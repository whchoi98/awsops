'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { Rocket, CheckCircle, AlertTriangle } from 'lucide-react';
import { queries as k8sQ } from '@/lib/queries/k8s';

interface DashboardData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function K8sDeploymentsPage() {
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
            deploymentSummary: k8sQ.deploymentSummary,
            deploymentList: k8sQ.deploymentList,
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

  const summary = getFirst('deploymentSummary') as any;
  const deployments = get('deploymentList');

  // Replica comparison bar chart
  const replicaData = deployments.slice(0, 20).map((d: any) => ({
    name: d.name,
    desired: Number(d.replicas) || 0,
    available: Number(d.available_replicas) || 0,
  }));

  return (
    <div className="min-h-screen">
      <Header
        title="Kubernetes Deployments"
        subtitle="Deployment health and replica status"
        onRefresh={() => fetchData(true)}
      />

      <main className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard
            label="Total Deployments"
            value={summary.total_deployments ?? '-'}
            icon={Rocket}
            color="cyan"
          />
          <StatsCard
            label="Fully Available"
            value={summary.fully_available ?? '-'}
            icon={CheckCircle}
            color="green"
          />
          <StatsCard
            label="Partially Available"
            value={summary.partially_available ?? '-'}
            icon={AlertTriangle}
            color="orange"
          />
        </div>

        {/* Replica Comparison Chart */}
        {replicaData.length > 0 && (
          <div className="bg-navy-800 border border-navy-600 rounded-lg p-5">
            <h3 className="text-white font-semibold mb-4">Replica Comparison (Desired vs Available)</h3>
            <div className="space-y-2">
              {replicaData.map((d: any) => (
                <div key={d.name} className="flex items-center gap-3 text-sm">
                  <span className="text-gray-400 font-mono w-48 truncate">{d.name}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-4 bg-navy-700 rounded-full overflow-hidden relative">
                      <div
                        className="absolute inset-y-0 left-0 bg-accent-cyan/30 rounded-full"
                        style={{ width: d.desired > 0 ? '100%' : '0%' }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 bg-accent-green rounded-full"
                        style={{ width: d.desired > 0 ? `${(d.available / d.desired) * 100}%` : '0%' }}
                      />
                    </div>
                    <span className="text-gray-400 font-mono text-xs w-16 text-right">
                      {d.available}/{d.desired}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <DataTable
          columns={[
            { key: 'name', label: 'Name' },
            { key: 'namespace', label: 'Namespace' },
            { key: 'replicas', label: 'Desired' },
            { key: 'available_replicas', label: 'Available' },
            { key: 'ready_replicas', label: 'Ready' },
            { key: 'creation_timestamp', label: 'Created' },
          ]}
          data={deployments}
        />
      </main>
    </div>
  );
}
