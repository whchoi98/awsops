// Multi-Source Incident Analyzer Collector
// 다중 소스 인시던트 분석 컬렉터: CloudWatch + K8s + Prometheus + Loki + Tempo/Jaeger 자동 수집
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import { runQuery } from '@/lib/steampipe';
import type { Collector, CollectorResult, SendFn } from './types';

// ============================================================================
// Steampipe queries — always available
// ============================================================================

const CLOUDWATCH_ALARMS_SQL = `
SELECT
  name,
  namespace,
  metric_name,
  state_value,
  state_reason,
  state_updated_timestamp,
  account_id
FROM aws_cloudwatch_alarm
WHERE state_value = 'ALARM'
ORDER BY state_updated_timestamp DESC
LIMIT 20
`;

const K8S_WARNING_EVENTS_SQL = `
SELECT
  reason,
  message,
  type,
  namespace,
  involved_object_kind,
  involved_object_name,
  last_timestamp
FROM kubernetes_event
WHERE type = 'Warning'
ORDER BY last_timestamp DESC
LIMIT 30
`;

// ============================================================================
// Prometheus anomaly queries
// ============================================================================

interface PromAnomalyResult { label: string; rows: any[]; }

async function collectPrometheusAnomalies(ds: any): Promise<PromAnomalyResult[]> {
  const queries: { label: string; promql: string }[] = [
    { label: 'HTTP 5xx Error Rate by Service',
      promql: 'topk(20, sum by (namespace, service) (rate(http_requests_total{code=~"5.."}[5m])))' },
    { label: 'CPU Spikes by Pod',
      promql: 'topk(10, avg by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[5m])))' },
    { label: 'Pod Restart Counts',
      promql: 'topk(20, sum by (namespace, pod) (kube_pod_container_status_restarts_total))' },
    { label: 'Memory Pressure (usage/limit ratio)',
      promql: 'topk(10, container_memory_working_set_bytes{container!=""} / container_spec_memory_limit_bytes{container!=""})' },
  ];

  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const result = await queryDatasource(ds, q.promql, { start: '1h', step: '300' });
      return { label: q.label, rows: result.rows || [] };
    })
  );

  const anomalies: PromAnomalyResult[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.rows.length > 0) {
      anomalies.push(r.value);
    }
  }
  return anomalies;
}

// ============================================================================
// Loki error log collection
// ============================================================================

async function collectLokiErrors(ds: any): Promise<any[]> {
  // Try structured level label first, then fallback to broader pattern
  const logQueries = [
    '{level=~"error|fatal"}',
    '{job=~".+"} |= "error"',
  ];
  for (const logql of logQueries) {
    try {
      const result = await queryDatasource(ds, logql, { start: '1h', limit: 50 });
      if (result.rows && result.rows.length > 0) return result.rows;
    } catch { /* try next */ }
  }
  return [];
}

// ============================================================================
// Tempo/Jaeger error trace collection
// ============================================================================

async function collectErrorTraces(ds: any, dsType: 'tempo' | 'jaeger'): Promise<any[]> {
  try {
    if (dsType === 'tempo') {
      const result = await queryDatasource(ds, '{ status = error }', { start: '1h', limit: 20 });
      return result.rows || [];
    } else {
      // Jaeger: search for traces with error tags
      const result = await queryDatasource(ds, 'service=*&tags={"error":"true"}', { start: '1h', limit: 20 });
      return result.rows || [];
    }
  } catch {
    return [];
  }
}

// ============================================================================
// Collector implementation
// ============================================================================
const incidentCollector: Collector = {
  displayName: 'Incident Analyzer',

  async collect(send: SendFn, accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    const promDs = getDefaultDatasource('prometheus');
    const lokiDs = getDefaultDatasource('loki');
    const tempoDs = getDefaultDatasource('tempo');
    const jaegerDs = getDefaultDatasource('jaeger');
    const tracingDs = tempoDs || jaegerDs;
    const tracingType: 'tempo' | 'jaeger' | null = tempoDs ? 'tempo' : jaegerDs ? 'jaeger' : null;

    // Report available sources
    const sources: string[] = ['CloudWatch Alarms (Steampipe)'];
    if (promDs) sources.push(`Prometheus (${promDs.name})`);
    if (lokiDs) sources.push(`Loki (${lokiDs.name})`);
    if (tracingDs) sources.push(`${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'} (${tracingDs.name})`);

    send('status', { step: 'incident-start', message: isEn
      ? `🔍 Scanning ${sources.length} sources: ${sources.join(', ')}...`
      : `🔍 ${sources.length}개 소스 스캔 중: ${sources.join(', ')}...` });

    // Run ALL sources in parallel via Promise.allSettled
    const queryOpts = accountId ? { accountId } : undefined;

    const [alarmsResult, k8sEventsResult, promResult, lokiResult, tracesResult] = await Promise.allSettled([
      // 1. CloudWatch Alarms (always available)
      runQuery(CLOUDWATCH_ALARMS_SQL, queryOpts),
      // 2. K8s Warning Events (optional — fails gracefully if no K8s connection)
      runQuery(K8S_WARNING_EVENTS_SQL, queryOpts),
      // 3. Prometheus anomalies (optional)
      promDs ? collectPrometheusAnomalies(promDs) : Promise.resolve([]),
      // 4. Loki errors (optional)
      lokiDs ? collectLokiErrors(lokiDs) : Promise.resolve([]),
      // 5. Tracing errors (optional)
      tracingDs && tracingType ? collectErrorTraces(tracingDs, tracingType) : Promise.resolve([]),
    ]);

    // Extract results safely
    const alarms = alarmsResult.status === 'fulfilled' ? (alarmsResult.value?.rows || []) : [];
    const k8sEvents = k8sEventsResult.status === 'fulfilled' ? (k8sEventsResult.value?.rows || []) : [];
    const promAnomalies: PromAnomalyResult[] = promResult.status === 'fulfilled' ? (promResult.value as PromAnomalyResult[]) : [];
    const lokiErrors = lokiResult.status === 'fulfilled' ? (lokiResult.value as any[]) : [];
    const errorTraces = tracesResult.status === 'fulfilled' ? (tracesResult.value as any[]) : [];

    // SSE progress per source
    if (alarms.length > 0) {
      send('status', { step: 'incident-alarms', message: isEn
        ? `🚨 CloudWatch: ${alarms.length} alarm(s) in ALARM state`
        : `🚨 CloudWatch: ${alarms.length}개 알람 발생 중` });
    } else {
      send('status', { step: 'incident-alarms-ok', message: isEn
        ? '✅ CloudWatch: No active alarms'
        : '✅ CloudWatch: 활성 알람 없음' });
    }

    if (k8sEvents.length > 0) {
      send('status', { step: 'incident-k8s', message: isEn
        ? `⚠️ K8s: ${k8sEvents.length} warning event(s)`
        : `⚠️ K8s: ${k8sEvents.length}개 경고 이벤트` });
    } else if (k8sEventsResult.status === 'fulfilled') {
      send('status', { step: 'incident-k8s-ok', message: isEn
        ? '✅ K8s: No warning events'
        : '✅ K8s: 경고 이벤트 없음' });
    }

    if (promDs && promAnomalies.length > 0) {
      const totalRows = promAnomalies.reduce((n, a) => n + a.rows.length, 0);
      send('status', { step: 'incident-prom', message: isEn
        ? `📈 Prometheus: ${promAnomalies.length} anomaly type(s) detected (${totalRows} data points)`
        : `📈 Prometheus: ${promAnomalies.length}개 이상 유형 감지 (${totalRows}개 데이터 포인트)` });
    }

    if (lokiDs && lokiErrors.length > 0) {
      send('status', { step: 'incident-loki', message: isEn
        ? `📝 Loki: ${lokiErrors.length} error log(s) found`
        : `📝 Loki: ${lokiErrors.length}개 에러 로그 발견` });
    }

    if (tracingDs && errorTraces.length > 0) {
      send('status', { step: 'incident-traces', message: isEn
        ? `🔗 ${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'}: ${errorTraces.length} error trace(s)`
        : `🔗 ${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'}: ${errorTraces.length}개 에러 트레이스` });
    }

    // Build used tools / queried resources
    const usedTools: string[] = [];
    const queriedResources: string[] = [];

    usedTools.push(`Steampipe: ${alarms.length} CloudWatch alarms`);
    queriedResources.push('steampipe');
    if (k8sEvents.length > 0) usedTools.push(`Steampipe: ${k8sEvents.length} K8s warning events`);
    if (promAnomalies.length > 0) {
      usedTools.push(`Prometheus: ${promAnomalies.length} anomaly categories`);
      queriedResources.push('prometheus');
    }
    if (lokiErrors.length > 0) {
      usedTools.push(`Loki: ${lokiErrors.length} error logs`);
      queriedResources.push('loki');
    }
    if (errorTraces.length > 0) {
      usedTools.push(`${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'}: ${errorTraces.length} error traces`);
      queriedResources.push(tracingType || 'tracing');
    }

    const totalFindings = alarms.length + k8sEvents.length +
      promAnomalies.reduce((n, a) => n + a.rows.length, 0) +
      lokiErrors.length + errorTraces.length;

    return {
      sections: {
        alarms,
        k8sEvents,
        promAnomalies,
        lokiErrors,
        errorTraces,
        tracingType,
        sourcesAvailable: {
          prometheus: !!promDs,
          loki: !!lokiDs,
          tracing: !!tracingDs,
          tracingName: tracingDs?.name || null,
          promName: promDs?.name || null,
          lokiName: lokiDs?.name || null,
        },
      },
      usedTools,
      queriedResources,
      viaSummary: `Incident Analyzer (${totalFindings} findings from ${sources.length} sources)`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { alarms, k8sEvents, promAnomalies, lokiErrors, errorTraces, tracingType, sourcesAvailable } = data.sections;
    const sections: string[] = [];

    // Source availability summary
    const available: string[] = ['CloudWatch (Steampipe)'];
    if (sourcesAvailable.prometheus) available.push(`Prometheus (${sourcesAvailable.promName})`);
    if (sourcesAvailable.loki) available.push(`Loki (${sourcesAvailable.lokiName})`);
    if (sourcesAvailable.tracing) available.push(`${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'} (${sourcesAvailable.tracingName})`);
    sections.push(`## Data Sources: ${available.join(', ')}`);

    // CloudWatch Alarms
    if (alarms?.length > 0) {
      sections.push('## CloudWatch Alarms in ALARM State');
      sections.push(`\`\`\`json\n${JSON.stringify(alarms, null, 2)}\n\`\`\``);
    } else {
      sections.push('## CloudWatch Alarms\nNo active alarms.');
    }

    // K8s Warning Events
    if (k8sEvents?.length > 0) {
      sections.push('## Kubernetes Warning Events (recent)');
      sections.push(`\`\`\`json\n${JSON.stringify(k8sEvents, null, 2)}\n\`\`\``);
    }

    // Prometheus Anomalies
    if (promAnomalies?.length > 0) {
      sections.push('## Prometheus Anomalies Detected');
      for (const anomaly of promAnomalies) {
        sections.push(`### ${anomaly.label} (${anomaly.rows.length} series)\n\`\`\`json\n${JSON.stringify(anomaly.rows.slice(0, 30), null, 2)}\n\`\`\``);
      }
    }

    // Loki Error Logs
    if (lokiErrors?.length > 0) {
      sections.push('## Loki Error Logs (last 1h)');
      sections.push(`\`\`\`json\n${JSON.stringify(lokiErrors.slice(0, 30), null, 2)}\n\`\`\``);
    }

    // Error Traces
    if (errorTraces?.length > 0) {
      sections.push(`## ${tracingType === 'tempo' ? 'Tempo' : 'Jaeger'} Error Traces (last 1h)`);
      sections.push(`\`\`\`json\n${JSON.stringify(errorTraces.slice(0, 20), null, 2)}\n\`\`\``);
    }

    if (sections.length <= 1) return '\n\n--- No incident data could be collected ---';
    return '\n\n--- INCIDENT ANALYSIS DATA (collected automatically) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: `You are an SRE incident analysis expert. You have been given REAL data from multiple observability sources collected from the user's environment.

## Analysis Structure

### 1. Incident Summary
- Current severity assessment (Critical/Warning/Info)
- Affected services/resources
- Timeline of events

### 2. Root Cause Analysis
- Most likely root cause(s) based on cross-source correlation
- Evidence from each data source supporting the hypothesis
- Alternative hypotheses if data is ambiguous

### 3. Impact Assessment
- Which services are affected
- User-facing impact (if detectable from error rates/latency)
- Blast radius estimation

### 4. Remediation Steps
- Immediate actions to mitigate
- Investigation commands (kubectl, AWS CLI)
- Rollback procedures if applicable

### 5. Prevention
- Monitoring gaps identified
- Suggested alerts/dashboards to add
- Configuration changes to prevent recurrence

## Rules
- Correlate timestamps across sources to build a coherent timeline
- If a source has no data, note it but don't treat it as "no issues"
- Prioritize actionable findings over exhaustive listings
- Always respond in the SAME LANGUAGE as the user's question`,
};

export default incidentCollector;
