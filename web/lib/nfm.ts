import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import {
  NetworkFlowMonitorClient,
  ListMonitorsCommand,
  ListScopesCommand,
  StartQueryMonitorTopContributorsCommand,
  GetQueryStatusMonitorTopContributorsCommand,
  GetQueryResultsMonitorTopContributorsCommand,
  StopQueryMonitorTopContributorsCommand,
  type MonitorMetric,
  type DestinationCategory,
} from '@aws-sdk/client-networkflowmonitor';

// CloudWatch Network Flow Monitor (NFM) — nfm-dashboard 주요 기능 이식의 데이터 계층.
// nfm-dashboard와 달리 수집 파이프라인(DDB) 없이 NFM 비동기 쿼리를 라이브로 실행한다:
// StartQuery → 상태 폴링 → GetQueryResults. 쿼리는 수 초~수십 초 걸리므로 결과를
// TTL 캐시에 보관하고, 동일 파라미터의 동시 요청은 in-flight promise를 공유한다.
// 게이트: 모니터(nfm-eks-<cluster> / nfm-vpc-all)가 없으면 available:false로 정직 안내.

const REGION = process.env.AWS_REGION || 'ap-northeast-2';
let client: NetworkFlowMonitorClient | null = null;
const nfm = () => (client ??= new NetworkFlowMonitorClient({ region: REGION }));
let cwClient: CloudWatchClient | null = null;
const cw = () => (cwClient ??= new CloudWatchClient({ region: REGION }));

export const NFM_METRICS = ['DATA_TRANSFERRED', 'RETRANSMISSIONS', 'TIMEOUTS', 'ROUND_TRIP_TIME'] as const;
export type NfmMetric = (typeof NFM_METRICS)[number];
// Monitor top-contributors queries accept the 7 core categories (the extra 4 — INTERNET /
// AWS_SERVICE / TRANSIT_GATEWAY / LOCAL_ZONE — are Workload-Insights-only; nfm-dashboard 검증).
export const NFM_CATEGORIES = ['INTRA_AZ', 'INTER_AZ', 'INTER_VPC', 'INTER_REGION', 'AMAZON_S3', 'AMAZON_DYNAMODB', 'UNCLASSIFIED'] as const;
export type NfmCategory = (typeof NFM_CATEGORIES)[number];

// 비용 추정 기준 (nfm-dashboard spec §6.1과 동일): inter-AZ 전송은 ap-northeast-2 기준
// 방향당 $0.01/GB. INTER_VPC/INTER_REGION도 같은 방향당 요율로 근사. 정확한 청구가 아닌
// 추정치이며 UI는 "추정" 배지를 단다.
export const AZ_TRANSFER_USD_PER_GB = 0.01;
export const BILLED_CATEGORIES: ReadonlySet<NfmCategory> = new Set<NfmCategory>(['INTER_AZ', 'INTER_VPC', 'INTER_REGION']);
export const bytesToUsd = (bytes: number, category: NfmCategory): number =>
  BILLED_CATEGORIES.has(category) ? (bytes / 1e9) * AZ_TRANSFER_USD_PER_GB : 0;

// arn: CW 메트릭 디멘션 `MonitorId`의 값은 모니터 ARN — ListMonitors 응답에서 그대로
// 취한다 (조립 금지). 상태 요약 밴드가 CW GetMetricData 조회에 사용.
export interface NfmMonitorInfo { name: string; status: string; cluster: string | null; arn: string }
export interface NfmStatus { monitors: NfmMonitorInfo[]; scopeCount: number }

export interface NfmEndpoint {
  ip?: string; instanceId?: string; subnetId?: string; az?: string; vpcId?: string; region?: string;
  podName?: string; podNamespace?: string; serviceName?: string;
}
export interface NfmFlowRow {
  local: NfmEndpoint; remote: NfmEndpoint;
  value: number; unit: string; category: NfmCategory;
  snatIp?: string; dnatIp?: string; targetPort?: number;
  /** traversedConstructs component types, deduped (e.g. TGW / NAT) — 경로 요약 배지용. */
  traversed: string[];
  /** 상세 패널용 전체 경유 목록 (type:id, 순서 유지). */
  traversedIds: string[];
}

// ── TTL cache + in-flight dedupe ────────────────────────────────────────────
const TTL_MS = 4 * 60_000;
const cache = new Map<string, { at: number; v: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.v as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = fn().then((v) => {
    cache.set(key, { at: Date.now(), v });
    return v;
  }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
export function _resetNfmCacheForTests() { cache.clear(); inflight.clear(); client = null; cwClient = null; }

// ── Status (menu gate) ──────────────────────────────────────────────────────
export async function nfmStatus(): Promise<NfmStatus> {
  return cached('status', async () => {
    const [mon, sc] = await Promise.all([
      nfm().send(new ListMonitorsCommand({})),
      nfm().send(new ListScopesCommand({})).catch(() => ({ scopes: [] })),
    ]);
    const monitors: NfmMonitorInfo[] = (mon.monitors ?? []).map((m) => {
      const name = m.monitorName ?? '';
      return {
        name,
        status: m.monitorStatus ?? '',
        cluster: name.startsWith('nfm-eks-') ? name.slice('nfm-eks-'.length) : null,
        arn: m.monitorArn ?? '',
      };
    });
    return { monitors, scopeCount: (sc.scopes ?? []).length };
  });
}

/** ACTIVE monitor name for an EKS cluster (nfm-dashboard 온보딩 네이밍), or null. */
export async function nfmMonitorForCluster(cluster: string): Promise<string | null> {
  const s = await nfmStatus();
  const m = s.monitors.find((x) => x.cluster === cluster && x.status === 'ACTIVE');
  return m ? m.name : null;
}

// ── Health summary (상태 요약 밴드) ─────────────────────────────────────────
// NFM은 모니터별 5메트릭을 CW `AWS/NetworkFlowMonitor`에 발행한다 (디멘션
// `MonitorId` = 모니터 ARN). monitor 쿼리(1h 한도)와 달리 CW 경로는 기간 제한이
// 사실상 없다. RoundTripTime은 **µs**(monitor 쿼리 폴백 Milliseconds와 다름 —
// 1000배 함정), HealthIndicator는 1=degraded(AWS망 이슈)/0=healthy.

export interface NfmHealthPoint { t: number; v: number }
export interface NfmHealthSummary {
  available: boolean;
  /** HealthIndicator 기간 최대 > 0 — AWS망 이슈. 데이터 없으면 null. */
  degraded: boolean | null;
  /** 기간 합계. 해당 메트릭 무데이터면 null (0과 구분 — UI는 "수집 전"). */
  timeouts: number | null;
  retransmissions: number | null;
  /** 기간 평균 RTT (µs — CW 원단위 유지, 표시는 nfm-format.formatMicros). sparse 가능. */
  rttAvgUs: number | null;
  series: { rtt: NfmHealthPoint[]; retransmissions: NfmHealthPoint[]; timeouts: NfmHealthPoint[]; health: NfmHealthPoint[] };
}

/** 모니터 1개의 상태 요약 — GetMetricData 1콜 배치 (4 통계 + 스파크라인 시계열). */
export async function nfmHealthSummary(monitorArn: string, rangeSec: number): Promise<NfmHealthSummary> {
  return cached(`health|${monitorArn}|${rangeSec}`, async () => {
    const end = new Date();
    const start = new Date(end.getTime() - rangeSec * 1000);
    // 스파크라인용 ≤ ~60 버킷. 4메트릭 × 60포인트라 GetMetricData 페이지네이션 불필요.
    const period = Math.max(60, Math.ceil(rangeSec / 60 / 60) * 60);
    const metric = (name: string) => ({
      Namespace: 'AWS/NetworkFlowMonitor', MetricName: name,
      Dimensions: [{ Name: 'MonitorId', Value: monitorArn }],
    });
    const res = await cw().send(new GetMetricDataCommand({
      StartTime: start, EndTime: end, ScanBy: 'TimestampAscending',
      MetricDataQueries: [
        { Id: 'rtt', MetricStat: { Metric: metric('RoundTripTime'), Period: period, Stat: 'Average' } },
        { Id: 'health', MetricStat: { Metric: metric('HealthIndicator'), Period: period, Stat: 'Maximum' } },
        { Id: 'retx', MetricStat: { Metric: metric('Retransmissions'), Period: period, Stat: 'Sum' } },
        { Id: 'tmo', MetricStat: { Metric: metric('Timeouts'), Period: period, Stat: 'Sum' } },
      ],
    }));
    const series = (id: string): NfmHealthPoint[] => {
      const r = (res.MetricDataResults ?? []).find((x) => x.Id === id);
      return (r?.Timestamps ?? []).map((ts, i) => ({ t: new Date(ts).getTime(), v: r?.Values?.[i] ?? 0 }));
    };
    const rtt = series('rtt'); const health = series('health');
    const retx = series('retx'); const tmo = series('tmo');
    const sum = (pts: NfmHealthPoint[]) => pts.reduce((a, p) => a + p.v, 0);
    const available = rtt.length + health.length + retx.length + tmo.length > 0;
    return {
      available,
      degraded: health.length ? health.some((p) => p.v > 0) : null,
      timeouts: tmo.length ? sum(tmo) : null,
      retransmissions: retx.length ? sum(retx) : null,
      rttAvgUs: rtt.length ? sum(rtt) / rtt.length : null,
      series: { rtt, retransmissions: retx, timeouts: tmo, health },
    };
  });
}

// ── Monitor top-contributors query (start → poll → results) ────────────────
interface RawContributor {
  localIp?: string; localInstanceId?: string; localSubnetId?: string; localAz?: string;
  localVpcId?: string; localRegion?: string;
  remoteIp?: string; remoteInstanceId?: string; remoteSubnetId?: string; remoteAz?: string;
  remoteVpcId?: string; remoteRegion?: string;
  snatIp?: string; dnatIp?: string; targetPort?: number; value?: number;
  traversedConstructs?: { componentId?: string; componentType?: string; serviceName?: string }[];
  kubernetesMetadata?: {
    localPodName?: string; localPodNamespace?: string; localServiceName?: string;
    remotePodName?: string; remotePodNamespace?: string; remoteServiceName?: string;
  };
}

// CFN 타입 접두사를 줄여 배지/상세를 읽기 쉽게: 'AWS::EC2::NetworkInterface' → 'NetworkInterface'.
const shortType = (t?: string): string | undefined => (t ? t.split('::').pop() : undefined);

// 라이브 API는 빈 필드를 ''로 채워 반환한다(예: remotePodName: "") — undefined로 정규화.
const nz = (s?: string): string | undefined => (s ? s : undefined);

function toRow(r: RawContributor, category: NfmCategory, unit: string): NfmFlowRow {
  const k = r.kubernetesMetadata ?? {};
  return {
    local: {
      ip: nz(r.localIp), instanceId: nz(r.localInstanceId), subnetId: nz(r.localSubnetId), az: nz(r.localAz),
      vpcId: nz(r.localVpcId), region: nz(r.localRegion),
      podName: nz(k.localPodName), podNamespace: nz(k.localPodNamespace), serviceName: nz(k.localServiceName),
    },
    remote: {
      ip: nz(r.remoteIp), instanceId: nz(r.remoteInstanceId), subnetId: nz(r.remoteSubnetId), az: nz(r.remoteAz),
      vpcId: nz(r.remoteVpcId), region: nz(r.remoteRegion),
      podName: nz(k.remotePodName), podNamespace: nz(k.remotePodNamespace), serviceName: nz(k.remoteServiceName),
    },
    value: r.value ?? 0, unit, category,
    snatIp: nz(r.snatIp), dnatIp: nz(r.dnatIp), targetPort: r.targetPort,
    traversed: [...new Set((r.traversedConstructs ?? []).map((t) => shortType(t.componentType) ?? t.serviceName ?? '').filter(Boolean))],
    traversedIds: (r.traversedConstructs ?? [])
      .map((t) => [shortType(t.componentType) ?? t.serviceName, t.componentId].filter(Boolean).join(':'))
      .filter(Boolean),
  };
}

/** 라이브 API가 unit을 null로 반환하는 경우의 metric별 폴백 (실측: DATA_TRANSFERRED → null). */
const UNIT_FALLBACK: Record<NfmMetric, string> = {
  DATA_TRANSFERRED: 'Bytes', ROUND_TRIP_TIME: 'Milliseconds', RETRANSMISSIONS: 'Count', TIMEOUTS: 'Count',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface NfmQueryResult { rows: NfmFlowRow[]; unit: string; tookMs: number }

// NFM 모니터 쿼리의 하드 한도 (실측: "Time range can not exceed 1 hour" ValidationException).
// 더 긴 기간이 필요하면 nfm-dashboard처럼 수집 파이프라인이 필요하다 — 라이브 조회는 1h가 상한.
export const NFM_MAX_RANGE_SEC = 3600;

/** One monitor × metric × category top-contributors query over the trailing range (≤ 1h). */
export async function nfmTopContributors(
  monitor: string, metric: NfmMetric, category: NfmCategory, rangeSec: number, limit = 50,
): Promise<NfmQueryResult> {
  if (rangeSec > NFM_MAX_RANGE_SEC) throw new Error(`NFM query range max ${NFM_MAX_RANGE_SEC}s (API limit)`);
  return cached(`q|${monitor}|${metric}|${category}|${rangeSec}|${limit}`, async () => {
    const t0 = Date.now();
    const end = new Date();
    const start = new Date(end.getTime() - rangeSec * 1000);
    const { queryId } = await nfm().send(new StartQueryMonitorTopContributorsCommand({
      monitorName: monitor, metricName: metric as MonitorMetric,
      destinationCategory: category as DestinationCategory,
      startTime: start, endTime: end, limit,
    }));
    // Poll to SUCCEEDED (≤ ~40s), then stop the query on timeout so it doesn't linger.
    for (let i = 0; ; i++) {
      const { status } = await nfm().send(new GetQueryStatusMonitorTopContributorsCommand({ monitorName: monitor, queryId }));
      if (status === 'SUCCEEDED') break;
      if (status === 'FAILED' || status === 'CANCELED') throw new Error(`NFM query ${status}`);
      if (i >= 26) {
        await nfm().send(new StopQueryMonitorTopContributorsCommand({ monitorName: monitor, queryId })).catch(() => {});
        throw new Error('NFM query timeout');
      }
      await sleep(1500);
    }
    const rows: NfmFlowRow[] = [];
    let unit = UNIT_FALLBACK[metric];
    let nextToken: string | undefined;
    do {
      const res = await nfm().send(new GetQueryResultsMonitorTopContributorsCommand({ monitorName: monitor, queryId, nextToken }));
      unit = res.unit ?? unit;
      for (const raw of res.topContributors ?? []) rows.push(toRow(raw as RawContributor, category, res.unit ?? UNIT_FALLBACK[metric]));
      nextToken = res.nextToken;
    } while (nextToken && rows.length < limit);
    return { rows: rows.slice(0, limit), unit, tookMs: Date.now() - t0 };
  });
}

// ── Pod transfer aggregation (EKS 비용 메뉴) ────────────────────────────────
export interface PodTransferRow {
  /** local endpoint identity: pod명 우선, 없으면 instance/ip (노드·비파드 트래픽). */
  key: string; podName: string | null; namespace: string | null; serviceName: string | null;
  bytes: number; byCategory: Partial<Record<NfmCategory, number>>;
  /** billable 카테고리(INTER_AZ/VPC/REGION) 합산 추정 비용 (방향당 $0.01/GB). */
  billableBytes: number; estUsd: number;
}
export interface PodTransferResult {
  available: boolean; monitor: string | null; rangeSec: number;
  pods: PodTransferRow[];
  totals: { bytes: number; billableBytes: number; estUsd: number; byCategory: Partial<Record<NfmCategory, number>> };
  failedCategories: NfmCategory[];
}

/**
 * Per-pod DATA_TRANSFERRED aggregation across all destination categories for one cluster.
 * Bytes are attributed to the LOCAL side (the monitored cluster's own workload) so the
 * table sums cleanly — pod-to-pod flows inside the cluster appear once per direction.
 */
export async function nfmPodTransfer(cluster: string, rangeSec: number): Promise<PodTransferResult> {
  const monitor = await nfmMonitorForCluster(cluster);
  const empty = { bytes: 0, billableBytes: 0, estUsd: 0, byCategory: {} };
  if (!monitor) return { available: false, monitor: null, rangeSec, pods: [], totals: empty, failedCategories: [] };

  const failed: NfmCategory[] = [];
  const settled = await Promise.all(NFM_CATEGORIES.map(async (cat) => {
    try {
      return await nfmTopContributors(monitor, 'DATA_TRANSFERRED', cat, rangeSec, 100);
    } catch {
      failed.push(cat);
      return { rows: [] as NfmFlowRow[], unit: 'Bytes', tookMs: 0 };
    }
  }));

  const byKey = new Map<string, PodTransferRow>();
  const totals = { bytes: 0, billableBytes: 0, estUsd: 0, byCategory: {} as Partial<Record<NfmCategory, number>> };
  for (const res of settled) {
    for (const row of res.rows) {
      const e = row.local;
      const key = e.podName ? `pod:${e.podNamespace ?? '_'}/${e.podName}` : e.instanceId ? `i:${e.instanceId}` : `ip:${e.ip ?? 'unknown'}`;
      let agg = byKey.get(key);
      if (!agg) {
        agg = { key, podName: e.podName ?? null, namespace: e.podNamespace ?? null, serviceName: e.serviceName ?? null, bytes: 0, byCategory: {}, billableBytes: 0, estUsd: 0 };
        byKey.set(key, agg);
      }
      agg.bytes += row.value;
      agg.byCategory[row.category] = (agg.byCategory[row.category] ?? 0) + row.value;
      totals.bytes += row.value;
      totals.byCategory[row.category] = (totals.byCategory[row.category] ?? 0) + row.value;
      if (BILLED_CATEGORIES.has(row.category)) {
        const usd = bytesToUsd(row.value, row.category);
        agg.billableBytes += row.value; agg.estUsd += usd;
        totals.billableBytes += row.value; totals.estUsd += usd;
      }
    }
  }
  const pods = [...byKey.values()].sort((a, b) => b.estUsd - a.estUsd || b.bytes - a.bytes);
  return { available: true, monitor, rangeSec, pods, totals, failedCategories: failed };
}
