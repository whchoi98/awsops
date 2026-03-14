'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Search as SearchIcon, X, Shield, Database, Network } from 'lucide-react';
import { queries as osQ } from '@/lib/queries/opensearch';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function OpenSearchPage() {
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: osQ.summary,
            list: osQ.list,
            engineDistribution: osQ.engineDistribution,
            encryptionDistribution: osQ.encryptionDistribution,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (domainName: string) => {
    setDetailLoading(true);
    try {
      const sql = osQ.detail.replace(/{domain_name}/g, domainName);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      setSelected(result.detail?.rows?.[0] || null);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const sum = getFirst('summary') as any;

  const safeJson = (raw: string | null | undefined): any => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const domains = get('list').filter((r: any) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      String(r.domain_name || '').toLowerCase().includes(s) ||
      String(r.engine_version || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Amazon OpenSearch" subtitle="Search & Analytics" onRefresh={() => fetchData(true)} />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Total Domains" value={Number(sum?.total_domains) || 0} icon={Database} color="cyan"
          change={`${Number(sum?.active_domains) || 0} active`} />
        <StatsCard label="Processing" value={Number(sum?.processing_domains) || 0} icon={Database}
          color={Number(sum?.processing_domains) > 0 ? 'orange' : 'green'}
          change={Number(sum?.processing_domains) > 0 ? 'Configuration updating' : 'All stable'} />
        <StatsCard label="Node-to-Node Enc" value={Number(sum?.node_encrypted) || 0} icon={Shield}
          color={Number(sum?.node_encrypted) === Number(sum?.total_domains) ? 'green' : 'orange'}
          change={`of ${Number(sum?.total_domains) || 0} domains`} />
        <StatsCard label="At-Rest Enc" value={Number(sum?.rest_encrypted) || 0} icon={Shield}
          color={Number(sum?.rest_encrypted) === Number(sum?.total_domains) ? 'green' : 'orange'}
          change={`of ${Number(sum?.total_domains) || 0} domains`} />
        <StatsCard label="VPC Domains" value={Number(sum?.vpc_domains) || 0} icon={Network} color="purple"
          change={`of ${Number(sum?.total_domains) || 0} domains`} />
        <StatsCard label="Public Domains" value={Math.max(0, (Number(sum?.total_domains) || 0) - (Number(sum?.vpc_domains) || 0))} icon={Network}
          color={(Number(sum?.total_domains) || 0) - (Number(sum?.vpc_domains) || 0) > 0 ? 'red' : 'green'}
          change={(Number(sum?.total_domains) || 0) - (Number(sum?.vpc_domains) || 0) > 0 ? 'Review access' : 'All in VPC'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Engine Version" data={get('engineDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
        <PieChartCard title="Encryption Status" data={get('encryptionDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input type="text" placeholder="Search domains..."
          value={searchText} onChange={e => setSearchText(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-600 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-cyan/50" />
      </div>

      {/* Table */}
      <DataTable
        columns={[
          { key: 'domain_name', label: 'Domain Name', render: (v: any) => <span className="text-white font-medium">{v}</span> },
          { key: 'engine_version', label: 'Engine', render: (v: any) => <span className="font-mono text-xs text-accent-cyan">{v}</span> },
          { key: 'processing', label: 'Status', render: (v: any) => (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              !v ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-orange/10 text-accent-orange'
            }`}><span className={`w-1.5 h-1.5 rounded-full ${!v ? 'bg-accent-green' : 'bg-accent-orange'}`} />{v ? 'Processing' : 'Active'}</span>
          )},
          { key: 'cluster_config', label: 'Instance', render: (v: any) => {
            const cfg = safeJson(v);
            return <span className="font-mono text-xs">{cfg?.InstanceType || cfg?.instanceType || '-'}</span>;
          }},
          { key: 'cluster_config', label: 'Nodes', render: (v: any) => {
            const cfg = safeJson(v);
            return <span className="font-mono">{cfg?.InstanceCount || cfg?.instanceCount || '-'}</span>;
          }},
          { key: 'node_to_node_encryption_options_enabled', label: 'N2N Enc', render: (v: any) => (
            <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-accent-red'}`}>{v ? 'Yes' : 'No'}</span>
          )},
          { key: 'encrypt_at_rest', label: 'Rest Enc', render: (v: any) => (
            <span className={`text-xs font-medium ${v === 'true' ? 'text-accent-green' : 'text-accent-red'}`}>{v === 'true' ? 'Yes' : 'No'}</span>
          )},
          { key: 'ebs_options', label: 'Storage', render: (v: any) => {
            const ebs = safeJson(v);
            return <span className="font-mono text-xs">{ebs?.VolumeSize || ebs?.volumeSize || '-'} GB</span>;
          }},
        ]}
        data={loading ? undefined : domains as any[]}
        onRowClick={(row: any) => fetchDetail(row.domain_name)}
      />

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="w-[520px] bg-navy-800 h-full overflow-y-auto border-l border-navy-600 p-6 space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">OpenSearch Domain Detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-navy-700 rounded animate-pulse" />
              ))}</div>
            ) : (
              <>
                {/* Basic Info */}
                <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Domain Info</h3>
                  {[
                    ['Domain Name', selected.domain_name],
                    ['Domain ID', selected.domain_id],
                    ['Engine', selected.engine_version],
                    ['Status', selected.processing ? 'Processing' : 'Active'],
                    ['Created', selected.created ? 'Yes' : 'No'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                    </div>
                  ))}
                </div>

                {/* Cluster Config */}
                {(() => {
                  const cfg = safeJson(selected.cluster_config);
                  if (!cfg) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Cluster Configuration</h3>
                      {[
                        ['Instance Type', cfg.InstanceType || cfg.instanceType],
                        ['Instance Count', cfg.InstanceCount || cfg.instanceCount],
                        ['Dedicated Master', cfg.DedicatedMasterEnabled || cfg.dedicatedMasterEnabled ? 'Yes' : 'No'],
                        ['Master Type', cfg.DedicatedMasterType || cfg.dedicatedMasterType || '-'],
                        ['Master Count', cfg.DedicatedMasterCount || cfg.dedicatedMasterCount || '-'],
                        ['Zone Awareness', cfg.ZoneAwarenessEnabled || cfg.zoneAwarenessEnabled ? 'Yes' : 'No'],
                        ['Warm Enabled', cfg.WarmEnabled || cfg.warmEnabled ? 'Yes' : 'No'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* EBS Storage */}
                {(() => {
                  const ebs = safeJson(selected.ebs_options);
                  if (!ebs) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">EBS Storage</h3>
                      {[
                        ['EBS Enabled', (ebs.EBSEnabled || ebs.ebsEnabled) ? 'Yes' : 'No'],
                        ['Volume Type', ebs.VolumeType || ebs.volumeType],
                        ['Volume Size (GB)', ebs.VolumeSize || ebs.volumeSize],
                        ['IOPS', ebs.Iops || ebs.iops || '-'],
                        ['Throughput', ebs.Throughput || ebs.throughput || '-'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Encryption */}
                <div className={`rounded-lg p-4 border ${
                  selected.node_to_node_encryption_options_enabled ? 'bg-accent-green/5 border-accent-green/30' : 'bg-accent-red/5 border-accent-red/30'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className={selected.node_to_node_encryption_options_enabled ? 'text-accent-green' : 'text-accent-red'} />
                    <h3 className="text-sm font-semibold text-white">Encryption</h3>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Node-to-Node</span>
                      <span className={selected.node_to_node_encryption_options_enabled ? 'text-accent-green' : 'text-accent-red'}>
                        {selected.node_to_node_encryption_options_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    {(() => {
                      const ear = safeJson(selected.encrypt_at_rest_options);
                      return (
                        <div className="flex justify-between">
                          <span className="text-gray-400">At Rest</span>
                          <span className={ear?.Enabled || ear?.enabled ? 'text-accent-green' : 'text-accent-red'}>
                            {ear?.Enabled || ear?.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* VPC / Endpoints */}
                {(() => {
                  const vpc = safeJson(selected.vpc_options);
                  const endpoints = safeJson(selected.endpoints);
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Network</h3>
                      {vpc ? (
                        <>
                          {[
                            ['VPC ID', vpc.VPCId || vpc.vpcId],
                            ['Subnets', JSON.stringify(vpc.SubnetIds || vpc.subnetIds || [])],
                            ['Security Groups', JSON.stringify(vpc.SecurityGroupIds || vpc.securityGroupIds || [])],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-sm">
                              <span className="text-gray-500">{k}</span>
                              <span className="text-gray-200 font-mono text-xs max-w-[280px] truncate">{String(v || '-')}</span>
                            </div>
                          ))}
                        </>
                      ) : (
                        <p className="text-xs text-accent-orange">Public domain (no VPC)</p>
                      )}
                      {endpoints && (
                        <div className="mt-2">
                          <span className="text-gray-500 text-xs">Endpoints:</span>
                          <pre className="text-xs text-gray-400 font-mono mt-1 break-all">{JSON.stringify(endpoints, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
