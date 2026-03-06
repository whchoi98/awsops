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

  const memBarData = nodes.map((n: any) => ({
    name: n.name,
    value: parseInt(String(n.capacity_memory)) || 0,
  }));

  // Sum totals
  const totalCpu = nodes.reduce((sum: number, n: any) => sum + (Number(n.capacity_cpu) || 0), 0);
  const totalMem = nodes.reduce((sum: number, n: any) => {
    const mem = String(n.capacity_memory || '');
    return sum + (parseInt(mem) || 0);
  }, 0);
  const memLabel = totalMem > 1024 ? `${(totalMem / 1024).toFixed(1)} Gi` : `${totalMem} Mi`;

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

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChartCard title="CPU Capacity per Node" data={cpuBarData} color="#00d4ff" />
          <BarChartCard title="Memory Capacity per Node" data={memBarData} color="#a855f7" />
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
            { key: 'capacity_memory', label: 'Memory Capacity' },
            { key: 'allocatable_cpu', label: 'Allocatable CPU' },
            { key: 'allocatable_memory', label: 'Allocatable Memory' },
            { key: 'creation_timestamp', label: 'Created' },
          ]}
          data={nodes}
        />
      </main>
    </div>
  );
}
