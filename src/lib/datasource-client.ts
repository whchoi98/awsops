// External datasource HTTP client / 외부 데이터소스 HTTP 클라이언트
// Uses native fetch() — no npm packages needed (ARM-compatible)
// Supports Prometheus, Loki, Tempo, ClickHouse via their HTTP APIs
import NodeCache from 'node-cache';
import type { DatasourceConfig, DatasourceType } from './app-config';
import { DATASOURCE_TYPES } from './datasource-registry';

// --- Types ---

export interface QueryOptions {
  start?: string;   // ISO timestamp or relative (e.g., "1h")
  end?: string;     // ISO timestamp
  step?: string;    // Prometheus/Loki step (e.g., "15s")
  limit?: number;   // Max results
  direction?: 'forward' | 'backward'; // Loki log direction
}

export interface QueryResult {
  columns: string[];
  rows: any[];
  metadata: {
    datasource: string;
    type: DatasourceType;
    queryLanguage: string;
    executionTimeMs: number;
    resultType?: string;   // Prometheus: "vector", "matrix", "scalar"
    totalRows?: number;
  };
}

export interface TestResult {
  ok: boolean;
  latency: number;
  version?: string;
  error?: string;
}

// --- Cache ---
const dsCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

function cacheKey(dsId: string, query: string, opts?: QueryOptions): string {
  return `ds:${dsId}:${query}:${JSON.stringify(opts || {})}`;
}

// --- Auth header builder ---
function buildHeaders(ds: DatasourceConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (ds.auth) {
    switch (ds.auth.type) {
      case 'basic':
        if (ds.auth.username) {
          headers['Authorization'] = 'Basic ' + Buffer.from(`${ds.auth.username}:${ds.auth.password || ''}`).toString('base64');
        }
        break;
      case 'bearer':
        if (ds.auth.token) headers['Authorization'] = `Bearer ${ds.auth.token}`;
        break;
      case 'custom-header':
        if (ds.auth.headerName && ds.auth.headerValue) {
          headers[ds.auth.headerName] = ds.auth.headerValue;
        }
        break;
    }
  }
  if (ds.settings?.customHeaders) {
    Object.assign(headers, ds.settings.customHeaders);
  }
  return headers;
}

// --- Timeout fetch wrapper ---
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...init, signal: controller.signal });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// --- Time range helpers ---
function parseRelativeTime(rel: string): string {
  const match = rel.match(/^(\d+)([smhd])$/);
  if (!match) return rel;
  const [, num, unit] = match;
  const ms = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit] || 0;
  return new Date(Date.now() - parseInt(num) * ms).toISOString();
}

function toUnixSeconds(ts: string): string {
  if (/^\d+$/.test(ts)) return ts;
  if (/^\d+\.\d+$/.test(ts)) return String(Math.floor(parseFloat(ts)));
  if (/^\d+[smhd]$/.test(ts)) return String(Math.floor(new Date(parseRelativeTime(ts)).getTime() / 1000));
  return String(Math.floor(new Date(ts).getTime() / 1000));
}

// ============================================================================
// Prometheus / 프로메테우스
// ============================================================================
async function queryPrometheus(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  const isRange = opts?.start || opts?.step;
  const now = Date.now() / 1000;
  const params = new URLSearchParams({ query });

  if (isRange) {
    params.set('start', toUnixSeconds(opts?.start || '1h'));
    params.set('end', toUnixSeconds(opts?.end || String(now)));
    params.set('step', opts?.step || '60');
  } else {
    params.set('time', String(now));
  }

  const endpoint = isRange ? '/api/v1/query_range' : '/api/v1/query';
  const resp = await fetchWithTimeout(`${baseUrl}${endpoint}?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Prometheus error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  if (data.status !== 'success') throw new Error(`Prometheus query failed: ${data.error || 'unknown'}`);

  return normalizePrometheusResult(data.data, ds);
}

function normalizePrometheusResult(data: any, ds: DatasourceConfig): QueryResult {
  const resultType = data.resultType;

  if (resultType === 'vector') {
    const rows = (data.result || []).map((r: any) => ({
      metric: JSON.stringify(r.metric),
      value: r.value?.[1],
      timestamp: new Date((r.value?.[0] || 0) * 1000).toISOString(),
    }));
    return {
      columns: ['metric', 'value', 'timestamp'],
      rows,
      metadata: { datasource: ds.name, type: 'prometheus', queryLanguage: 'PromQL', executionTimeMs: 0, resultType, totalRows: rows.length },
    };
  }

  if (resultType === 'matrix') {
    const rows: any[] = [];
    for (const series of data.result || []) {
      const metricLabel = JSON.stringify(series.metric);
      for (const [ts, val] of series.values || []) {
        rows.push({ metric: metricLabel, value: val, timestamp: new Date(ts * 1000).toISOString() });
      }
    }
    return {
      columns: ['metric', 'value', 'timestamp'],
      rows,
      metadata: { datasource: ds.name, type: 'prometheus', queryLanguage: 'PromQL', executionTimeMs: 0, resultType, totalRows: rows.length },
    };
  }

  // scalar / string
  return {
    columns: ['value'],
    rows: [{ value: data.result?.[1] || data.result }],
    metadata: { datasource: ds.name, type: 'prometheus', queryLanguage: 'PromQL', executionTimeMs: 0, resultType, totalRows: 1 },
  };
}

// ============================================================================
// Loki / 로키
// ============================================================================
async function queryLoki(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  const isRange = opts?.start || opts?.step;
  const params = new URLSearchParams({ query });

  if (isRange) {
    const now = Date.now() * 1000000; // nanoseconds
    params.set('start', opts?.start ? String(new Date(parseRelativeTime(opts.start)).getTime() * 1000000) : String(now - 3600000000000));
    params.set('end', opts?.end ? String(new Date(opts.end).getTime() * 1000000) : String(now));
    if (opts?.step) params.set('step', opts.step);
  }
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.direction) params.set('direction', opts.direction);

  const endpoint = isRange ? '/loki/api/v1/query_range' : '/loki/api/v1/query';
  const resp = await fetchWithTimeout(`${baseUrl}${endpoint}?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Loki error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  if (data.status !== 'success') throw new Error(`Loki query failed: ${data.error || 'unknown'}`);

  return normalizeLokiResult(data.data, ds);
}

function normalizeLokiResult(data: any, ds: DatasourceConfig): QueryResult {
  const resultType = data.resultType;
  const rows: any[] = [];

  if (resultType === 'streams') {
    for (const stream of data.result || []) {
      const labels = JSON.stringify(stream.stream);
      for (const [ts, line] of stream.values || []) {
        rows.push({ timestamp: new Date(parseInt(ts) / 1000000).toISOString(), labels, line });
      }
    }
    return {
      columns: ['timestamp', 'labels', 'line'],
      rows,
      metadata: { datasource: ds.name, type: 'loki', queryLanguage: 'LogQL', executionTimeMs: 0, resultType, totalRows: rows.length },
    };
  }

  // matrix (metric queries in Loki)
  if (resultType === 'matrix') {
    for (const series of data.result || []) {
      const labels = JSON.stringify(series.metric);
      for (const [ts, val] of series.values || []) {
        rows.push({ timestamp: new Date(ts * 1000).toISOString(), labels, value: val });
      }
    }
    return {
      columns: ['timestamp', 'labels', 'value'],
      rows,
      metadata: { datasource: ds.name, type: 'loki', queryLanguage: 'LogQL', executionTimeMs: 0, resultType, totalRows: rows.length },
    };
  }

  return {
    columns: ['result'],
    rows: [{ result: JSON.stringify(data.result) }],
    metadata: { datasource: ds.name, type: 'loki', queryLanguage: 'LogQL', executionTimeMs: 0, resultType, totalRows: 1 },
  };
}

// ============================================================================
// Tempo / 템포
// ============================================================================
async function queryTempo(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  // Detect trace ID lookup vs TraceQL search
  const isTraceId = /^[a-f0-9]{16,32}$/i.test(query.trim());

  if (isTraceId) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/traces/${query.trim()}`, { headers }, timeout);
    if (!resp.ok) throw new Error(`Tempo error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return normalizeTempoTrace(data, ds);
  }

  // TraceQL search
  const params = new URLSearchParams({ q: query });
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.start) params.set('start', toUnixSeconds(opts.start));
  params.set('end', toUnixSeconds(opts?.end || String(Math.floor(Date.now() / 1000))));

  const resp = await fetchWithTimeout(`${baseUrl}/api/search?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Tempo error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return normalizeTempoSearch(data, ds);
}

function normalizeTempoTrace(data: any, ds: DatasourceConfig): QueryResult {
  const rows: any[] = [];
  const batches = data.batches || data.resourceSpans || [];
  for (const batch of batches) {
    const resource = batch.resource?.attributes?.map((a: any) => `${a.key}=${a.value?.stringValue || a.value?.intValue || ''}`).join(', ') || '';
    const scopeSpans = batch.scopeSpans || batch.instrumentationLibrarySpans || [];
    for (const scope of scopeSpans) {
      for (const span of scope.spans || []) {
        rows.push({
          traceId: span.traceId,
          spanId: span.spanId,
          name: span.name,
          serviceName: resource,
          durationMs: span.endTimeUnixNano && span.startTimeUnixNano
            ? (parseInt(span.endTimeUnixNano) - parseInt(span.startTimeUnixNano)) / 1000000
            : 0,
          status: span.status?.code || 'UNSET',
          startTime: span.startTimeUnixNano ? new Date(parseInt(span.startTimeUnixNano) / 1000000).toISOString() : '',
        });
      }
    }
  }
  return {
    columns: ['traceId', 'spanId', 'name', 'serviceName', 'durationMs', 'status', 'startTime'],
    rows,
    metadata: { datasource: ds.name, type: 'tempo', queryLanguage: 'TraceQL', executionTimeMs: 0, resultType: 'trace', totalRows: rows.length },
  };
}

function normalizeTempoSearch(data: any, ds: DatasourceConfig): QueryResult {
  const traces = data.traces || [];
  const rows = traces.map((t: any) => ({
    traceId: t.traceID,
    rootServiceName: t.rootServiceName,
    rootTraceName: t.rootTraceName,
    durationMs: t.durationMs,
    startTime: t.startTimeUnixNano ? new Date(parseInt(t.startTimeUnixNano) / 1000000).toISOString() : '',
    spanSets: t.spanSets?.length || 0,
  }));
  return {
    columns: ['traceId', 'rootServiceName', 'rootTraceName', 'durationMs', 'startTime', 'spanSets'],
    rows,
    metadata: { datasource: ds.name, type: 'tempo', queryLanguage: 'TraceQL', executionTimeMs: 0, resultType: 'search', totalRows: rows.length },
  };
}

// ============================================================================
// ClickHouse / 클릭하우스
// ============================================================================
async function queryClickHouse(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  // SELECT-only validation (same pattern as steampipe.ts)
  if (!/^\s*SELECT\s/i.test(query) && !/^\s*SHOW\s/i.test(query) && !/^\s*DESCRIBE\s/i.test(query)) {
    throw new Error('Only SELECT, SHOW, and DESCRIBE queries are allowed');
  }
  if (/[|&`;]/.test(query)) throw new Error('Invalid characters in query');
  // Block dangerous ClickHouse table functions that can access external resources
  if (/\b(url|file|remote|remoteSecure|s3|gcs|hdfs|input|cluster|mysql|postgresql|jdbc|odbc|mongo)\s*\(/i.test(query)) {
    throw new Error('Table functions are not allowed for security reasons');
  }

  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  headers['Content-Type'] = 'text/plain';
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  const params = new URLSearchParams();
  if (ds.settings?.database) params.set('database', ds.settings.database);
  params.set('default_format', 'JSON');

  const limitedQuery = opts?.limit && !/LIMIT\s+\d/i.test(query)
    ? `${query.replace(/;\s*$/, '')} LIMIT ${opts.limit}`
    : query;

  const url = `${baseUrl}/?${params}`;
  const resp = await fetchWithTimeout(url, { method: 'POST', headers, body: limitedQuery }, timeout);
  if (!resp.ok) throw new Error(`ClickHouse error ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  return normalizeClickHouseResult(data, ds);
}

function normalizeClickHouseResult(data: any, ds: DatasourceConfig): QueryResult {
  const meta = data.meta || [];
  const columns = meta.map((m: any) => m.name);
  const rows = data.data || [];
  return {
    columns,
    rows,
    metadata: {
      datasource: ds.name,
      type: 'clickhouse',
      queryLanguage: 'SQL',
      executionTimeMs: data.statistics?.elapsed ? Math.round(data.statistics.elapsed * 1000) : 0,
      totalRows: data.rows || rows.length,
    },
  };
}

// ============================================================================
// Jaeger / 예거
// ============================================================================
async function queryJaeger(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  // Detect trace ID lookup vs service search
  const isTraceId = /^[a-f0-9]{16,32}$/i.test(query.trim());

  if (isTraceId) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/traces/${query.trim()}`, { headers }, timeout);
    if (!resp.ok) throw new Error(`Jaeger error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return normalizeJaegerTrace(data, ds);
  }

  // Parse service search params: "service=X&operation=Y&tags={}&lookback=2h&limit=50"
  const params = new URLSearchParams();
  const parts = query.split('&');
  for (const part of parts) {
    const [k, ...rest] = part.split('=');
    if (k && rest.length) params.set(k.trim(), rest.join('=').trim());
  }
  if (!params.has('service')) params.set('service', query.trim());
  if (!params.has('limit')) params.set('limit', String(opts?.limit || 20));
  if (opts?.start) params.set('start', String(new Date(parseRelativeTime(opts.start)).getTime() * 1000));
  if (opts?.end) params.set('end', String(new Date(opts.end).getTime() * 1000));

  const resp = await fetchWithTimeout(`${baseUrl}/api/traces?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Jaeger error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return normalizeJaegerSearch(data, ds);
}

function normalizeJaegerTrace(data: any, ds: DatasourceConfig): QueryResult {
  const rows: any[] = [];
  const traces = data.data || [];
  for (const trace of traces) {
    for (const span of trace.spans || []) {
      const process = trace.processes?.[span.processID];
      rows.push({
        traceId: trace.traceID,
        spanId: span.spanID,
        operationName: span.operationName,
        serviceName: process?.serviceName || '',
        durationMs: (span.duration || 0) / 1000,
        status: span.tags?.find((t: any) => t.key === 'error')?.value ? 'error' : 'ok',
        startTime: span.startTime ? new Date(span.startTime / 1000).toISOString() : '',
      });
    }
  }
  return {
    columns: ['traceId', 'spanId', 'operationName', 'serviceName', 'durationMs', 'status', 'startTime'],
    rows,
    metadata: { datasource: ds.name, type: 'jaeger', queryLanguage: 'Jaeger API', executionTimeMs: 0, resultType: 'trace', totalRows: rows.length },
  };
}

function normalizeJaegerSearch(data: any, ds: DatasourceConfig): QueryResult {
  const traces = data.data || [];
  const rows = traces.map((t: any) => {
    const rootSpan = t.spans?.[0];
    const process = rootSpan ? t.processes?.[rootSpan.processID] : null;
    return {
      traceId: t.traceID,
      serviceName: process?.serviceName || '',
      operationName: rootSpan?.operationName || '',
      durationMs: (rootSpan?.duration || 0) / 1000,
      spans: t.spans?.length || 0,
      startTime: rootSpan?.startTime ? new Date(rootSpan.startTime / 1000).toISOString() : '',
    };
  });
  return {
    columns: ['traceId', 'serviceName', 'operationName', 'durationMs', 'spans', 'startTime'],
    rows,
    metadata: { datasource: ds.name, type: 'jaeger', queryLanguage: 'Jaeger API', executionTimeMs: 0, resultType: 'search', totalRows: rows.length },
  };
}

// ============================================================================
// Dynatrace / 다이나트레이스
// ============================================================================
async function queryDynatrace(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  // Detect entity query vs metric query
  const isEntity = /^(HOST|SERVICE|PROCESS|APPLICATION)/i.test(query.trim());

  if (isEntity) {
    const params = new URLSearchParams({ entitySelector: query.trim() });
    if (opts?.limit) params.set('pageSize', String(opts.limit));
    const resp = await fetchWithTimeout(`${baseUrl}/api/v2/entities?${params}`, { headers }, timeout);
    if (!resp.ok) throw new Error(`Dynatrace error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return normalizeDynatraceEntities(data, ds);
  }

  // Metric query
  const params = new URLSearchParams({ metricSelector: query.trim() });
  if (opts?.start) params.set('from', parseRelativeTime(opts.start));
  if (opts?.end) params.set('to', opts.end);
  params.set('resolution', opts?.step || '1h');
  const resp = await fetchWithTimeout(`${baseUrl}/api/v2/metrics/query?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Dynatrace error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return normalizeDynatraceMetrics(data, ds);
}

function normalizeDynatraceEntities(data: any, ds: DatasourceConfig): QueryResult {
  const entities = data.entities || [];
  const rows = entities.map((e: any) => ({
    entityId: e.entityId,
    displayName: e.displayName,
    type: e.type,
    lastSeenMs: e.lastSeenTms ? new Date(e.lastSeenTms).toISOString() : '',
    tags: (e.tags || []).map((t: any) => t.key + (t.value ? ':' + t.value : '')).join(', '),
  }));
  return {
    columns: ['entityId', 'displayName', 'type', 'lastSeenMs', 'tags'],
    rows,
    metadata: { datasource: ds.name, type: 'dynatrace', queryLanguage: 'Dynatrace API', executionTimeMs: 0, resultType: 'entities', totalRows: rows.length },
  };
}

function normalizeDynatraceMetrics(data: any, ds: DatasourceConfig): QueryResult {
  const rows: any[] = [];
  for (const result of data.result || []) {
    const metricId = result.metricId;
    for (const series of result.data || []) {
      const dims = Object.entries(series.dimensions || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      const timestamps = series.timestamps || [];
      const values = series.values || [];
      for (let i = 0; i < timestamps.length; i++) {
        rows.push({
          metric: metricId,
          dimensions: dims,
          value: values[i],
          timestamp: new Date(timestamps[i]).toISOString(),
        });
      }
    }
  }
  return {
    columns: ['metric', 'dimensions', 'value', 'timestamp'],
    rows,
    metadata: { datasource: ds.name, type: 'dynatrace', queryLanguage: 'Dynatrace API', executionTimeMs: 0, resultType: 'metrics', totalRows: rows.length },
  };
}

// ============================================================================
// Datadog / 데이터독
// ============================================================================
async function queryDatadog(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const timeout = ds.settings?.timeout || 30000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');

  // Detect log search vs metric query
  const isLogSearch = /^(logs:|search:|source:|service:|status:)/i.test(query.trim()) || query.includes('"');

  if (isLogSearch) {
    const now = Math.floor(Date.now() / 1000);
    const body = {
      filter: {
        query: query.trim(),
        from: opts?.start ? parseRelativeTime(opts.start) : new Date((now - 3600) * 1000).toISOString(),
        to: opts?.end || new Date(now * 1000).toISOString(),
      },
      sort: 'timestamp',
      page: { limit: opts?.limit || 50 },
    };
    const resp = await fetchWithTimeout(`${baseUrl}/api/v2/logs/events/search`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, timeout);
    if (!resp.ok) throw new Error(`Datadog error ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    return normalizeDatadogLogs(data, ds);
  }

  // Metric query
  const now = Math.floor(Date.now() / 1000);
  const from = opts?.start ? Math.floor(new Date(parseRelativeTime(opts.start)).getTime() / 1000) : now - 3600;
  const to = opts?.end ? Math.floor(new Date(opts.end).getTime() / 1000) : now;
  const params = new URLSearchParams({ query: query.trim(), from: String(from), to: String(to) });
  const resp = await fetchWithTimeout(`${baseUrl}/api/v1/query?${params}`, { headers }, timeout);
  if (!resp.ok) throw new Error(`Datadog error ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  return normalizeDatadogMetrics(data, ds);
}

function normalizeDatadogLogs(data: any, ds: DatasourceConfig): QueryResult {
  const logs = data.data || [];
  const rows = logs.map((l: any) => ({
    id: l.id,
    timestamp: l.attributes?.timestamp || '',
    service: l.attributes?.service || '',
    status: l.attributes?.status || '',
    message: l.attributes?.message || '',
    host: l.attributes?.host || '',
  }));
  return {
    columns: ['id', 'timestamp', 'service', 'status', 'message', 'host'],
    rows,
    metadata: { datasource: ds.name, type: 'datadog', queryLanguage: 'Datadog Query', executionTimeMs: 0, resultType: 'logs', totalRows: rows.length },
  };
}

function normalizeDatadogMetrics(data: any, ds: DatasourceConfig): QueryResult {
  const rows: any[] = [];
  for (const series of data.series || []) {
    const scope = series.scope || '';
    const metric = series.metric || series.expression || '';
    for (const point of series.pointlist || []) {
      rows.push({
        metric,
        scope,
        value: point[1],
        timestamp: new Date(point[0]).toISOString(),
      });
    }
  }
  return {
    columns: ['metric', 'scope', 'value', 'timestamp'],
    rows,
    metadata: { datasource: ds.name, type: 'datadog', queryLanguage: 'Datadog Query', executionTimeMs: 0, resultType: 'metrics', totalRows: rows.length },
  };
}

// ============================================================================
// Public API / 공개 API
// ============================================================================

const QUERY_HANDLERS: Record<DatasourceType, (ds: DatasourceConfig, query: string, opts?: QueryOptions) => Promise<QueryResult>> = {
  prometheus: queryPrometheus,
  loki: queryLoki,
  tempo: queryTempo,
  clickhouse: queryClickHouse,
  jaeger: queryJaeger,
  dynatrace: queryDynatrace,
  datadog: queryDatadog,
};

export async function queryDatasource(ds: DatasourceConfig, query: string, opts?: QueryOptions): Promise<QueryResult> {
  const key = cacheKey(ds.id, query, opts);
  const cached = dsCache.get<QueryResult>(key);
  if (cached) return cached;

  const handler = QUERY_HANDLERS[ds.type];
  if (!handler) throw new Error(`Unsupported datasource type: ${ds.type}`);

  const start = Date.now();
  const result = await handler(ds, query, opts);
  result.metadata.executionTimeMs = Date.now() - start;

  const ttl = ds.settings?.cacheTTL || 60;
  dsCache.set(key, result, ttl);
  return result;
}

export async function testConnection(ds: DatasourceConfig): Promise<TestResult> {
  const meta = DATASOURCE_TYPES[ds.type];
  if (!meta) return { ok: false, latency: 0, error: `Unknown type: ${ds.type}` };

  const timeout = ds.settings?.timeout || 10000;
  const headers = buildHeaders(ds);
  const baseUrl = ds.url.trim().replace(/\/$/, '');
  const start = Date.now();

  try {
    const resp = await fetchWithTimeout(`${baseUrl}${meta.healthEndpoint}`, { headers }, timeout);
    const latency = Date.now() - start;

    if (!resp.ok && resp.status !== 204) {
      return { ok: false, latency, error: `HTTP ${resp.status}: ${await resp.text().catch(() => 'unknown')}` };
    }

    // Try to extract version info
    let version: string | undefined;
    try {
      const text = await resp.text();
      if (ds.type === 'prometheus' && text.includes('Prometheus')) version = text.trim();
      else if (ds.type === 'clickhouse') version = text.trim();
      else if (text.length < 100) version = text.trim();
    } catch {}

    return { ok: true, latency, version };
  } catch (err: any) {
    const latency = Date.now() - start;
    const cause = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    console.error(`[datasource-test] URL=${baseUrl}${meta.healthEndpoint} err=${err.message}${cause} name=${err.name} latency=${latency}ms`);
    if (err.name === 'AbortError' || err.cause?.name === 'AbortError') return { ok: false, latency, error: 'Connection timeout' };
    return { ok: false, latency, error: `${err.message}${cause}` };
  }
}
