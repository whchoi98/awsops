'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Table, X, Database, Settings, Shield, Tag } from 'lucide-react';
import { queries as dynamoQ } from '@/lib/queries/dynamodb';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default function DynamoDBPage() {
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
            summary: dynamoQ.summary,
            tableList: dynamoQ.tableList,
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

  const fetchDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const sql = dynamoQ.detail.replace('{name}', name);
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
  const tableList = get('tableList');

  const totalTables = Number(summary?.total_tables) || 0;
  const activeTables = Number(summary?.active_tables) || 0;

  const totalItems = tableList.reduce(
    (sum: number, r: Record<string, unknown>) => sum + (Number(r.item_count) || 0), 0
  );
  const totalSize = tableList.reduce(
    (sum: number, r: Record<string, unknown>) => sum + (Number(r.table_size_bytes) || 0), 0
  );

  const statusMap: Record<string, number> = {};
  tableList.forEach((t: Record<string, unknown>) => {
    const s = String(t.table_status || 'UNKNOWN');
    statusMap[s] = (statusMap[s] || 0) + 1;
  });
  const statusPie = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

  const itemsBar = tableList
    .filter((t: Record<string, unknown>) => Number(t.item_count) > 0)
    .map((t: Record<string, unknown>) => ({
      name: String(t.name || '').slice(0, 20),
      value: Number(t.item_count) || 0,
    }))
    .slice(0, 10);

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
      <Header title="DynamoDB" subtitle="NoSQL Database Service" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Tables" value={totalTables} icon={Table} color="cyan" />
        <StatsCard label="Active" value={activeTables} icon={Table} color="green" />
        <StatsCard label="Total Items" value={totalItems.toLocaleString()} icon={Table} color="purple" />
        <StatsCard label="Total Size" value={formatBytes(totalSize)} icon={Table} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Table Status" data={statusPie} />
        <BarChartCard title="Items per Table" data={itemsBar} color="#a855f7" />
      </div>

      {loading && !tableList.length && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Table Name' },
          {
            key: 'table_status',
            label: 'Status',
            render: (value: string) => <StatusBadge status={value || 'unknown'} />,
          },
          { key: 'item_count', label: 'Items', render: (v: number) => (v || 0).toLocaleString() },
          {
            key: 'table_size_bytes',
            label: 'Size',
            render: (v: number) => formatBytes(v || 0),
          },
          {
            key: 'billing_mode',
            label: 'Billing',
            render: (v: string) => (
              <span className="text-xs font-mono">
                {v === 'PAY_PER_REQUEST' ? 'On-Demand' : v || 'Provisioned'}
              </span>
            ),
          },
          { key: 'region', label: 'Region' },
        ]}
        data={loading && !tableList.length ? undefined : tableList}
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
                <p className="text-sm text-gray-400">DynamoDB Table</p>
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
                  <StatusBadge status={selected.table_status || 'unknown'} />
                </div>

                <Section title="Table" icon={Database}>
                  <Row label="Name" value={selected.name} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Status" value={selected.table_status} />
                  <Row label="Items" value={Number(selected.item_count || 0).toLocaleString()} />
                  <Row label="Size" value={formatBytes(Number(selected.table_size_bytes) || 0)} />
                  <Row label="Billing Mode" value={selected.billing_mode === 'PAY_PER_REQUEST' ? 'On-Demand' : selected.billing_mode || 'Provisioned'} />
                  <Row label="Created" value={selected.creation_date_time ? new Date(selected.creation_date_time).toLocaleString() : '--'} />
                  <Row label="Region" value={selected.region} />
                </Section>

                <Section title="Keys" icon={Table}>
                  {(() => {
                    const keySchema = parseJson(selected.key_schema);
                    if (keySchema && Array.isArray(keySchema)) {
                      return keySchema.map((k: any, i: number) => (
                        <Row key={i} label={k.KeyType || k.key_type || 'Key'} value={k.AttributeName || k.attribute_name} />
                      ));
                    }
                    return <p className="text-gray-500 text-sm">No key schema</p>;
                  })()}
                </Section>

                <Section title="Throughput" icon={Settings}>
                  <Row label="Read Capacity" value={selected.read_capacity} />
                  <Row label="Write Capacity" value={selected.write_capacity} />
                </Section>

                <Section title="Settings" icon={Shield}>
                  {(() => {
                    const pitr = parseJson(selected.point_in_time_recovery_description);
                    const sse = parseJson(selected.sse_description);
                    return (
                      <>
                        <Row label="Point-in-Time Recovery" value={pitr?.PointInTimeRecoveryStatus || pitr?.point_in_time_recovery_status || 'Not configured'} />
                        <Row label="Encryption" value={sse?.Status || sse?.status || 'Not configured'} />
                        {sse?.SSEType && <Row label="Encryption Type" value={sse.SSEType} />}
                      </>
                    );
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
