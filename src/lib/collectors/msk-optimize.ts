// MSK Broker Rightsizing Collector
// MSK 브로커 적정 규모 컬렉터: Steampipe 클러스터 목록 + CloudWatch 메트릭 + Prometheus Kafka 메트릭
import { runQuery } from '@/lib/steampipe';
import { queries as mskQ } from '@/lib/queries/msk';
import { queryDatasource } from '@/lib/datasource-client';
import { getDefaultDatasource } from '@/lib/app-config';
import type { Collector, CollectorResult, SendFn } from './types';

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

// ============================================================================
// Prometheus Kafka metric candidates — tried in order per candidate
// ============================================================================
interface KafkaMetricCandidate { key: string; label: string; queries: string[]; }

const KAFKA_METRIC_CANDIDATES: KafkaMetricCandidate[] = [
  { key: 'messagesInPerSec', label: 'Messages In/sec', queries: [
    'sum by (topic) (rate(kafka_server_BrokerTopicMetrics_MessagesInPerSec[5m]))',
    'sum by (topic) (rate(kafka_server_brokertopicmetrics_messagesinpersec_count[5m]))',
  ]},
  { key: 'bytesInPerSec', label: 'Bytes In/sec', queries: [
    'sum by (topic) (rate(kafka_server_BrokerTopicMetrics_BytesInPerSec[5m]))',
    'sum by (topic) (rate(kafka_server_brokertopicmetrics_bytesinpersec_count[5m]))',
  ]},
  { key: 'bytesOutPerSec', label: 'Bytes Out/sec', queries: [
    'sum by (topic) (rate(kafka_server_BrokerTopicMetrics_BytesOutPerSec[5m]))',
    'sum by (topic) (rate(kafka_server_brokertopicmetrics_bytesoutpersec_count[5m]))',
  ]},
  { key: 'consumerLag', label: 'Consumer Lag', queries: [
    'topk(50, sum by (consumergroup, topic, partition) (kafka_consumer_fetch_manager_records_lag))',
    'topk(50, sum by (consumergroup, topic) (kafka_consumergroup_lag))',
    'topk(50, kafka_consumer_group_lag)',
  ]},
  { key: 'partitionCount', label: 'Partition Count', queries: [
    'sum by (topic) (kafka_server_ReplicaManager_PartitionCount)',
    'kafka_topic_partitions',
  ]},
];

interface KafkaMetricResult { key: string; label: string; query: string; rows: any[]; }

// ============================================================================
// Prometheus: try each Kafka metric candidate
// ============================================================================
async function collectKafkaMetrics(ds: any): Promise<{ metrics: KafkaMetricResult[]; skipped: string[] }> {
  const metrics: KafkaMetricResult[] = [];
  const skipped: string[] = [];
  const results = await Promise.allSettled(
    KAFKA_METRIC_CANDIDATES.map(async (candidate) => {
      for (const promql of candidate.queries) {
        try {
          const result = await queryDatasource(ds, promql, { start: '1h', step: '300' });
          if (result.rows && result.rows.length > 0) {
            return { key: candidate.key, label: candidate.label, query: promql, rows: result.rows };
          }
        } catch { /* try next query variant */ }
      }
      return null;
    })
  );
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) metrics.push(r.value);
    else skipped.push(KAFKA_METRIC_CANDIDATES[i].label);
  }
  return { metrics, skipped };
}

// ============================================================================
// Helper — build fetch URL with optional accountId
// ============================================================================
function apiUrl(path: string, params: Record<string, string>, accountId?: string): string {
  const qs = new URLSearchParams(params);
  if (accountId) qs.set('accountId', accountId);
  return `${BASE_URL}/awsops/api/${path}?${qs.toString()}`;
}

// ============================================================================
// Helper — safe fetch with timeout
// ============================================================================
async function safeFetch<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : fallback;
  } catch { return fallback; }
}

// ============================================================================
// Collector implementation
// ============================================================================
const mskOptimizeCollector: Collector = {
  displayName: 'MSK Broker Optimizer',

  async collect(send: SendFn, accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    const qOpts = accountId ? { accountId } : undefined;
    const promDs = getDefaultDatasource('prometheus');

    // ── Phase 1: Get MSK cluster list from Steampipe ──
    send('status', { step: 'msk-list', message: isEn
      ? '🔍 Discovering MSK clusters...'
      : '🔍 MSK 클러스터 탐색 중...' });

    const clusterResult = await runQuery(mskQ.list, qOpts).catch(() => ({ rows: [] }));
    const clusters = clusterResult?.rows || [];

    if (clusters.length === 0) {
      send('status', { step: 'msk-empty', message: isEn
        ? '⚠️ No MSK clusters found.'
        : '⚠️ MSK 클러스터가 없습니다.' });
      return {
        sections: { clusters: [], brokerNodes: {}, brokerMetrics: {}, kafkaMetrics: [], kafkaSkipped: KAFKA_METRIC_CANDIDATES.map(c => c.label), datasourceName: null },
        usedTools: ['Steampipe: MSK list (0)'],
        queriedResources: [],
        viaSummary: 'MSK Broker Optimizer (no clusters)',
      };
    }

    send('status', { step: 'msk-list-done', message: isEn
      ? `✅ Found ${clusters.length} MSK cluster(s)`
      : `✅ MSK 클러스터 ${clusters.length}개 발견` });

    // ── Phase 2: For each cluster, fetch broker nodes + CloudWatch metrics (parallel) ──
    send('status', { step: 'msk-brokers', message: isEn
      ? '📈 Fetching broker nodes and CloudWatch metrics...'
      : '📈 브로커 노드 및 CloudWatch 메트릭 조회 중...' });

    const brokerNodes: Record<string, any[]> = {};
    const brokerMetrics: Record<string, any> = {};

    // Fetch broker nodes for all clusters in parallel
    const nodeResults = await Promise.allSettled(
      clusters.map(async (cl: any) => {
        const arn = cl.cluster_arn;
        const name = cl.cluster_name;
        if (!arn || !name) return { name, nodes: [], metrics: {} };

        // Get broker node list
        const nodeData = await safeFetch<any>(apiUrl('msk', { clusterArn: arn }, accountId), { nodes: [] });
        const nodes = nodeData.nodes || [];

        // Get CloudWatch metrics for discovered brokers
        const brokerIds = nodes
          .map((n: any) => n.BrokerNodeInfo?.BrokerId)
          .filter((id: any) => id != null);

        let metrics: any = {};
        if (brokerIds.length > 0) {
          const metricsData = await safeFetch<any>(
            apiUrl('msk', { action: 'metrics', clusterName: name, brokerIds: brokerIds.join(',') }, accountId),
            { metrics: {} }
          );
          metrics = metricsData.metrics || {};
        }

        return { name, nodes, metrics };
      })
    );

    for (const r of nodeResults) {
      if (r.status === 'fulfilled' && r.value) {
        brokerNodes[r.value.name] = r.value.nodes;
        brokerMetrics[r.value.name] = r.value.metrics;
      }
    }

    const totalBrokers = Object.values(brokerNodes).reduce((sum, nodes) => sum + nodes.length, 0);
    const metricsCollected = Object.values(brokerMetrics).reduce((sum, m) => sum + Object.keys(m).length, 0);

    send('status', { step: 'msk-brokers-done', message: isEn
      ? `✅ Brokers: ${totalBrokers} nodes, ${metricsCollected} metric sets`
      : `✅ 브로커: ${totalBrokers}개 노드, ${metricsCollected}개 메트릭 세트` });

    // ── Phase 3: Optional Prometheus Kafka metrics ──
    let kafkaResult = { metrics: [] as KafkaMetricResult[], skipped: KAFKA_METRIC_CANDIDATES.map(c => c.label) };

    if (promDs) {
      send('status', { step: 'msk-prometheus', message: isEn
        ? `📈 Querying Prometheus for Kafka metrics (${promDs.name})...`
        : `📈 Prometheus에서 Kafka 메트릭 조회 중 (${promDs.name})...` });

      kafkaResult = await collectKafkaMetrics(promDs);

      send('status', { step: 'msk-prometheus-done', message: isEn
        ? `✅ Prometheus: ${kafkaResult.metrics.length}/${KAFKA_METRIC_CANDIDATES.length} Kafka metric types collected`
        : `✅ Prometheus: ${kafkaResult.metrics.length}/${KAFKA_METRIC_CANDIDATES.length}개 Kafka 메트릭 유형 수집 완료` });
    } else {
      send('status', { step: 'msk-no-prometheus', message: isEn
        ? '⚠️ No Prometheus datasource — skipping Kafka JMX metrics.'
        : '⚠️ Prometheus 미설정 — Kafka JMX 메트릭 건너뜁니다.' });
    }

    // ── Build result ──
    const usedTools: string[] = [];
    const queriedResources: string[] = [];

    usedTools.push(`Steampipe: MSK list (${clusters.length})`);
    queriedResources.push('msk');
    if (totalBrokers > 0) usedTools.push(`MSK API: broker nodes (${totalBrokers})`);
    if (metricsCollected > 0) { usedTools.push(`CloudWatch: MSK broker metrics (${metricsCollected} sets)`); queriedResources.push('cloudwatch'); }
    if (kafkaResult.metrics.length > 0) {
      usedTools.push(...kafkaResult.metrics.map(m => `Prometheus: ${m.label}`));
      queriedResources.push('prometheus');
    }
    if (kafkaResult.skipped.length > 0) usedTools.push(`Skipped: ${kafkaResult.skipped.join(', ')}`);

    return {
      sections: {
        clusters,
        brokerNodes,
        brokerMetrics,
        kafkaMetrics: kafkaResult.metrics,
        kafkaSkipped: kafkaResult.skipped,
        datasourceName: promDs?.name || null,
      },
      usedTools,
      queriedResources,
      viaSummary: `MSK Broker Optimizer (${clusters.length} clusters, ${totalBrokers} brokers${promDs ? `, ${promDs.name}` : ''})`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { clusters, brokerNodes, brokerMetrics, kafkaMetrics, kafkaSkipped, datasourceName } = data.sections;
    const sections: string[] = [];

    // ── Cluster configurations ──
    if (clusters?.length > 0) {
      sections.push('## MSK Cluster Configurations');
      const configs = clusters.map((cl: any) => ({
        name: cl.cluster_name,
        state: cl.state,
        type: cl.cluster_type,
        kafkaVersion: cl.kafka_version,
        brokerCount: cl.number_of_broker_nodes,
        instanceType: cl.instance_type,
        ebsVolumeGB: cl.ebs_volume_gb,
        enhancedMonitoring: cl.enhanced_monitoring,
      }));
      sections.push(`\`\`\`json\n${JSON.stringify(configs, null, 2)}\n\`\`\``);
    }

    // ── Per-broker CloudWatch metrics ──
    if (brokerMetrics && Object.keys(brokerMetrics).length > 0) {
      sections.push('## Per-Broker CloudWatch Metrics (last 1h)');
      for (const [clusterName, metrics] of Object.entries(brokerMetrics as Record<string, any>)) {
        if (!metrics || Object.keys(metrics).length === 0) continue;
        sections.push(`### ${clusterName}`);
        const formatted: Record<string, any> = {};
        for (const [brokerId, m] of Object.entries(metrics as Record<string, any>)) {
          formatted[`Broker ${brokerId}`] = {
            cpuUser: m.cpu_user != null ? `${m.cpu_user.toFixed(1)}%` : 'N/A',
            cpuSystem: m.cpu_system != null ? `${m.cpu_system.toFixed(1)}%` : 'N/A',
            memoryUsedGB: m.mem_used != null ? `${(m.mem_used / 1024 / 1024 / 1024).toFixed(1)} GB` : 'N/A',
            memoryFreeGB: m.mem_free != null ? `${(m.mem_free / 1024 / 1024 / 1024).toFixed(1)} GB` : 'N/A',
            bytesInPerSec: m.bytes_in != null ? `${(m.bytes_in / 1024).toFixed(1)} KB/s` : 'N/A',
            bytesOutPerSec: m.bytes_out != null ? `${(m.bytes_out / 1024).toFixed(1)} KB/s` : 'N/A',
            networkRxPackets: m.net_rx != null ? Math.round(m.net_rx) : 'N/A',
            networkTxPackets: m.net_tx != null ? Math.round(m.net_tx) : 'N/A',
          };
        }
        sections.push(`\`\`\`json\n${JSON.stringify(formatted, null, 2)}\n\`\`\``);
      }
    }

    // ── Broker node topology ──
    if (brokerNodes && Object.keys(brokerNodes).length > 0) {
      const anyNodes = Object.values(brokerNodes).some((nodes: any) => nodes.length > 0);
      if (anyNodes) {
        sections.push('## Broker Node Topology');
        for (const [clusterName, nodes] of Object.entries(brokerNodes as Record<string, any[]>)) {
          if (!nodes || nodes.length === 0) continue;
          sections.push(`### ${clusterName} (${nodes.length} brokers)`);
          const nodeInfo = nodes.map((n: any) => ({
            brokerId: n.BrokerNodeInfo?.BrokerId,
            instanceType: n.InstanceType,
            az: n.BrokerNodeInfo?.CurrentBrokerSoftwareInfo?.ConfigurationRevision != null
              ? n.BrokerNodeInfo?.CurrentBrokerSoftwareInfo?.ConfigurationRevision
              : undefined,
            endpoints: n.BrokerNodeInfo?.Endpoints,
            attachedVolumes: n.BrokerNodeInfo?.AttachedENIId ? 1 : 0,
          }));
          sections.push(`\`\`\`json\n${JSON.stringify(nodeInfo.slice(0, 20), null, 2)}\n\`\`\``);
        }
      }
    }

    // ── Prometheus Kafka metrics ──
    if (kafkaMetrics?.length > 0) {
      sections.push(`## Prometheus Kafka Metrics (last 1h)\nDatasource: ${datasourceName || 'unknown'}`);
      for (const m of kafkaMetrics) {
        sections.push(`### ${m.label} (${m.rows.length} series)\nPromQL: \`${m.query}\`\n\`\`\`json\n${JSON.stringify(m.rows.slice(0, 30), null, 2)}\n\`\`\``);
      }
    }
    if (kafkaSkipped?.length > 0) {
      sections.push(`### Unavailable Kafka Metrics (not found in Prometheus)\n${kafkaSkipped.join(', ')}`);
    }

    if (sections.length === 0) return '\n\n--- No MSK optimization data could be collected ---';
    return '\n\n--- MSK BROKER RIGHTSIZING DATA (collected automatically) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: `You are an MSK (Managed Streaming for Apache Kafka) optimization expert. You have been given REAL data from the user's environment:
- MSK cluster configurations (broker count, instance type, EBS size, Kafka version)
- Per-broker CloudWatch metrics (CPU User/System, Memory Used/Free, BytesIn/Out, Network packets)
- Broker node topology
- Prometheus Kafka JMX metrics (if available): throughput, consumer lag, partition counts

Analyze ALL the provided data and give specific, actionable broker rightsizing recommendations.

## Analysis Structure

### 1. Executive Summary
- Total estimated monthly savings
- Number of over-provisioned brokers/clusters
- Any critical issues (high CPU, high consumer lag, imbalanced brokers)

### 2. Per-Cluster Analysis
For each MSK cluster:

#### Instance Type Rightsizing
| Cluster | Current Type | Broker Count | CPU (User+System) | Memory Used | Recommended Type | Est. Savings |
- **CPU (User+System) < 20%** → downsize instance type (e.g., kafka.m5.2xlarge → kafka.m5.xlarge)
- **CPU > 70%** → flag as capacity risk, do NOT downsize
- Compare memory used vs total — if memory utilization < 30%, smaller type may work

#### EBS Storage Optimization
- Current EBS volume size vs actual data throughput needs
- BytesIn/Out trends — does throughput justify current storage IOPS?
- Consider gp3 with custom IOPS/throughput if using gp2

#### Broker Count Optimization
- If per-broker CPU/throughput is very low across all brokers → consider reducing broker count
- Minimum 3 brokers for production, 2 for dev/test
- Check partition distribution balance across brokers

### 3. Kafka-Level Optimization (if Prometheus data available)
- **Consumer lag analysis**: groups with consistently growing lag need attention
- **Throughput per topic**: identify low-traffic topics that could be consolidated
- **Partition count**: over-partitioned topics waste broker resources
- Messages In/sec vs broker capacity — is the cluster over-provisioned for actual workload?

### 4. Architecture Recommendations
- **Provisioned vs Serverless**: if throughput is bursty and low average, Serverless may be cheaper
- **Kafka version**: recommend upgrade if running older version (security + performance)
- **Enhanced monitoring**: recommend enabling if currently DEFAULT
- **Multi-AZ broker distribution**: verify brokers span AZs evenly

### 5. Risk Warnings
- Clusters with CPU > 60% — do not downsize
- Clusters with growing consumer lag — may need MORE capacity
- Single-AZ clusters — availability risk
- Broker imbalance (uneven CPU/throughput across brokers)

## Important Rules
- Provide specific instance type recommendations with cost estimates
- MSK pricing is per-broker-hour + EBS storage — calculate both
- If Prometheus data is missing, analyze based on CloudWatch metrics only
- Always respond in the SAME LANGUAGE as the user's question
- Use tables for easy comparison
- Include AWS CLI commands for applying recommendations where applicable`,
};

export default mskOptimizeCollector;
