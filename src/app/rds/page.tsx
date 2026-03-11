'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Database, X, HardDrive, Network, Shield, Tag } from 'lucide-react';
import { queries as rdsQ } from '@/lib/queries/rds';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function RDSPage() {
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
          queries: {
            summary: rdsQ.summary,
            engineDistribution: rdsQ.engineDistribution,
            list: rdsQ.list,
          },
        }),
      });
      const result = await res.json();
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const sql = rdsQ.detail.replace('{id}', id);
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
  const engineData = get('engineDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));
  const list = get('list');

  const totalInstances = Number(summary?.total_instances) || 0;
  const multiAz = Number(summary?.multi_az_instances) || 0;
  const uniqueEngines = engineData.length;

  const storageData = list
    .filter((r: Record<string, unknown>) => r.allocated_storage)
    .map((r: Record<string, unknown>) => ({
      name: String(r.db_instance_identifier || '').slice(0, 20),
      value: Number(r.allocated_storage) || 0,
    }))
    .slice(0, 10);

  const totalStorage = list.reduce(
    (sum: number, r: Record<string, unknown>) => sum + (Number(r.allocated_storage) || 0),
    0
  );

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="RDS Instances" subtitle="Relational Database Service" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Instances" value={totalInstances} icon={Database} color="cyan" />
        <StatsCard label="Storage (GB)" value={totalStorage} icon={Database} color="purple" />
        <StatsCard label="Multi-AZ" value={multiAz} icon={Database} color="green" />
        <StatsCard label="Engines" value={uniqueEngines} icon={Database} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Engine Distribution" data={engineData} />
        <BarChartCard title="Storage by Instance (GB)" data={storageData} color="#a855f7" />
      </div>

      {loading && !list.length && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'db_instance_identifier', label: 'Identifier' },
          { key: 'engine', label: 'Engine' },
          { key: 'engine_version', label: 'Version' },
          { key: 'db_instance_class', label: 'Class' },
          {
            key: 'status',
            label: 'Status',
            render: (value: string) => <StatusBadge status={value || 'unknown'} />,
          },
          { key: 'allocated_storage', label: 'Storage (GB)' },
          {
            key: 'multi_az',
            label: 'Multi-AZ',
            render: (v: boolean) => (
              <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-gray-500'}`}>
                {v ? 'Yes' : 'No'}
              </span>
            ),
          },
          { key: 'region', label: 'Region' },
        ]}
        data={loading && !list.length ? undefined : list}
        onRowClick={(row) => fetchDetail(row.db_instance_identifier)}
      />

      {/* Detail Panel */}
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
                  {selected?.db_instance_identifier || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400">{selected?.engine} {selected?.engine_version}</p>
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
                  <span className="text-sm text-gray-400 font-mono">{selected.class}</span>
                </div>

                <Section title="Instance" icon={Database}>
                  <Row label="Identifier" value={selected.db_instance_identifier} />
                  <Row label="Engine" value={selected.engine} />
                  <Row label="Version" value={selected.engine_version} />
                  <Row label="Class" value={selected.class} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Multi-AZ" value={selected.multi_az ? 'Yes' : 'No'} />
                  <Row label="Publicly Accessible" value={selected.publicly_accessible ? 'Yes' : 'No'} />
                  <Row label="ARN" value={selected.arn} />
                </Section>

                <Section title="Storage" icon={HardDrive}>
                  <Row label="Allocated Storage" value={`${selected.allocated_storage} GB`} />
                  <Row label="Storage Type" value={selected.storage_type} />
                  <Row label="Encrypted" value={selected.storage_encrypted ? 'Yes' : 'No'} />
                  <Row label="KMS Key ID" value={selected.kms_key_id} />
                </Section>

                <Section title="Network" icon={Network}>
                  <Row label="VPC ID" value={selected.vpc_id} />
                  <Row label="Subnet Group" value={selected.db_subnet_group_name} />
                  <Row label="Availability Zone" value={selected.availability_zone} />
                  <Row label="Endpoint" value={selected.endpoint_address} />
                  <Row label="Port" value={selected.endpoint_port} />
                </Section>

                <Section title="Backup" icon={Shield}>
                  <Row label="Retention Period" value={selected.backup_retention_period ? `${selected.backup_retention_period} days` : '--'} />
                  <Row label="Backup Window" value={selected.preferred_backup_window} />
                  <Row label="Latest Restorable" value={selected.latest_restorable_time ? new Date(selected.latest_restorable_time).toLocaleString() : '--'} />
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
