'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import DataTable from '@/components/table/DataTable';
import { Shield, X, Tag } from 'lucide-react';
import { queries as wafQ } from '@/lib/queries/waf';
import { useAccountContext } from '@/contexts/AccountContext';

export default function WAFPage() {
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
        body: JSON.stringify({ accountId: currentAccountId, queries: { summary: wafQ.summary, list: wafQ.webAclList } }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (id: string, name: string) => {
    setDetailLoading(true);
    try {
      const sql = wafQ.detail.replace('{acl_id}', id).replace('{acl_name}', name);
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
      <Header title="WAF" subtitle="Web Application Firewall" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatsCard label="Web ACLs" value={Number(summary?.total_web_acls) || 0} icon={Shield} color="cyan" />
        <StatsCard label="Rule Groups" value={Number(summary?.total_rule_groups) || 0} icon={Shield} color="purple" />
        <StatsCard label="IP Sets" value={Number(summary?.total_ip_sets) || 0} icon={Shield} color="orange" />
      </div>

      <DataTable columns={[
        { key: 'name', label: 'Name' },
        { key: 'id', label: 'ID' },
        { key: 'scope', label: 'Scope' },
        { key: 'capacity', label: 'Capacity' },
        { key: 'description', label: 'Description' },
        { key: 'region', label: 'Region' },
      ]} data={loading && !list.length ? undefined : list}
         onRowClick={(row) => fetchDetail(row.id, row.name)} />

      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div><h2 className="text-lg font-bold text-white font-mono">{selected?.name || 'Loading...'}</h2><p className="text-sm text-gray-400">Web ACL</p></div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white"><X size={20} /></button>
            </div>
            {detailLoading ? <div className="p-6 space-y-4">{[1,2,3].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div> : selected ? (
              <div className="p-6 space-y-6">
                <Section title="Web ACL" icon={Shield}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="Name" value={selected.name} />
                  <Row label="ID" value={selected.id} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Scope" value={selected.scope} />
                  <Row label="Capacity" value={selected.capacity} />
                  <Row label="Description" value={selected.description || '--'} />
                  <Row label="Default Action" value={(() => { try { const a = JSON.parse(selected.default_action); return Object.keys(a)[0] || '--'; } catch { return selected.default_action; } })()} />
                </Section>
                <Section title="Rules" icon={Shield}>
                  {(() => {
                    const rules = parseJson(selected.rules);
                    return rules.length > 0 ? (
                      <div className="space-y-2">
                        {rules.map((r: any, i: number) => (
                          <div key={i} className="bg-navy-800 rounded p-2 text-xs font-mono">
                            <div className="flex justify-between mb-1">
                              <span className="text-accent-cyan">{r.Name || r.name}</span>
                              <span className="text-gray-500">Priority: {r.Priority ?? r.priority}</span>
                            </div>
                            <div className="text-gray-400">Action: {JSON.stringify(r.Action || r.action || r.OverrideAction || r.override_action || {}).slice(0, 80)}</div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-gray-500 text-sm">No rules</p>;
                  })()}
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
