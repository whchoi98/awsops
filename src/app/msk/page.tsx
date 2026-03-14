'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { Radio, X, Shield, Search, Activity } from 'lucide-react';
import { queries as mskQ } from '@/lib/queries/msk';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function MSKPage() {
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
            summary: mskQ.summary,
            list: mskQ.list,
            stateDistribution: mskQ.stateDistribution,
            versionDistribution: mskQ.versionDistribution,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (clusterName: string) => {
    setDetailLoading(true);
    try {
      const sql = mskQ.detail.replace(/{cluster_name}/g, clusterName);
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

  const clusters = get('list').filter((r: any) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      String(r.cluster_name || '').toLowerCase().includes(s) ||
      String(r.kafka_version || '').toLowerCase().includes(s) ||
      String(r.state || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Amazon MSK" subtitle="Managed Streaming for Apache Kafka" onRefresh={() => fetchData(true)} />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatsCard label="Total Clusters" value={Number(sum?.total_clusters) || 0} icon={Radio} color="cyan"
          change={`${Number(sum?.active_clusters) || 0} active`} />
        <StatsCard label="Active" value={Number(sum?.active_clusters) || 0} icon={Activity} color="green"
          change={Number(sum?.inactive_clusters) > 0 ? `${sum.inactive_clusters} inactive` : 'All active'} />
        <StatsCard label="Brokers" value={clusters.reduce((s: number, r: any) => s + (Number(r.number_of_broker_nodes) || 0), 0)} icon={Radio} color="purple"
          change="Total broker nodes" />
        <StatsCard label="Enhanced Monitoring" value={Number(sum?.enhanced_monitoring) || 0} icon={Activity} color="orange"
          change={`of ${Number(sum?.total_clusters) || 0} clusters`} />
        <StatsCard label="Encrypted" value={Number(sum?.encrypted_clusters) || 0} icon={Shield}
          color={Number(sum?.encrypted_clusters) === Number(sum?.total_clusters) ? 'green' : 'orange'}
          change={`of ${Number(sum?.total_clusters) || 0} clusters`} />
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
          { key: 'kafka_version', label: 'Kafka Version', render: (v: any) => <span className="font-mono text-xs">{v}</span> },
          { key: 'cluster_type', label: 'Type' },
          { key: 'number_of_broker_nodes', label: 'Brokers', render: (v: any) => <span className="font-mono">{v}</span> },
          { key: 'enhanced_monitoring', label: 'Monitoring', render: (v: any) => (
            <span className={`text-xs ${v !== 'DEFAULT' ? 'text-accent-green' : 'text-gray-500'}`}>{v}</span>
          )},
          { key: 'creation_time', label: 'Created', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
        ]}
        data={loading ? undefined : clusters as any[]}
        onRowClick={(row: any) => fetchDetail(row.cluster_name)}
      />

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
            ) : (
              <>
                {/* Basic Info */}
                <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Cluster Info</h3>
                  {[
                    ['Cluster Name', selected.cluster_name],
                    ['State', selected.state],
                    ['Type', selected.cluster_type],
                    ['Kafka Version', selected.kafka_version],
                    ['Brokers', selected.number_of_broker_nodes],
                    ['Monitoring', selected.enhanced_monitoring],
                    ['Version', selected.current_version],
                    ['Created', selected.creation_time ? new Date(selected.creation_time).toLocaleString() : '-'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-200 font-mono text-xs">{String(v || '-')}</span>
                    </div>
                  ))}
                </div>

                {/* Broker Info */}
                {(() => {
                  const broker = safeJson(selected.broker_info);
                  if (!broker) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Broker Configuration</h3>
                      {[
                        ['Instance Type', broker.InstanceType || broker.instanceType],
                        ['EBS Volume (GB)', broker.StorageInfo?.EbsStorageInfo?.VolumeSize || broker.storageInfo?.ebsStorageInfo?.volumeSize],
                        ['Security Groups', JSON.stringify(broker.SecurityGroups || broker.securityGroups || [])],
                        ['Subnets', JSON.stringify(broker.ClientSubnets || broker.clientSubnets || [])],
                      ].map(([k, v]) => (
                        <div key={k} className="flex justify-between text-sm">
                          <span className="text-gray-500">{k}</span>
                          <span className="text-gray-200 font-mono text-xs max-w-[280px] truncate">{String(v || '-')}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* Encryption */}
                {(() => {
                  const enc = safeJson(selected.encryption_info);
                  const hasEnc = enc && (enc.EncryptionAtRest || enc.EncryptionInTransit || enc.encryptionAtRest || enc.encryptionInTransit);
                  return (
                    <div className={`rounded-lg p-4 border ${hasEnc ? 'bg-accent-green/5 border-accent-green/30' : 'bg-accent-orange/5 border-accent-orange/30'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <Shield size={16} className={hasEnc ? 'text-accent-green' : 'text-accent-orange'} />
                        <h3 className="text-sm font-semibold text-white">Encryption</h3>
                      </div>
                      <pre className="text-xs text-gray-400 overflow-x-auto">{JSON.stringify(enc, null, 2) || 'No encryption info'}</pre>
                    </div>
                  );
                })()}

                {/* ZooKeeper */}
                {selected.zookeeper_connect_string && (
                  <div className="bg-navy-900 rounded-lg p-4">
                    <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">ZooKeeper</h3>
                    <p className="text-xs text-gray-400 font-mono break-all">{selected.zookeeper_connect_string}</p>
                  </div>
                )}

                {/* Logging */}
                {(() => {
                  const logging = safeJson(selected.logging_info);
                  if (!logging) return null;
                  return (
                    <div className="bg-navy-900 rounded-lg p-4">
                      <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Logging</h3>
                      <pre className="text-xs text-gray-400 overflow-x-auto">{JSON.stringify(logging, null, 2)}</pre>
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
