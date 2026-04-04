// Service Trace Analyzer Collector
// 서비스 트레이스 분석 컬렉터: Tempo/Jaeger 트레이스 + Prometheus 서비스 메트릭 자동 수집
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import type { DatasourceConfig } from '@/lib/app-config';
import type { Collector, CollectorResult, SendFn } from './types';

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
    const tempoDs = getDefaultDatasource('tempo');
    const jaegerDs = getDefaultDatasource('jaeger');
    const tracingDs = tempoDs || jaegerDs;
    const promDs = getDefaultDatasource('prometheus');

    // No tracing datasource — return minimal result
    if (!tracingDs) {
      send('status', { step: 'trace-no-ds', message: isEn
        ? '⚠️ No tracing datasource (Tempo/Jaeger) configured. Configure one in Datasources page.'
        : '⚠️ 트레이싱 데이터소스(Tempo/Jaeger)가 설정되지 않았습니다. Datasources 페이지에서 설정해주세요.' });
      return {
        sections: { traces: [], serviceMetrics: null, datasourceName: null, dsType: null },
        usedTools: [],
        queriedResources: [],
        viaSummary: 'Trace Analyzer (no datasource)',
      };
    }

    const dsType = tempoDs ? 'tempo' : 'jaeger';
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
    return {
      sections: { traceResults, serviceMetrics, serviceNames, datasourceName: tracingDs.name, dsType },
      usedTools,
      queriedResources,
      viaSummary: `Trace Analyzer (${totalTraces} traces, ${traceResults.length} services, ${tracingDs.name})`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { traceResults, serviceMetrics, serviceNames, datasourceName, dsType } = data.sections;
    const sections: string[] = [];

    sections.push(`## Tracing Datasource: ${datasourceName || 'none'} (${dsType || 'none'})`);
    if (serviceNames?.length > 0) {
      sections.push(`### Discovered Services (${serviceNames.length})\n${serviceNames.join(', ')}`);
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
