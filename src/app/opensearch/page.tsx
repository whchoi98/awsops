'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Search as SearchIcon, X, Shield, Database, Network } from 'lucide-react';
import { queries as osQ } from '@/lib/queries/opensearch';
import { useAccountContext } from '@/contexts/AccountContext';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function OpenSearchPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [domainMetrics, setDomainMetrics] = useState<Record<string, Record<string, number>>>({});

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            summary: osQ.summary,
            list: osQ.list,
            engineDistribution: osQ.engineDistribution,
            encryptionDistribution: osQ.encryptionDistribution,
          },
        }),
      });
      const result = await res.json();
      setData(result);

      // CloudWatch 메트릭 조회 / Fetch CloudWatch metrics for all domains
      const domainList = result.list?.rows || [];
      if (domainList.length > 0) {
        const names = domainList.map((d: any) => d.domain_name).filter(Boolean);
        try {
          const mRes = await fetch(`/awsops/api/opensearch?domains=${encodeURIComponent(names.join(','))}`);
          const mData = await mRes.json();
          setDomainMetrics(mData.metrics || {});
        } catch {}
      }
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

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
            return <span className="font-mono text-xs">{cfg?.InstanceType || '-'}</span>;
          }},
          { key: 'cluster_config', label: 'Nodes', render: (v: any, row: any) => {
            const cfg = safeJson(row.cluster_config);
            return <span className="font-mono">{cfg?.InstanceCount || '-'}</span>;
          }},
          { key: 'node_to_node_encryption_options_enabled', label: 'N2N Enc', render: (v: any) => (
            <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-accent-red'}`}>{v ? 'Yes' : 'No'}</span>
          )},
          { key: 'encrypt_at_rest', label: 'Rest Enc', render: (v: any) => (
            <span className={`text-xs font-medium ${v === 'true' ? 'text-accent-green' : 'text-accent-red'}`}>{v === 'true' ? 'Yes' : 'No'}</span>
          )},
          { key: 'ebs_options', label: 'Storage', render: (v: any) => {
            const ebs = safeJson(v);
            return <span className="font-mono text-xs">{ebs?.VolumeSize || '-'} GB</span>;
          }},
        ]}
        data={loading ? undefined : domains as any[]}
        onRowClick={(row: any) => fetchDetail(row.domain_name)}
      />

      {/* Domain Metrics Table / 도메인 메트릭 테이블 */}
      {!loading && domains.length > 0 && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Database size={16} className="text-accent-cyan" />
            Domain Metrics
            <span className="text-xs text-gray-500 font-normal ml-1">({domains.length} domains · last 1h)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-navy-700">
                  {['Domain', 'Engine', 'Cluster Status', 'CPU', 'JVM Memory', 'Nodes', 'Documents', 'Free Storage', 'Search Rate', 'Search Latency', 'Index Rate', 'Index Latency'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-mono font-semibold uppercase tracking-wider text-accent-cyan">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(domains as any[]).map((d: any) => {
                  const m = domainMetrics[d.domain_name] || {};
                  const cpu = m.cpu || 0;
                  const jvmMem = m.mem_pressure || 0;
                  const freeStorage = m.free_storage || 0;
                  const nodes = m.nodes || 0;
                  const docs = m.searchable_docs || 0;
                  const searchRate = m.search_rate || 0;
                  const searchLatency = m.search_latency || 0;
                  const indexRate = m.indexing_rate || 0;
                  const indexLatency = m.indexing_latency || 0;
                  const green = m.cluster_status_green || 0;
                  const yellow = m.cluster_status_yellow || 0;
                  const red = m.cluster_status_red || 0;
                  const clusterStatus = red >= 1 ? 'RED' : yellow >= 1 ? 'YELLOW' : green >= 1 ? 'GREEN' : '-';
                  return (
                    <tr key={d.domain_name} className="border-b border-navy-600 hover:bg-navy-700 transition-colors cursor-pointer"
                      onClick={() => fetchDetail(d.domain_name)}>
                      <td className="px-3 py-2 text-sm text-white">{d.domain_name}</td>
                      <td className="px-3 py-2 text-xs font-mono text-accent-cyan">{d.engine_version}</td>
                      {/* Cluster Status */}
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          clusterStatus === 'GREEN' ? 'bg-accent-green/10 text-accent-green' :
                          clusterStatus === 'YELLOW' ? 'bg-accent-orange/10 text-accent-orange' :
                          clusterStatus === 'RED' ? 'bg-accent-red/10 text-accent-red' :
                          'bg-navy-600 text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            clusterStatus === 'GREEN' ? 'bg-accent-green' :
                            clusterStatus === 'YELLOW' ? 'bg-accent-orange' :
                            clusterStatus === 'RED' ? 'bg-accent-red' : 'bg-gray-600'
                          }`} />
                          {clusterStatus}
                        </span>
                      </td>
                      {/* CPU */}
                      <td className="px-3 py-2">
                        {cpu > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-2 bg-navy-600 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${cpu > 80 ? 'bg-accent-red' : cpu > 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`}
                                style={{ width: `${Math.min(cpu, 100)}%` }} />
                            </div>
                            <span className="text-xs font-mono text-gray-300">{cpu.toFixed(1)}%</span>
                          </div>
                        ) : <span className="text-xs text-gray-600">-</span>}
                      </td>
                      {/* JVM Memory Pressure */}
                      <td className="px-3 py-2">
                        {jvmMem > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-14 h-2 bg-navy-600 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${jvmMem > 85 ? 'bg-accent-red' : jvmMem > 60 ? 'bg-accent-orange' : 'bg-accent-purple'}`}
                                style={{ width: `${Math.min(jvmMem, 100)}%` }} />
                            </div>
                            <span className="text-xs font-mono text-gray-300">{jvmMem.toFixed(1)}%</span>
                          </div>
                        ) : <span className="text-xs text-gray-600">-</span>}
                      </td>
                      {/* Nodes */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {nodes > 0 ? Math.round(nodes) : '-'}
                      </td>
                      {/* Documents */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {docs > 0 ? Math.round(docs).toLocaleString() : '-'}
                      </td>
                      {/* Free Storage */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {freeStorage > 0 ? `${(freeStorage / 1024).toFixed(1)} GB` : '-'}
                      </td>
                      {/* Search Rate */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {searchRate > 0 ? `${searchRate.toFixed(1)}/5m` : '-'}
                      </td>
                      {/* Search Latency */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {searchLatency > 0 ? `${searchLatency.toFixed(1)} ms` : '-'}
                      </td>
                      {/* Index Rate */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {indexRate > 0 ? `${indexRate.toFixed(1)}/5m` : '-'}
                      </td>
                      {/* Index Latency */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {indexLatency > 0 ? `${indexLatency.toFixed(1)} ms` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                  {selected.account_id && isMultiAccount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Account</span>
                      <span className="text-gray-200 font-mono text-xs">{selected.account_id}</span>
                    </div>
                  )}
                  {[
                    ['Domain Name', selected.domain_name],
                    ['Domain ID', selected.domain_id],
                    ['Engine', selected.engine_version],
                    ['Engine Type', selected.engine_type],
                    ['Status', selected.processing ? 'Processing' : 'Active'],
                    ['IP Type', selected.ip_address_type],
                    ['Endpoint', selected.endpoint],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-200 font-mono text-xs max-w-[280px] truncate">{String(v || '-')}</span>
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
                        ['Instance Type', cfg.InstanceType],
                        ['Instance Count', cfg.InstanceCount],
                        ['Dedicated Master', cfg.DedicatedMasterEnabled ? 'Yes' : 'No'],
                        ['Master Type', cfg.DedicatedMasterType || '-'],
                        ['Master Count', cfg.DedicatedMasterCount || '-'],
                        ['Zone Awareness', cfg.ZoneAwarenessEnabled ? 'Yes' : 'No'],
                        ['Warm Enabled', cfg.WarmEnabled ? 'Yes' : 'No'],
                        ['Warm Type', cfg.WarmType || '-'],
                        ['Warm Count', cfg.WarmCount || '-'],
                        ['Cold Storage', cfg.ColdStorageOptions?.Enabled ? 'Yes' : 'No'],
                        ['Multi-AZ with Standby', cfg.MultiAZWithStandbyEnabled ? 'Yes' : 'No'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs">{String(v ?? '-')}</span>
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
                        ['EBS Enabled', ebs.EBSEnabled ? 'Yes' : 'No'],
                        ['Volume Type', ebs.VolumeType],
                        ['Volume Size (GB)', ebs.VolumeSize],
                        ['IOPS', ebs.Iops || '-'],
                        ['Throughput', ebs.Throughput || '-'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs">{String(v ?? '-')}</span>
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
                      const ear = safeJson(selected.encryption_at_rest_options);
                      return (
                        <>
                          <div className="flex justify-between">
                            <span className="text-gray-400">At Rest</span>
                            <span className={ear?.Enabled ? 'text-accent-green' : 'text-accent-red'}>
                              {ear?.Enabled ? 'Enabled' : 'Disabled'}
                            </span>
                          </div>
                          {ear?.KmsKeyId && (
                            <div className="flex justify-between">
                              <span className="text-gray-400">KMS Key</span>
                              <span className="text-gray-300 font-mono text-[10px] max-w-[280px] truncate">{ear.KmsKeyId}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Advanced Security */}
                {(() => {
                  const sec = safeJson(selected.advanced_security_options);
                  if (!sec) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Advanced Security</h3>
                      {[
                        ['Fine-Grained Access', sec.Enabled ? 'Enabled' : 'Disabled'],
                        ['Internal User DB', sec.InternalUserDatabaseEnabled ? 'Enabled' : 'Disabled'],
                        ['Anonymous Auth', sec.AnonymousAuthEnabled ? 'Enabled' : 'Disabled'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className={`text-xs ${v === 'Enabled' ? 'text-accent-green' : 'text-gray-500'}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* VPC / Network */}
                {(() => {
                  const vpc = safeJson(selected.vpc_options);
                  const epOpts = safeJson(selected.domain_endpoint_options);
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Network</h3>
                      {vpc && vpc.VPCId ? (
                        <>
                          {[
                            ['VPC ID', vpc.VPCId],
                            ['Availability Zones', (vpc.AvailabilityZones || []).join(', ')],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-sm">
                              <span className="text-gray-500">{k}</span>
                              <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                            </div>
                          ))}
                          <div className="mt-1">
                            <span className="text-gray-500 text-xs">Subnets:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(vpc.SubnetIds || []).map((sn: string) => (
                                <span key={sn} className="px-2 py-0.5 bg-navy-700 rounded text-xs font-mono text-gray-300">{sn}</span>
                              ))}
                            </div>
                          </div>
                          <div className="mt-1">
                            <span className="text-gray-500 text-xs">Security Groups:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(vpc.SecurityGroupIds || []).map((sg: string) => (
                                <span key={sg} className="px-2 py-0.5 bg-navy-700 rounded text-xs font-mono text-accent-cyan">{sg}</span>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-accent-orange">Public domain (no VPC)</p>
                      )}
                      {epOpts && (
                        <div className="mt-2 space-y-1">
                          {[
                            ['HTTPS Required', epOpts.EnforceHTTPS ? 'Yes' : 'No'],
                            ['TLS Security Policy', epOpts.TLSSecurityPolicy],
                            ['Custom Endpoint', epOpts.CustomEndpointEnabled ? epOpts.CustomEndpoint || 'Yes' : 'No'],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-sm">
                              <span className="text-gray-500">{k}</span>
                              <span className="text-gray-200 text-xs">{String(v || '-')}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Service Software */}
                {(() => {
                  const sw = safeJson(selected.service_software_options);
                  if (!sw) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Service Software</h3>
                      {[
                        ['Current Version', sw.CurrentVersion],
                        ['Update Available', sw.UpdateAvailable ? 'Yes' : 'No'],
                        ['Update Status', sw.UpdateStatus],
                        ['Cancellable', sw.Cancellable ? 'Yes' : 'No'],
                        ['Optional Deployment', sw.OptionalDeployment ? 'Yes' : 'No'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 text-xs">{String(v || '-')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Logging */}
                {(() => {
                  const logs = safeJson(selected.log_publishing_options);
                  if (!logs || Object.keys(logs).length === 0) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Log Publishing</h3>
                      <div className="space-y-1">
                        {Object.entries(logs).map(([logType, config]: [string, any]) => (
                          <div key={logType} className="flex justify-between text-xs">
                            <span className="text-gray-400">{logType}</span>
                            <span className={config?.Enabled ? 'text-accent-green' : 'text-gray-500'}>
                              {config?.Enabled ? `→ ${config.CloudWatchLogsLogGroupArn?.split(':').pop() || 'Enabled'}` : 'Disabled'}
                            </span>
                          </div>
                        ))}
                      </div>
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
