'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Database, X, Shield, Settings, Tag } from 'lucide-react';
import { queries as s3Q } from '@/lib/queries/s3';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function S3Page() {
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
            summary: s3Q.summary,
            list: s3Q.list,
            publicBuckets: s3Q.publicBuckets,
          },
        }),
      });
      const result = await res.json();
      setData(result);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const sql = s3Q.detail.replace('{name}', name);
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
  const list = get('list');

  const totalBuckets = Number(summary?.total_buckets) || 0;
  const publicBuckets = Number(summary?.public_buckets) || 0;
  const versioningEnabled = Number(summary?.versioning_enabled) || 0;
  const loggingCount = list.filter((r: Record<string, unknown>) => r.logging_target).length;

  const regionMap: Record<string, number> = {};
  list.forEach((r: Record<string, unknown>) => {
    const region = String(r.region || 'unknown');
    regionMap[region] = (regionMap[region] || 0) + 1;
  });
  const regionData = Object.entries(regionMap).map(([name, value]) => ({ name, value }));

  const versioningData = [
    { name: 'Enabled', value: versioningEnabled },
    { name: 'Disabled', value: totalBuckets - versioningEnabled },
  ].filter(d => d.value > 0);

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="S3 Buckets" subtitle="Simple Storage Service" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Buckets" value={totalBuckets} icon={Database} color="cyan" />
        <StatsCard label="Public Buckets" value={publicBuckets} icon={Database} color="red"
          change={publicBuckets > 0 ? 'Requires attention!' : undefined} />
        <StatsCard label="Versioning Enabled" value={versioningEnabled} icon={Database} color="green" />
        <StatsCard label="Logging Enabled" value={loggingCount} icon={Database} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Buckets by Region" data={regionData} />
        <BarChartCard title="Versioning Status" data={versioningData} color="#00ff88" />
      </div>

      {loading && !list.length && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Bucket Name' },
          { key: 'region', label: 'Region' },
          {
            key: 'versioning_enabled',
            label: 'Versioning',
            render: (v: boolean) => <StatusBadge status={v ? 'active' : 'stopped'} />,
          },
          {
            key: 'encryption_enabled',
            label: 'Encryption',
            render: (v: boolean) => <StatusBadge status={v ? 'active' : 'stopped'} />,
          },
          {
            key: 'logging_target',
            label: 'Logging',
            render: (v: string) => v ? <StatusBadge status="active" /> : <span className="text-gray-600">--</span>,
          },
          {
            key: 'bucket_policy_is_public',
            label: 'Public',
            render: (v: boolean) =>
              v ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-red/10 text-accent-red">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
                  PUBLIC
                </span>
              ) : (
                <span className="text-gray-500 text-xs">Private</span>
              ),
          },
        ]}
        data={loading && !list.length ? undefined : list}
        onRowClick={(row) => fetchDetail(row.name)}
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
                  {selected?.name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400">{selected?.region}</p>
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
                <Section title="Bucket Info" icon={Database}>
                  <Row label="Name" value={selected.name} />
                  <Row label="Region" value={selected.region} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Creation Date" value={selected.creation_date ? new Date(selected.creation_date).toLocaleString() : '--'} />
                </Section>

                <Section title="Security" icon={Shield}>
                  <Row label="Public Policy" value={selected.bucket_policy_is_public ? 'YES - PUBLIC' : 'No'} />
                  <Row label="Block Public ACLs" value={selected.block_public_acls ? 'Yes' : 'No'} />
                  <Row label="Block Public Policy" value={selected.block_public_policy ? 'Yes' : 'No'} />
                  <Row label="Ignore Public ACLs" value={selected.ignore_public_acls ? 'Yes' : 'No'} />
                  <Row label="Restrict Public Buckets" value={selected.restrict_public_buckets ? 'Yes' : 'No'} />
                </Section>

                <Section title="Configuration" icon={Settings}>
                  <Row label="Versioning" value={selected.versioning_enabled ? 'Enabled' : 'Disabled'} />
                  <Row label="Encryption" value={selected.server_side_encryption_configuration ? 'Configured' : 'Not configured'} />
                  <Row label="Logging" value={selected.logging ? JSON.stringify(selected.logging) : 'Disabled'} />
                  <Row label="Lifecycle Rules" value={selected.lifecycle_rules ? `${Array.isArray(selected.lifecycle_rules) ? selected.lifecycle_rules.length : 'Configured'} rule(s)` : 'None'} />
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
