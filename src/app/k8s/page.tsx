'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, ArrowLeft, Cpu, HardDrive, Wifi } from 'lucide-react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Box, Rocket, Network, Server, AlertTriangle } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { useAccountContext } from '@/contexts/AccountContext';

// Format K8s memory values (e.g. "32986188Ki" → "31.5 GiB") / K8s 메모리 가독성 변환
function formatK8sMemory(mem: any): string {
  if (!mem) return '--';
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|K|M|G|T|k|m|g|t)?$/);
  if (!match) return s;
  let value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'ki' || unit === 'k') value = value / 1024;
  else if (unit === 'gi' || unit === 'g') value = value * 1024;
  else if (unit === 'ti' || unit === 't') value = value * 1024 * 1024;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} TiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GiB`;
  if (value >= 1) return `${Math.round(value)} MiB`;
  return `${Math.round(value * 1024)} KiB`;
}

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

const NODE_LIST_QUERY = `
  SELECT
    name, uid, pod_cidr, capacity_cpu, capacity_memory,
    allocatable_cpu, allocatable_memory,
    CASE WHEN jsonb_array_length(conditions) > 0 THEN 'Ready' ELSE 'NotReady' END as status
  FROM kubernetes_node
`;

const POD_REQUESTS_QUERY = `
  SELECT
    p.node_name,
    c->'resources'->'requests'->>'cpu' AS cpu_req,
    c->'resources'->'requests'->>'memory' AS mem_req
  FROM
    kubernetes_pod p,
    jsonb_array_elements(p.containers) AS c
  WHERE
    p.phase = 'Running' AND p.node_name IS NOT NULL
`;

// Format bytes to human readable / 바이트를 가독성 있게 변환
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes.toFixed(0)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatPackets(pkts: number): string {
  if (pkts <= 0) return '0';
  if (pkts < 1000) return `${pkts.toFixed(0)}`;
  if (pkts < 1000000) return `${(pkts / 1000).toFixed(1)}K`;
  return `${(pkts / 1000000).toFixed(1)}M`;
}

// Parse K8s CPU (e.g. "8" → 8, "7910m" → 7.91) / K8s CPU 파싱
function parseCpu(cpu: any): number {
  if (!cpu) return 0;
  const s = String(cpu).trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  return parseFloat(s) || 0;
}

// Parse K8s memory to MiB / K8s 메모리 MiB 변환
function parseMiB(mem: any): number {
  if (!mem) return 0;
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti)?$/i);
  if (!match) return parseInt(s) || 0;
  let v = parseFloat(match[1]);
  const u = (match[2] || '').toLowerCase();
  if (u === 'ki') v = v / 1024;
  else if (u === 'gi') v = v * 1024;
  else if (u === 'ti') v = v * 1024 * 1024;
  return Math.round(v);
}

export default function K8sOverviewPage() {
  const { currentAccountId } = useAccountContext();
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [selectedClusters, setSelectedClusters] = useState<Set<string>>(new Set());
  const [selectedVpcs, setSelectedVpcs] = useState<Set<string>>(new Set());
  const [showFilter, setShowFilter] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeEnis, setNodeEnis] = useState<any[]>([]);
  const [nodeTraffic, setNodeTraffic] = useState<any>(null);
  const [eniLoading, setEniLoading] = useState(false);

  // Fetch ENI data + traffic for selected node / 선택된 노드의 ENI + 트래픽 조회
  const fetchNodeEnis = useCallback(async (nodeName: string) => {
    setEniLoading(true);
    setNodeTraffic(null);
    try {
      const ipPrefix = nodeName.split('.')[0];
      const eniSql = `SELECT network_interface_id, status, interface_type, private_ip_address::text AS primary_ip, attachment_status, private_ip_addresses::text AS all_ips FROM aws_ec2_network_interface WHERE attached_instance_id IN (SELECT instance_id FROM aws_ec2_instance WHERE private_dns_name LIKE '${ipPrefix}%')`;
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { enis: eniSql } }),
      });
      const result = await res.json();
      const eniRows = result.enis?.rows || [];
      setNodeEnis(eniRows);

      // Fetch per-ENI traffic from CloudWatch / ENI별 트래픽 조회
      if (eniRows.length > 0) {
        const eniIds = eniRows.map((e: any) => `'${e.network_interface_id}'`).join(',');
        const trafficSql = `SELECT dimension_value AS eni_id, metric_name, average, timestamp FROM aws_cloudwatch_metric_statistic_data_point WHERE namespace = 'AWS/EC2' AND metric_name IN ('NetworkIn', 'NetworkOut', 'NetworkPacketsIn', 'NetworkPacketsOut') AND dimension_name = 'NetworkInterfaceId' AND dimension_value IN (${eniIds}) AND period = 300 AND timestamp >= NOW() - INTERVAL '1 hour' ORDER BY dimension_value, metric_name, timestamp DESC`;
        try {
          const tRes = await fetch('/awsops/api/steampipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries: { traffic: trafficSql } }),
          });
          const tResult = await tRes.json();
          const trafficRows = tResult.traffic?.rows || [];
          // Group by ENI → metric → avg / ENI별 메트릭 평균 집계
          const perEni: Record<string, Record<string, number[]>> = {};
          trafficRows.forEach((r: any) => {
            const eni = String(r.eni_id);
            const metric = String(r.metric_name);
            if (!perEni[eni]) perEni[eni] = {};
            if (!perEni[eni][metric]) perEni[eni][metric] = [];
            perEni[eni][metric].push(Number(r.average) || 0);
          });
          const avgArr = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
          const trafficMap: Record<string, any> = {};
          Object.entries(perEni).forEach(([eni, metrics]) => {
            trafficMap[eni] = {
              networkIn: avgArr(metrics['NetworkIn'] || []),
              networkOut: avgArr(metrics['NetworkOut'] || []),
              packetsIn: avgArr(metrics['NetworkPacketsIn'] || []),
              packetsOut: avgArr(metrics['NetworkPacketsOut'] || []),
            };
          });
          setNodeTraffic(trafficMap);
        } catch {
          setNodeTraffic({});
        }
      }
    } catch {
      setNodeEnis([]);
    } finally {
      setEniLoading(false);
    }
  }, []);

  // Select node + fetch ENIs / 노드 선택 + ENI 조회
  const selectNode = useCallback((nodeName: string) => {
    setSelectedNode(nodeName);
    setNodeEnis([]);
    fetchNodeEnis(nodeName);
  }, [fetchNodeEnis]);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            nodeSummary: k8sQ.nodeSummary,
            podSummary: k8sQ.podSummary,
            deploymentSummary: k8sQ.deploymentSummary,
            serviceList: k8sQ.serviceList,
            warningEvents: k8sQ.warningEvents,
            namespaceSummary: k8sQ.namespaceSummary,
            nodeList: NODE_LIST_QUERY,
            podRequests: POD_REQUESTS_QUERY,
            podList: k8sQ.podList,
            eksClusters: k8sQ.eksClusterList,
          },
        }),
      });
      setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const nodeSummary = getFirst('nodeSummary') as any;
  const podSummary = getFirst('podSummary') as any;
  const deploySummary = getFirst('deploymentSummary') as any;
  const services = get('serviceList');
  const events = get('warningEvents');
  const namespaces = get('namespaceSummary');
  const nodes = get('nodeList');
  const podReqRows = get('podRequests');
  const eksClusters = get('eksClusters');

  // Aggregate pod requests per node / 노드별 Pod 리소스 요청 집계
  const reqMap: Record<string, { cpuReq: number; memReqMiB: number; podCount: number }> = {};
  podReqRows.forEach((r: any) => {
    const node = String(r.node_name || '');
    if (!node) return;
    if (!reqMap[node]) reqMap[node] = { cpuReq: 0, memReqMiB: 0, podCount: 0 };
    reqMap[node].podCount += 1;
    if (r.cpu_req) reqMap[node].cpuReq += parseCpu(r.cpu_req);
    if (r.mem_req) reqMap[node].memReqMiB += parseMiB(r.mem_req);
  });

  // Extract unique clusters and VPCs / 클러스터 및 VPC 목록 추출
  const clusterNames = useMemo(() => eksClusters.map((c: any) => String(c.cluster_name)).sort(), [eksClusters]);
  const vpcList = useMemo(() => {
    const vpcs = new Set<string>();
    eksClusters.forEach((c: any) => { if (c.vpc_id) vpcs.add(String(c.vpc_id)); });
    return Array.from(vpcs).sort();
  }, [eksClusters]);

  // Filter clusters / 클러스터 필터링
  const filteredClusters = useMemo(() => {
    if (selectedClusters.size === 0 && selectedVpcs.size === 0) return eksClusters;
    return eksClusters.filter((c: any) => {
      const matchCluster = selectedClusters.size === 0 || selectedClusters.has(String(c.cluster_name));
      const matchVpc = selectedVpcs.size === 0 || selectedVpcs.has(String(c.vpc_id));
      return matchCluster && matchVpc;
    });
  }, [eksClusters, selectedClusters, selectedVpcs]);

  const hasFilters = selectedClusters.size > 0 || selectedVpcs.size > 0;

  // Toggle helpers / 토글 헬퍼
  const toggleCluster = (name: string) => {
    setSelectedClusters(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };
  const toggleVpc = (vpc: string) => {
    setSelectedVpcs(prev => {
      const next = new Set(prev);
      if (next.has(vpc)) next.delete(vpc); else next.add(vpc);
      return next;
    });
  };
  const clearFilters = () => { setSelectedClusters(new Set()); setSelectedVpcs(new Set()); };

  // Selected node detail data / 선택된 노드 상세 데이터
  const allPods = get('podList');
  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    const node = nodes.find((n: any) => n.name === selectedNode);
    if (!node) return null;
    const nodePods = allPods.filter((p: any) => p.node_name === selectedNode);
    const req = reqMap[selectedNode] || { cpuReq: 0, memReqMiB: 0, podCount: 0 };
    const capCpu = parseCpu(node.capacity_cpu) || 1;
    const allocCpu = parseCpu(node.allocatable_cpu) || 0;
    const capMiB = parseMiB(node.capacity_memory) || 1;
    const allocMiB = parseMiB(node.allocatable_memory) || 0;
    return { node, nodePods, req, capCpu, allocCpu, capMiB, allocMiB };
  }, [selectedNode, nodes, allPods, reqMap]);

  // Pod status pie data
  const podStatusData = [
    { name: 'Running', value: Number(podSummary.running_pods) || 0 },
    { name: 'Pending', value: Number(podSummary.pending_pods) || 0 },
    { name: 'Failed', value: Number(podSummary.failed_pods) || 0 },
    { name: 'Succeeded', value: Number(podSummary.succeeded_pods) || 0 },
  ].filter((d) => d.value > 0);

  // Namespace bar data
  const namespaceData = namespaces.map((ns: any) => ({
    name: ns.name,
    value: 1,
  }));

  // Node Detail View / 노드 상세 뷰
  if (selectedNode && selectedNodeData) {
    const { node, nodePods, req, capCpu, allocCpu, capMiB, allocMiB } = selectedNodeData as any;
    const cpuReqPct = Math.min(Math.round((req.cpuReq / capCpu) * 100), 100);
    const memReqPct = Math.min(Math.round((req.memReqMiB / capMiB) * 100), 100);
    const cpuAllocPct = Math.round((allocCpu / capCpu) * 100);
    const memAllocPct = Math.round((allocMiB / capMiB) * 100);

    return (
      <div className="min-h-screen">
        <div className="p-6 space-y-6 animate-fade-in">
          {/* Back button + Node name / 뒤로가기 + 노드 이름 */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedNode(null)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-navy-800 border border-navy-600 text-gray-400 hover:text-white hover:border-accent-cyan/50 transition-colors text-sm"
            >
              <ArrowLeft size={16} />
              Back to Overview
            </button>
            <div>
              <h1 className="text-lg font-bold text-white font-mono">{node.name.split('.')[0]}</h1>
              <p className="text-xs text-gray-500">{node.name}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="bg-accent-green/15 text-accent-green text-xs font-mono px-2 py-1 rounded-full">{req.podCount} pods</span>
              <StatusBadge status={node.status ?? 'Unknown'} />
            </div>
          </div>

          {/* Resource Cards / 리소스 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* CPU Card */}
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={16} className="text-accent-cyan" />
                <h3 className="text-sm font-semibold text-white">CPU</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Capacity</span><span className="text-white font-mono">{capCpu} vCPU</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Allocatable</span><span className="text-white font-mono">{allocCpu.toFixed(2)} vCPU ({cpuAllocPct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pod Requested</span><span className="text-accent-cyan font-mono">{req.cpuReq.toFixed(2)} vCPU ({cpuReqPct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="text-accent-green font-mono">{(allocCpu - req.cpuReq).toFixed(2)} vCPU</span></div>
              </div>
              <div className="h-4 bg-navy-900 rounded-full overflow-hidden mt-3 flex">
                <div className={`h-full ${cpuReqPct >= 80 ? 'bg-accent-red' : cpuReqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`} style={{ width: `${cpuReqPct}%` }} />
                <div className="h-full bg-accent-green/20" style={{ width: `${cpuAllocPct - cpuReqPct}%` }} />
                <div className="h-full bg-gray-700" style={{ width: `${100 - cpuAllocPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1 text-gray-600">
                <span>Requested</span><span>Available</span><span>Reserved</span>
              </div>
            </div>

            {/* Memory Card */}
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <HardDrive size={16} className="text-accent-purple" />
                <h3 className="text-sm font-semibold text-white">Memory</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Capacity</span><span className="text-white font-mono">{formatK8sMemory(node.capacity_memory)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Allocatable</span><span className="text-white font-mono">{formatK8sMemory(`${allocMiB}Mi`)} ({memAllocPct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pod Requested</span><span className="text-accent-purple font-mono">{formatK8sMemory(`${req.memReqMiB}Mi`)} ({memReqPct}%)</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Available</span><span className="text-accent-green font-mono">{formatK8sMemory(`${allocMiB - req.memReqMiB}Mi`)}</span></div>
              </div>
              <div className="h-4 bg-navy-900 rounded-full overflow-hidden mt-3 flex">
                <div className={`h-full ${memReqPct >= 80 ? 'bg-accent-red' : memReqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-purple'}`} style={{ width: `${memReqPct}%` }} />
                <div className="h-full bg-accent-green/20" style={{ width: `${memAllocPct - memReqPct}%` }} />
                <div className="h-full bg-gray-700" style={{ width: `${100 - memAllocPct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] mt-1 text-gray-600">
                <span>Requested</span><span>Available</span><span>Reserved</span>
              </div>
            </div>

            {/* Pod Info Card / Pod 정보 카드 */}
            <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-3">
                <Box size={16} className="text-accent-green" />
                <h3 className="text-sm font-semibold text-white">Pod Info</h3>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-gray-500">Pod CIDR</span><span className="text-white font-mono">{node.pod_cidr || '--'}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total Pods</span><span className="text-accent-green font-mono">{req.podCount}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Running</span><span className="text-white font-mono">{nodePods.filter((p: any) => p.phase === 'Running').length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Pending</span><span className="text-accent-orange font-mono">{nodePods.filter((p: any) => p.phase === 'Pending').length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Failed</span><span className="text-accent-red font-mono">{nodePods.filter((p: any) => p.phase === 'Failed').length}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="text-white font-mono">{node.creation_timestamp ? new Date(node.creation_timestamp).toLocaleDateString() : '--'}</span></div>
              </div>
            </div>
          </div>

          {/* ENI (Network Interfaces) / ENI 네트워크 인터페이스 */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Wifi size={18} className="text-accent-orange" />
              Network Interfaces (ENI)
              {!eniLoading && <span className="text-xs text-gray-500 font-normal ml-2">{nodeEnis.length} ENIs</span>}
            </h2>
            {eniLoading ? (
              <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-24 skeleton rounded" />)}</div>
            ) : nodeEnis.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {nodeEnis.map((eni: any) => {
                  let ips: any[] = [];
                  try { ips = JSON.parse(eni.all_ips || '[]'); } catch {}
                  const totalSlots = ips.length;
                  const secondaryIps = ips.filter((ip: any) => !ip.Primary);
                  const eniTraffic = nodeTraffic?.[eni.network_interface_id];
                  return (
                    <div key={eni.network_interface_id} className="bg-navy-800 border border-navy-600 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-accent-orange font-mono text-xs">{eni.network_interface_id}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${eni.status === 'in-use' ? 'bg-accent-green/15 text-accent-green' : 'bg-gray-700 text-gray-400'}`}>{eni.status}</span>
                      </div>
                      <div className="space-y-1.5 text-xs mb-3">
                        <div className="flex justify-between"><span className="text-gray-500">Primary IP</span><span className="text-white font-mono">{eni.primary_ip}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Type</span><span className="text-white font-mono">{eni.interface_type}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">IPs Allocated</span><span className="text-accent-cyan font-mono">{totalSlots} ({secondaryIps.length} secondary)</span></div>
                      </div>
                      {/* IP usage bar / IP 사용량 바 */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="text-gray-500">IP Slots Used</span>
                          <span className="text-white font-mono">{totalSlots} / 15</span>
                        </div>
                        <div className="h-2.5 bg-navy-900 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${totalSlots >= 14 ? 'bg-accent-red' : totalSlots >= 10 ? 'bg-accent-orange' : 'bg-accent-cyan'}`} style={{ width: `${Math.min((totalSlots / 15) * 100, 100)}%` }} />
                        </div>
                      </div>
                      {/* Per-ENI Traffic / ENI별 트래픽 */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-navy-900 rounded p-2 text-center">
                          <p className="text-[9px] text-gray-500 uppercase">In (avg/5m)</p>
                          <p className="text-sm font-mono font-bold text-accent-cyan">{eniTraffic ? formatBytes(eniTraffic.networkIn) : '--'}</p>
                          <p className="text-[9px] text-gray-600">{eniTraffic ? `${formatPackets(eniTraffic.packetsIn)} pkts` : ''}</p>
                        </div>
                        <div className="bg-navy-900 rounded p-2 text-center">
                          <p className="text-[9px] text-gray-500 uppercase">Out (avg/5m)</p>
                          <p className="text-sm font-mono font-bold text-accent-purple">{eniTraffic ? formatBytes(eniTraffic.networkOut) : '--'}</p>
                          <p className="text-[9px] text-gray-600">{eniTraffic ? `${formatPackets(eniTraffic.packetsOut)} pkts` : ''}</p>
                        </div>
                      </div>
                      {/* Secondary IPs (collapsed) / 세컨더리 IP 목록 */}
                      <details>
                        <summary className="text-[10px] text-gray-500 cursor-pointer hover:text-gray-300">Show {secondaryIps.length} secondary IPs</summary>
                        <div className="mt-1 max-h-32 overflow-y-auto space-y-0.5">
                          {secondaryIps.map((ip: any, i: number) => (
                            <div key={i} className="text-[10px] font-mono text-gray-400 pl-2 border-l border-navy-600">
                              {ip.PrivateIpAddress}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No ENI data available</p>
            )}
          </div>

          {/* Pods Table / 파드 테이블 */}
          <div>
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <Box size={18} className="text-accent-green" />
              Pods on {node.name.split('.')[0]}
              <span className="text-xs text-gray-500 font-normal ml-2">{nodePods.length} pods</span>
            </h2>
            <DataTable
              columns={[
                { key: 'name', label: 'Pod Name' },
                { key: 'namespace', label: 'Namespace' },
                { key: 'phase', label: 'Status', render: (v: string) => <StatusBadge status={v || 'Unknown'} /> },
                { key: 'pod_ip', label: 'Pod IP' },
                { key: 'service_account_name', label: 'Service Account' },
                { key: 'creation_timestamp', label: 'Created', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
              ]}
              data={nodePods}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Kubernetes Overview"
        subtitle="Cluster health and resource summary"
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
        {/* EKS Cluster / VPC Filter / EKS 클러스터 및 VPC 필터 */}
        {eksClusters.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilter(!showFilter)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  showFilter || hasFilters
                    ? 'bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30'
                    : 'bg-navy-800 text-gray-400 border border-navy-600 hover:text-white'
                }`}
              >
                <Filter size={14} />
                Cluster / VPC Filter
                {hasFilters && (
                  <span className="bg-accent-cyan/20 text-accent-cyan text-xs px-1.5 py-0.5 rounded-full">
                    {selectedClusters.size + selectedVpcs.size}
                  </span>
                )}
              </button>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-white transition-colors">
                  Clear all
                </button>
              )}
              <span className="text-xs text-gray-500 ml-auto">
                {filteredClusters.length} / {eksClusters.length} clusters
              </span>
            </div>

            {showFilter && (
              <div className="bg-navy-800 border border-navy-600 rounded-lg p-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Cluster select / 클러스터 선택 */}
                <div>
                  <p className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-2">EKS Clusters</p>
                  <div className="flex flex-wrap gap-2">
                    {clusterNames.map((name: string) => (
                      <button
                        key={name}
                        onClick={() => toggleCluster(name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                          selectedClusters.has(name)
                            ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                            : 'bg-navy-900 text-gray-400 border border-navy-700 hover:text-white hover:border-navy-500'
                        }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
                {/* VPC select / VPC 선택 */}
                <div>
                  <p className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-2">VPCs</p>
                  <div className="flex flex-wrap gap-2">
                    {vpcList.map((vpc: string) => {
                      const clusterCount = eksClusters.filter((c: any) => String(c.vpc_id) === vpc).length;
                      return (
                        <button
                          key={vpc}
                          onClick={() => toggleVpc(vpc)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                            selectedVpcs.has(vpc)
                              ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
                              : 'bg-navy-900 text-gray-400 border border-navy-700 hover:text-white hover:border-navy-500'
                          }`}
                        >
                          {vpc} <span className="text-gray-600">({clusterCount})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* EKS Cluster Cards / EKS 클러스터 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredClusters.map((c: any) => (
                <div key={c.cluster_name} className="bg-navy-800 border border-navy-600 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-mono text-sm font-semibold">{c.cluster_name}</span>
                    <StatusBadge status={c.status || 'UNKNOWN'} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Version: </span><span className="text-gray-300 font-mono">{c.version}</span></div>
                    <div><span className="text-gray-500">VPC: </span><span className="text-accent-purple font-mono">{c.vpc_id}</span></div>
                    <div><span className="text-gray-500">Platform: </span><span className="text-gray-300 font-mono">{c.platform_version || '--'}</span></div>
                    <div><span className="text-gray-500">Region: </span><span className="text-gray-300 font-mono">{c.region}</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            label="Nodes"
            value={nodeSummary.total_nodes ?? '-'}
            icon={Server}
            color="cyan"
            change={`${nodeSummary.ready_nodes ?? 0} ready`}
          />
          <StatsCard
            label="Pods"
            value={podSummary.total_pods ?? '-'}
            icon={Box}
            color="green"
            change={`${podSummary.running_pods ?? 0} running`}
          />
          <StatsCard
            label="Deployments"
            value={deploySummary.total_deployments ?? '-'}
            icon={Rocket}
            color="purple"
            change={`${deploySummary.fully_available ?? 0} fully available`}
          />
          <StatsCard
            label="Services"
            value={services.length}
            icon={Network}
            color="orange"
          />
        </div>

        {/* Node Cards Grid */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3">Nodes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {nodes.map((node: any) => {
              const capCpu = parseCpu(node.capacity_cpu) || 1;
              const capMiB = parseMiB(node.capacity_memory) || 1;
              const req = reqMap[node.name] || { cpuReq: 0, memReqMiB: 0, podCount: 0 };
              const cpuPct = Math.min(Math.round((req.cpuReq / capCpu) * 100), 100);
              const memPct = Math.min(Math.round((req.memReqMiB / capMiB) * 100), 100);
              return (
                <div
                  key={node.name}
                  onClick={() => selectNode(node.name)}
                  className="bg-navy-800 border border-navy-600 rounded-lg p-4 cursor-pointer transition-all hover:scale-[1.02] hover:border-accent-cyan/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Server size={16} className="text-accent-cyan" />
                      <span className="text-white font-mono text-sm">{node.name.split('.')[0]}</span>
                      <span className="bg-accent-green/15 text-accent-green text-[10px] font-mono px-1.5 py-0.5 rounded-full">{req.podCount} pods</span>
                    </div>
                    <StatusBadge status={node.status ?? 'Unknown'} />
                  </div>

                  {/* CPU Usage Bar / CPU 사용량 바 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">CPU</span>
                      <span className="text-white font-mono">{req.cpuReq.toFixed(1)} / {capCpu} vCPU <span className={cpuPct >= 80 ? 'text-accent-red' : cpuPct >= 50 ? 'text-accent-orange' : 'text-accent-cyan'}>({cpuPct}%)</span></span>
                    </div>
                    <div className="h-3 bg-navy-900 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cpuPct >= 80 ? 'bg-accent-red' : cpuPct >= 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`} style={{ width: `${cpuPct}%` }} />
                    </div>
                  </div>

                  {/* Memory Usage Bar / 메모리 사용량 바 */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-500">Memory</span>
                      <span className="text-white font-mono">{formatK8sMemory(`${req.memReqMiB}Mi`)} / {formatK8sMemory(node.capacity_memory)} <span className={memPct >= 80 ? 'text-accent-red' : memPct >= 50 ? 'text-accent-orange' : 'text-accent-purple'}>({memPct}%)</span></span>
                    </div>
                    <div className="h-3 bg-navy-900 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${memPct >= 80 ? 'bg-accent-red' : memPct >= 50 ? 'bg-accent-orange' : 'bg-accent-purple'}`} style={{ width: `${memPct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {nodes.length === 0 && !loading && (
              <div className="col-span-full text-center text-gray-500 py-8">No nodes found</div>
            )}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PieChartCard title="Pod Status Distribution" data={podStatusData} />
          <BarChartCard title="Namespaces" data={namespaceData} color="#00d4ff" />
        </div>

        {/* Warning Events Table */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={18} className="text-accent-orange" />
            Warning Events
          </h2>
          <DataTable
            columns={[
              { key: 'involved_object_kind', label: 'Kind' },
              { key: 'involved_object_name', label: 'Object' },
              { key: 'reason', label: 'Reason' },
              { key: 'message', label: 'Message' },
              { key: 'count', label: 'Count' },
              { key: 'last_timestamp', label: 'Last Seen' },
            ]}
            data={events}
          />
        </div>
      </main>
    </div>
  );
}
