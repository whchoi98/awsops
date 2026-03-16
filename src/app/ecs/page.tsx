'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Container, X, Settings, Tag } from 'lucide-react';
import { queries as ecsQ } from '@/lib/queries/ecs';
import { useAccountContext } from '@/contexts/AccountContext';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function ECSPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            summary: ecsQ.summary,
            clusterList: ecsQ.clusterList,
            serviceList: ecsQ.serviceList,
          },
        }),
      });
      const result = await res.json();
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const sql = ecsQ.clusterDetail.replace('{name}', name);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) {
        setSelected(result.detail.rows[0]);
      }
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as Record<string, unknown>;
  const clusters = get('clusterList');
  const services = get('serviceList');

  const totalClusters = Number(summary?.total_clusters) || 0;
  const totalServices = Number(summary?.total_services) || 0;
  const totalTasks = Number(summary?.total_tasks) || 0;
  const totalContainerInstances = Number(summary?.total_container_instances) || 0;

  const tasksPerCluster = clusters.map((c: Record<string, unknown>) => ({
    name: String(c.cluster_name || 'unknown'),
    value: Number(c.running_tasks_count) || 0,
  })).filter((d: { value: number }) => d.value > 0);

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  const parseJson = (val: any) => {
    if (!val) return null;
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return null; }
    return typeof val === 'object' ? val : null;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="ECS" subtitle="Elastic Container Service" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Clusters" value={totalClusters} icon={Container} color="cyan" />
        <StatsCard label="Services" value={totalServices} icon={Container} color="purple" />
        <StatsCard label="Tasks" value={totalTasks} icon={Container} color="green" />
        <StatsCard label="Container Instances" value={totalContainerInstances} icon={Container} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Running Tasks per Cluster" data={tasksPerCluster} />
      </div>

      <div>
        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Clusters</h3>
        {loading && !clusters.length && (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
          </div>
        )}
        <DataTable
          columns={[
            { key: 'cluster_name', label: 'Cluster Name' },
            {
              key: 'status',
              label: 'Status',
              render: (value: string) => <StatusBadge status={value || 'unknown'} />,
            },
            { key: 'running_tasks_count', label: 'Running Tasks' },
            { key: 'pending_tasks_count', label: 'Pending Tasks' },
            { key: 'active_services_count', label: 'Active Services' },
            { key: 'registered_container_instances_count', label: 'Container Instances' },
            { key: 'region', label: 'Region' },
          ]}
          data={loading && !clusters.length ? undefined : clusters}
          onRowClick={(row) => fetchDetail(row.cluster_name)}
        />
      </div>

      <div>
        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Services</h3>
        <DataTable
          columns={[
            { key: 'service_name', label: 'Service Name' },
            {
              key: 'status',
              label: 'Status',
              render: (value: string) => <StatusBadge status={value || 'unknown'} />,
            },
            { key: 'desired_count', label: 'Desired' },
            { key: 'running_count', label: 'Running' },
            { key: 'pending_count', label: 'Pending' },
            { key: 'launch_type', label: 'Launch Type' },
            { key: 'scheduling_strategy', label: 'Strategy' },
          ]}
          data={loading && !services.length ? undefined : services}
        />
      </div>

      {/* Cluster Detail Panel */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">
                  {selected?.cluster_name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400">ECS Cluster</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 skeleton rounded" />)}
              </div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                <div className="flex items-center gap-3">
                  <StatusBadge status={selected.status || 'unknown'} />
                </div>

                <Section title="Cluster" icon={Container}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="Name" value={selected.cluster_name} />
                  <Row label="ARN" value={selected.cluster_arn} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Running Tasks" value={selected.running_tasks_count} />
                  <Row label="Pending Tasks" value={selected.pending_tasks_count} />
                  <Row label="Active Services" value={selected.active_services_count} />
                  <Row label="Container Instances" value={selected.registered_container_instances_count} />
                  <Row label="Region" value={selected.region} />
                </Section>

                <Section title="Settings" icon={Settings}>
                  {(() => {
                    const settings = parseJson(selected.settings);
                    if (settings && Array.isArray(settings)) {
                      return settings.map((s: any, i: number) => (
                        <Row key={i} label={s.Name || s.name || `Setting ${i}`} value={s.Value || s.value} />
                      ));
                    }
                    return <p className="text-gray-500 text-sm">No settings</p>;
                  })()}
                </Section>

                <Section title="Tags" icon={Tag}>
                  {Object.keys(parseTags(selected.tags)).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(parseTags(selected.tags)).map(([k, v]) => (
                        <div key={k} className="flex gap-2 text-sm">
                          <span className="text-accent-purple font-mono text-xs min-w-[120px]">{k}</span>
                          <span className="text-gray-300">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No tags</p>
                  )}
                </Section>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-accent-cyan" />
        <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">{title}</h3>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-gray-500 min-w-[130px] shrink-0">{label}</span>
      <span className="text-gray-200 font-mono text-xs break-all">{value ?? '--'}</span>
    </div>
  );
}
