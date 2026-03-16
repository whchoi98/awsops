// EKS Container Cost API: Pod resource requests + node cost allocation
// EKS 컨테이너 비용 API: Pod 리소스 요청 + 노드 비용 분배
import { NextRequest, NextResponse } from 'next/server';
import { runQuery } from '@/lib/steampipe';
import { queries } from '@/lib/queries/eks-container-cost';
import { getConfig } from '@/lib/app-config';



// Parse K8s CPU (e.g. "8" -> 8, "500m" -> 0.5, "1000m" -> 1)
// K8s CPU 파싱 (예: "8" -> 8, "500m" -> 0.5)
function parseCpu(cpu: string | null): number {
  if (!cpu) return 0;
  const s = String(cpu).trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  return parseFloat(s) || 0;
}

// Parse K8s memory to MB (e.g. "512Mi" -> 512, "1Gi" -> 1024)
// K8s 메모리를 MB로 파싱 (예: "512Mi" -> 512, "1Gi" -> 1024)
function parseMemoryMB(mem: string | null): number {
  if (!mem) return 0;
  const s = String(mem).trim();
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|K|M|G|T)?$/i);
  if (!match) return parseInt(s) / (1024 * 1024) || 0; // bytes to MB
  const v = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();
  if (u === 'ki' || u === 'k') return v / 1024;
  if (u === 'mi' || u === 'm') return v;
  if (u === 'gi' || u === 'g') return v * 1024;
  if (u === 'ti' || u === 't') return v * 1024 * 1024;
  return v;
}

// EC2 instance type hourly pricing (ap-northeast-2, on-demand)
// EC2 인스턴스 타입별 시간당 가격 (서울, 온디맨드)
const EC2_PRICING: Record<string, number> = {
  // General Purpose / 범용
  'm5.large': 0.118, 'm5.xlarge': 0.236, 'm5.2xlarge': 0.472, 'm5.4xlarge': 0.944,
  'm6i.large': 0.118, 'm6i.xlarge': 0.236, 'm6i.2xlarge': 0.472, 'm6i.4xlarge': 0.944,
  'm6g.large': 0.0998, 'm6g.xlarge': 0.1996, 'm6g.2xlarge': 0.3992,
  'm7g.large': 0.1048, 'm7g.xlarge': 0.2096, 'm7g.2xlarge': 0.4192,
  // Compute Optimized / 컴퓨팅 최적화
  'c5.large': 0.098, 'c5.xlarge': 0.196, 'c5.2xlarge': 0.392, 'c5.4xlarge': 0.784,
  'c6i.large': 0.098, 'c6i.xlarge': 0.196, 'c6i.2xlarge': 0.392,
  'c6g.large': 0.0832, 'c6g.xlarge': 0.1664, 'c6g.2xlarge': 0.3328,
  // Memory Optimized / 메모리 최적화
  'r5.large': 0.152, 'r5.xlarge': 0.304, 'r5.2xlarge': 0.608,
  'r6i.large': 0.152, 'r6i.xlarge': 0.304, 'r6i.2xlarge': 0.608,
  'r6g.large': 0.1292, 'r6g.xlarge': 0.2584, 'r6g.2xlarge': 0.5168,
  // Burstable / 버스트
  't3.medium': 0.052, 't3.large': 0.104, 't3.xlarge': 0.2080, 't3.2xlarge': 0.416,
  't4g.medium': 0.0432, 't4g.large': 0.0864, 't4g.xlarge': 0.1728, 't4g.2xlarge': 0.3456,
};
const DEFAULT_HOURLY_RATE = 0.236; // m5.xlarge fallback / m5.xlarge 기본값

function getNodeHourlyRate(instanceType: string | null): number {
  if (!instanceType) return DEFAULT_HOURLY_RATE;
  return EC2_PRICING[instanceType] || DEFAULT_HOURLY_RATE;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'summary';
  const accountId = searchParams.get('accountId');
  const queryOpts = accountId ? { accountId } : {};

  try {
    // Auto-detect OpenCost: use it as primary if configured / OpenCost 자동 감지: 설정 시 우선 사용
    const config = getConfig();
    const opencostEndpoint = config.opencostEndpoint;

    if (opencostEndpoint && action !== 'request-only') {
      // OpenCost mode: actual usage-based cost (CPU, Memory, Network, Storage, GPU)
      // OpenCost 모드: 실제 사용량 기반 비용 (CPU, Memory, Network, Storage, GPU)
      try {
        const window = searchParams.get('window') || '1d';
        const res = await fetch(
          `${opencostEndpoint}/allocation/compute?window=${window}&aggregate=namespace,pod`,
          { signal: AbortSignal.timeout(10000) }
        );
        const ocData = await res.json();

        if (ocData.code === 200 && ocData.data?.[0]) {
          const allocations = ocData.data[0];
          const podList: any[] = [];
          const nsCosts: Record<string, number> = {};
          let totalDailyCost = 0;

          Object.entries(allocations).forEach(([key, alloc]: [string, any]) => {
            if (!alloc || key === '__idle__') return;
            const ns = alloc.properties?.namespace || 'unknown';
            const podName = alloc.properties?.pod || alloc.name || key;
            // Scale costs to 24h based on actual window minutes / 실제 윈도우 분 기준 24시간으로 환산
            const minutes = alloc.minutes || 60;
            const scale = (24 * 60) / minutes;
            const cpuCost = (alloc.cpuCost || 0) * scale;
            const memCost = (alloc.ramCost || 0) * scale;
            const networkCost = (alloc.networkCost || 0) * scale;
            const pvCost = (alloc.pvCost || 0) * scale;
            const gpuCost = (alloc.gpuCost || 0) * scale;
            const totalCost = cpuCost + memCost + networkCost + pvCost + gpuCost;

            podList.push({
              pod_name: podName,
              namespace: ns,
              node_name: alloc.properties?.node || '',
              instance_type: '',
              cpu_request_vcpu: alloc.cpuCoreRequestAverage || 0,
              memory_request_mb: Math.round((alloc.ramByteRequestAverage || 0) / (1024 * 1024)),
              cpuCostDaily: Math.round(cpuCost * 10000) / 10000,
              memCostDaily: Math.round(memCost * 10000) / 10000,
              networkCostDaily: Math.round(networkCost * 10000) / 10000,
              pvCostDaily: Math.round(pvCost * 10000) / 10000,
              gpuCostDaily: Math.round(gpuCost * 10000) / 10000,
              totalCostDaily: Math.round(totalCost * 10000) / 10000,
              cpuEfficiency: alloc.cpuEfficiency || 0,
              ramEfficiency: alloc.ramEfficiency || 0,
            });

            nsCosts[ns] = (nsCosts[ns] || 0) + totalCost;
            totalDailyCost += totalCost;
          });

          podList.sort((a, b) => b.totalCostDaily - a.totalCostDaily);

          const namespaceCosts = Object.entries(nsCosts)
            .map(([name, cost]) => ({ name, cost: Math.round(cost * 1000) / 1000 }))
            .sort((a, b) => b.cost - a.cost);

          return NextResponse.json({
            summary: {
              totalPodCostDaily: Math.round(totalDailyCost * 1000) / 1000,
              totalPodCostMonthly: Math.round(totalDailyCost * 30 * 100) / 100,
              totalNodeCostDaily: 0,
              totalNodeCostMonthly: 0,
              podCount: podList.length,
              nodeCount: 0,
              namespaceCount: namespaceCosts.length,
              topNamespace: namespaceCosts[0] || null,
            },
            pods: podList,
            nodes: [],
            namespaces: [],
            namespaceCosts,
            opencostEnabled: true,
            dataSource: 'opencost',
          });
        }
      } catch (err: any) {
        console.warn('[EKS Cost] OpenCost failed, falling back to request-based:', err.message);
        // Fall through to request-based / Request 기반으로 폴백
      }
    }

    // Request-based cost estimation (fallback or no OpenCost) / 리소스 요청 기반 비용 추정 (폴백 또는 OpenCost 없음)
    const [podsResult, nodesResult, nodeAggResult, nsResult] = await Promise.all([
      runQuery(queries.podResourceRequests, queryOpts),
      runQuery(queries.nodeCapacity, queryOpts),
      runQuery(queries.nodeRequestAggregation, queryOpts),
      runQuery(queries.namespaceSummary, queryOpts),
    ]);

    // Build node info map / 노드 정보 맵 구성
    const nodeMap: Record<string, { instanceType: string; allocCpu: number; allocMemMB: number; hourlyRate: number }> = {};
    (nodesResult.rows || []).forEach((n: any) => {
      const allocCpu = parseCpu(n.allocatable_cpu);
      const allocMemMB = parseMemoryMB(n.allocatable_memory);
      const instanceType = n.instance_type || '';
      nodeMap[n.node_name] = {
        instanceType,
        allocCpu,
        allocMemMB,
        hourlyRate: getNodeHourlyRate(instanceType),
      };
    });

    // Calculate per-pod cost / Pod별 비용 계산
    // Cost = (pod_cpu_req / node_alloc_cpu) * node_hourly * 24 + (pod_mem_req / node_alloc_mem) * node_hourly * 24
    // 비용 = (Pod CPU 요청 / 노드 할당 CPU) * 노드 시간당 가격 * 24 + (Pod Memory 요청 / 노드 할당 Memory) * 노드 시간당 가격 * 24
    const pods = (podsResult.rows || []).map((p: any) => {
      const cpuReq = parseCpu(p.cpu_request);
      const memReqMB = parseMemoryMB(p.memory_request);
      const node = nodeMap[p.node_name] || { allocCpu: 4, allocMemMB: 16384, hourlyRate: DEFAULT_HOURLY_RATE, instanceType: 'unknown' };

      const cpuRatio = node.allocCpu > 0 ? cpuReq / node.allocCpu : 0;
      const memRatio = node.allocMemMB > 0 ? memReqMB / node.allocMemMB : 0;
      // Split node cost 50% by CPU ratio, 50% by Memory ratio / 노드 비용을 CPU 50%, Memory 50% 비율로 분배
      const cpuCostDaily = cpuRatio * node.hourlyRate * 24 * 0.5;
      const memCostDaily = memRatio * node.hourlyRate * 24 * 0.5;
      const totalCostDaily = cpuCostDaily + memCostDaily;

      return {
        ...p,
        cpu_request_vcpu: cpuReq,
        memory_request_mb: Math.round(memReqMB),
        instance_type: node.instanceType,
        cpuCostDaily: Math.round(cpuCostDaily * 10000) / 10000,
        memCostDaily: Math.round(memCostDaily * 10000) / 10000,
        totalCostDaily: Math.round(totalCostDaily * 10000) / 10000,
      };
    });

    // Aggregate by pod (merge containers) / Pod 단위 집계 (컨테이너 병합)
    const podCostMap: Record<string, any> = {};
    pods.forEach((p: any) => {
      const key = `${p.namespace}/${p.pod_name}`;
      if (!podCostMap[key]) {
        podCostMap[key] = {
          pod_name: p.pod_name, namespace: p.namespace, node_name: p.node_name,
          instance_type: p.instance_type, phase: p.phase,
          cpu_request_vcpu: 0, memory_request_mb: 0,
          cpuCostDaily: 0, memCostDaily: 0, totalCostDaily: 0,
          containers: [],
        };
      }
      podCostMap[key].cpu_request_vcpu += p.cpu_request_vcpu;
      podCostMap[key].memory_request_mb += p.memory_request_mb;
      podCostMap[key].cpuCostDaily += p.cpuCostDaily;
      podCostMap[key].memCostDaily += p.memCostDaily;
      podCostMap[key].totalCostDaily += p.totalCostDaily;
      podCostMap[key].containers.push({
        name: p.container_name,
        cpu_request: p.cpu_request, memory_request: p.memory_request,
        cpu_limit: p.cpu_limit, memory_limit: p.memory_limit,
      });
    });
    const podList = Object.values(podCostMap).map((p: any) => ({
      ...p,
      cpu_request_vcpu: Math.round(p.cpu_request_vcpu * 1000) / 1000,
      memory_request_mb: Math.round(p.memory_request_mb),
      cpuCostDaily: Math.round(p.cpuCostDaily * 10000) / 10000,
      memCostDaily: Math.round(p.memCostDaily * 10000) / 10000,
      totalCostDaily: Math.round(p.totalCostDaily * 10000) / 10000,
    })).sort((a: any, b: any) => b.totalCostDaily - a.totalCostDaily);

    // Namespace cost aggregation / 네임스페이스별 비용 집계
    const nsCosts: Record<string, number> = {};
    podList.forEach((p: any) => {
      nsCosts[p.namespace] = (nsCosts[p.namespace] || 0) + p.totalCostDaily;
    });
    const namespaceCosts = Object.entries(nsCosts)
      .map(([name, cost]) => ({ name, cost: Math.round(cost * 1000) / 1000 }))
      .sort((a, b) => b.cost - a.cost);

    // Node cost summary / 노드 비용 요약
    const nodeCosts = (nodesResult.rows || []).map((n: any) => {
      const info = nodeMap[n.node_name];
      const agg = (nodeAggResult.rows || []).find((a: any) => a.node_name === n.node_name);
      return {
        node_name: n.node_name,
        instance_type: info?.instanceType || 'unknown',
        hourlyRate: info?.hourlyRate || DEFAULT_HOURLY_RATE,
        dailyCost: Math.round((info?.hourlyRate || DEFAULT_HOURLY_RATE) * 24 * 100) / 100,
        allocatable_cpu: info?.allocCpu || 0,
        allocatable_memory_mb: info?.allocMemMB || 0,
        pod_count: parseInt(String(agg?.pod_count)) || 0,
        container_count: parseInt(String(agg?.container_count)) || 0,
      };
    });

    const totalDailyCost = podList.reduce((sum: number, p: any) => sum + p.totalCostDaily, 0);
    const totalNodeDailyCost = nodeCosts.reduce((sum: number, n: any) => sum + n.dailyCost, 0);

    return NextResponse.json({
      summary: {
        totalPodCostDaily: Math.round(totalDailyCost * 1000) / 1000,
        totalPodCostMonthly: Math.round(totalDailyCost * 30 * 100) / 100,
        totalNodeCostDaily: Math.round(totalNodeDailyCost * 100) / 100,
        totalNodeCostMonthly: Math.round(totalNodeDailyCost * 30 * 100) / 100,
        podCount: podList.length,
        nodeCount: nodeCosts.length,
        namespaceCount: namespaceCosts.length,
        topNamespace: namespaceCosts[0] || null,
      },
      pods: podList,
      nodes: nodeCosts,
      namespaces: nsResult.rows || [],
      namespaceCosts,
      opencostEnabled: !!opencostEndpoint,
      dataSource: 'request-based',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to fetch EKS container cost data' }, { status: 500 });
  }
}
