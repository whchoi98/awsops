'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Database, X, Shield, Settings, Tag, Search, Users } from 'lucide-react';
import { queries as s3Q } from '@/lib/queries/s3';
import { useAccountContext } from '@/contexts/AccountContext';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function S3Page() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [publicFilter, setPublicFilter] = useState('');
  const [iamRoles, setIamRoles] = useState<any[]>([]);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: { summary: s3Q.summary, list: s3Q.list, publicBuckets: s3Q.publicBuckets },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (name: string) => {
    setDetailLoading(true);
    setIamRoles([]);
    try {
      const detailSql = s3Q.detail.replace('{name}', name);
      const iamSql = s3Q.s3IamRoles;
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: detailSql, iam: iamSql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) setSelected(result.detail.rows[0]);
      setIamRoles(result.iam?.rows || []);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as any;
  const list = get('list');

  const totalBuckets = Number(summary?.total_buckets) || 0;
  const publicBuckets = Number(summary?.public_buckets) || 0;
  const versioningEnabled = Number(summary?.versioning_enabled) || 0;
  const loggingCount = list.filter((r: any) => r.logging_target).length;

  // Filters / 필터
  const regionList = useMemo(() => {
    const regions = new Set<string>();
    list.forEach((r: any) => { if (r.region) regions.add(String(r.region)); });
    return Array.from(regions).sort();
  }, [list]);

  const filteredList = useMemo(() => {
    let filtered = list;
    if (regionFilter) filtered = filtered.filter((r: any) => String(r.region) === regionFilter);
    if (publicFilter === 'public') filtered = filtered.filter((r: any) => r.bucket_policy_is_public);
    else if (publicFilter === 'private') filtered = filtered.filter((r: any) => !r.bucket_policy_is_public);
    if (searchText) {
      const lower = searchText.toLowerCase();
      filtered = filtered.filter((r: any) => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(lower)));
    }
    return filtered;
  }, [list, regionFilter, publicFilter, searchText]);

  const hasFilters = regionFilter || publicFilter || searchText;

  // Chart data / 차트 데이터
  const regionMap: Record<string, number> = {};
  list.forEach((r: any) => { regionMap[String(r.region || 'unknown')] = (regionMap[String(r.region || 'unknown')] || 0) + 1; });
  const regionData = Object.entries(regionMap).map(([name, value]) => ({ name, value }));

  // TreeMap: region × security status / 트리맵: 리전 × 보안 상태
  const treeMapData = useMemo(() => {
    const data: { name: string; children: { name: string; size: number; color: string }[] }[] = [];
    const byRegion: Record<string, any[]> = {};
    list.forEach((r: any) => {
      const region = String(r.region || 'unknown');
      if (!byRegion[region]) byRegion[region] = [];
      byRegion[region].push(r);
    });
    Object.entries(byRegion).forEach(([region, buckets]) => {
      data.push({
        name: region,
        children: buckets.map((b: any) => ({
          name: String(b.name),
          size: 1,
          color: b.bucket_policy_is_public ? '#ef4444' : b.versioning_enabled ? '#00ff88' : '#00d4ff',
        })),
      });
    });
    return data;
  }, [list]);

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="S3 Buckets" subtitle="Simple Storage Service" onRefresh={() => fetchData(true)} />

      {loading && (
        <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Total Buckets" value={totalBuckets} icon={Database} color="cyan" />
        <StatsCard label="Public Buckets" value={publicBuckets} icon={Database}
          color={publicBuckets > 0 ? 'red' : 'green'} highlight
          change={publicBuckets > 0 ? 'Requires attention!' : '✓ All private'} />
        <StatsCard label="Versioning" value={versioningEnabled} icon={Database} color="green"
          change={`${totalBuckets - versioningEnabled} disabled`} />
        <StatsCard label="Logging" value={loggingCount} icon={Database} color="purple"
          change={`${totalBuckets - loggingCount} without logging`} />
      </div>

      {/* TreeMap: Buckets by Region (visual blocks) / 트리맵: 리전별 버킷 시각화 */}
      <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
        <h3 className="text-sm font-semibold text-white mb-2">Bucket Map by Region</h3>
        <div className="flex items-center gap-4 text-[10px] mb-3">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#ef4444' }} /> Public</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#00ff88' }} /> Versioned</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded" style={{ background: '#00d4ff' }} /> Standard</span>
        </div>
        <div className="space-y-3">
          {treeMapData.map(region => (
            <div key={region.name}>
              <p className="text-xs text-gray-400 font-mono mb-1">{region.name} ({region.children.length})</p>
              <div className="flex flex-wrap gap-1">
                {region.children.map(bucket => (
                  <div key={bucket.name}
                    onClick={() => fetchDetail(bucket.name)}
                    className="cursor-pointer rounded px-2 py-1 text-[9px] font-mono text-white hover:opacity-80 transition-opacity truncate max-w-[200px]"
                    style={{ background: bucket.color + '30', border: `1px solid ${bucket.color}60` }}
                    title={bucket.name}>
                    {bucket.name.length > 25 ? bucket.name.slice(0, 23) + '..' : bucket.name}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Buckets by Region" data={regionData} />
        <BarChartCard title="Security Status" data={[
          { name: 'Private', value: totalBuckets - publicBuckets },
          { name: 'Public', value: publicBuckets },
          { name: 'Versioned', value: versioningEnabled },
          { name: 'Logging', value: loggingCount },
        ].filter(d => d.value > 0)} color="#00d4ff" />
      </div>

      {/* Filters / 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search bucket name..."
            className="bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 w-56 focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none" />
        </div>
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-accent-cyan focus:border-accent-cyan">
          <option value="">All Regions</option>
          {regionList.map(r => <option key={r} value={r}>{r} ({list.filter((b: any) => String(b.region) === r).length})</option>)}
        </select>
        <select value={publicFilter} onChange={(e) => setPublicFilter(e.target.value)}
          className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 text-sm text-gray-200 focus:ring-accent-cyan focus:border-accent-cyan">
          <option value="">All Access</option>
          <option value="public">Public ({publicBuckets})</option>
          <option value="private">Private ({totalBuckets - publicBuckets})</option>
        </select>
        {hasFilters && <button onClick={() => { setSearchText(''); setRegionFilter(''); setPublicFilter(''); }} className="text-xs text-gray-500 hover:text-white">Clear all</button>}
        <span className="text-xs text-gray-500 ml-auto">{filteredList.length} / {list.length} buckets</span>
      </div>

      <DataTable
        columns={[
          { key: 'name', label: 'Bucket Name' },
          { key: 'region', label: 'Region' },
          { key: 'versioning_enabled', label: 'Versioning', render: (v: boolean) => <StatusBadge status={v ? 'active' : 'stopped'} /> },
          { key: 'encryption_enabled', label: 'Encryption', render: (v: boolean) => <StatusBadge status={v ? 'active' : 'stopped'} /> },
          { key: 'logging_target', label: 'Logging', render: (v: string) => v ? <StatusBadge status="active" /> : <span className="text-gray-600">--</span> },
          { key: 'bucket_policy_is_public', label: 'Access', render: (v: boolean) =>
            v ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent-red/10 text-accent-red"><span className="w-1.5 h-1.5 rounded-full bg-accent-red" />PUBLIC</span>
              : <span className="text-gray-500 text-xs">Private</span>
          },
          { key: 'creation_date', label: 'Created', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
        ]}
        data={loading && !filteredList.length ? undefined : filteredList}
        onRowClick={(row) => fetchDetail(row.name)}
      />

      {/* Detail Panel / 상세 패널 */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{selected?.name || 'Loading...'}</h2>
                <p className="text-sm text-gray-400">{selected?.region}</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                <Section title="Bucket Info" icon={Database}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="Name" value={selected.name} />
                  <Row label="Region" value={selected.region} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Created" value={selected.creation_date ? new Date(selected.creation_date).toLocaleString() : '--'} />
                </Section>

                <Section title="Security" icon={Shield}>
                  <Row label="Public Policy" value={selected.bucket_policy_is_public ? 'YES - PUBLIC' : 'No'} />
                  <Row label="Block Public ACLs" value={selected.block_public_acls ? 'Yes' : 'No'} />
                  <Row label="Block Public Policy" value={selected.block_public_policy ? 'Yes' : 'No'} />
                  <Row label="Ignore Public ACLs" value={selected.ignore_public_acls ? 'Yes' : 'No'} />
                  <Row label="Restrict Public" value={selected.restrict_public_buckets ? 'Yes' : 'No'} />
                </Section>

                <Section title="Configuration" icon={Settings}>
                  <Row label="Versioning" value={selected.versioning_enabled ? 'Enabled' : 'Disabled'} />
                  <Row label="Encryption" value={selected.server_side_encryption_configuration ? 'Configured' : 'Not configured'} />
                  <Row label="Lifecycle Rules" value={selected.lifecycle_rules ? `${Array.isArray(selected.lifecycle_rules) ? selected.lifecycle_rules.length : 'Yes'} rule(s)` : 'None'} />
                </Section>

                {/* IAM Roles with S3 Access / S3 접근 가능한 IAM 역할 */}
                <Section title="IAM Roles with S3 Access" icon={Users}>
                  {iamRoles.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {iamRoles.map((r: any, i: number) => (
                        <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono">
                          <span className="text-accent-purple">{r.role_name}</span>
                          <p className="text-gray-500 mt-0.5 truncate text-[9px]">{r.policies?.slice(0, 100) || r.role_arn}</p>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-gray-500 text-sm">No roles with S3 access found</p>}
                </Section>

                {selected.tags && (
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
                    ) : <p className="text-gray-500 text-sm">No tags</p>}
                  </Section>
                )}
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
