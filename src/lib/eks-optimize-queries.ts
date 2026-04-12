// EKS Resource Optimization: Prometheus metric discovery + collection + analysis
// EKS 리소스 최적화: Prometheus 메트릭 디스커버리 + 수집 + 분석
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import { runQuery } from '@/lib/steampipe';
import { queries as eksQ } from '@/lib/queries/eks-container-cost';

// ============================================================================
// Prometheus metric candidates — tried in order, skipped if not present
// Prometheus 메트릭 후보 — 순서대로 시도, 없으면 건너뜀
// ============================================================================
interface MetricCandidate {
  key: string;
  label: string;
  // multiple PromQL alternatives — first to return data wins
  queries: string[];
}

const METRIC_CANDIDATES: MetricCandidate[] = [
  // CPU usage (cadvisor)
  {
    key: 'cpuUsage',
    label: 'CPU Usage per Container',
    queries: [
      'topk(100, avg by (namespace, pod, container) (rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m])))',
      'topk(100, avg by (namespace, pod, container) (rate(container_cpu_usage_seconds_total{container!=""}[5m])))',
    ],
  },
  // CPU requests (kube-state-metrics)
  {
    key: 'cpuRequests',
    label: 'CPU Requests per Container',
    queries: [
      'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="cpu",unit="core"})',
      'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="cpu"})',
    ],
  },
  // Memory usage (cadvisor)
  {
    key: 'memoryUsage',
    label: 'Memory Usage per Container',
    queries: [
      'topk(100, avg by (namespace, pod, container) (container_memory_working_set_bytes{container!="",container!="POD",image!=""}))',
      'topk(100, avg by (namespace, pod, container) (container_memory_working_set_bytes{container!=""}))',
    ],
  },
  // Memory requests (kube-state-metrics)
  {
    key: 'memoryRequests',
    label: 'Memory Requests per Container',
    queries: [
      'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="memory",unit="byte"})',
      'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="memory"})',
    ],
  },
  // CPU throttling (cadvisor CFS)
  {
    key: 'cpuThrottling',
    label: 'CPU Throttling Rate',
    queries: [
      'topk(50, sum by (namespace, pod, container) (rate(container_cpu_cfs_throttled_periods_total[5m])) / sum by (namespace, pod, container) (rate(container_cpu_cfs_periods_total[5m])))',
    ],
  },
  // Pod restarts (kube-state-metrics)
  {
    key: 'podRestarts',
    label: 'Pod Restart Counts',
    queries: [
      'topk(50, sum by (namespace, pod) (kube_pod_container_status_restarts_total))',
    ],
  },
  // HTTP error rates (various metric names)
  {
    key: 'httpErrors',
    label: 'HTTP Error Rates (5xx)',
    queries: [
      'topk(20, sum by (namespace, service, method) (rate(http_requests_total{code=~"5.."}[5m])))',
      'topk(20, sum by (namespace, exported_service) (rate(istio_requests_total{response_code=~"5.."}[5m])))',
      'topk(20, sum by (namespace, destination_service) (rate(istio_requests_total{response_code=~"5.."}[5m])))',
    ],
  },
  // Node CPU utilization
  {
    key: 'nodeCpu',
    label: 'Node CPU Utilization',
    queries: [
      'avg by (node) (1 - rate(node_cpu_seconds_total{mode="idle"}[5m]))',
      'avg by (instance) (1 - rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    ],
  },
  // Node memory utilization
  {
    key: 'nodeMemory',
    label: 'Node Memory Utilization',
    queries: [
      'avg by (node) (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
      'avg by (instance) (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
    ],
  },
];

// ============================================================================
// Data types
// ============================================================================
interface MetricResult {
  key: string;
  label: string;
  query: string;
  rows: any[];
  columns?: string[];
}

export interface EksOptimizationData {
  prometheus: MetricResult[];
  prometheusSkipped: string[];
  k8sResources: { podResources: any[]; nodeCapacity: any[] } | null;
  costData: any | null;
  datasourceName: string | null;
}

type SendFn = (event: string, data: any) => void;

// ============================================================================
// Core: Collect all optimization data in parallel
// 핵심: 모든 최적화 데이터를 병렬 수집
// ============================================================================
export async function collectEksOptimizationData(
  send: SendFn,
  accountId?: string,
  isEn?: boolean,
): Promise<EksOptimizationData> {
  const result: EksOptimizationData = {
    prometheus: [],
    prometheusSkipped: [],
    k8sResources: null,
    costData: null,
    datasourceName: null,
  };

  // --- Phase 1: Discover Prometheus datasource ---
  const promDs = getDefaultDatasource('prometheus');

  // --- Phase 2: Parallel collection ---
  // Prometheus metrics (if datasource exists) + Steampipe K8s + EKS Cost API
  const promPromise = promDs
    ? collectPrometheusMetrics(promDs, send, isEn)
    : Promise.resolve({ metrics: [], skipped: METRIC_CANDIDATES.map(c => c.label) });

  const k8sPromise = Promise.allSettled([
    runQuery(eksQ.podResourceRequests, accountId ? { accountId } : undefined),
    runQuery(eksQ.nodeCapacity, accountId ? { accountId } : undefined),
  ]);

  const costPromise = fetch(`http://localhost:${process.env.PORT || 3000}/awsops/api/eks-container-cost${accountId ? `?accountId=${accountId}` : ''}`, {
    signal: AbortSignal.timeout(15000),
  }).then(r => r.json()).catch(() => null);

  if (promDs) {
    result.datasourceName = promDs.name;
    send('status', { step: 'eks-prometheus', message: isEn
      ? `📈 Discovering & querying Prometheus metrics (${promDs.name})...`
      : `📈 Prometheus 메트릭 탐색 및 조회 중 (${promDs.name})...` });
  } else {
    send('status', { step: 'eks-no-prometheus', message: isEn
      ? '⚠️ No Prometheus datasource configured. Using Steampipe + Cost API only.'
      : '⚠️ Prometheus 미설정. Steampipe + Cost API만 사용합니다.' });
  }

  send('status', { step: 'eks-k8s', message: isEn
    ? '☸️ Querying K8s resource configurations & cost data...'
    : '☸️ K8s 리소스 설정 및 비용 데이터 조회 중...' });

  // Await all in parallel
  const [promResult, k8sResults, costData] = await Promise.all([promPromise, k8sPromise, costPromise]);

  // Process Prometheus
  result.prometheus = promResult.metrics;
  result.prometheusSkipped = promResult.skipped;
  if (promDs) {
    send('status', { step: 'eks-prometheus-done', message: isEn
      ? `✅ Prometheus: ${result.prometheus.length}/${METRIC_CANDIDATES.length} metric types collected`
      : `✅ Prometheus: ${result.prometheus.length}/${METRIC_CANDIDATES.length}개 메트릭 유형 수집 완료` });
  }

  // Process K8s
  const [podResult, nodeResult] = k8sResults;
  if (podResult.status === 'fulfilled' && podResult.value?.rows) {
    result.k8sResources = {
      podResources: podResult.value.rows,
      nodeCapacity: nodeResult.status === 'fulfilled' ? (nodeResult.value?.rows || []) : [],
    };
    send('status', { step: 'eks-k8s-done', message: isEn
      ? `✅ K8s: ${result.k8sResources.podResources.length} pods, ${result.k8sResources.nodeCapacity.length} nodes`
      : `✅ K8s: ${result.k8sResources.podResources.length}개 Pod, ${result.k8sResources.nodeCapacity.length}개 Node` });
  }

  // Process Cost
  if (costData && costData.summary) {
    result.costData = costData;
    send('status', { step: 'eks-cost-done', message: isEn
      ? `💰 Cost: ${costData.summary.podCount || 0} pods, $${(costData.summary.totalPodCostMonthly || 0).toFixed(0)}/month`
      : `💰 비용: ${costData.summary.podCount || 0}개 Pod, $${(costData.summary.totalPodCostMonthly || 0).toFixed(0)}/월` });
  }

  return result;
}

// ============================================================================
// Prometheus: try each metric candidate, use first query that returns data
// Prometheus: 각 메트릭 후보 시도, 데이터를 반환하는 첫 번째 쿼리 사용
// ============================================================================
async function collectPrometheusMetrics(
  ds: any,
  _send: SendFn,
  _isEn?: boolean,
): Promise<{ metrics: MetricResult[]; skipped: string[] }> {
  const metrics: MetricResult[] = [];
  const skipped: string[] = [];

  // Run all candidates in parallel — each candidate tries its alternatives sequentially
  const results = await Promise.allSettled(
    METRIC_CANDIDATES.map(async (candidate) => {
      for (const promql of candidate.queries) {
        try {
          const result = await queryDatasource(ds, promql, { start: '1h', step: '300' });
          if (result.rows && result.rows.length > 0) {
            return { key: candidate.key, label: candidate.label, query: promql, rows: result.rows, columns: result.columns };
          }
        } catch {
          // try next alternative
        }
      }
      return null; // none worked
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      metrics.push(r.value);
    } else {
      skipped.push(METRIC_CANDIDATES[i].label);
    }
  }

  return { metrics, skipped };
}

// ============================================================================
// Format collected data as context for Bedrock analysis
// 수집된 데이터를 Bedrock 분석용 컨텍스트로 포맷
// ============================================================================
export function formatOptimizationContext(data: EksOptimizationData): string {
  const sections: string[] = [];

  // Prometheus metrics
  if (data.prometheus.length > 0) {
    sections.push('## Prometheus Real-time Metrics (last 1h)');
    sections.push(`Datasource: ${data.datasourceName || 'unknown'}`);
    for (const m of data.prometheus) {
      const rowPreview = JSON.stringify(m.rows.slice(0, 50), null, 2);
      sections.push(`### ${m.label} (${m.rows.length} series)\nPromQL: \`${m.query}\`\n\`\`\`json\n${rowPreview}\n\`\`\``);
    }
  }
  if (data.prometheusSkipped.length > 0) {
    sections.push(`### Unavailable Metrics (not found in Prometheus)\n${data.prometheusSkipped.join(', ')}`);
  }

  // K8s resource configurations
  if (data.k8sResources) {
    sections.push('## K8s Pod Resource Requests/Limits (from Steampipe)');
    sections.push(`\`\`\`json\n${JSON.stringify(data.k8sResources.podResources.slice(0, 100), null, 2)}\n\`\`\``);
    if (data.k8sResources.nodeCapacity.length > 0) {
      sections.push('## Node Capacity');
      sections.push(`\`\`\`json\n${JSON.stringify(data.k8sResources.nodeCapacity, null, 2)}\n\`\`\``);
    }
  }

  // Cost data
  if (data.costData?.summary) {
    sections.push('## EKS Cost Data');
    sections.push(`Data Source: ${data.costData.dataSource}\nTotal Monthly: $${data.costData.summary.totalPodCostMonthly?.toFixed(2)}`);
    if (data.costData.pods?.length > 0) {
      sections.push('### Per-Pod Costs (top 50 by cost)');
      sections.push(`\`\`\`json\n${JSON.stringify(data.costData.pods.slice(0, 50), null, 2)}\n\`\`\``);
    }
    if (data.costData.namespaceCosts?.length > 0) {
      sections.push('### Namespace Costs');
      sections.push(`\`\`\`json\n${JSON.stringify(data.costData.namespaceCosts, null, 2)}\n\`\`\``);
    }
  }

  if (sections.length === 0) {
    return '\n\n--- No EKS optimization data could be collected ---';
  }

  return '\n\n--- EKS OPTIMIZATION DATA (collected automatically) ---\n' + sections.join('\n\n');
}

// ============================================================================
// Analysis system prompt for Bedrock
// Bedrock 분석 시스템 프롬프트
// ============================================================================
export const EKS_OPTIMIZE_ANALYSIS_PROMPT = `You are an EKS resource optimization expert. You have been given REAL data collected from the user's cluster:
- Prometheus real-time metrics (CPU/memory usage, throttling, errors, restarts)
- Kubernetes resource configurations (requests/limits from Steampipe)
- Per-pod and per-namespace cost data

Analyze ALL the provided data and give specific, actionable recommendations.

## Analysis Structure

### 1. Executive Summary
- Total estimated monthly savings
- Number of over-provisioned workloads found
- Any critical issues (high throttling, frequent restarts, error spikes)

### 2. Per-Namespace Analysis (sorted by savings potential)
For each namespace with optimization potential:
- Current monthly cost
- Potential monthly savings
- Number of pods to optimize

### 3. Per-Deployment Recommendations (sorted by savings)
For each workload with significant over/under-provisioning:
- **Current**: CPU request/limit, Memory request/limit
- **Actual Usage**: CPU usage (from Prometheus), Memory usage (from Prometheus)
- **Recommended**: New CPU request/limit, New Memory request/limit
- **Savings**: Estimated monthly $ savings
- **Risk**: Note if CPU throttling is occurring (need MORE resources, not less)

### 4. Risk Warnings
- Workloads with >10% CPU throttling rate — these may need MORE resources
- Workloads with frequent restarts (possible OOMKill)
- Services with elevated HTTP 5xx error rates
- Under-provisioned workloads where usage > 80% of requests

### 5. Node-level Optimization
- Nodes with very low utilization (candidates for consolidation)
- Instance type right-sizing suggestions if applicable

## Important Rules
- Calculate savings using the ACTUAL cost data provided, not estimates
- For over-provisioned pods: recommend request = P95 usage * 1.2 (20% headroom)
- For under-provisioned pods: recommend request = P95 usage * 1.3 (30% headroom)
- If Prometheus data is missing, analyze based on Steampipe requests/limits ratios and cost data
- Always respond in the SAME LANGUAGE as the user's question
- Use tables and formatting for easy scanning
- Include kubectl patch/set commands for the top recommendations`;
