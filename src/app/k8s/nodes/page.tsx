'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Server, CheckCircle, Cpu, HardDrive } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';

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

export default function K8sNodesPage() {
  const [data, setData] = useState<DashboardData>({});
  const [_loading, setLoading] = useState(true);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            nodeSummary: k8sQ.nodeSummary,
            nodeList: NODE_DETAIL_QUERY,
          },
        }),
      });
      setData(await res.json());
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('nodeSummary') as any;
  const nodes = get('nodeList');

  // CPU & Memory capacity bar data
  const cpuBarData = nodes.map((n: any) => ({
    name: n.name,
    value: Number(n.capacity_cpu) || 0,
  }));

  // Parse K8s memory to MiB for charts / 차트용 MiB 변환
  const parseMiB = (mem: any): number => {
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
  };

  const memBarData = nodes.map((n: any) => ({
    name: n.name,
    value: Math.round(parseMiB(n.capacity_memory) / 1024), // GiB for chart
  }));

  // Sum totals
  const totalCpu = nodes.reduce((sum: number, n: any) => sum + (Number(n.capacity_cpu) || 0), 0);
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

        {/* Allocation % Charts / 할당률 차트 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">CPU Allocation per Node</h3>
            <div className="space-y-3">
              {nodes.map((n: any) => {
                const cap = Number(n.capacity_cpu) || 1;
                const alloc = Number(n.allocatable_cpu) || 0;
                const used = cap - alloc;
                const pct = Math.round((used / cap) * 100);
                return (
                  <div key={`cpu-${n.name}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 font-mono truncate max-w-[200px]">{n.name}</span>
                      <span className="text-white font-mono">{used}/{cap} vCPU ({pct}%)</span>
                    </div>
                    <div className="h-4 bg-navy-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-accent-red' : pct >= 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {nodes.length === 0 && <p className="text-gray-500 text-sm">No nodes</p>}
            </div>
          </div>

          <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Memory Allocation per Node</h3>
            <div className="space-y-3">
              {nodes.map((n: any) => {
                const capMiB = parseMiB(n.capacity_memory) || 1;
                const allocMiB = parseMiB(n.allocatable_memory) || 0;
                const usedMiB = capMiB - allocMiB;
                const pct = Math.round((usedMiB / capMiB) * 100);
                return (
                  <div key={`mem-${n.name}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-400 font-mono truncate max-w-[200px]">{n.name}</span>
                      <span className="text-white font-mono">{formatK8sMemory(`${usedMiB}Mi`)}/{formatK8sMemory(`${capMiB}Mi`)} ({pct}%)</span>
                    </div>
                    <div className="h-4 bg-navy-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-accent-red' : pct >= 50 ? 'bg-accent-orange' : 'bg-accent-purple'}`}
                        style={{ width: `${pct}%` }}
                      />
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
            { key: 'capacity_cpu', label: 'CPU Capacity' },
            { key: 'capacity_memory', label: 'Memory Capacity', render: (v: any) => formatK8sMemory(v) },
            { key: 'allocatable_cpu', label: 'Allocatable CPU' },
            { key: 'allocatable_memory', label: 'Allocatable Memory', render: (v: any) => formatK8sMemory(v) },
            { key: 'creation_timestamp', label: 'Created' },
          ]}
          data={nodes}
        />
      </main>
    </div>
  );
}
