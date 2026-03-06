'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Network, Globe, Server, Share2 } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function K8sServicesPage() {
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
            serviceList: k8sQ.serviceList,
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
  const services = get('serviceList');

  const total = services.length;
  const clusterIP = services.filter((s: any) => s.type === 'ClusterIP').length;
  const nodePort = services.filter((s: any) => s.type === 'NodePort').length;
  const loadBalancer = services.filter((s: any) => s.type === 'LoadBalancer').length;

  const typeData = [
    { name: 'ClusterIP', value: clusterIP },
    { name: 'NodePort', value: nodePort },
    { name: 'LoadBalancer', value: loadBalancer },
    { name: 'Other', value: total - clusterIP - nodePort - loadBalancer },
  ].filter((d) => d.value > 0);

  return (
    <div className="min-h-screen">
      <Header
        title="Kubernetes Services"
        subtitle="Service discovery and networking"
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total Services" value={total} icon={Network} color="cyan" />
          <StatsCard label="ClusterIP" value={clusterIP} icon={Server} color="green" />
          <StatsCard label="NodePort" value={nodePort} icon={Share2} color="purple" />
          <StatsCard label="LoadBalancer" value={loadBalancer} icon={Globe} color="orange" />
        </div>

        {/* Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PieChartCard title="Service Type Distribution" data={typeData} />
        </div>

        {/* Table */}
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'namespace', label: 'Namespace' },
            { key: 'type', label: 'Type' },
            { key: 'cluster_ip', label: 'Cluster IP' },
            { key: 'external_ip', label: 'External IP' },
            { key: 'creation_timestamp', label: 'Created' },
          ]}
          data={services}
        />
      </main>
    </div>
  );
}
