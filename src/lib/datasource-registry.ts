// Datasource type metadata registry / 데이터소스 타입 메타데이터 레지스트리
// Provides labels, icons, colors, query language info, and example queries per datasource type
import type { DatasourceType } from './app-config';

export interface DatasourceTypeMeta {
  label: string;
  labelKo: string;
  icon: string;           // lucide-react icon name
  color: string;          // accent color name for StatsCard
  queryLanguage: string;
  healthEndpoint: string; // path to check connectivity
  defaultPort: number;
  placeholder: string;    // URL placeholder
  examples: string[];     // example queries for Explore page
}

export const DATASOURCE_TYPES: Record<DatasourceType, DatasourceTypeMeta> = {
  prometheus: {
    label: 'Prometheus',
    labelKo: 'Prometheus',
    icon: 'Activity',
    color: 'orange',
    queryLanguage: 'PromQL',
    healthEndpoint: '/-/healthy',
    defaultPort: 9090,
    placeholder: 'http://prometheus:9090',
    examples: [
      'up',
      'rate(node_cpu_seconds_total{mode="idle"}[5m])',
      'node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100',
      'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
    ],
  },
  loki: {
    label: 'Loki',
    labelKo: 'Loki',
    icon: 'FileText',
    color: 'green',
    queryLanguage: 'LogQL',
    healthEndpoint: '/ready',
    defaultPort: 3100,
    placeholder: 'http://loki:3100',
    examples: [
      '{job="varlogs"}',
      '{namespace="default"} |= "error"',
      'rate({job="nginx"}[5m])',
      '{app="frontend"} | json | level="error" | line_format "{{.message}}"',
    ],
  },
  tempo: {
    label: 'Tempo',
    labelKo: 'Tempo',
    icon: 'Waypoints',
    color: 'cyan',
    queryLanguage: 'TraceQL',
    healthEndpoint: '/ready',
    defaultPort: 3200,
    placeholder: 'http://tempo:3200',
    examples: [
      '{ resource.service.name = "frontend" }',
      '{ span.http.status_code >= 400 }',
      '{ duration > 500ms }',
      '{ resource.service.name = "api" && status = error }',
    ],
  },
  clickhouse: {
    label: 'ClickHouse',
    labelKo: 'ClickHouse',
    icon: 'Database',
    color: 'purple',
    queryLanguage: 'SQL',
    healthEndpoint: '/ping',
    defaultPort: 8123,
    placeholder: 'http://clickhouse:8123',
    examples: [
      'SELECT count() FROM system.tables',
      'SELECT database, name, engine FROM system.tables ORDER BY database, name',
      'SELECT * FROM system.metrics WHERE metric LIKE \'%Query%\'',
      'SELECT toStartOfHour(event_time) AS hour, count() AS queries FROM system.query_log WHERE event_date = today() GROUP BY hour ORDER BY hour',
    ],
  },
  jaeger: {
    label: 'Jaeger',
    labelKo: 'Jaeger',
    icon: 'Radar',
    color: 'cyan',
    queryLanguage: 'Jaeger API',
    healthEndpoint: '/',
    defaultPort: 16686,
    placeholder: 'http://jaeger:16686',
    examples: [
      'service=frontend',
      'service=api-gateway&operation=GET /users',
      'service=payment&tags={"error":"true"}',
      'service=order&lookback=2h&limit=50',
    ],
  },
  dynatrace: {
    label: 'Dynatrace',
    labelKo: 'Dynatrace',
    icon: 'Gauge',
    color: 'green',
    queryLanguage: 'Dynatrace API',
    healthEndpoint: '/api/v1/config/clusterversion',
    defaultPort: 443,
    placeholder: 'https://abc12345.live.dynatrace.com',
    examples: [
      'builtin:host.cpu.usage',
      'builtin:host.mem.usage',
      'builtin:service.response.time:avg',
      'builtin:service.errors.total.count:sum',
    ],
  },
  datadog: {
    label: 'Datadog',
    labelKo: 'Datadog',
    icon: 'Dog',
    color: 'purple',
    queryLanguage: 'Datadog Query',
    healthEndpoint: '/api/v1/validate',
    defaultPort: 443,
    placeholder: 'https://api.datadoghq.com',
    examples: [
      'avg:system.cpu.user{*}',
      'sum:trace.http.request.hits{service:web-app}.as_count()',
      'avg:system.mem.used{host:web-01} by {host}',
      'sum:aws.ec2.cpuutilization{region:us-east-1} by {instance_id}',
    ],
  },
};

// Get all supported datasource types / 지원되는 모든 데이터소스 타입
export const DATASOURCE_TYPE_LIST: DatasourceType[] = Object.keys(DATASOURCE_TYPES) as DatasourceType[];

// Detect single datasource type (first match) / AI 질문 키워드에서 데이터소스 타입 감지 (첫 매치)
export function detectDatasourceType(question: string): DatasourceType | null {
  const q = question.toLowerCase();
  if (/프로메테우스|prometheus|promql|메트릭|metric|cpu 사용|memory 사용|node_/.test(q)) return 'prometheus';
  if (/로키|loki|logql|로그 검색|로그 조회|에러 로그|error log|log search/.test(q)) return 'loki';
  if (/템포|tempo|traceql|트레이스|trace|스팬|span|지연시간|latency|분산 추적/.test(q)) return 'tempo';
  if (/클릭하우스|clickhouse|클릭 하우스/.test(q)) return 'clickhouse';
  if (/예거|jaeger|예이거/.test(q)) return 'jaeger';
  if (/다이나트레이스|dynatrace|다이나 트레이스/.test(q)) return 'dynatrace';
  if (/데이터독|datadog|데이터 독/.test(q)) return 'datadog';
  return null;
}

// Detect ALL datasource types mentioned in question / 질문에 언급된 모든 데이터소스 타입 감지 (복수 반환)
export function detectDatasourceTypes(question: string): DatasourceType[] {
  const q = question.toLowerCase();
  const types: DatasourceType[] = [];
  if (/프로메테우스|prometheus|promql|메트릭|metric|cpu 사용|memory 사용|node_/.test(q)) types.push('prometheus');
  if (/로키|loki|logql|로그 검색|로그 조회|에러 로그|error log|log search/.test(q)) types.push('loki');
  if (/템포|tempo|traceql|트레이스|trace|스팬|span|지연시간|latency|분산 추적/.test(q)) types.push('tempo');
  if (/클릭하우스|clickhouse|클릭 하우스/.test(q)) types.push('clickhouse');
  if (/예거|jaeger|예이거/.test(q)) types.push('jaeger');
  if (/다이나트레이스|dynatrace|다이나 트레이스/.test(q)) types.push('dynatrace');
  if (/데이터독|datadog|데이터 독/.test(q)) types.push('datadog');
  return types;
}
