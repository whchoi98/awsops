'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Database, X, Network, Shield, Settings, Tag, Activity, Search } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { queries as ecQ } from '@/lib/queries/elasticache';

export default function ElastiCachePage() {
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sgDetails, setSgDetails] = useState<any[]>([]);
  const [ecMetrics, setEcMetrics] = useState<Record<string, any[]>>({});
  const [searchText, setSearchText] = useState('');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: ecQ.summary,
            engines: ecQ.engineDistribution,
            nodeTypes: ecQ.nodeTypeDistribution,
            clusters: ecQ.clusterList,
            replGroups: ecQ.replicationGroupList,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (id: string) => {
    setDetailLoading(true);
    setSgDetails([]);
    setEcMetrics({});
    try {
      const detailSql = ecQ.detail.replace(/{id}/g, id);
      const metricSql = ecQ.ecMetrics.replace(/{id}/g, id);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: detailSql, metrics: metricSql } }),
      });
      const result = await res.json();
      const detail = result.detail?.rows?.[0];
      if (detail) {
        setSelected(detail);
        // Fetch SG details / SG 상세 조회
        try {
          const sgs = JSON.parse(detail.security_groups || '[]');
          const sgIds = sgs.map((sg: any) => sg.SecurityGroupId || sg.security_group_id).filter(Boolean);
          if (sgIds.length > 0) {
            const sgQueries: Record<string, string> = {};
            sgIds.forEach((sgId: string) => { sgQueries[sgId] = ecQ.ecSgDetail.replace('{sg_id}', sgId); });
            const sgRes = await fetch('/awsops/api/steampipe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ queries: sgQueries }),
            });
            const sgResult = await sgRes.json();
            const sgList: any[] = [];
            Object.values(sgResult).forEach((val: any) => { if (val?.rows?.[0]) sgList.push(val.rows[0]); });
            setSgDetails(sgList);
          }
        } catch {}
      }
      // Process metrics / 메트릭 처리
      const metricRows = result.metrics?.rows || [];
      const grouped: Record<string, any[]> = {};
      metricRows.forEach((m: any) => {
        if (!grouped[m.metric_name]) grouped[m.metric_name] = [];
        grouped[m.metric_name].push(m);
      });
      setEcMetrics(grouped);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const summary = getFirst('summary') as any;

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="ElastiCache" subtitle="Redis & Memcached Clusters" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Clusters" value={Number(summary?.total_clusters) || 0} icon={Database} color="red" />
        <StatsCard label="Repl Groups" value={Number(summary?.total_replication_groups) || 0} icon={Database} color="purple" />
        <StatsCard label="Total Nodes" value={Number(summary?.total_nodes) || 0} icon={Database} color="cyan" />
        <StatsCard label="Redis" value={Number(summary?.redis_count) || 0} icon={Database} color="orange" />
        <StatsCard label="Memcached" value={Number(summary?.memcached_count) || 0} icon={Database} color="green" />
        <StatsCard label="Node Types" value={Number(summary?.node_types) || 0} icon={Database} color="pink" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Engine Distribution" data={get('engines').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }))} />
        <BarChartCard title="Node Type Distribution" data={get('nodeTypes').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }))} />
      </div>

      {/* Search / 검색 */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search cluster ID, engine..."
            className="bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 w-56 focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none" />
        </div>
        {searchText && <button onClick={() => setSearchText('')} className="text-xs text-gray-500 hover:text-white">Clear</button>}
      </div>

      <div>
        <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Cache Clusters</h3>
        <DataTable
          columns={[
            { key: 'cache_cluster_id', label: 'Cluster ID' },
            { key: 'engine', label: 'Engine' },
            { key: 'engine_version', label: 'Version' },
            { key: 'cache_node_type', label: 'Node Type' },
            { key: 'cache_cluster_status', label: 'Status', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
            { key: 'num_cache_nodes', label: 'Nodes' },
            { key: 'replication_group_id', label: 'Repl Group' },
            { key: 'at_rest_encryption_enabled', label: 'Encryption', render: (v: any) => (
              <span className={v ? 'text-accent-green' : 'text-accent-red'}>{v ? 'Yes' : 'No'}</span>
            )},
            { key: 'region', label: 'Region' },
          ]}
          data={loading ? undefined : get('clusters')}
          onRowClick={(row) => fetchDetail(row.cache_cluster_id)}
        />
      </div>

      {get('replGroups').length > 0 && (
        <div>
          <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Replication Groups</h3>
          <DataTable
            columns={[
              { key: 'replication_group_id', label: 'Group ID' },
              { key: 'description', label: 'Description' },
              { key: 'status', label: 'Status', render: (v: string) => <StatusBadge status={v || 'unknown'} /> },
              { key: 'cache_node_type', label: 'Node Type' },
              { key: 'multi_az', label: 'Multi-AZ', render: (v: any) => (
                <span className={v === 'enabled' ? 'text-accent-green' : 'text-gray-500'}>{v || 'disabled'}</span>
              )},
              { key: 'automatic_failover', label: 'Auto Failover' },
              { key: 'cluster_enabled', label: 'Cluster Mode', render: (v: any) => v ? 'Enabled' : 'Disabled' },
              { key: 'region', label: 'Region' },
            ]}
            data={loading ? undefined : get('replGroups')}
          />
        </div>
      )}

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
                  {selected?.cache_cluster_id || 'Loading...'}
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
                  <StatusBadge status={selected.cache_cluster_status || 'unknown'} />
                  <span className="text-sm text-gray-400 font-mono">{selected.cache_node_type}</span>
                </div>

                <Section title="Cluster" icon={Database}>
                  <Row label="Cluster ID" value={selected.cache_cluster_id} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="Engine" value={selected.engine} />
                  <Row label="Version" value={selected.engine_version} />
                  <Row label="Node Type" value={selected.cache_node_type} />
                  <Row label="Status" value={selected.cache_cluster_status} />
                  <Row label="Nodes" value={selected.num_cache_nodes} />
                  <Row label="Replication Group" value={selected.replication_group_id} />
                  <Row label="Created" value={selected.cache_cluster_create_time ? new Date(selected.cache_cluster_create_time).toLocaleString() : '--'} />
                </Section>

                <Section title="Network" icon={Network}>
                  <Row label="Subnet Group" value={selected.cache_subnet_group_name} />
                  <Row label="Availability Zone" value={selected.preferred_availability_zone} />
                </Section>

                <Section title="Security" icon={Shield}>
                  <Row label="At-Rest Encryption" value={selected.at_rest_encryption_enabled ? 'Yes' : 'No'} />
                  <Row label="Transit Encryption" value={selected.transit_encryption_enabled ? 'Yes' : 'No'} />
                  <Row label="Auth Token" value={selected.auth_token_enabled ? 'Enabled' : 'Disabled'} />
                </Section>

                <Section title="Configuration" icon={Settings}>
                  <Row label="Auto Minor Upgrade" value={selected.auto_minor_version_upgrade ? 'Yes' : 'No'} />
                  <Row label="Snapshot Retention" value={selected.snapshot_retention_limit ? `${selected.snapshot_retention_limit} days` : 'Disabled'} />
                  <Row label="Snapshot Window" value={selected.snapshot_window} />
                  <Row label="Maintenance Window" value={selected.preferred_maintenance_window} />
                </Section>

                {/* Security Groups / SG */}
                <Section title="Security Groups" icon={Shield}>
                  {sgDetails.length > 0 ? (
                    <div className="space-y-3">
                      {sgDetails.map((sg: any) => {
                        const rules = (() => { try { return JSON.parse(sg.inbound_rules || '[]'); } catch { return []; } })();
                        return (
                          <div key={sg.group_id} className="bg-navy-800 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-accent-cyan font-mono text-xs">{sg.group_id}</span>
                              <span className="text-gray-400 text-xs">{sg.group_name}</span>
                            </div>
                            {rules.length > 0 ? (
                              <div className="space-y-1">
                                {rules.map((r: any, i: number) => (
                                  <div key={i} className="text-[10px] font-mono flex flex-wrap gap-2 pl-2 border-l border-navy-600">
                                    <span className="text-accent-cyan">{r.IpProtocol === '-1' ? 'All' : r.IpProtocol?.toUpperCase()}</span>
                                    {r.FromPort !== undefined && <span className="text-gray-400">{r.FromPort === r.ToPort ? r.FromPort : `${r.FromPort}-${r.ToPort}`}</span>}
                                    {(r.IpRanges || []).map((ip: any, j: number) => <span key={j} className="text-gray-300">{ip.CidrIp}</span>)}
                                    {(r.UserIdGroupPairs || []).map((g: any, j: number) => <span key={`g${j}`} className="text-accent-purple">{g.GroupId}</span>)}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-600 text-xs">No inbound rules</p>}
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-gray-500 text-sm">{detailLoading ? 'Loading...' : 'No security groups'}</p>}
                </Section>

                {/* CloudWatch Metrics / CloudWatch 메트릭 */}
                {Object.keys(ecMetrics).length > 0 && (
                  <Section title="Metrics (Last 1h)" icon={Activity}>
                    <div className="space-y-3">
                      {Object.entries(ecMetrics).map(([name, points]) => {
                        const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                        const latest = points[0];
                        const chartData = sorted.map(p => ({
                          name: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          value: Math.round((Number(p.average) || 0) * 100) / 100,
                        }));
                        const formatVal = (v: number) => {
                          if (name === 'FreeableMemory') return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                          if (name === 'NetworkBytesIn' || name === 'NetworkBytesOut') return `${(v / 1024).toFixed(1)} KB`;
                          if (name === 'CPUUtilization' || name === 'CacheHitRate') return `${v.toFixed(1)}%`;
                          return v.toFixed(0);
                        };
                        const color = name === 'CPUUtilization' ? '#ef4444' : name === 'CacheHitRate' ? '#00ff88' : '#00d4ff';
                        return (
                          <div key={name} className="bg-navy-800 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-mono text-accent-cyan">{name}</span>
                              <span className="text-xs font-mono text-white">{formatVal(Number(latest?.average) || 0)}</span>
                            </div>
                            {chartData.length > 2 ? (
                              <div className="h-20">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={chartData}>
                                    <XAxis dataKey="name" hide />
                                    <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1a2540', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#6b7280' }} />
                                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            ) : (
                              <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                                <div><span className="text-gray-500">Avg:</span> <span className="text-white">{formatVal(Number(latest?.average) || 0)}</span></div>
                                <div><span className="text-gray-500">Max:</span> <span className="text-white">{formatVal(Number(latest?.maximum) || 0)}</span></div>
                                <div><span className="text-gray-500">Min:</span> <span className="text-white">{formatVal(Number(latest?.minimum) || 0)}</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}

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
