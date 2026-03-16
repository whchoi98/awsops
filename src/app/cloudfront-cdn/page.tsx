'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import StatusBadge from '@/components/dashboard/StatusBadge';
import { Globe, X, Tag } from 'lucide-react';
import { queries as cfQ } from '@/lib/queries/cloudfront';
import { useAccountContext } from '@/contexts/AccountContext';

export default function CloudFrontPage() {
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
        body: JSON.stringify({ accountId: currentAccountId, queries: { summary: cfQ.summary, list: cfQ.list } }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (distId: string) => {
    setDetailLoading(true);
    try {
      const sql = cfQ.detail.replace('{dist_id}', distId);
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

  const parseJson = (val: any) => { try { return JSON.parse(val || '[]'); } catch { return []; } };
  const parseTags = (tags: any) => { if (!tags) return {}; if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; } return typeof tags === 'object' ? tags : {}; };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="CloudFront" subtitle="Content Delivery Network" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="Distributions" value={Number(summary?.total_distributions) || 0} icon={Globe} color="cyan" />
        <StatsCard label="Enabled" value={Number(summary?.enabled_count) || 0} icon={Globe} color="green" />
        <StatsCard label="Disabled" value={Number(summary?.disabled_count) || 0} icon={Globe} color="red" />
        <StatsCard label="HTTP Allowed" value={Number(summary?.http_allowed) || 0} icon={Globe}
          color={Number(summary?.http_allowed) > 0 ? 'orange' : 'green'}
          change={Number(summary?.http_allowed) > 0 ? 'Consider HTTPS only' : '✓ All HTTPS'} />
      </div>

      <DataTable columns={[
        { key: 'id', label: 'Distribution ID' },
        { key: 'name', label: 'Name', render: (v: string) => v || <span className="text-gray-600">--</span> },
        { key: 'domain_name', label: 'Domain' },
        { key: 'status', label: 'Status', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
        { key: 'enabled', label: 'Enabled', render: (v: boolean) => v ? <span className="text-accent-green">Yes</span> : <span className="text-accent-red">No</span> },
        { key: 'viewer_protocol', label: 'Protocol' },
      ]} data={loading && !list.length ? undefined : list}
         onRowClick={(row) => fetchDetail(row.id)} />

      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white font-mono">{selected?.id || 'Loading...'}</h2><p className="text-sm text-gray-400">{selected?.domain_name}</p></div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            {detailLoading ? <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div> : selected ? (
              <div className="p-6 space-y-6">
                <Section title="Distribution" icon={Globe}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="ID" value={selected.id} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Domain" value={selected.domain_name} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Enabled" value={selected.enabled ? 'Yes' : 'No'} />
                  <Row label="HTTP Version" value={selected.http_version} />
                  <Row label="IPv6" value={selected.is_ipv6_enabled ? 'Yes' : 'No'} />
                  <Row label="Price Class" value={selected.price_class} />
                  <Row label="WAF ACL" value={selected.web_acl_id || 'None'} />
                </Section>
                <Section title="Origins" icon={Globe}>
                  {parseJson(selected.origins).map((o: any, i: number) => (
                    <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono mb-2">
                      <Row label="ID" value={o.Id || o.id} />
                      <Row label="Domain" value={o.DomainName || o.domain_name} />
                    </div>
                  ))}
                </Section>
                {parseJson(selected.aliases).length > 0 && (
                  <Section title="Aliases (CNAMEs)" icon={Globe}>
                    {parseJson(selected.aliases).map((a: string, i: number) => (
                      <div key={i} className="text-xs font-mono text-accent-cyan pl-2 border-l border-navy-600">{a}</div>
                    ))}
                  </Section>
                )}
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
