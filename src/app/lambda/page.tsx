'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Zap, X, Settings, Network, Tag } from 'lucide-react';
import { queries as lambdaQ } from '@/lib/queries/lambda';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

const DEPRECATED_RUNTIMES = [
  'python2.7', 'python3.6', 'python3.7',
  'nodejs10.x', 'nodejs12.x', 'nodejs14.x',
  'dotnetcore2.1', 'dotnetcore3.1',
  'ruby2.5', 'ruby2.7',
  'java8', 'go1.x',
];

export default function LambdaPage() {
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
            summary: lambdaQ.summary,
            runtimeDistribution: lambdaQ.runtimeDistribution,
            list: lambdaQ.list,
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
      const sql = lambdaQ.detail.replace('{name}', name);
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
  const runtimeData = get('runtimeDistribution') as { name: string; value: number }[];
  const list = get('list');

  const totalFunctions = Number(summary?.total_functions) || 0;
  const uniqueRuntimes = Number(summary?.unique_runtimes) || 0;
  const longTimeout = Number(summary?.long_timeout_functions) || 0;

  const avgMemory = list.length > 0
    ? Math.round(list.reduce((sum: number, r: Record<string, unknown>) => sum + (Number(r.memory_size) || 0), 0) / list.length)
    : 0;

  const memoryMap: Record<string, number> = {};
  list.forEach((r: Record<string, unknown>) => {
    const mem = `${r.memory_size} MB`;
    memoryMap[mem] = (memoryMap[mem] || 0) + 1;
  });
  const memoryData = Object.entries(memoryMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => parseInt(a.name) - parseInt(b.name));

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

  const formatBytes = (v: number) => {
    if (!v) return '--';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Lambda Functions" subtitle="Serverless Compute" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Functions" value={totalFunctions} icon={Zap} color="cyan" />
        <StatsCard label="Runtimes" value={uniqueRuntimes} icon={Zap} color="purple" />
        <StatsCard label="Avg Memory (MB)" value={avgMemory} icon={Zap} color="green" />
        <StatsCard label="Long Timeout (>5m)" value={longTimeout} icon={Zap} color="orange"
          change={longTimeout > 0 ? 'Functions with timeout > 300s' : undefined} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Runtime Distribution" data={runtimeData.slice(0, 8)} />
        <BarChartCard title="Memory Allocation" data={memoryData.slice(0, 10)} color="#a855f7" />
      </div>

      {loading && !list.length && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Function Name' },
          {
            key: 'runtime',
            label: 'Runtime',
            render: (v: string) => {
              const deprecated = DEPRECATED_RUNTIMES.includes(v);
              return (
                <span className={deprecated ? 'text-accent-orange font-medium' : ''}>
                  {v || 'custom'}
                  {deprecated && (
                    <span className="ml-1 text-[10px] bg-accent-orange/10 text-accent-orange px-1.5 py-0.5 rounded-full">
                      deprecated
                    </span>
                  )}
                </span>
              );
            },
          },
          { key: 'memory_size', label: 'Memory (MB)' },
          { key: 'timeout', label: 'Timeout (s)' },
          {
            key: 'code_size',
            label: 'Code Size',
            render: (v: number) => formatBytes(v),
          },
          {
            key: 'last_modified',
            label: 'Last Modified',
            render: (v: string) => v ? new Date(v).toLocaleDateString() : '--',
          },
          { key: 'region', label: 'Region' },
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
                <p className="text-sm text-gray-400">{selected?.runtime || 'custom'}</p>
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
                <Section title="Function" icon={Zap}>
                  <Row label="Name" value={selected.name} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Runtime" value={selected.runtime || 'custom'} />
                  <Row label="Handler" value={selected.handler} />
                  <Row label="Architectures" value={Array.isArray(selected.architectures) ? selected.architectures.join(', ') : selected.architectures} />
                  <Row label="Package Type" value={selected.package_type} />
                  <Row label="Code Size" value={formatBytes(Number(selected.code_size))} />
                  <Row label="Last Modified" value={selected.last_modified ? new Date(selected.last_modified).toLocaleString() : '--'} />
                </Section>

                <Section title="Configuration" icon={Settings}>
                  <Row label="Memory" value={`${selected.memory_size} MB`} />
                  <Row label="Timeout" value={`${selected.timeout} seconds`} />
                </Section>

                <Section title="Network" icon={Network}>
                  {(() => {
                    const vpc = parseJson(selected.vpc_config);
                    if (vpc && vpc.VpcId) {
                      return (
                        <>
                          <Row label="VPC ID" value={vpc.VpcId} />
                          <Row label="Subnets" value={vpc.SubnetIds?.join(', ')} />
                          <Row label="Security Groups" value={vpc.SecurityGroupIds?.join(', ')} />
                        </>
                      );
                    }
                    return <p className="text-gray-500 text-sm">Not in VPC</p>;
                  })()}
                </Section>

                <Section title="Environment" icon={Settings}>
                  {(() => {
                    const env = parseJson(selected.environment_variables);
                    if (env && typeof env === 'object') {
                      const keys = Object.keys(env);
                      return (
                        <>
                          <Row label="Variable Count" value={keys.length} />
                          <div className="mt-2 space-y-1">
                            {keys.map(k => (
                              <div key={k} className="flex gap-2 text-xs font-mono">
                                <span className="text-accent-purple min-w-[120px]">{k}</span>
                                <span className="text-gray-500">[hidden]</span>
                              </div>
                            ))}
                          </div>
                        </>
                      );
                    }
                    return <p className="text-gray-500 text-sm">No environment variables</p>;
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
