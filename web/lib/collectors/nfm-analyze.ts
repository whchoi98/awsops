// Network Flow Analyzer collector — the chat-side equivalent of a field-proven `nfm-analyze`
// Slack-bot workflow: NFM 상태 요약 → 악화 모니터 선별 → 그 모니터의 top-contributor
// 플로우(어느 pod/서브넷 페어가 원인인지)를 수집해 Bedrock 분석으로 넘긴다.
// 데이터원은 전부 lib/nfm.ts (TTL 캐시 + in-flight dedupe 재사용) — Steampipe 불필요.
import {
  nfmStatus, nfmHealthSummary, nfmMonitorCoverage, nfmTopContributors,
  type NfmFlowRow, type NfmMetric, type NfmCategory,
} from '../nfm';
import { formatMicros } from '../nfm-format';
import type { ChatCollector, CollectCtx, CollectOutput } from './index';

const RANGE_SEC = 3600; // monitor 쿼리 하드 한도(1h)와 정렬 — 더 긴 맥락은 CW 건강 요약이 담당
/** 플로우 팬아웃 상한: 최악 모니터 2 × 메트릭 3 × 카테고리 2 = 12 쿼리 (병렬, 각 ≤40s 폴링). */
const WORST_MONITOR_CAP = 2;
export const FLOW_METRICS: readonly NfmMetric[] = ['TIMEOUTS', 'RETRANSMISSIONS', 'DATA_TRANSFERRED'];
export const FLOW_CATEGORIES: readonly NfmCategory[] = ['INTER_AZ', 'INTRA_AZ'];
const ROW_CAP = 10;

const epLabel = (e: NfmFlowRow['local']): string =>
  e.podName ? `${e.podNamespace ?? '-'}/${e.podName}` : e.instanceId ?? e.ip ?? '?';

/** 분석 컨텍스트용 압축 행 — 페어·위치·값·경유만 (토큰 절약). */
export function flowRowCompact(r: NfmFlowRow) {
  return {
    local: epLabel(r.local), lAz: r.local.az, lSubnet: r.local.subnetId,
    remote: epLabel(r.remote), rAz: r.remote.az,
    port: r.targetPort, value: r.value, unit: r.unit,
    path: r.traversed.length ? r.traversed.join('>') : undefined,
  };
}

const nfmAnalyzeCollector: ChatCollector = {
  key: 'nfm-analyze',
  sectionMeta: { agentName: 'Network Flow Analyzer' },

  // NFM 모니터가 하나라도 있어야 의미 있음 — 없으면 일반 라우팅(network 게이트웨이)으로 폴백.
  available: () => nfmStatus().then((s) => s.monitors.length > 0).catch(() => false),

  async collect(ctx: CollectCtx): Promise<CollectOutput> {
    const summary: string[] = [];
    const sections: string[] = [];
    const tools: string[] = [];
    let collected = 0;

    // 0) 이 콜렉터가 안 묶는 소스는 선공개 (fail-open 계약).
    summary.push('Pod-level logs (Container Insights): 미가용 (not wired in this collector — flow pairs point WHERE to look)');

    // 1) 모니터 목록 + 감시 대상 (coverage는 best-effort)
    ctx.onStep({ tool: 'nfm_status', query: 'ListMonitors + ListScopes + GetMonitor coverage' });
    let monitors: Awaited<ReturnType<typeof nfmStatus>>['monitors'] = [];
    try {
      monitors = (await nfmStatus()).monitors;
    } catch (e) {
      summary.push(`NFM monitors: 미가용 (${(e instanceof Error ? e.message : String(e)).slice(0, 120)})`);
    }
    if (monitors.length === 0) {
      sections.push('\n## Collection Summary\n' + summary.map((s) => `- ${s}`).join('\n'));
      return {
        context: '--- No NFM data could be collected ---\n' + sections.join('\n\n'),
        summary, tools, collected: 0, via: 'Network Flow Analyzer (no monitors)',
      };
    }
    const coverage = await nfmMonitorCoverage().catch(() => ({} as Record<string, never>));
    tools.push('nfm_status');
    collected++;

    // 2) 모니터별 건강 요약 (CW 배치 — 병렬) → 악화 순 랭킹
    ctx.onStep({ tool: 'cloudwatch_metrics', query: `AWS/NetworkFlowMonitor health summary: ${monitors.length} monitors (last 1h)` });
    const health = await Promise.all(monitors.map(async (m) => {
      try {
        const h = await nfmHealthSummary(m.arn, RANGE_SEC);
        return { monitor: m.name, status: m.status, ...h };
      } catch {
        return null;
      }
    }));
    const healthRows = health.filter((h): h is NonNullable<typeof h> => h != null);
    if (healthRows.length > 0) {
      collected++;
      tools.push('cloudwatch_metrics');
      // 악화 우선: degraded(AWS망 이슈) → 타임아웃 합계 → 재전송 합계
      healthRows.sort((a, b) => Number(b.degraded ?? false) - Number(a.degraded ?? false)
        || (b.timeouts ?? 0) - (a.timeouts ?? 0) || (b.retransmissions ?? 0) - (a.retransmissions ?? 0));
      summary.push(`Monitor health (CloudWatch): ${healthRows.length}/${monitors.length} monitors, last 1h`);
      sections.push(
        '## NFM Monitor Health (last 1h, worst first — timeouts/retransmissions are sums, rtt is the µs average, degraded = AWS-side HealthIndicator)\n' +
        '```json\n' + JSON.stringify(healthRows.map((h) => ({
          monitor: h.monitor, status: h.status, degraded: h.degraded,
          timeouts: h.timeouts, retransmissions: h.retransmissions,
          rttAvg: h.rttAvgUs != null ? formatMicros(h.rttAvgUs) : null,
          watches: (coverage as Record<string, { local: { type: string; id: string }[] }>)[h.monitor]?.local?.map((r) => r.id) ?? undefined,
        }))) + '\n```',
      );
    } else {
      summary.push('Monitor health (CloudWatch): 미가용 (no metric data — agents may not be publishing yet)');
    }

    // 3) 악화 상위 모니터의 top-contributor 플로우 (병렬 팬아웃, 실패 콤보는 disclose)
    const worst = (healthRows.length ? healthRows.map((h) => h.monitor) : monitors.map((m) => m.name))
      .slice(0, WORST_MONITOR_CAP);
    const failed: string[] = [];
    let flowCount = 0;
    if (!ctx.signal?.aborted) {
      ctx.onStep({ tool: 'nfm_top_contributors', query: `${worst.join(', ')} × ${FLOW_METRICS.join('/')} × ${FLOW_CATEGORIES.join('/')} (last 1h)` });
      const combos = worst.flatMap((mon) => FLOW_METRICS.flatMap((met) => FLOW_CATEGORIES.map((cat) => ({ mon, met, cat }))));
      const results = await Promise.all(combos.map(async (c) => {
        try {
          const r = await nfmTopContributors(c.mon, c.met, c.cat, RANGE_SEC, ROW_CAP);
          return { ...c, rows: r.rows, unit: r.unit };
        } catch (e) {
          failed.push(`${c.mon}/${c.met}/${c.cat}: ${(e instanceof Error ? e.message : String(e)).slice(0, 80)}`);
          return null;
        }
      }));
      for (const r of results) {
        if (!r || r.rows.length === 0) continue;
        flowCount += r.rows.length;
        sections.push(
          `## Top Flows — ${r.mon} · ${r.met} · ${r.cat} (last 1h, unit ${r.unit}, top ${r.rows.length})\n` +
          '```json\n' + JSON.stringify(r.rows.map(flowRowCompact)) + '\n```',
        );
      }
      if (flowCount > 0) {
        collected++;
        tools.push('nfm_top_contributors');
        summary.push(`Top-contributor flows: ${flowCount} rows across ${worst.length} monitor(s) × ${FLOW_METRICS.length} metrics × ${FLOW_CATEGORIES.join('/')}`);
      } else {
        summary.push('Top-contributor flows: 미가용 (no flows aggregated for the queried metric/category combos in the last hour)');
      }
      if (failed.length) summary.push(`Failed flow queries (skipped): ${failed.join(' · ')}`);
      summary.push(`Categories not queried (fan-out cap): ${(['INTER_VPC', 'INTER_REGION', 'AMAZON_S3', 'AMAZON_DYNAMODB', 'UNCLASSIFIED']).join(', ')}`);
    }

    sections.push('\n## Collection Summary\n' + summary.map((s) => `- ${s}`).join('\n'));
    const context = collected === 0
      ? '--- No NFM data could be collected ---\n' + sections.join('\n\n')
      : '--- NETWORK FLOW DATA (collected automatically from CloudWatch Network Flow Monitor, last 1h) ---\n' + sections.join('\n\n');

    return {
      context, summary, tools, collected,
      via: `Network Flow Analyzer (${monitors.length} monitors, health ${healthRows.length}, flows ${flowCount})`,
    };
  },

  analysisPrompt: `You are a network operations expert. You have been given REAL data from AWS CloudWatch Network Flow Monitor (NFM): per-monitor health summaries (timeouts, retransmissions, RTT, AWS-side HealthIndicator) and top-contributor flows (which pod/instance/subnet pairs produced the timeouts/retransmissions/traffic).

## Analysis Structure

### 1. Health Verdict
- Per monitor: healthy vs degraded. degraded=true means AWS itself flagged its network side — say so explicitly (it changes who acts)
- Rank monitors by timeouts, then retransmissions

### 2. Culprit Flows
- From the top-flow tables, identify the pairs that dominate TIMEOUTS and RETRANSMISSIONS (often 1-2 pairs carry most of the count)
- Name them concretely: "pod X (az2) → IP:port (az1)" — port hints the protocol (3306 MySQL, 443 TLS, 8080 HTTP)
- Cross-check against DATA_TRANSFERRED: a pair with high retransmissions AND high transfer may just be volume; high retransmissions on LOW transfer is a genuine quality problem

### 3. Topology & Cost Reading
- AZ/subnet patterns: are the problem flows crossing AZs? Inter-AZ transfer costs ~$0.01/GB per direction (estimate) and adds latency exposure
- traversed path components (TGW/NAT) if present — extra hops are extra failure points

### 4. Hypotheses & Next Checks
- For the top culprit pair: ranked plausible causes (receiver saturation, connection churn, security-group/NACL asymmetry, MTU mismatch, conntrack exhaustion, AZ-crossing to a single-AZ dependency)
- Concrete follow-ups: the pod logs to read (the flow pairs tell you WHERE), kubectl/aws CLI checks, and whether co-locating the workload with its dependency (same AZ) would help

### 5. Limits
- The flow window is the LAST 1 HOUR only (monitor-query API cap); the health summary is the same window
- Per-flow RTT rankings may be absent even when the chart-level RTT average exists (needs enough TCP round-trip samples) — never invent flow RTT

## Rules
- Base the analysis ONLY on the provided data; sources marked 미가용/unavailable or skipped must be acknowledged honestly
- Absolute counts need traffic context — prefer "per-GB" style reasoning when DATA_TRANSFERRED is available
- Use tables for the flow rankings; keep the verdict first`,
};

export default nfmAnalyzeCollector;
