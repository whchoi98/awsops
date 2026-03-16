'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Radio, X, Shield, Search, Activity } from 'lucide-react';
import { queries as mskQ } from '@/lib/queries/msk';
import { useAccountContext } from '@/contexts/AccountContext';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function MSKPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [brokerNodes, setBrokerNodes] = useState<any[]>([]);
  const [allNodes, setAllNodes] = useState<{ clusterName: string; nodes: any[] }[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [brokerMetrics, setBrokerMetrics] = useState<Record<string, Record<number, Record<string, number>>>>({});

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            summary: mskQ.summary,
            list: mskQ.list,
            stateDistribution: mskQ.stateDistribution,
            versionDistribution: mskQ.versionDistribution,
          },
        }),
      });
      const result = await res.json();
      setData(result);
      // Fetch broker nodes for all clusters / 모든 클러스터의 브로커 노드 조회
      const clusterList = result.list?.rows || [];
      if (clusterList.length > 0) {
        setNodesLoading(true);
        const nodePromises = clusterList.map(async (c: any) => {
          if (!c.cluster_arn) return { clusterName: c.cluster_name, nodes: [] };
          try {
            const nRes = await fetch(`/awsops/api/msk?clusterArn=${encodeURIComponent(c.cluster_arn)}`);
            const nData = await nRes.json();
            return { clusterName: c.cluster_name as string, nodes: nData.nodes || [] };
          } catch { return { clusterName: c.cluster_name as string, nodes: [] }; }
        });
        const allResults = await Promise.all(nodePromises);
        setAllNodes(allResults);
        setNodesLoading(false);

        // Fetch CloudWatch metrics for each cluster's brokers / 클러스터별 브로커 메트릭 조회
        const metricsMap: Record<string, Record<number, Record<string, number>>> = {};
        const metricPromises = allResults.map(async (cluster) => {
          const brokerIds = cluster.nodes
            .filter((n: any) => n.NodeType === 'BROKER' && n.BrokerNodeInfo?.BrokerId)
            .map((n: any) => Math.round(n.BrokerNodeInfo.BrokerId));
          if (brokerIds.length === 0) return;
          try {
            const mRes = await fetch(`/awsops/api/msk?action=metrics&clusterName=${encodeURIComponent(cluster.clusterName)}&brokerIds=${brokerIds.join(',')}`);
            const mData = await mRes.json();
            metricsMap[cluster.clusterName] = mData.metrics || {};
          } catch {}
        });
        await Promise.all(metricPromises);
        setBrokerMetrics(metricsMap);
      }
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (clusterName: string, clusterArn?: string) => {
    setDetailLoading(true);
    setBrokerNodes([]);
    try {
      const sql = mskQ.detail.replace(/{cluster_name}/g, clusterName);
      const [steampipeRes, nodesRes] = await Promise.all([
        fetch('/awsops/api/steampipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queries: { detail: sql } }),
        }),
        clusterArn
          ? fetch(`/awsops/api/msk?clusterArn=${encodeURIComponent(clusterArn)}`)
          : Promise.resolve(null),
      ]);
      const result = await steampipeRes.json();
      setSelected(result.detail?.rows?.[0] || null);
      if (nodesRes) {
        const nodesData = await nodesRes.json();
        setBrokerNodes(nodesData.nodes || []);
      }
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const sum = getFirst('summary') as any;

  const safeJson = (raw: string | null | undefined): any => {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  };

  const clusters = get('list').filter((r: any) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      String(r.cluster_name || '').toLowerCase().includes(s) ||
      String(r.kafka_version || '').toLowerCase().includes(s) ||
      String(r.state || '').toLowerCase().includes(s) ||
      String(r.instance_type || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Amazon MSK" subtitle="Managed Streaming for Apache Kafka" onRefresh={() => fetchData(true)} />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Total Clusters" value={Number(sum?.total_clusters) || 0} icon={Radio} color="cyan"
          change={`${Number(sum?.active_clusters) || 0} active`} />
        <StatsCard label="Active" value={Number(sum?.active_clusters) || 0} icon={Activity} color="green"
          change={Number(sum?.inactive_clusters) > 0 ? `${sum.inactive_clusters} inactive` : 'All active'} />
        <StatsCard label="Total Brokers" value={Number(sum?.total_brokers) || 0} icon={Radio} color="purple"
          change="Across all clusters" />
        <StatsCard label="Enhanced Monitoring" value={Number(sum?.enhanced_monitoring) || 0} icon={Activity} color="orange"
          change={`of ${Number(sum?.total_clusters) || 0} clusters`} />
        <StatsCard label="In-Transit Encrypted" value={Number(sum?.encrypted_in_transit) || 0} icon={Shield}
          color={Number(sum?.encrypted_in_transit) === Number(sum?.total_clusters) ? 'green' : 'orange'}
          change={`of ${Number(sum?.total_clusters) || 0} clusters`} />
        <StatsCard label="Avg Brokers/Cluster" value={
          Number(sum?.total_clusters) > 0
            ? (Number(sum?.total_brokers) / Number(sum?.total_clusters)).toFixed(1)
            : '0'
        } icon={Radio} color="cyan" change="Per cluster" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Cluster State" data={get('stateDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
        <PieChartCard title="Kafka Version" data={get('versionDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input type="text" placeholder="Search clusters..."
          value={searchText} onChange={e => setSearchText(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-600 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-cyan/50" />
      </div>

      {/* Table */}
      <DataTable
        columns={[
          { key: 'cluster_name', label: 'Cluster Name', render: (v: any) => <span className="text-white font-medium">{v}</span> },
          { key: 'state', label: 'State', render: (v: any) => (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              v === 'ACTIVE' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-orange/10 text-accent-orange'
            }`}><span className={`w-1.5 h-1.5 rounded-full ${v === 'ACTIVE' ? 'bg-accent-green' : 'bg-accent-orange'}`} />{v}</span>
          )},
          { key: 'kafka_version', label: 'Kafka Version', render: (v: any) => <span className="font-mono text-xs">{v || '-'}</span> },
          { key: 'cluster_type', label: 'Type' },
          { key: 'instance_type', label: 'Instance', render: (v: any) => <span className="font-mono text-xs">{v || '-'}</span> },
          { key: 'number_of_broker_nodes', label: 'Brokers', render: (v: any) => <span className="font-mono">{v}</span> },
          { key: 'ebs_volume_gb', label: 'EBS (GB)', render: (v: any) => <span className="font-mono text-xs">{v || '-'}</span> },
          { key: 'enhanced_monitoring', label: 'Monitoring', render: (v: any) => (
            <span className={`text-xs ${v && v !== 'DEFAULT' ? 'text-accent-green' : 'text-gray-500'}`}>{v || '-'}</span>
          )},
          { key: 'creation_time', label: 'Created', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
        ]}
        data={loading ? undefined : clusters as any[]}
        onRowClick={(row: any) => fetchDetail(row.cluster_name, row.cluster_arn)}
      />

      {/* Broker Nodes Overview — all clusters / 전체 클러스터 브로커 노드 */}
      {(allNodes.length > 0 || nodesLoading) && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Radio size={16} className="text-accent-cyan" />
            Broker Nodes
            {!nodesLoading && (
              <span className="text-xs text-gray-500 font-normal ml-1">
                ({allNodes.reduce((s, c) => s + c.nodes.filter((n: any) => n.NodeType === 'BROKER').length, 0)} brokers · {allNodes.reduce((s, c) => s + c.nodes.filter((n: any) => n.NodeType === 'CONTROLLER').length, 0)} controllers)
              </span>
            )}
          </h3>
          {nodesLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 bg-navy-700 rounded animate-pulse" />
            ))}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-navy-700">
                    {['Cluster', 'Type', 'ID', 'Instance', 'VPC IP', 'ENI', 'CPU', 'Memory', 'Net In', 'Net Out', 'Endpoint'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-mono font-semibold uppercase tracking-wider text-accent-cyan">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allNodes.flatMap(cluster => {
                    const cm = brokerMetrics[cluster.clusterName] || {};
                    return cluster.nodes
                      .filter((n: any) => n.NodeType === 'BROKER')
                      .map((node: any, i: number) => {
                        const bi = node.BrokerNodeInfo;
                        const bId = bi?.BrokerId ? Math.round(bi.BrokerId) : 0;
                        const m = cm[bId] || {};
                        const cpuTotal = (m.cpu_user || 0) + (m.cpu_system || 0);
                        const memUsed = m.mem_used || 0;
                        const memFree = m.mem_free || 0;
                        const memTotal = memUsed + memFree;
                        const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;
                        const bytesIn = m.bytes_in || 0;
                        const bytesOut = m.bytes_out || 0;
                        return (
                          <tr key={`${cluster.clusterName}-${i}`} className="border-b border-navy-600 hover:bg-navy-700 transition-colors">
                            <td className="px-3 py-2 text-sm text-white">{cluster.clusterName}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-cyan/10 text-accent-cyan">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />BROKER
                              </span>
                            </td>
                            <td className="px-3 py-2 text-sm font-mono text-gray-300">{bId || '-'}</td>
                            <td className="px-3 py-2 text-xs font-mono text-accent-green">{node.InstanceType || '-'}</td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-300">{bi?.ClientVpcIpAddress || '-'}</td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-500 max-w-[120px] truncate">{bi?.AttachedENIId || '-'}</td>
                            <td className="px-3 py-2">
                              {cpuTotal > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-2 bg-navy-600 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${cpuTotal > 80 ? 'bg-accent-red' : cpuTotal > 50 ? 'bg-accent-orange' : 'bg-accent-cyan'}`}
                                      style={{ width: `${Math.min(cpuTotal, 100)}%` }} />
                                  </div>
                                  <span className="text-xs font-mono text-gray-300">{cpuTotal.toFixed(1)}%</span>
                                </div>
                              ) : <span className="text-xs text-gray-600">-</span>}
                            </td>
                            <td className="px-3 py-2">
                              {memTotal > 0 ? (
                                <div className="flex items-center gap-1.5">
                                  <div className="w-16 h-2 bg-navy-600 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${memPct > 85 ? 'bg-accent-red' : memPct > 60 ? 'bg-accent-orange' : 'bg-accent-green'}`}
                                      style={{ width: `${Math.min(memPct, 100)}%` }} />
                                  </div>
                                  <span className="text-xs font-mono text-gray-300">{memPct.toFixed(0)}%</span>
                                </div>
                              ) : <span className="text-xs text-gray-600">-</span>}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-300">
                              {bytesIn > 0 ? `${(bytesIn / 1024).toFixed(1)} KB/s` : '-'}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-300">
                              {bytesOut > 0 ? `${(bytesOut / 1024).toFixed(1)} KB/s` : '-'}
                            </td>
                            <td className="px-3 py-2 text-xs font-mono text-gray-400 max-w-[180px] truncate">{bi?.Endpoints?.[0] || '-'}</td>
                          </tr>
                        );
                      });
                  })}
                  {/* Controller rows */}
                  {allNodes.flatMap(cluster =>
                    cluster.nodes
                      .filter((n: any) => n.NodeType === 'CONTROLLER')
                      .map((node: any, i: number) => (
                        <tr key={`${cluster.clusterName}-ctrl-${i}`} className="border-b border-navy-600/50 hover:bg-navy-700 transition-colors">
                          <td className="px-3 py-2 text-sm text-gray-400">{cluster.clusterName}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-purple/10 text-accent-purple">
                              <span className="w-1.5 h-1.5 rounded-full bg-accent-purple" />CTRL
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">-</td>
                          <td className="px-3 py-2 text-xs text-gray-500">KRaft</td>
                          <td className="px-3 py-2 text-xs text-gray-500">-</td>
                          <td className="px-3 py-2 text-xs text-gray-500">-</td>
                          <td className="px-3 py-2 text-xs text-gray-500" colSpan={4}>-</td>
                          <td className="px-3 py-2 text-xs font-mono text-gray-400 max-w-[180px] truncate">{node.ControllerNodeInfo?.Endpoints?.[0] || '-'}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Detail Panel */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="w-[520px] bg-navy-800 h-full overflow-y-auto border-l border-navy-600 p-6 space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">MSK Cluster Detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-navy-700 rounded animate-pulse" />
              ))}</div>
            ) : (() => {
              const prov = safeJson(selected.provisioned);
              const broker = prov?.BrokerNodeGroupInfo;
              const enc = prov?.EncryptionInfo;
              const kafka = prov?.CurrentBrokerSoftwareInfo;
              const auth = prov?.ClientAuthentication;
              const logging = prov?.LoggingInfo;
              const monitoring = prov?.OpenMonitoring;

              return (
                <>
                  {/* Basic Info */}
                  <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Cluster Info</h3>
                    {selected.account_id && isMultiAccount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Account</span>
                      <span className="text-gray-200 font-mono text-xs">{selected.account_id}</span>
                    </div>
                  )}
                  {[
                      ['Cluster Name', selected.cluster_name],
                      ['State', selected.state],
                      ['Type', selected.cluster_type],
                      ['Kafka Version', kafka?.KafkaVersion],
                      ['Brokers', prov?.NumberOfBrokerNodes],
                      ['Enhanced Monitoring', prov?.EnhancedMonitoring],
                      ['Storage Mode', prov?.StorageMode],
                      ['Version', selected.current_version],
                      ['Created', selected.creation_time ? new Date(selected.creation_time).toLocaleString() : '-'],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between text-sm">
                        <span className="text-gray-500">{k}</span>
                        <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                      </div>
                    ))}
                  </div>

                  {/* Broker Configuration */}
                  {broker && (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Broker Configuration</h3>
                      {[
                        ['Instance Type', broker.InstanceType],
                        ['EBS Volume (GB)', broker.StorageInfo?.EbsStorageInfo?.VolumeSize],
                        ['AZ Distribution', broker.BrokerAZDistribution],
                        ['Zones', broker.ZoneIds?.join(', ')],
                        ['Public Access', broker.ConnectivityInfo?.PublicAccess?.Type],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                        </div>
                      ))}
                      <div className="mt-2">
                        <span className="text-gray-500 text-xs">Security Groups:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(broker.SecurityGroups || []).map((sg: string) => (
                            <span key={sg} className="px-2 py-0.5 bg-navy-700 rounded text-xs font-mono text-accent-cyan">{sg}</span>
                          ))}
                        </div>
                      </div>
                      <div className="mt-2">
                        <span className="text-gray-500 text-xs">Subnets:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(broker.ClientSubnets || []).map((sn: string) => (
                            <span key={sn} className="px-2 py-0.5 bg-navy-700 rounded text-xs font-mono text-gray-300">{sn}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Encryption */}
                  <div className={`rounded-lg p-4 border ${
                    enc?.EncryptionInTransit?.InCluster ? 'bg-accent-green/5 border-accent-green/30' : 'bg-accent-orange/5 border-accent-orange/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield size={16} className={enc?.EncryptionInTransit?.InCluster ? 'text-accent-green' : 'text-accent-orange'} />
                      <h3 className="text-sm font-semibold text-white">Encryption</h3>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-400">In-Transit (InCluster)</span>
                        <span className={enc?.EncryptionInTransit?.InCluster ? 'text-accent-green' : 'text-accent-red'}>
                          {enc?.EncryptionInTransit?.InCluster ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Client-Broker</span>
                        <span className="text-gray-300 font-mono">{enc?.EncryptionInTransit?.ClientBroker || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">At-Rest KMS Key</span>
                        <span className="text-gray-300 font-mono text-[10px] max-w-[280px] truncate block">
                          {enc?.EncryptionAtRest?.DataVolumeKMSKeyId || 'AWS managed'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Authentication */}
                  {auth && (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Authentication</h3>
                      {[
                        ['Unauthenticated', auth.Unauthenticated?.Enabled ? 'Enabled' : 'Disabled'],
                        ['SASL/IAM', auth.Sasl?.Iam?.Enabled ? 'Enabled' : 'Disabled'],
                        ['SASL/SCRAM', auth.Sasl?.Scram?.Enabled ? 'Enabled' : 'Disabled'],
                        ['TLS', auth.Tls ? 'Configured' : 'Not configured'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className={`text-xs ${v === 'Enabled' || v === 'Configured' ? 'text-accent-green' : 'text-gray-500'}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bootstrap Brokers */}
                  {(selected.bootstrap_broker_string || selected.bootstrap_broker_string_tls) && (
                    <div className="bg-navy-900 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Bootstrap Brokers</h3>
                      {selected.bootstrap_broker_string && (
                        <div className="mb-2">
                          <span className="text-gray-500 text-xs">Plaintext:</span>
                          <p className="text-xs text-gray-400 font-mono break-all mt-0.5">{selected.bootstrap_broker_string}</p>
                        </div>
                      )}
                      {selected.bootstrap_broker_string_tls && (
                        <div>
                          <span className="text-gray-500 text-xs">TLS:</span>
                          <p className="text-xs text-gray-400 font-mono break-all mt-0.5">{selected.bootstrap_broker_string_tls}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Broker Nodes — from AWS CLI / 브로커 노드 — AWS CLI 조회 */}
                  <div className="bg-navy-900 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-3">
                      Broker Nodes ({brokerNodes.filter(n => n.NodeType === 'BROKER').length} brokers · {brokerNodes.filter(n => n.NodeType === 'CONTROLLER').length} controllers)
                    </h3>
                    {brokerNodes.length === 0 ? (
                      <p className="text-sm text-gray-500 text-center py-3">Loading nodes...</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Broker nodes */}
                        {brokerNodes.filter(n => n.NodeType === 'BROKER').map((node: any, i: number) => {
                          const bi = node.BrokerNodeInfo;
                          return (
                            <div key={i} className="bg-navy-800 rounded-lg p-3 border border-navy-600">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <Radio size={14} className="text-accent-cyan" />
                                  <span className="text-sm font-medium text-white">Broker {bi?.BrokerId ? Math.round(bi.BrokerId) : i + 1}</span>
                                </div>
                                <span className="text-xs font-mono text-accent-green">{node.InstanceType}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <div><span className="text-gray-500">IP: </span><span className="text-gray-300 font-mono">{bi?.ClientVpcIpAddress || '-'}</span></div>
                                <div><span className="text-gray-500">Subnet: </span><span className="text-gray-300 font-mono text-[10px]">{bi?.ClientSubnet || '-'}</span></div>
                                <div><span className="text-gray-500">ENI: </span><span className="text-gray-300 font-mono text-[10px]">{bi?.AttachedENIId || '-'}</span></div>
                                <div><span className="text-gray-500">Kafka: </span><span className="text-gray-300 font-mono">{bi?.CurrentBrokerSoftwareInfo?.KafkaVersion || '-'}</span></div>
                                {bi?.Endpoints?.[0] && (
                                  <div className="col-span-2"><span className="text-gray-500">Endpoint: </span><span className="text-gray-400 font-mono text-[10px] break-all">{bi.Endpoints[0]}</span></div>
                                )}
                                {node.AddedToClusterTime && (
                                  <div className="col-span-2"><span className="text-gray-500">Added: </span><span className="text-gray-400">{new Date(node.AddedToClusterTime).toLocaleString()}</span></div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {/* Controller nodes */}
                        {brokerNodes.filter(n => n.NodeType === 'CONTROLLER').length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500 mb-1.5">Controllers (KRaft)</p>
                            <div className="space-y-1">
                              {brokerNodes.filter(n => n.NodeType === 'CONTROLLER').map((node: any, i: number) => (
                                <div key={i} className="flex items-center justify-between bg-navy-800 rounded p-2 text-xs border border-navy-700">
                                  <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-accent-purple" />
                                    <span className="text-gray-300">Controller {i + 1}</span>
                                  </div>
                                  <span className="text-gray-400 font-mono text-[10px]">
                                    {node.ControllerNodeInfo?.Endpoints?.[0] || '-'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Monitoring */}
                  {monitoring && (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Open Monitoring</h3>
                      {[
                        ['JMX Exporter', monitoring.Prometheus?.JmxExporter?.EnabledInBroker ? 'Enabled' : 'Disabled'],
                        ['Node Exporter', monitoring.Prometheus?.NodeExporter?.EnabledInBroker ? 'Enabled' : 'Disabled'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className={`text-xs ${v === 'Enabled' ? 'text-accent-green' : 'text-gray-500'}`}>{v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Logging */}
                  {logging && (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Logging</h3>
                      {[
                        ['CloudWatch Logs', logging.BrokerLogs?.CloudWatchLogs?.Enabled ? `Enabled → ${logging.BrokerLogs.CloudWatchLogs.LogGroup}` : 'Disabled'],
                        ['S3 Logs', logging.BrokerLogs?.S3?.Enabled ? `Enabled → ${logging.BrokerLogs.S3.Bucket}` : 'Disabled'],
                        ['Firehose', logging.BrokerLogs?.Firehose?.Enabled ? 'Enabled' : 'Disabled'],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-300 text-xs max-w-[280px] truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
