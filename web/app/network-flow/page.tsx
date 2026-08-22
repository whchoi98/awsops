'use client';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Boxes, Globe, Loader2, Radar } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatTile from '@/components/ui/StatTile';
import Badge from '@/components/ui/Badge';
import DetailPanel from '@/components/ui/DetailPanel';
import MetricTable, { type MetricCol } from '@/components/inventory/metrics/MetricTable';
import { RangePicker, dash } from '@/components/inventory/metrics/shared';
import { useI18n } from '@/components/shell/LanguageProvider';
import type { NfmEndpoint, NfmFlowRow } from '@/lib/nfm';
import type { InvType } from '@/lib/inventory-types';
import FlowHopPath, { ResourceIcon, endpointKind } from '@/components/nfm/FlowHopPath';
import HealthBand from '@/components/nfm/HealthBand';
import { NFM_RANGE_PRESETS } from '@/lib/nfm-format';

// /network-flow — nfm-dashboard 플로우 조회 이식 (CloudWatch Network Flow Monitor).
// 데이터 계층은 lib/nfm.ts(비동기 쿼리 폴링 + TTL 캐시)가 담당하고, 이 페이지는
// GET /api/nfm(상태 게이트) + GET /api/nfm/query(top-contributors)만 소비한다.
// 쿼리는 수 초~수십 초 걸리므로 파라미터 변경 시에만 자동 재조회하고 로딩을 명시한다.

interface MonitorInfo { name: string; status: string; cluster: string | null }
interface StatusResp {
  monitors: MonitorInfo[];
  scopeCount: number;
  metrics: string[];
  categories: string[];
  error?: string;
}
interface QueryResp { rows: NfmFlowRow[]; unit: string; tookMs: number }

// 서버 값 도착 전 셀렉트 초기 옵션 (lib/nfm.ts enum과 동일 — 값 import는 AWS SDK를
// 클라이언트 번들에 끌고 오므로 리터럴로 미러링).
const METRICS_FALLBACK = ['DATA_TRANSFERRED', 'RETRANSMISSIONS', 'TIMEOUTS', 'ROUND_TRIP_TIME'];
const CATEGORIES_FALLBACK = ['INTRA_AZ', 'INTER_AZ', 'INTER_VPC', 'INTER_REGION', 'AMAZON_S3', 'AMAZON_DYNAMODB', 'UNCLASSIFIED'];
/** 데이터 전송 요금이 발생할 수 있는 카테고리 (lib/nfm.ts BILLED_CATEGORIES 미러). */
const BILLED = new Set(['INTER_AZ', 'INTER_VPC', 'INTER_REGION']);
const VPC_MONITOR = 'nfm-vpc-all';
// NFM 모니터 쿼리 한도: 최대 1시간 윈도우 → 프리셋을 15m/30m/1h로 제한 (라우트와 공유).
const NFM_RANGES = NFM_RANGE_PRESETS;

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
function humanBytes(v: number): string {
  let x = v; let i = 0;
  while (x >= 1024 && i < BYTE_UNITS.length - 1) { x /= 1024; i++; }
  return `${i === 0 ? Math.round(x) : x >= 100 ? x.toFixed(0) : x.toFixed(1)} ${BYTE_UNITS[i]}`;
}
function fmtValue(v: number, unit: string): string {
  if (unit === 'Bytes') return humanBytes(v);
  if (unit === 'Milliseconds') return `${v.toFixed(1)} ms`;
  return Math.round(v).toLocaleString();
}

/** 엔드포인트 표시명: 파드 ns/name 우선, 없으면 instanceId → ip. */
function epLabel(e: NfmEndpoint): string | null {
  if (e.podName) return `${e.podNamespace ?? '-'}/${e.podName}`;
  return e.instanceId ?? e.ip ?? null;
}
/** 검색까지 커버하는 정렬/필터 값: 표시명 + (다른 경우) ip. */
function epValue(e: NfmEndpoint): string | null {
  const label = epLabel(e);
  if (!label) return null;
  return e.ip && e.ip !== label ? `${label} ${e.ip}` : label;
}
function epTitle(e: NfmEndpoint): string | undefined {
  const parts = [e.ip, e.serviceName, e.vpcId, e.region].filter(Boolean);
  return parts.length ? parts.join(' · ') : undefined;
}

function EndpointCell({ e, category }: { e: NfmEndpoint; category?: string }) {
  const label = epLabel(e);
  if (!label) return dash;
  return (
    <span className="inline-flex items-center gap-1.5" title={epTitle(e)}>
      <ResourceIcon kind={endpointKind(e, category)} size={18} />
      {label}
    </span>
  );
}

// 상세 패널을 인벤토리 상세와 같은 섹션 카드 디자인으로 렌더하기 위한 최소 spec —
// sections가 있으면 DetailPanel이 아이콘 있는 섹션 + 친화적 라벨 포맷을 쓴다 (없으면 평면 raw 키).
const FLOW_DETAIL_SPEC: InvType = {
  label: 'Network Flow', group: 'Network',
  columns: [
    { key: 'category', label: 'Category' }, { key: 'value', label: 'Value' }, { key: 'target_port', label: 'Target Port' },
    { key: 'snat_ip', label: 'SNAT IP' }, { key: 'dnat_ip', label: 'DNAT IP' }, { key: 'traversed_path', label: 'Traversed Constructs' },
    { key: 'local_pod', label: 'Pod' }, { key: 'local_service', label: 'Service' }, { key: 'local_instance', label: 'Instance' },
    { key: 'local_ip', label: 'IP' }, { key: 'local_az', label: 'AZ' }, { key: 'local_subnet', label: 'Subnet' },
    { key: 'local_vpc', label: 'VPC' }, { key: 'local_region', label: 'Region' },
    { key: 'remote_pod', label: 'Pod' }, { key: 'remote_service', label: 'Service' }, { key: 'remote_instance', label: 'Instance' },
    { key: 'remote_ip', label: 'IP' }, { key: 'remote_az', label: 'AZ' }, { key: 'remote_subnet', label: 'Subnet' },
    { key: 'remote_vpc', label: 'VPC' }, { key: 'remote_region', label: 'Region' },
  ],
  sections: [
    { label: 'Flow', keys: ['category', 'value', 'target_port'] },
    { label: 'Local Endpoint', keys: ['local_pod', 'local_service', 'local_instance', 'local_ip', 'local_az', 'local_subnet', 'local_vpc', 'local_region'] },
    { label: 'Remote Endpoint', keys: ['remote_pod', 'remote_service', 'remote_instance', 'remote_ip', 'remote_az', 'remote_subnet', 'remote_vpc', 'remote_region'] },
    { label: 'Network Path', keys: ['snat_ip', 'dnat_ip', 'traversed_path'] },
  ],
};

/** 상세 패널용 flat 뷰 — 빈 필드는 제외 (DetailPanel이 키/값 + 복사 버튼을 렌더). */
function flowDetail(r: NfmFlowRow, unitLabel: string): Record<string, unknown> {
  const ep = (p: 'local' | 'remote', e: NfmEndpoint): Record<string, unknown> => ({
    [`${p}_pod`]: e.podName ? `${e.podNamespace ?? '-'}/${e.podName}` : undefined,
    [`${p}_service`]: e.serviceName,
    [`${p}_instance`]: e.instanceId,
    [`${p}_ip`]: e.ip,
    [`${p}_az`]: e.az,
    [`${p}_subnet`]: e.subnetId,
    [`${p}_vpc`]: e.vpcId,
    [`${p}_region`]: e.region,
  });
  const all: Record<string, unknown> = {
    category: r.category,
    value: `${fmtValue(r.value, unitLabel)} (${Math.round(r.value).toLocaleString()} ${unitLabel})`,
    target_port: r.targetPort,
    ...ep('local', r.local),
    ...ep('remote', r.remote),
    snat_ip: r.snatIp,
    dnat_ip: r.dnatIp,
    traversed_path: r.traversedIds.length ? r.traversedIds.join(' → ') : undefined,
  };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v != null && v !== ''));
}

const SELECT_CLS = 'rounded-md border border-ink-200 bg-card px-2 py-1 text-[12px] text-ink-600';

export default function NetworkFlowPage() {
  const { tt } = useI18n();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [statusErr, setStatusErr] = useState('');
  // 쿼리 파라미터 — 변경 시에만 재조회 (NFM 비동기 쿼리는 수 초~수십 초)
  const [monitor, setMonitor] = useState('');
  const [metric, setMetric] = useState('DATA_TRANSFERRED');
  const [category, setCategory] = useState('INTER_AZ');
  const [range, setRange] = useState(3600);
  const [result, setResult] = useState<QueryResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [queryErr, setQueryErr] = useState('');
  const [selected, setSelected] = useState<NfmFlowRow | null>(null);

  // 상태 게이트 로드 (모니터 목록 + scope 수 + 셀렉트 enum)
  useEffect(() => {
    let alive = true;
    fetch('/api/nfm')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: StatusResp) => {
        if (!alive) return;
        setStatus(d);
        const first = d.monitors.find((m) => m.status === 'ACTIVE') ?? d.monitors[0];
        if (first) setMonitor((prev) => prev || first.name);
      })
      .catch((e) => { if (alive) setStatusErr(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  // 파라미터가 정해지면 자동 조회. 실패 시 이전 결과는 유지하고 에러 라인만 표시.
  useEffect(() => {
    if (!monitor) return;
    let alive = true;
    setBusy(true); setQueryErr(''); setSelected(null);
    const qs = `monitor=${encodeURIComponent(monitor)}&metric=${metric}&category=${category}&range=${range}`;
    fetch(`/api/nfm/query?${qs}`)
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.message ?? `HTTP ${r.status}`);
        return d as QueryResp;
      })
      .then((d) => { if (alive) setResult({ rows: d.rows ?? [], unit: d.unit ?? 'Count', tookMs: d.tookMs ?? 0 }); })
      .catch((e) => { if (alive) setQueryErr(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [monitor, metric, category, range]);

  const monitors = status?.monitors ?? [];
  const activeCount = monitors.filter((m) => m.status === 'ACTIVE').length;
  const clusters = [...new Set(monitors.map((m) => m.cluster).filter((c): c is string => c != null))];
  const hasVpcMonitor = monitors.some((m) => m.name === VPC_MONITOR);
  const onboarded = monitors.length > 0;

  const columns = useMemo<MetricCol<NfmFlowRow>[]>(() => [
    {
      key: 'local', label: 'Local', mono: true,
      title: tt('로컬 엔드포인트 — 파드(ns/name) 우선, 없으면 instanceId/IP'),
      value: (r) => epValue(r.local),
      render: (r) => <EndpointCell e={r.local} category={r.category} />,
    },
    { key: 'localAz', label: 'Local AZ', facet: true, value: (r) => r.local.az ?? null },
    {
      key: 'remote', label: 'Remote', mono: true,
      title: tt('원격 엔드포인트 — 파드(ns/name) 우선, 없으면 instanceId/IP'),
      value: (r) => epValue(r.remote),
      render: (r) => <EndpointCell e={r.remote} category={r.category} />,
    },
    { key: 'remoteAz', label: 'Remote AZ', facet: true, value: (r) => r.remote.az ?? null },
    { key: 'port', label: 'Port', type: 'num', mono: true, value: (r) => r.targetPort ?? null },
    {
      key: 'value', label: 'Value', type: 'num',
      title: tt('선택 메트릭의 기간 합계 — Bytes/Count/Milliseconds'),
      value: (r) => r.value,
      render: (r) => <span className="tabular">{fmtValue(r.value, r.unit)}</span>,
    },
    {
      key: 'nat', label: 'SNAT·DNAT', mono: true,
      value: (r) => (r.snatIp || r.dnatIp ? `${r.snatIp ?? '—'} → ${r.dnatIp ?? '—'}` : null),
    },
    {
      key: 'path', label: tt('경로'),
      title: tt('플로우가 경유한 네트워크 구성요소 (traversedConstructs)'),
      value: (r) => (r.traversed.length ? r.traversed.join(' · ') : null),
      render: (r) => r.traversed.length
        ? (
          <span className="inline-flex flex-wrap gap-1">
            {r.traversed.map((t) => <Badge key={t} tone="neutral" variant="outline" mono>{t}</Badge>)}
          </span>
        )
        : dash,
    },
  ], [tt]);

  return (
    <>
      <PageHeader
        title="Network Flow"
        subtitle="CloudWatch Network Flow Monitor(NFM) 플로우 조회 — 모니터·메트릭·카테고리·기간별 top-contributors"
      />
      <div className="px-4 lg:px-8 py-8 flex flex-col gap-6">
        {statusErr && (
          <div className="text-[13px] text-rose-600">{tt('NFM 상태 조회 실패')}: {statusErr}</div>
        )}
        {!status && !statusErr && <div className="text-ink-400">{tt('로딩 중…')}</div>}

        {status && (
          <>
            {/* 상태 밴드: 모니터/커버리지/VPC/Scope */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="ACTIVE 모니터"
                value={activeCount}
                variant={activeCount > 0 ? 'accent' : 'warn'}
                hint={monitors.length > activeCount ? `${activeCount}/${monitors.length}` : undefined}
                icon={<Radar size={16} />}
              />
              <StatTile
                label="EKS 클러스터 커버리지"
                value={clusters.length}
                hint={clusters.length ? clusters.join(', ') : undefined}
                icon={<Boxes size={16} />}
              />
              <StatTile
                label="VPC 모니터"
                value={hasVpcMonitor ? tt('있음') : tt('없음')}
                variant={hasVpcMonitor ? 'default' : 'warn'}
                hint={tt('EKS 외 VPC 전체 트래픽 커버 (nfm-vpc-all)')}
                icon={<Globe size={16} />}
              />
              <StatTile
                label="Scope"
                value={status.scopeCount}
                variant={status.scopeCount > 0 ? 'default' : 'warn'}
                hint={status.scopeCount > 0
                  ? tt('계정 전체 트래픽 추이 조회 설정됨 (Workload Insights)')
                  : tt('미설정 — 계정 전체 트래픽 추이 조회 불가')}
                icon={<Activity size={16} />}
              />
            </div>

            {/* 상태 요약 밴드 — 선택 모니터의 CW 메트릭 요약 (모니터/기간 변경 시 재조회) */}
            {onboarded && monitor && <HealthBand monitor={monitor} range={range} />}

            {/* NFM 미온보딩 — amber 안내로 degrade, 쿼리 패널 숨김 */}
            {!onboarded && (
              <div className="flex flex-col gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-700">
                <div className="font-semibold">{tt('Network Flow Monitor 미온보딩')}</div>
                <p>{tt('EKS 클러스터에 aws-network-flow-monitoring-agent add-on을 설치하고 NFM 모니터(nfm-eks-<클러스터> / nfm-vpc-all)를 온보딩하면 플로우 조회가 활성화됩니다.')}</p>
                {status.error && <p className="font-mono text-[11.5px]">{status.error}</p>}
              </div>
            )}

            {onboarded && (
              <Card
                title="플로우 조회"
                subtitle="모니터 × 메트릭 × 카테고리 top-contributors — 파라미터 변경 시 자동 재조회"
                right={<RangePicker value={range} onChange={setRange} ranges={NFM_RANGES} />}
                padded={false}
              >
                {/* 쿼리 파라미터 + 실행 상태 */}
                <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 px-4 py-3">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
                    {tt('모니터')}
                    <select className={SELECT_CLS} value={monitor} onChange={(e) => setMonitor(e.target.value)}>
                      {monitors.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}{m.status !== 'ACTIVE' ? ` (${m.status})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
                    {tt('메트릭')}
                    <select className={SELECT_CLS} value={metric} onChange={(e) => setMetric(e.target.value)}>
                      {(status.metrics?.length ? status.metrics : METRICS_FALLBACK).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-500">
                    {tt('카테고리')}
                    <select className={SELECT_CLS} value={category} onChange={(e) => setCategory(e.target.value)}>
                      {(status.categories?.length ? status.categories : CATEGORIES_FALLBACK).map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <div className="ml-auto flex items-center gap-2">
                    {busy && (
                      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700">
                        <Loader2 size={13} className="animate-spin" />
                        {tt('쿼리 실행 중 (수 초~수십 초)…')}
                      </span>
                    )}
                    {!busy && result && !queryErr && (
                      <span className="tabular text-[11.5px] text-ink-400">
                        {result.rows.length} rows · {result.unit} · {(result.tookMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                </div>

                {/* 실패는 rose 라인으로 degrade — 이전 결과는 유지 */}
                {queryErr && (
                  <div className="border-b border-ink-100 px-4 py-2 text-[12px] text-rose-600">
                    {tt('쿼리 실패')}: {queryErr}
                  </div>
                )}

                {/* INTER_AZ/INTER_VPC/INTER_REGION — 과금 카테고리 힌트 */}
                {BILLED.has(category) && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-2">
                    <Badge tone="brand" variant="soft">{tt('과금 카테고리')}</Badge>
                    <span className="text-[11.5px] text-ink-400">
                      {tt('AZ 간/VPC 간/리전 간 전송 — 방향당 약 $0.01/GB 데이터 전송 요금이 발생할 수 있습니다 (추정)')}
                    </span>
                  </div>
                )}

                {result ? (
                  <MetricTable
                    columns={columns}
                    items={result.rows}
                    rowKey={(r, i) => `${i}|${epLabel(r.local) ?? ''}|${epLabel(r.remote) ?? ''}|${r.targetPort ?? ''}`}
                    defaultSortKey="value"
                    emptyText="해당 기간/카테고리에 플로우 없음"
                    onRowClick={setSelected}
                  />
                ) : (
                  <div className="px-4 py-8 text-center text-[12.5px] text-ink-400">
                    {busy ? tt('쿼리 실행 중 (수 초~수십 초)…') : tt('모니터를 선택하면 자동으로 조회합니다')}
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>

      <DetailPanel
        title={selected ? `${epLabel(selected.local) ?? '?'} ↔ ${epLabel(selected.remote) ?? '?'}` : undefined}
        data={selected ? flowDetail(selected, selected.unit) : null}
        spec={FLOW_DETAIL_SPEC}
        actions={selected ? <FlowHopPath row={selected} /> : undefined}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
