// DB Service Rightsizing Collector — RDS + ElastiCache + OpenSearch
// DB 서비스 적정 규모 컬렉터: RDS + ElastiCache + OpenSearch CloudWatch 메트릭 수집 + 분석
import { runQuery } from '@/lib/steampipe';
import { queries as rdsQ } from '@/lib/queries/rds';
import { queries as ecQ } from '@/lib/queries/elasticache';
import { queries as osQ } from '@/lib/queries/opensearch';
import type { Collector, CollectorResult, SendFn } from './types';

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

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
const dbOptimizeCollector: Collector = {
  displayName: 'DB Rightsizing Optimizer',

  async collect(send: SendFn, accountId?: string, isEn?: boolean): Promise<CollectorResult> {
    const qOpts = accountId ? { accountId } : undefined;

    // ── Phase 1: Get resource lists from Steampipe (parallel) ──
    send('status', { step: 'db-lists', message: isEn
      ? '🔍 Discovering RDS instances, ElastiCache clusters, and OpenSearch domains...'
      : '🔍 RDS 인스턴스, ElastiCache 클러스터, OpenSearch 도메인 탐색 중...' });

    const [rdsResult, ecResult, osResult] = await Promise.allSettled([
      runQuery(rdsQ.list, qOpts),
      runQuery(ecQ.clusterList, qOpts),
      runQuery(osQ.list, qOpts),
    ]);

    const rdsInstances = rdsResult.status === 'fulfilled' ? (rdsResult.value?.rows || []) : [];
    const ecClusters = ecResult.status === 'fulfilled' ? (ecResult.value?.rows || []) : [];
    const osDomains = osResult.status === 'fulfilled' ? (osResult.value?.rows || []) : [];

    send('status', { step: 'db-lists-done', message: isEn
      ? `✅ Found ${rdsInstances.length} RDS, ${ecClusters.length} ElastiCache, ${osDomains.length} OpenSearch`
      : `✅ RDS ${rdsInstances.length}개, ElastiCache ${ecClusters.length}개, OpenSearch ${osDomains.length}개 발견` });

    // ── Phase 2: Fetch CloudWatch metrics for discovered resources (parallel) ──
    send('status', { step: 'db-metrics', message: isEn
      ? '📈 Fetching CloudWatch metrics for all DB services...'
      : '📈 모든 DB 서비스의 CloudWatch 메트릭 조회 중...' });

    const rdsIds = rdsInstances.map((r: any) => r.db_instance_identifier).filter(Boolean);
    const ecIds = ecClusters.map((c: any) => c.cache_cluster_id).filter(Boolean);
    const osNames = osDomains.map((d: any) => d.domain_name).filter(Boolean);

    const [rdsMetrics, ecMetrics, osMetrics] = await Promise.allSettled([
      rdsIds.length > 0
        ? safeFetch<any>(apiUrl('rds', { instanceIds: rdsIds.join(',') }, accountId), { metrics: {} })
        : Promise.resolve({ metrics: {} }),
      ecIds.length > 0
        ? safeFetch<any>(apiUrl('elasticache', { clusterIds: ecIds.join(',') }, accountId), { metrics: {} })
        : Promise.resolve({ metrics: {} }),
      osNames.length > 0
        ? safeFetch<any>(apiUrl('opensearch', { domains: osNames.join(',') }, accountId), { metrics: {} })
        : Promise.resolve({ metrics: {} }),
    ]);

    const rdsM = rdsMetrics.status === 'fulfilled' ? rdsMetrics.value : { metrics: {} };
    const ecM = ecMetrics.status === 'fulfilled' ? ecMetrics.value : { metrics: {} };
    const osM = osMetrics.status === 'fulfilled' ? osMetrics.value : { metrics: {} };

    const rdsMetricCount = Object.keys(rdsM.metrics || {}).length;
    const ecMetricCount = Object.keys(ecM.metrics || {}).length;
    const osMetricCount = Object.keys(osM.metrics || {}).length;

    send('status', { step: 'db-metrics-done', message: isEn
      ? `✅ Metrics: RDS ${rdsMetricCount}/${rdsIds.length}, ElastiCache ${ecMetricCount}/${ecIds.length}, OpenSearch ${osMetricCount}/${osNames.length}`
      : `✅ 메트릭: RDS ${rdsMetricCount}/${rdsIds.length}, ElastiCache ${ecMetricCount}/${ecIds.length}, OpenSearch ${osMetricCount}/${osNames.length}` });

    // ── Build result ──
    const usedTools: string[] = [];
    const queriedResources: string[] = [];

    if (rdsInstances.length > 0) { usedTools.push(`Steampipe: RDS list (${rdsInstances.length})`); queriedResources.push('rds'); }
    if (ecClusters.length > 0) { usedTools.push(`Steampipe: ElastiCache list (${ecClusters.length})`); queriedResources.push('elasticache'); }
    if (osDomains.length > 0) { usedTools.push(`Steampipe: OpenSearch list (${osDomains.length})`); queriedResources.push('opensearch'); }
    if (rdsMetricCount > 0) usedTools.push(`CloudWatch: RDS metrics (${rdsMetricCount} instances)`);
    if (ecMetricCount > 0) usedTools.push(`CloudWatch: ElastiCache metrics (${ecMetricCount} clusters)`);
    if (osMetricCount > 0) usedTools.push(`CloudWatch: OpenSearch metrics (${osMetricCount} domains)`);

    const totalResources = rdsInstances.length + ecClusters.length + osDomains.length;

    return {
      sections: {
        rdsInstances, rdsMetrics: rdsM.metrics || {},
        ecClusters, ecMetrics: ecM.metrics || {},
        osDomains, osMetrics: osM.metrics || {},
      },
      usedTools,
      queriedResources,
      viaSummary: `DB Rightsizing (${totalResources} resources, ${rdsMetricCount + ecMetricCount + osMetricCount} metric sets)`,
    };
  },

  formatContext(data: CollectorResult): string {
    const { rdsInstances, rdsMetrics, ecClusters, ecMetrics, osDomains, osMetrics } = data.sections;
    const sections: string[] = [];

    // ── RDS ──
    if (rdsInstances?.length > 0) {
      sections.push('## RDS Instances');
      const enriched = rdsInstances.map((inst: any) => {
        const m = rdsMetrics?.[inst.db_instance_identifier];
        return {
          id: inst.db_instance_identifier,
          engine: `${inst.engine} ${inst.engine_version}`,
          class: inst.db_instance_class,
          multiAz: inst.multi_az,
          storage: `${inst.allocated_storage} GB`,
          status: inst.status,
          region: inst.region,
          metrics: m ? {
            cpuAvg: m.cpu != null ? `${m.cpu.toFixed(1)}%` : 'N/A',
            freeMemoryMB: m.mem != null ? `${(m.mem / 1024 / 1024).toFixed(0)} MB` : 'N/A',
            connections: m.conn != null ? Math.round(m.conn) : 'N/A',
            readIOPS: m.riops != null ? Math.round(m.riops) : 'N/A',
            writeIOPS: m.wiops != null ? Math.round(m.wiops) : 'N/A',
            freeStorageGB: m.storage != null ? `${(m.storage / 1024 / 1024 / 1024).toFixed(1)} GB` : 'N/A',
          } : 'No metrics available',
        };
      });
      sections.push(`\`\`\`json\n${JSON.stringify(enriched, null, 2)}\n\`\`\``);
    }

    // ── ElastiCache ──
    if (ecClusters?.length > 0) {
      sections.push('## ElastiCache Clusters');
      const enriched = ecClusters.map((cl: any) => {
        const m = ecMetrics?.[cl.cache_cluster_id];
        return {
          id: cl.cache_cluster_id,
          engine: `${cl.engine} ${cl.engine_version}`,
          nodeType: cl.cache_node_type,
          numNodes: cl.num_cache_nodes,
          status: cl.cache_cluster_status,
          replicationGroup: cl.replication_group_id || null,
          region: cl.region,
          metrics: m ? {
            cpuAvg: m.cpu != null ? `${m.cpu.toFixed(1)}%` : 'N/A',
            engineCpu: m.ecpu != null ? `${m.ecpu.toFixed(1)}%` : 'N/A',
            freeMemoryMB: m.mem != null ? `${(m.mem / 1024 / 1024).toFixed(0)} MB` : 'N/A',
            connections: m.conn != null ? Math.round(m.conn) : 'N/A',
            networkInMB: m.net_in != null ? `${(m.net_in / 1024 / 1024).toFixed(1)} MB` : 'N/A',
            networkOutMB: m.net_out != null ? `${(m.net_out / 1024 / 1024).toFixed(1)} MB` : 'N/A',
          } : 'No metrics available',
        };
      });
      sections.push(`\`\`\`json\n${JSON.stringify(enriched, null, 2)}\n\`\`\``);
    }

    // ── OpenSearch ──
    if (osDomains?.length > 0) {
      sections.push('## OpenSearch Domains');
      const enriched = osDomains.map((dom: any) => {
        const m = osMetrics?.[dom.domain_name];
        let clusterConfig: any = null;
        try { clusterConfig = typeof dom.cluster_config === 'string' ? JSON.parse(dom.cluster_config) : dom.cluster_config; } catch {}
        let ebsOptions: any = null;
        try { ebsOptions = typeof dom.ebs_options === 'string' ? JSON.parse(dom.ebs_options) : dom.ebs_options; } catch {}
        return {
          name: dom.domain_name,
          version: dom.engine_version,
          instanceType: clusterConfig?.InstanceType || 'unknown',
          instanceCount: clusterConfig?.InstanceCount || 'unknown',
          ebsVolumeSize: ebsOptions?.VolumeSize ? `${ebsOptions.VolumeSize} GB` : 'unknown',
          ebsVolumeType: ebsOptions?.VolumeType || 'unknown',
          metrics: m ? {
            cpuAvg: m.cpu != null ? `${m.cpu.toFixed(1)}%` : 'N/A',
            jvmMemoryPressure: m.mem_pressure != null ? `${m.mem_pressure.toFixed(1)}%` : 'N/A',
            freeStorageGB: m.free_storage != null ? `${(m.free_storage / 1024).toFixed(1)} GB` : 'N/A',
            searchLatencyMs: m.search_latency != null ? `${m.search_latency.toFixed(1)} ms` : 'N/A',
            indexingLatencyMs: m.indexing_latency != null ? `${m.indexing_latency.toFixed(1)} ms` : 'N/A',
            searchRate: m.search_rate != null ? Math.round(m.search_rate) : 'N/A',
            indexingRate: m.indexing_rate != null ? Math.round(m.indexing_rate) : 'N/A',
            clusterGreen: m.cluster_status_green ?? 'N/A',
            nodes: m.nodes != null ? Math.round(m.nodes) : 'N/A',
          } : 'No metrics available',
        };
      });
      sections.push(`\`\`\`json\n${JSON.stringify(enriched, null, 2)}\n\`\`\``);
    }

    if (sections.length === 0) return '\n\n--- No DB optimization data could be collected ---';
    return '\n\n--- DB SERVICE RIGHTSIZING DATA (collected automatically) ---\n' + sections.join('\n\n');
  },

  analysisPrompt: `You are a database service rightsizing expert for AWS. You have been given REAL data from the user's environment:
- RDS instances with CloudWatch metrics (CPU, FreeableMemory, Connections, IOPS, FreeStorageSpace)
- ElastiCache clusters with CloudWatch metrics (CPU, EngineCPU, FreeableMemory, Connections, Network)
- OpenSearch domains with CloudWatch metrics (CPU, JVM Pressure, FreeStorage, Latency, Cluster Status)

Analyze ALL the provided data and give specific, actionable rightsizing recommendations.

## Analysis Structure

### 1. Executive Summary
- Total estimated monthly savings across all DB services
- Number of over-provisioned resources found
- Any critical issues (high CPU, low memory, cluster health)

### 2. RDS Rightsizing
For each RDS instance with optimization potential:
| Instance | Engine | Current Class | CPU Avg | Memory Free | Connections | IOPS | Recommended Class | Est. Savings |
- **CPU < 20% sustained** → downsize instance class (e.g., db.r6g.xlarge → db.r6g.large)
- **FreeStorageSpace > 50% of allocated** → reduce allocated storage or switch to gp3
- **Low connections (< 10)** → consider downsizing or consolidating
- **Multi-AZ** → evaluate if Multi-AZ is needed for non-production workloads
- Check Reserved Instance applicability for stable workloads

### 3. ElastiCache Rightsizing
For each ElastiCache cluster with optimization potential:
| Cluster | Engine | Current Type | CPU Avg | Memory Free | Connections | Recommended | Est. Savings |
- **CPU < 15%** → downsize node type (e.g., cache.r6g.xlarge → cache.r6g.large)
- **Low connections (< 5)** → reduce node count or consolidate clusters
- **Engine CPU vs Host CPU gap** → evaluate if node type memory is underutilized
- Check Reserved Node pricing for stable clusters

### 4. OpenSearch Rightsizing
For each OpenSearch domain with optimization potential:
| Domain | Version | Current Type | CPU Avg | JVM Pressure | Free Storage | Recommended | Est. Savings |
- **JVM Memory Pressure < 50%** → downsize instance type
- **FreeStorageSpace > 60% of EBS** → reduce EBS volume size
- **Low search/indexing rate** → reduce instance count
- **Cluster status yellow/red** → investigate before downsizing
- Evaluate UltraWarm/Cold tiers for infrequently accessed indices

### 5. Cross-Service Recommendations
- DB services with matching workload patterns that could share infrastructure
- Non-production environments candidates for scheduled scaling
- Reserved capacity recommendations (RI/Savings Plans)

## Important Rules
- Provide specific instance type recommendations (not just "downsize")
- Include estimated monthly cost savings per recommendation
- Flag any resources that should NOT be downsized (high utilization, critical production)
- If metrics show N/A, note that monitoring data is insufficient
- Always respond in the SAME LANGUAGE as the user's question
- Use tables and formatting for easy scanning`,
};

export default dbOptimizeCollector;
