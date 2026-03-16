'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { Package, X, Tag } from 'lucide-react';
import { queries as ecrQ } from '@/lib/queries/ecr';
import { useAccountContext } from '@/contexts/AccountContext';

export default function ECRPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: currentAccountId, queries: { summary: ecrQ.summary, list: ecrQ.list } }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (repoName: string) => {
    setDetailLoading(true);
    try {
      const sql = ecrQ.detail.replace('{repo_name}', repoName);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) setSelected(result.detail.rows[0]);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const summary = getFirst('summary') as any;
  const list = get('list');

  const parseTags = (tags: any) => { if (!tags) return {}; if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; } return typeof tags === 'object' ? tags : {}; };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="ECR" subtitle="Elastic Container Registry" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatsCard label="Repositories" value={Number(summary?.total_repos) || 0} icon={Package} color="cyan" />
        <StatsCard label="Scan on Push" value={Number(summary?.scan_enabled) || 0} icon={Package} color="green"
          change="Image scanning enabled" />
        <StatsCard label="Immutable Tags" value={Number(summary?.immutable_tags) || 0} icon={Package} color="purple"
          change="Tag immutability" />
      </div>

      <DataTable columns={[
        { key: 'repository_name', label: 'Repository' },
        { key: 'repository_uri', label: 'URI' },
        { key: 'image_tag_mutability', label: 'Tag Mutability' },
        { key: 'scan_on_push', label: 'Scan', render: (v: string) => v === 'true' ? <span className="text-accent-green">Yes</span> : <span className="text-gray-500">No</span> },
        { key: 'encryption_type', label: 'Encryption' },
        { key: 'created_at', label: 'Created', render: (v: string) => v ? new Date(v).toLocaleDateString() : '--' },
      ]} data={loading && !list.length ? undefined : list}
         onRowClick={(row) => fetchDetail(row.repository_name)} />

      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white font-mono">{selected?.repository_name || 'Loading...'}</h2><p className="text-sm text-gray-400">ECR Repository</p></div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            {detailLoading ? <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div> : selected ? (
              <div className="p-6 space-y-6">
                <Section title="Repository" icon={Package}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="Name" value={selected.repository_name} />
                  <Row label="URI" value={selected.repository_uri} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Registry ID" value={selected.registry_id} />
                  <Row label="Tag Mutability" value={selected.image_tag_mutability} />
                  <Row label="Created" value={selected.created_at ? new Date(selected.created_at).toLocaleString() : '--'} />
                  <Row label="Region" value={selected.region} />
                </Section>
                {selected.tags && <Section title="Tags" icon={Tag}>
                  {Object.entries(parseTags(selected.tags)).map(([k, v]) => <div key={k} className="flex gap-2 text-sm"><span className="text-accent-purple font-mono text-xs min-w-[120px]">{k}</span><span className="text-gray-300">{String(v)}</span></div>)}
                </Section>}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (<div className="bg-navy-900 rounded-lg border border-navy-600 p-4"><div className="flex items-center gap-2 mb-3"><Icon size={14} className="text-accent-cyan" /><h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">{title}</h3></div><div className="space-y-1.5">{children}</div></div>);
}
function Row({ label, value }: { label: string; value: any }) {
  return (<div className="flex items-start gap-3 text-sm"><span className="text-gray-500 min-w-[130px] shrink-0">{label}</span><span className="text-gray-200 font-mono text-xs break-all">{value ?? '--'}</span></div>);
}
