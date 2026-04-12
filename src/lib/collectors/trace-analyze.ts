// Service Trace Analyzer Collector
// 서비스 트레이스 분석 컬렉터: Tempo/Jaeger 트레이스 + Prometheus 서비스 메트릭 + 서비스 맵 자동 수집
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource, getDatasources } from '@/lib/app-config';
import type { DatasourceConfig, DatasourceType } from '@/lib/app-config';
import type { Collector, CollectorResult, SendFn } from './types';

// ============================================================================
// Smart datasource detection — 트레이싱 가능 데이터소스 감지
// ============================================================================

const TRACING_CAPABLE_TYPES: DatasourceType[] = ['tempo', 'jaeger', 'dynatrace', 'datadog'];

interface DetectedTracingDs {
  ds: DatasourceConfig;
  type: DatasourceType;
}

function detectTracingDatasources(): DetectedTracingDs[] {
  const allDs = getDatasources();
  const result: DetectedTracingDs[] = [];
  for (const type of TRACING_CAPABLE_TYPES) {
    for (const ds of allDs) {
      if (ds.type === type) result.push({ ds, type });
    }
  }
  return result;
}

// ============================================================================
// Service Map — span parent-child 관계에서 서비스 의존성 맵 구축
// ============================================================================

interface ServiceMapEdge {
  source: string;
  target: string;
  callCount: number;
  avgLatencyMs: number;
  errorCount: number;
  p95LatencyMs: number;
  operations: string[];
}

/** Extract clean service name from Tempo resource attribute string */
function extractServiceName(resourceStr: string): string {
  const match = resourceStr.match(/service\.name=([^,]+)/);
  return match ? match[1].trim() : resourceStr.split(',')[0]?.trim() || 'unknown';
}

/** Build service map from full trace spans (with parentSpanId) */
function buildServiceMapFromSpans(allSpans: any[], dsType: string): ServiceMapEdge[] {
  // spanId → { serviceName, operationName }
  const spanIndex = new Map<string, { serviceName: string; operationName: string }>();
  for (const span of allSpans) {
    const svc = dsType === 'tempo'
      ? extractServiceName(span.serviceName || '')
      : (span.serviceName || 'unknown');
    spanIndex.set(span.spanId, {
      serviceName: svc,
      operationName: span.name || span.operationName || '',
    });
  }

  // Build edges from parent-child relationships
  const edgeMap = new Map<string, { latencies: number[]; errorCount: number; operations: Set<string> }>();

  for (const span of allSpans) {
    const parentId = span.parentSpanId;
    if (!parentId) continue;

    const parent = spanIndex.get(parentId);
    const child = spanIndex.get(span.spanId);
    if (!parent || !child) continue;
    if (parent.serviceName === child.serviceName) continue; // same service — skip

    const key = `${parent.serviceName}→${child.serviceName}`;
    let edge = edgeMap.get(key);
    if (!edge) {
      edge = { latencies: [], errorCount: 0, operations: new Set() };
      edgeMap.set(key, edge);
    }

    edge.latencies.push(span.durationMs || 0);
    if (span.status === 'error' || span.status === 'STATUS_CODE_ERROR' || span.status === 2) {
      edge.errorCount++;
    }
    if (child.operationName) edge.operations.add(child.operationName);
  }

  // Aggregate
  const edges: ServiceMapEdge[] = [];
  edgeMap.forEach((data, key) => {
    const [source, target] = key.split('→');
    const sorted = [...data.latencies].sort((a, b) => a - b);
    const avg = sorted.length > 0 ? sorted.reduce((s, v) => s + v, 0) / sorted.length : 0;
    const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    edges.push({
      source,
      target,
      callCount: data.latencies.length,
      avgLatencyMs: Math.round(avg * 100) / 100,
      errorCount: data.errorCount,
      p95LatencyMs: sorted[p95Idx] || 0,
      operations: Array.from(data.operations).slice(0, 5),
    });
  });

  return edges.sort((a, b) => b.callCount - a.callCount);
}

// ============================================================================
// Trace collection helpers
// ============================================================================

interface TraceSearchResult {
  traces: any[];
  errorTraces: any[];
  slowTraces: any[];
  serviceName: string;
}

/** Extract unique service names from recent traces */
function extractServiceNames(rows: any[]): string[] {
  const services = new Set<string>();
  for (const row of rows) {
    const name = row.rootServiceName || row.serviceName || '';
    if (name && name !== 'unknown') services.add(name);
  }
  return Array.from(services);
}

/** Collect error + slow traces for a single service (Tempo) */
async function collectServiceTracesTempo(
  ds: DatasourceConfig,
  serviceName: string,
): Promise<TraceSearchResult> {
  const [errorResult, slowResult] = await Promise.allSettled([
    queryDatasource(ds, `{ status = error && resource.service.name = "${serviceName}" }`, { start: '1h', limit: 10 }),
    queryDatasource(ds, `{ duration > 500ms && resource.service.name = "${serviceName}" }`, { start: '1h', limit: 10 }),
  ]);

  const errorTraces = errorResult.status === 'fulfilled' ? errorResult.value.rows : [];
  const slowTraces = slowResult.status === 'fulfilled' ? slowResult.value.rows : [];

  return {
    traces: [...errorTraces, ...slowTraces],
    errorTraces,
    slowTraces,
    serviceName,
  };
}

/** Collect error + slow traces for a single service (Jaeger) */
async function collectServiceTracesJaeger(
  ds: DatasourceConfig,
  serviceName: string,
): Promise<TraceSearchResult> {
  const [errorResult, slowResult] = await Promise.allSettled([
    queryDatasource(ds, `service=${serviceName}&tags={"error":"true"}`, { start: '1h', limit: 10 }),
    queryDatasource(ds, `service=${serviceName}&minDuration=500ms`, { start: '1h', limit: 10 }),
  ]);

  const errorTraces = errorResult.status === 'fulfilled' ? errorResult.value.rows : [];
  const slowTraces = slowResult.status === 'fulfilled' ? slowResult.value.rows : [];

  return {
    traces: [...errorTraces, ...slowTraces],
    errorTraces,
    slowTraces,
    serviceName,
  };
}

// ============================================================================
// Prometheus service metrics
// ============================================================================

interface ServiceMetrics {
  requestRates: any[];
  errorRates: any[];
}

async function collectServiceMetrics(ds: DatasourceConfig): Promise<ServiceMetrics> {
  const [rateResult, errorResult] = await Promise.allSettled([
    queryDatasource(ds, 'topk(20, sum by (service, namespace) (rate(http_requests_total[5m])))', { start: '1h', step: '300' }),
    queryDatasource(ds, 'topk(20, sum by (service, namespace) (rate(http_requests_total{code=~"5.."}[5m])))', { start: '1h', step: '300' }),
  ]);

  return {
    requestRates: rateResult.status === 'fulfilled' ? rateResult.value.rows : [],
    errorRates: errorResult.status === 'fulfilled' ? errorResult.value.rows : [],
  };
}

// ============================================================================
// Collector implementation
// ============================================================================
const traceAnalyzeCollector: Collector = {
  displayName: 'Service Trace Analyzer',

  async collect(send: SendFn, _accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    // Smart datasource detection
    const detectedDs = detectTracingDatasources();
    const tempoDs = getDefaultDatasource('tempo');
    const jaegerDs = getDefaultDatasource('jaeger');
    const tracingDs = tempoDs || jaegerDs || detectedDs[0]?.ds;
    const promDs = getDefaultDatasource('prometheus');

    // Report detected tracing datasources
    if (detectedDs.length > 0) {
      const dsNames = detectedDs.map(d => `${d.ds.name} (${d.type})`).join(', ');
      send('status', { step: 'trace-detect', message: isEn
        ? `🔎 Detected tracing-capable datasources: ${dsNames}`
        : `🔎 트레이싱 가능 데이터소스 감지: ${dsNames}` });
    }

    // No tracing datasource — return minimal result
    if (!tracingDs) {
      send('status', { step: 'trace-no-ds', message: isEn
        ? '⚠️ No tracing datasource (Tempo/Jaeger/Dynatrace/Datadog) configured. Configure one in Datasources page.'
        : '⚠️ 트레이싱 데이터소스(Tempo/Jaeger/Dynatrace/Datadog)가 설정되지 않았습니다. Datasources 페이지에서 설정해주세요.' });
      return {
        sections: { traces: [], serviceMetrics: null, datasourceName: null, dsType: null, serviceMap: [], tracingDatasources: [], traceIdsSampled: 0 },
        usedTools: [],
        queriedResources: [],
        viaSummary: 'Trace Analyzer (no datasource)',
      };
    }

    const dsType = tempoDs ? 'tempo' : (jaegerDs ? 'jaeger' : tracingDs.type);
    send('status', { step: 'trace-discover', message: isEn
      ? `🔍 Discovering services from ${tracingDs.name} (${dsType})...`
      : `🔍 ${tracingDs.name} (${dsType})에서 서비스 탐색 중...` });

    // Step 1: Discover services from recent traces
    let serviceNames: string[] = [];
    try {
      if (dsType === 'tempo') {
        const recentTraces = await queryDatasource(tracingDs, '{ }', { start: '1h', limit: 50 });
        serviceNames = extractServiceNames(recentTraces.rows);
      } else {
        // Jaeger: query a generic service to get trace list
        const recentTraces = await queryDatasource(tracingDs, 'service=*', { start: '1h', limit: 50 });
        serviceNames = extractServiceNames(recentTraces.rows);
      }
    } catch {
      // Fallback: try error traces without service filter
      try {
        if (dsType === 'tempo') {
          const fallback = await queryDatasource(tracingDs, '{ status = error }', { start: '1h', limit: 30 });
          serviceNames = extractServiceNames(fallback.rows);
        }
      } catch { /* no services discovered */ }
    }

    send('status', { step: 'trace-services', message: isEn
      ? `📋 Found ${serviceNames.length} services. Collecting trace samples...`
      : `📋 ${serviceNames.length}개 서비스 발견. 트레이스 샘플 수집 중...` });

    // Step 2: Collect traces per service (limit to top 5 services)
    const targetServices = serviceNames.slice(0, 5);
    const traceResults: TraceSearchResult[] = [];

    if (targetServices.length > 0) {
      const collectFn = dsType === 'tempo' ? collectServiceTracesTempo : collectServiceTracesJaeger;
      const results = await Promise.allSettled(
        targetServices.map(svc => collectFn(tracingDs, svc))
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.traces.length > 0) {
          traceResults.push(r.value);
        }
      }
    } else {
      // No services found — try collecting all error/slow traces
      try {
        if (dsType === 'tempo') {
          const [errRes, slowRes] = await Promise.allSettled([
            queryDatasource(tracingDs, '{ status = error }', { start: '1h', limit: 20 }),
            queryDatasource(tracingDs, '{ duration > 1s }', { start: '1h', limit: 20 }),
          ]);
          const errTraces = errRes.status === 'fulfilled' ? errRes.value.rows : [];
          const slowTraces = slowRes.status === 'fulfilled' ? slowRes.value.rows : [];
          if (errTraces.length > 0 || slowTraces.length > 0) {
            traceResults.push({ traces: [...errTraces, ...slowTraces], errorTraces: errTraces, slowTraces: slowTraces, serviceName: '(all services)' });
          }
        }
      } catch { /* best effort */ }
    }

    send('status', { step: 'trace-collected', message: isEn
      ? `✅ Traces: ${traceResults.length} services with data (${traceResults.reduce((n, r) => n + r.traces.length, 0)} traces)`
      : `✅ 트레이스: ${traceResults.length}개 서비스 데이터 수집 (${traceResults.reduce((n, r) => n + r.traces.length, 0)}개 트레이스)` });

    // Step 2.5: Build service map from full trace span trees
    let serviceMap: ServiceMapEdge[] = [];
    let traceIdsSampled = 0;

    if (traceResults.length > 0 && (dsType === 'tempo' || dsType === 'jaeger')) {
      send('status', { step: 'trace-svcmap', message: isEn
        ? '🗺️ Building service dependency map from trace spans...'
        : '🗺️ 트레이스 span에서 서비스 의존성 맵 구축 중...' });

      // Collect unique trace IDs (mix of error, slow, normal — up to 15)
      const traceIds = new Set<string>();
      for (const svc of traceResults) {
        for (const t of svc.errorTraces) {
          if (t.traceId || t.traceID) traceIds.add(t.traceId || t.traceID);
          if (traceIds.size >= 15) break;
        }
        for (const t of svc.slowTraces) {
          if (t.traceId || t.traceID) traceIds.add(t.traceId || t.traceID);
          if (traceIds.size >= 15) break;
        }
        if (traceIds.size >= 15) break;
      }
      traceIdsSampled = traceIds.size;

      if (traceIds.size > 0) {
        // Fetch full span trees for sampled traces
        const spanResults = await Promise.allSettled(
          Array.from(traceIds).map(tid => queryDatasource(tracingDs, tid))
        );

        const allSpans: any[] = [];
        for (const r of spanResults) {
          if (r.status === 'fulfilled' && r.value.rows.length > 0) {
            allSpans.push(...r.value.rows);
          }
        }

        if (allSpans.length > 0) {
          serviceMap = buildServiceMapFromSpans(allSpans, dsType);
          send('status', { step: 'trace-svcmap-done', message: isEn
            ? `✅ Service map: ${serviceMap.length} edges from ${traceIdsSampled} traces (${allSpans.length} spans)`
            : `✅ 서비스 맵: ${traceIdsSampled}개 트레이스에서 ${serviceMap.length}개 엣지 추출 (${allSpans.length}개 span)` });
        }
      }
    }

    // Step 3: Prometheus service metrics (optional)
    let serviceMetrics: ServiceMetrics | null = null;
    if (promDs) {
      send('status', { step: 'trace-prom', message: isEn
        ? `📈 Querying service metrics from ${promDs.name}...`
        : `📈 ${promDs.name}에서 서비스 메트릭 조회 중...` });
      try {
        serviceMetrics = await collectServiceMetrics(promDs);
      } catch { /* optional — skip on failure */ }

      if (serviceMetrics && (serviceMetrics.requestRates.length > 0 || serviceMetrics.errorRates.length > 0)) {
        send('status', { step: 'trace-prom-done', message: isEn
          ? `✅ Prometheus: ${serviceMetrics.requestRates.length} request rate series, ${serviceMetrics.errorRates.length} error rate series`
          : `✅ Prometheus: 요청률 ${serviceMetrics.requestRates.length}개, 에러율 ${serviceMetrics.errorRates.length}개 시리즈` });
      }
    }

    // Build result
    const usedTools: string[] = [];
    const queriedResources: string[] = [];
    if (traceResults.length > 0) {
      usedTools.push(`${dsType === 'tempo' ? 'Tempo' : 'Jaeger'}: ${traceResults.length} services traced`);
      queriedResources.push(dsType);
    }
    if (serviceMetrics && (serviceMetrics.requestRates.length > 0 || serviceMetrics.errorRates.length > 0)) {
      usedTools.push('Prometheus: service request/error rates');
      queriedResources.push('prometheus');
    }

    const totalTraces = traceResults.reduce((n, r) => n + r.traces.length, 0);
    const tracingDatasources = detectedDs.map(d => ({ name: d.ds.name, type: d.type, selected: d.ds.id === tracingDs.id }));
    return {
      sections: { traceResults, serviceMetrics, serviceNames, datasourceName: tracingDs.name, dsType, serviceMap, tracingDatasources, traceIdsSampled },
      usedTools,
      queriedResources,
      viaSummary: `Trace Analyzer (${totalTraces} traces, ${serviceMap.length} edges, ${traceResults.length} services, ${tracingDs.name})`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { traceResults, serviceMetrics, serviceNames, datasourceName, dsType, serviceMap, tracingDatasources, traceIdsSampled } = data.sections;
    const sections: string[] = [];

    // Detected tracing datasources
    if (tracingDatasources?.length > 0) {
      sections.push('## Detected Tracing Datasources');
      for (const d of tracingDatasources) {
        const icon = d.selected ? '✅' : '⚠️';
        const note = d.selected ? '— selected for analysis' : '— available';
        sections.push(`- ${icon} ${d.name} (${d.type}) ${note}`);
      }
    }

    sections.push(`## Tracing Datasource: ${datasourceName || 'none'} (${dsType || 'none'})`);
    if (serviceNames?.length > 0) {
      sections.push(`### Discovered Services (${serviceNames.length})\n${serviceNames.join(', ')}`);
    }

    // Service dependency map (built from span parent-child relationships)
    if (serviceMap?.length > 0) {
      sections.push(`## Service Dependency Map (built from ${traceIdsSampled || 0} traces)`);
      sections.push('| Source → Target | Calls | Avg Latency | P95 Latency | Errors | Operations |');
      sections.push('|---|---|---|---|---|---|');
      for (const edge of serviceMap.slice(0, 50)) {
        const ops = edge.operations.length > 0 ? edge.operations.join(', ') : '-';
        sections.push(`| ${edge.source} → ${edge.target} | ${edge.callCount} | ${edge.avgLatencyMs}ms | ${edge.p95LatencyMs}ms | ${edge.errorCount} | ${ops} |`);
      }
    }

    if (traceResults?.length > 0) {
      sections.push('## Trace Samples per Service');
      for (const svc of traceResults) {
        sections.push(`### ${svc.serviceName}`);
        if (svc.errorTraces.length > 0) {
          sections.push(`#### Error Traces (${svc.errorTraces.length})\n\`\`\`json\n${JSON.stringify(svc.errorTraces.slice(0, 20), null, 2)}\n\`\`\``);
        }
        if (svc.slowTraces.length > 0) {
          sections.push(`#### Slow Traces (${svc.slowTraces.length})\n\`\`\`json\n${JSON.stringify(svc.slowTraces.slice(0, 20), null, 2)}\n\`\`\``);
        }
      }
    }

    if (serviceMetrics) {
      if (serviceMetrics.requestRates.length > 0) {
        sections.push('## Service Request Rates (Prometheus, last 1h)');
        sections.push(`\`\`\`json\n${JSON.stringify(serviceMetrics.requestRates.slice(0, 30), null, 2)}\n\`\`\``);
      }
      if (serviceMetrics.errorRates.length > 0) {
        sections.push('## Service Error Rates — 5xx (Prometheus, last 1h)');
        sections.push(`\`\`\`json\n${JSON.stringify(serviceMetrics.errorRates.slice(0, 30), null, 2)}\n\`\`\``);
      }
    }

    if (sections.length <= 1) return '\n\n--- No trace data could be collected ---';
    return '\n\n--- SERVICE TRACE DATA (collected automatically) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: `You are a distributed systems expert analyzing service traces.
You have been given REAL trace data from the user's environment.

## Analysis Structure

### 1. Service Dependency Map
- List all services and their call relationships (A -> B -> C)
- Identify critical path services

### 2. Latency Analysis
- Slowest service-to-service calls
- Latency breakdown per span
- Potential bottlenecks

### 3. Error Analysis
- Services generating errors
- Error propagation paths (which downstream errors cause upstream failures)
- Error patterns and potential root causes

### 4. Optimization Recommendations
- Services that could benefit from caching
- Fan-out patterns that could be parallelized
- Circuit breaker recommendations for unstable dependencies
- Connection pooling suggestions

## Rules
- Base analysis on the ACTUAL trace data provided
- If trace data is limited, note what additional instrumentation would help
- Always respond in the SAME LANGUAGE as the user's question`,
};

export default traceAnalyzeCollector;
