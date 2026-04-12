// EKS Resource Optimization Collector
// EKS 리소스 최적화 컬렉터: Prometheus 메트릭 디스커버리 + K8s 설정 + 비용 자동 수집
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import { runQuery } from '@/lib/steampipe';
import { queries as eksQ } from '@/lib/queries/eks-container-cost';
import type { Collector, CollectorResult, SendFn } from './types';

// ============================================================================
// Prometheus metric candidates — tried in order, skipped if not present
// ============================================================================
interface MetricCandidate { key: string; label: string; queries: string[]; }

const METRIC_CANDIDATES: MetricCandidate[] = [
  { key: 'cpuUsage', label: 'CPU Usage per Container', queries: [
    'topk(100, avg by (namespace, pod, container) (rate(container_cpu_usage_seconds_total{container!="",container!="POD",image!=""}[5m])))',
    'topk(100, avg by (namespace, pod, container) (rate(container_cpu_usage_seconds_total{container!=""}[5m])))',
  ]},
  { key: 'cpuRequests', label: 'CPU Requests per Container', queries: [
    'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="cpu",unit="core"})',
    'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="cpu"})',
  ]},
  { key: 'memoryUsage', label: 'Memory Usage per Container', queries: [
    'topk(100, avg by (namespace, pod, container) (container_memory_working_set_bytes{container!="",container!="POD",image!=""}))',
    'topk(100, avg by (namespace, pod, container) (container_memory_working_set_bytes{container!=""}))',
  ]},
  { key: 'memoryRequests', label: 'Memory Requests per Container', queries: [
    'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="memory",unit="byte"})',
    'avg by (namespace, pod, container) (kube_pod_container_resource_requests{resource="memory"})',
  ]},
  { key: 'cpuThrottling', label: 'CPU Throttling Rate', queries: [
    'topk(50, sum by (namespace, pod, container) (rate(container_cpu_cfs_throttled_periods_total[5m])) / sum by (namespace, pod, container) (rate(container_cpu_cfs_periods_total[5m])))',
  ]},
  { key: 'podRestarts', label: 'Pod Restart Counts', queries: [
    'topk(50, sum by (namespace, pod) (kube_pod_container_status_restarts_total))',
  ]},
  { key: 'httpErrors', label: 'HTTP Error Rates (5xx)', queries: [
    'topk(20, sum by (namespace, service, method) (rate(http_requests_total{code=~"5.."}[5m])))',
    'topk(20, sum by (namespace, exported_service) (rate(istio_requests_total{response_code=~"5.."}[5m])))',
    'topk(20, sum by (namespace, destination_service) (rate(istio_requests_total{response_code=~"5.."}[5m])))',
  ]},
  { key: 'nodeCpu', label: 'Node CPU Utilization', queries: [
    'avg by (node) (1 - rate(node_cpu_seconds_total{mode="idle"}[5m]))',
    'avg by (instance) (1 - rate(node_cpu_seconds_total{mode="idle"}[5m]))',
  ]},
  { key: 'nodeMemory', label: 'Node Memory Utilization', queries: [
    'avg by (node) (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
    'avg by (instance) (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)',
  ]},
];

interface MetricResult { key: string; label: string; query: string; rows: any[]; columns?: string[]; }

// ============================================================================
// Prometheus: try each metric candidate, use first query that returns data
// ============================================================================
async function collectPrometheusMetrics(ds: any): Promise<{ metrics: MetricResult[]; skipped: string[] }> {
  const metrics: MetricResult[] = [];
  const skipped: string[] = [];
  const results = await Promise.allSettled(
    METRIC_CANDIDATES.map(async (candidate) => {
      for (const promql of candidate.queries) {
        try {
          const result = await queryDatasource(ds, promql, { start: '1h', step: '300' });
          if (result.rows && result.rows.length > 0) {
            return { key: candidate.key, label: candidate.label, query: promql, rows: result.rows, columns: result.columns };
          }
        } catch { /* try next */ }
      }
      return null;
    })
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) metrics.push(r.value);
    else skipped.push(METRIC_CANDIDATES[i].label);
  }
  return { metrics, skipped };
}

// ============================================================================
// Collector implementation
// ============================================================================
const eksOptimizeCollector: Collector = {
  displayName: 'EKS Cost Optimizer',

  async collect(send: SendFn, accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    const promDs = getDefaultDatasource('prometheus');

    const promPromise = promDs
      ? collectPrometheusMetrics(promDs)
      : Promise.resolve({ metrics: [] as MetricResult[], skipped: METRIC_CANDIDATES.map(c => c.label) });

    const k8sPromise = Promise.allSettled([
      runQuery(eksQ.podResourceRequests, accountId ? { accountId } : undefined),
      runQuery(eksQ.nodeCapacity, accountId ? { accountId } : undefined),
    ]);

    const costPromise = fetch(`http://localhost:${process.env.PORT || 3000}/awsops/api/eks-container-cost${accountId ? `?accountId=${accountId}` : ''}`, {
      signal: AbortSignal.timeout(15000),
    }).then(r => r.json()).catch(() => null);

    if (promDs) {
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

    const [promResult, k8sResults, costData] = await Promise.all([promPromise, k8sPromise, costPromise]);

    if (promDs) {
      send('status', { step: 'eks-prometheus-done', message: isEn
        ? `✅ Prometheus: ${promResult.metrics.length}/${METRIC_CANDIDATES.length} metric types collected`
        : `✅ Prometheus: ${promResult.metrics.length}/${METRIC_CANDIDATES.length}개 메트릭 유형 수집 완료` });
    }

    const [podResult, nodeResult] = k8sResults;
    const k8sResources = podResult.status === 'fulfilled' && podResult.value?.rows
      ? { podResources: podResult.value.rows, nodeCapacity: nodeResult.status === 'fulfilled' ? (nodeResult.value?.rows || []) : [] }
      : null;

    if (k8sResources) {
      send('status', { step: 'eks-k8s-done', message: isEn
        ? `✅ K8s: ${k8sResources.podResources.length} pods, ${k8sResources.nodeCapacity.length} nodes`
        : `✅ K8s: ${k8sResources.podResources.length}개 Pod, ${k8sResources.nodeCapacity.length}개 Node` });
    }
    if (costData?.summary) {
      send('status', { step: 'eks-cost-done', message: isEn
        ? `💰 Cost: ${costData.summary.podCount || 0} pods, $${(costData.summary.totalPodCostMonthly || 0).toFixed(0)}/month`
        : `💰 비용: ${costData.summary.podCount || 0}개 Pod, $${(costData.summary.totalPodCostMonthly || 0).toFixed(0)}/월` });
    }

    const usedTools: string[] = [];
    const queriedResources: string[] = [];
    if (promResult.metrics.length > 0) {
      usedTools.push(...promResult.metrics.map(m => `Prometheus: ${m.label}`));
      queriedResources.push('prometheus');
    }
    if (promResult.skipped.length > 0) usedTools.push(`Skipped: ${promResult.skipped.join(', ')}`);
    if (k8sResources) { usedTools.push('Steampipe: K8s Pod Resources', 'Steampipe: Node Capacity'); queriedResources.push('steampipe'); }
    if (costData?.summary) { usedTools.push('EKS Cost API'); queriedResources.push('eks-cost-api'); }

    return {
      sections: { prometheus: promResult.metrics, prometheusSkipped: promResult.skipped, k8sResources, costData, datasourceName: promDs?.name || null },
      usedTools,
      queriedResources,
      viaSummary: `EKS Cost Optimizer (${promResult.metrics.length} metrics${promDs ? `, ${promDs.name}` : ''})`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { prometheus, prometheusSkipped, k8sResources, costData, datasourceName } = data.sections;
    const sections: string[] = [];

    if (prometheus?.length > 0) {
      sections.push('## Prometheus Real-time Metrics (last 1h)');
      sections.push(`Datasource: ${datasourceName || 'unknown'}`);
      for (const m of prometheus) {
        sections.push(`### ${m.label} (${m.rows.length} series)\nPromQL: \`${m.query}\`\n\`\`\`json\n${JSON.stringify(m.rows.slice(0, 50), null, 2)}\n\`\`\``);
      }
    }
    if (prometheusSkipped?.length > 0) {
      sections.push(`### Unavailable Metrics (not found in Prometheus)\n${prometheusSkipped.join(', ')}`);
    }
    if (k8sResources) {
      sections.push('## K8s Pod Resource Requests/Limits (from Steampipe)');
      sections.push(`\`\`\`json\n${JSON.stringify(k8sResources.podResources.slice(0, 100), null, 2)}\n\`\`\``);
      if (k8sResources.nodeCapacity.length > 0) {
        sections.push('## Node Capacity');
        sections.push(`\`\`\`json\n${JSON.stringify(k8sResources.nodeCapacity, null, 2)}\n\`\`\``);
      }
    }
    if (costData?.summary) {
      sections.push('## EKS Cost Data');
      sections.push(`Data Source: ${costData.dataSource}\nTotal Monthly: $${costData.summary.totalPodCostMonthly?.toFixed(2)}`);
      if (costData.pods?.length > 0) sections.push(`### Per-Pod Costs (top 50)\n\`\`\`json\n${JSON.stringify(costData.pods.slice(0, 50), null, 2)}\n\`\`\``);
      if (costData.namespaceCosts?.length > 0) sections.push(`### Namespace Costs\n\`\`\`json\n${JSON.stringify(costData.namespaceCosts, null, 2)}\n\`\`\``);
    }
    if (sections.length === 0) return '\n\n--- No EKS optimization data could be collected ---';
    return '\n\n--- EKS OPTIMIZATION DATA (collected automatically) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: `You are an EKS resource optimization expert. You have been given REAL data collected from the user's cluster:
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
- Include kubectl patch/set commands for the top recommendations`,
};

export default eksOptimizeCollector;
