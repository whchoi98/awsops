'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Box, Rocket, Network, Server, AlertTriangle } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';

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

export default function K8sOverviewPage() {
  const [data, setData] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            nodeSummary: k8sQ.nodeSummary,
            podSummary: k8sQ.podSummary,
            deploymentSummary: k8sQ.deploymentSummary,
            serviceList: k8sQ.serviceList,
            warningEvents: k8sQ.warningEvents,
            namespaceSummary: k8sQ.namespaceSummary,
            nodeList: NODE_LIST_QUERY,
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

  const nodeSummary = getFirst('nodeSummary') as any;
  const podSummary = getFirst('podSummary') as any;
  const deploySummary = getFirst('deploymentSummary') as any;
  const services = get('serviceList');
  const events = get('warningEvents');
  const namespaces = get('namespaceSummary');
  const nodes = get('nodeList');

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

  return (
    <div className="min-h-screen">
      <Header
        title="Kubernetes Overview"
        subtitle="Cluster health and resource summary"
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
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
            {nodes.map((node: any) => (
              <div
                key={node.name}
                className="bg-navy-800 border border-navy-600 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Server size={16} className="text-accent-cyan" />
                    <span className="text-white font-mono text-sm">{node.name}</span>
                  </div>
                  <StatusBadge status={node.status ?? 'Unknown'} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-gray-500 mb-1">CPU Capacity</p>
                    <p className="text-white font-mono">{node.capacity_cpu ?? '-'} vCPU</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Memory Capacity</p>
                    <p className="text-white font-mono">{node.capacity_memory ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Allocatable CPU</p>
                    <p className="text-white font-mono">{node.allocatable_cpu ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Allocatable Mem</p>
                    <p className="text-white font-mono">{node.allocatable_memory ?? '-'}</p>
                  </div>
                </div>
                {node.pod_cidr && (
                  <p className="text-gray-500 text-xs mt-2">CIDR: <span className="text-gray-400 font-mono">{node.pod_cidr}</span></p>
                )}
              </div>
            ))}
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
