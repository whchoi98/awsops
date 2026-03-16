'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Server, CheckCircle, Cpu, HardDrive } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';
import { useAccountContext } from '@/contexts/AccountContext';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

const NODE_DETAIL_QUERY = `
  SELECT
    name, uid, pod_cidr,
    capacity_cpu, capacity_memory,
    allocatable_cpu, allocatable_memory,
    creation_timestamp,
    CASE WHEN jsonb_array_length(conditions) > 0 THEN 'Ready' ELSE 'NotReady' END as status
  FROM kubernetes_node
  ORDER BY name
`;

// Pod container resource requests (raw) / Pod 컨테이너 리소스 요청 (원시값)
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

// Format K8s memory values (e.g. "32986188Ki" → "31.5 GiB") / K8s 메모리 가독성 변환
function formatK8sMemory(mem: any): string {
  if (!mem) return '--';
  const s = String(mem);
  const match = s.match(/^(\d+(?:\.\d+)?)\s*(Ki|Mi|Gi|Ti|K|M|G|T|k|m|g|t)?$/);
  if (!match) return s;
  let value = parseFloat(match[1]);
  const unit = (match[2] || '').toLowerCase();
  // Convert to MiB / MiB로 변환
  if (unit === 'ki' || unit === 'k') value = value / 1024;
  else if (unit === 'mi' || unit === 'm' || unit === '') value = value;
  else if (unit === 'gi' || unit === 'g') value = value * 1024;
  else if (unit === 'ti' || unit === 't') value = value * 1024 * 1024;
  // Format to human readable / 사람이 읽기 쉬운 형식으로 변환
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} TiB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} GiB`;
  if (value >= 1) return `${Math.round(value)} MiB`;
  return `${Math.round(value * 1024)} KiB`;
}

// Parse K8s CPU values (e.g. "8" → 8, "7910m" → 7.91) / K8s CPU 파싱 (밀리코어 지원)
function parseCpu(cpu: any): number {
  if (!cpu) return 0;
  const s = String(cpu).trim();
  if (s.endsWith('m')) return parseFloat(s) / 1000;
  return parseFloat(s) || 0;
}

// Parse K8s memory to MiB (e.g. "32986188Ki" → 32213) / K8s 메모리 MiB 변환
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

export default function K8sNodesPage() {
  const { currentAccountId } = useAccountContext();
  const [data, setData] = useState<DashboardData>({});
  const [_loading, setLoading] = useState(true);

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
            nodeList: NODE_DETAIL_QUERY,
            podRequests: POD_REQUESTS_QUERY,
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

  const summary = getFirst('nodeSummary') as any;
  const nodes = get('nodeList');
  const podReqRows = get('podRequests');

  // Aggregate pod requests per node in frontend / 프론트엔드에서 노드별 Pod 요청 집계
  const reqMap: Record<string, { cpuReq: number; memReqMiB: number; podCount: number }> = {};
  podReqRows.forEach((r: any) => {
    const node = String(r.node_name || '');
    if (!node) return;
    if (!reqMap[node]) reqMap[node] = { cpuReq: 0, memReqMiB: 0, podCount: 0 };
    reqMap[node].podCount += 1;
    // Parse CPU request (e.g. "250m" → 0.25, "1" → 1) / CPU 요청 파싱
    if (r.cpu_req) reqMap[node].cpuReq += parseCpu(r.cpu_req);
    // Parse Memory request (e.g. "128Mi", "1Gi", "256Ki") / 메모리 요청 파싱
    if (r.mem_req) reqMap[node].memReqMiB += parseMiB(r.mem_req);
  });

  // CPU & Memory capacity bar data
  const cpuBarData = nodes.map((n: any) => ({
    name: n.name,
    value: parseCpu(n.capacity_cpu),
  }));

  const memBarData = nodes.map((n: any) => ({
    name: n.name,
    value: Math.round(parseMiB(n.capacity_memory) / 1024), // GiB for chart
  }));

  // Sum totals
  const totalCpu = nodes.reduce((sum: number, n: any) => sum + parseCpu(n.capacity_cpu), 0);
  const totalMemMiB = nodes.reduce((sum: number, n: any) => sum + parseMiB(n.capacity_memory), 0);
  const memLabel = formatK8sMemory(`${totalMemMiB}Mi`);

  return (
    <div className="min-h-screen">
      <Header
        title="Kubernetes Nodes"
        subtitle="Node inventory and capacity"
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total Nodes" value={summary.total_nodes ?? '-'} icon={Server} color="cyan" />
          <StatsCard label="Ready" value={summary.ready_nodes ?? '-'} icon={CheckCircle} color="green" />
          <StatsCard label="Total CPU" value={`${totalCpu} vCPU`} icon={Cpu} color="purple" />
          <StatsCard label="Total Memory" value={memLabel} icon={HardDrive} color="orange" />
        </div>

        {/* Node Resource Usage Charts — Requested / Allocatable / Capacity */}
        {/* 노드 리소스 사용 차트 — Pod 요청 / 할당가능 / 전체용량 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CPU Usage / CPU 사용률 */}
          <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
            <h3 className="text-sm font-semibold text-white mb-1">CPU Usage per Node</h3>
            <p className="text-xs text-gray-500 mb-3">Pod Requested / Allocatable / Capacity</p>
            <div className="flex items-center gap-4 text-[10px] mb-4">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-cyan inline-block" /> Requested</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-green/30 inline-block" /> Available</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" /> System Reserved</span>
            </div>
            <div className="space-y-4">
              {nodes.map((n: any) => {
                const cap = parseCpu(n.capacity_cpu) || 1;
                const alloc = parseCpu(n.allocatable_cpu) || 0;
                const req = reqMap[n.name]?.cpuReq || 0;
                const pods = reqMap[n.name]?.podCount || 0;
                const reserved = cap - alloc;
                const available = alloc - req;
                const reqPct = Math.round((req / cap) * 100);
                const availPct = Math.round((available / cap) * 100);
                const resPct = 100 - reqPct - availPct;
                return (
                  <div key={`cpu-${n.name}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 font-mono truncate max-w-[180px]">{n.name.split('.')[0]}</span>
                      <span className="text-white font-mono">{req.toFixed(1)} / {cap} vCPU <span className={`${reqPct >= 80 ? 'text-accent-red' : reqPct >= 50 ? 'text-accent-orange' : 'text-accent-cyan'}`}>({reqPct}%)</span></span>
                    </div>
                    <div className="h-5 bg-navy-900 rounded-full overflow-hidden flex">
                      <div className={`h-full ${reqPct >= 80 ? 'bg-accent-red' : reqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`} style={{ width: `${reqPct}%` }} />
                      <div className="h-full bg-accent-green/30" style={{ width: `${availPct}%` }} />
                      <div className="h-full bg-gray-700" style={{ width: `${resPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-0.5 text-gray-500">
                      <span>{pods} pods, req {req.toFixed(2)} vCPU</span>
                      <span>avail {available.toFixed(2)} | rsv {reserved.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && <p className="text-gray-500 text-sm">No nodes</p>}
            </div>
          </div>

          {/* Memory Usage / 메모리 사용률 */}
          <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
            <h3 className="text-sm font-semibold text-white mb-1">Memory Usage per Node</h3>
            <p className="text-xs text-gray-500 mb-3">Pod Requested / Allocatable / Capacity</p>
            <div className="flex items-center gap-4 text-[10px] mb-4">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-purple inline-block" /> Requested</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-accent-green/30 inline-block" /> Available</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-700 inline-block" /> System Reserved</span>
            </div>
            <div className="space-y-4">
              {nodes.map((n: any) => {
                const capMiB = parseMiB(n.capacity_memory) || 1;
                const allocMiB = parseMiB(n.allocatable_memory) || 0;
                const reqMiB = reqMap[n.name]?.memReqMiB || 0;
                const pods = reqMap[n.name]?.podCount || 0;
                const reservedMiB = capMiB - allocMiB;
                const availMiB = allocMiB - reqMiB;
                const reqPct = Math.round((reqMiB / capMiB) * 100);
                const availPct = Math.round((availMiB / capMiB) * 100);
                const resPct = 100 - reqPct - availPct;
                return (
                  <div key={`mem-${n.name}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 font-mono truncate max-w-[180px]">{n.name.split('.')[0]}</span>
                      <span className="text-white font-mono">{formatK8sMemory(`${reqMiB}Mi`)} / {formatK8sMemory(`${capMiB}Mi`)} <span className={`${reqPct >= 80 ? 'text-accent-red' : reqPct >= 50 ? 'text-accent-orange' : 'text-accent-purple'}`}>({reqPct}%)</span></span>
                    </div>
                    <div className="h-5 bg-navy-900 rounded-full overflow-hidden flex">
                      <div className={`h-full ${reqPct >= 80 ? 'bg-accent-red' : reqPct >= 50 ? 'bg-accent-orange' : 'bg-accent-purple'}`} style={{ width: `${reqPct}%` }} />
                      <div className="h-full bg-accent-green/30" style={{ width: `${availPct}%` }} />
                      <div className="h-full bg-gray-700" style={{ width: `${resPct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] mt-0.5 text-gray-500">
                      <span>{pods} pods, req {formatK8sMemory(`${reqMiB}Mi`)}</span>
                      <span>avail {formatK8sMemory(`${availMiB}Mi`)} | rsv {formatK8sMemory(`${reservedMiB}Mi`)}</span>
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && <p className="text-gray-500 text-sm">No nodes</p>}
            </div>
          </div>
        </div>

        {/* Capacity Charts / 용량 차트 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChartCard title="CPU Capacity per Node (vCPU)" data={cpuBarData} color="#00d4ff" />
          <BarChartCard title="Memory Capacity per Node (GiB)" data={memBarData} color="#a855f7" />
        </div>

        {/* Table */}
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            {
              key: 'status',
              label: 'Status',
              render: (value: string) => <StatusBadge status={value ?? 'Unknown'} />,
            },
            { key: 'capacity_cpu', label: 'CPU Capacity', render: (v: any) => `${parseCpu(v)} vCPU` },
            { key: 'capacity_memory', label: 'Memory Capacity', render: (v: any) => formatK8sMemory(v) },
            { key: 'allocatable_cpu', label: 'Allocatable CPU', render: (v: any) => `${parseCpu(v).toFixed(2)} vCPU` },
            { key: 'allocatable_memory', label: 'Allocatable Memory', render: (v: any) => formatK8sMemory(v) },
            { key: 'creation_timestamp', label: 'Created' },
          ]}
          data={nodes}
        />
      </main>
    </div>
  );
}
