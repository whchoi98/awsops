'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
// StatusBadge only takes status prop / StatusBadge는 status만 받음
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { HardDrive, X, Shield, Server, Search, Camera } from 'lucide-react';
import { queries as ebsQ } from '@/lib/queries/ebs';
import { useAccountContext } from '@/contexts/AccountContext';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

interface Attachment {
  InstanceId?: string;
  Device?: string;
  State?: string;
  DeleteOnTermination?: boolean;
}

export default function EBSPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [instanceMap, setInstanceMap] = useState<Record<string, any>>({});
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [tab, setTab] = useState<'volumes' | 'snapshots'>('volumes');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            summary: ebsQ.summary,
            typeDistribution: ebsQ.typeDistribution,
            stateDistribution: ebsQ.stateDistribution,
            encryptionDistribution: ebsQ.encryptionDistribution,
            list: ebsQ.list,
            snapshotSummary: ebsQ.snapshotSummary,
            snapshotList: ebsQ.snapshotList,
          },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Parse attachments JSON / 어태치먼트 JSON 파싱
  const parseAttachments = (raw: string | null | undefined): Attachment[] => {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch { return []; }
  };

  // Fetch volume detail + attached instance info / 볼륨 상세 + 인스턴스 정보
  const fetchDetail = async (volumeId: string) => {
    setDetailLoading(true);
    setSnapshots([]);
    setInstanceMap({});
    try {
      const detailSql = ebsQ.detail.replace(/{volume_id}/g, volumeId);
      const snapSql = ebsQ.volumeSnapshots.replace(/{volume_id}/g, volumeId);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: detailSql, snapshots: snapSql } }),
      });
      const result = await res.json();
      const detail = result.detail?.rows?.[0];
      if (detail) {
        setSelected(detail);
        setSnapshots(result.snapshots?.rows || []);

        // Fetch attached instance details / 어태치된 인스턴스 상세 조회
        const attachments = parseAttachments(detail.attachments as string);
        const instanceIds = attachments.map(a => a.InstanceId).filter(Boolean) as string[];
        if (instanceIds.length > 0) {
          const instQueries: Record<string, string> = {};
          instanceIds.forEach(id => { instQueries[id] = ebsQ.attachedInstance.replace('{instance_id}', id); });
          const instRes = await fetch('/awsops/api/steampipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ queries: instQueries }),
          });
          const instResult = await instRes.json();
          const map: Record<string, any> = {};
          Object.entries(instResult).forEach(([id, val]: [string, any]) => {
            if (val?.rows?.[0]) map[id] = val.rows[0];
          });
          setInstanceMap(map);
        }
      }
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};
  const sum = getFirst('summary') as any;
  const snapSum = getFirst('snapshotSummary') as any;

  // Filter volumes by search / 검색 필터
  const volumes = get('list').filter((r: any) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      String(r.volume_id || '').toLowerCase().includes(s) ||
      String(r.name || '').toLowerCase().includes(s) ||
      String(r.volume_type || '').toLowerCase().includes(s) ||
      String(r.state || '').toLowerCase().includes(s) ||
      String(r.attachments || '').toLowerCase().includes(s)
    );
  });

  const snapshotList = get('snapshotList').filter((r: any) => {
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      String(r.snapshot_id || '').toLowerCase().includes(s) ||
      String(r.volume_id || '').toLowerCase().includes(s) ||
      String(r.name || '').toLowerCase().includes(s)
    );
  });

  const encPct = Number(sum?.total_volumes) > 0
    ? ((Number(sum?.encrypted_count) / Number(sum?.total_volumes)) * 100).toFixed(0)
    : '0';

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="EBS Volumes & Snapshots" subtitle="Elastic Block Store" onRefresh={() => fetchData(true)} />

      {/* Stats Cards / 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="Total Volumes" value={Number(sum?.total_volumes) || 0} icon={HardDrive} color="cyan"
          change={`${Number(sum?.in_use) || 0} in-use · ${Number(sum?.available) || 0} available`} />
        <StatsCard label="Total Size" value={`${Number(sum?.total_size_gb) || 0} GB`} icon={HardDrive} color="purple"
          change={`${Number(sum?.in_use_size_gb) || 0} GB used · ${Number(sum?.available_size_gb) || 0} GB idle`} />
        <StatsCard label="Encrypted" value={`${encPct}%`} icon={Shield}
          color={Number(encPct) >= 100 ? 'green' : Number(encPct) >= 80 ? 'orange' : 'red'}
          change={`${Number(sum?.encrypted_count) || 0} enc · ${Number(sum?.unencrypted_count) || 0} unenc`} />
        <StatsCard label="Unencrypted" value={Number(sum?.unencrypted_count) || 0} icon={Shield}
          color={Number(sum?.unencrypted_count) > 0 ? 'red' : 'green'} highlight={Number(sum?.unencrypted_count) > 0}
          change={Number(sum?.unencrypted_count) > 0 ? 'Action required' : 'All encrypted'} />
        <StatsCard label="Snapshots" value={Number(snapSum?.total_snapshots) || 0} icon={Camera} color="orange"
          change={`${Number(snapSum?.encrypted_snapshots) || 0} encrypted · ${Number(snapSum?.total_snapshot_size_gb) || 0} GB`} />
        <StatsCard label="Idle Volumes" value={Number(sum?.available) || 0} icon={HardDrive}
          color={Number(sum?.available) > 0 ? 'orange' : 'green'}
          change={Number(sum?.available) > 0 ? `${Number(sum?.available_size_gb) || 0} GB wasted` : 'No idle volumes'} />
      </div>

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PieChartCard title="Volume Type" data={get('typeDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
        <PieChartCard title="State" data={get('stateDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
        <PieChartCard title="Encryption" data={get('encryptionDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) }))} />
      </div>

      {/* Tab + Search / 탭 + 검색 */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 bg-navy-900 rounded-lg p-0.5">
          {(['volumes', 'snapshots'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === t ? 'bg-navy-600 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}>
              {t === 'volumes' ? `Volumes (${Number(sum?.total_volumes) || 0})` : `Snapshots (${Number(snapSum?.total_snapshots) || 0})`}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text" placeholder={tab === 'volumes' ? 'Search volumes...' : 'Search snapshots...'}
            value={searchText} onChange={e => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-600 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-accent-cyan/50"
          />
        </div>
      </div>

      {/* Volumes Table / 볼륨 테이블 */}
      {tab === 'volumes' && (
        <DataTable
          columns={[
            { key: 'name', label: 'Name', render: (v: any) => <span className="text-white">{v || '-'}</span> },
            { key: 'volume_id', label: 'Volume ID', render: (v: any) => <span className="font-mono text-xs text-accent-cyan">{v}</span> },
            { key: 'volume_type', label: 'Type' },
            { key: 'size', label: 'Size (GB)', render: (v: any) => <span className="font-mono">{v}</span> },
            { key: 'state', label: 'State', render: (v: any) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                v === 'in-use' ? 'bg-accent-green/10 text-accent-green' : v === 'available' ? 'bg-accent-orange/10 text-accent-orange' : 'bg-accent-red/10 text-accent-red'
              }`}><span className={`w-1.5 h-1.5 rounded-full ${
                v === 'in-use' ? 'bg-accent-green' : v === 'available' ? 'bg-accent-orange' : 'bg-accent-red'
              }`} />{v}</span> },
            { key: 'encrypted', label: 'Encrypted', render: (v: any) => (
              <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-accent-red'}`}>
                {v ? 'Yes' : 'No'}
              </span>
            )},
            { key: 'attachments', label: 'Attached To', render: (v: any) => {
              const atts = parseAttachments(v);
              if (atts.length === 0) return <span className="text-gray-600 text-xs">Unattached</span>;
              return (
                <div className="space-y-0.5">
                  {atts.map((a, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-mono text-accent-cyan">{a.InstanceId}</span>
                      <span className="text-gray-500 ml-1">{a.Device}</span>
                    </div>
                  ))}
                </div>
              );
            }},
            { key: 'iops', label: 'IOPS', render: (v: any) => <span className="font-mono text-xs">{v || '-'}</span> },
            { key: 'availability_zone', label: 'AZ' },
          ]}
          data={loading ? undefined : volumes as any[]}
          onRowClick={(row: any) => fetchDetail(row.volume_id)}
        />
      )}

      {/* Snapshots Table / 스냅샷 테이블 */}
      {tab === 'snapshots' && (
        <DataTable
          columns={[
            { key: 'name', label: 'Name', render: (v: any) => <span className="text-white">{v || '-'}</span> },
            { key: 'snapshot_id', label: 'Snapshot ID', render: (v: any) => <span className="font-mono text-xs text-accent-cyan">{v}</span> },
            { key: 'volume_id', label: 'Volume ID', render: (v: any) => <span className="font-mono text-xs">{v}</span> },
            { key: 'volume_size', label: 'Size (GB)', render: (v: any) => <span className="font-mono">{v}</span> },
            { key: 'state', label: 'State', render: (v: any) => <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                v === 'completed' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-orange/10 text-accent-orange'
              }`}><span className={`w-1.5 h-1.5 rounded-full ${
                v === 'completed' ? 'bg-accent-green' : 'bg-accent-orange'
              }`} />{v}</span> },
            { key: 'encrypted', label: 'Encrypted', render: (v: any) => (
              <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-accent-red'}`}>{v ? 'Yes' : 'No'}</span>
            )},
            { key: 'start_time', label: 'Created', render: (v: any) => v ? new Date(v).toLocaleDateString() : '-' },
            { key: 'description', label: 'Description', render: (v: any) => (
              <span className="text-xs text-gray-400 truncate max-w-[200px] block">{v || '-'}</span>
            )},
          ]}
          data={loading ? undefined : snapshotList as any[]}
        />
      )}

      {/* Detail Panel / 상세 패널 */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="w-[520px] bg-navy-800 h-full overflow-y-auto border-l border-navy-600 p-6 space-y-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Volume Detail</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white"><X size={20} /></button>
            </div>

            {detailLoading ? (
              <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 bg-navy-700 rounded animate-pulse" />
              ))}</div>
            ) : (
              <>
                {/* Basic Info / 기본 정보 */}
                <div className="bg-navy-900 rounded-lg p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-2">Volume Info</h3>
                  {selected.account_id && isMultiAccount && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Account</span>
                      <span className="text-gray-200 font-mono text-xs">{selected.account_id}</span>
                    </div>
                  )}
                  {[
                    ['Volume ID', selected.volume_id],
                    ['Name', (() => { try { const t = JSON.parse(selected.tags || '{}'); return t.Name || '-'; } catch { return '-'; } })()],
                    ['Type', selected.volume_type],
                    ['Size', `${selected.size} GB`],
                    ['State', selected.state],
                    ['IOPS', selected.iops || '-'],
                    ['Throughput', selected.throughput ? `${selected.throughput} MB/s` : '-'],
                    ['AZ', selected.availability_zone],
                    ['Multi-Attach', selected.multi_attach_enabled ? 'Yes' : 'No'],
                    ['Created', selected.create_time ? new Date(selected.create_time).toLocaleString() : '-'],
                    ['Source Snapshot', selected.snapshot_id || '-'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-200 font-mono text-xs">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Encryption / 암호화 상태 */}
                <div className={`rounded-lg p-4 border ${selected.encrypted ? 'bg-accent-green/5 border-accent-green/30' : 'bg-accent-red/5 border-accent-red/30'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Shield size={16} className={selected.encrypted ? 'text-accent-green' : 'text-accent-red'} />
                    <h3 className="text-sm font-semibold text-white">
                      {selected.encrypted ? 'Encrypted' : 'Not Encrypted'}
                    </h3>
                  </div>
                  {selected.encrypted ? (
                    <p className="text-xs text-gray-400">
                      KMS Key: <span className="font-mono text-accent-green">{selected.kms_key_id || 'AWS managed key'}</span>
                    </p>
                  ) : (
                    <p className="text-xs text-accent-red">
                      This volume is not encrypted. Consider creating an encrypted copy.
                    </p>
                  )}
                </div>

                {/* Attached Resources / 연결된 리소스 */}
                <div className="bg-navy-900 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-3">
                    Attached Resources
                  </h3>
                  {(() => {
                    const attachments = parseAttachments(selected.attachments as string);
                    if (attachments.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <HardDrive size={24} className="text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">Not attached to any instance</p>
                          <p className="text-xs text-accent-orange mt-1">Idle volume — consider deleting to save costs</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {attachments.map((att, i) => {
                          const inst = instanceMap[att.InstanceId || ''];
                          return (
                            <div key={i} className="bg-navy-800 rounded-lg p-3 border border-navy-600">
                              <div className="flex items-center gap-2 mb-2">
                                <Server size={14} className="text-accent-cyan" />
                                <span className="font-mono text-sm text-accent-cyan">{att.InstanceId}</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1 text-xs">
                                <div><span className="text-gray-500">Device: </span><span className="text-gray-300 font-mono">{att.Device}</span></div>
                                <div><span className="text-gray-500">Attach State: </span><span className="text-gray-300">{att.State}</span></div>
                                <div><span className="text-gray-500">Delete on Term: </span>
                                  <span className={att.DeleteOnTermination ? 'text-accent-orange' : 'text-gray-300'}>
                                    {att.DeleteOnTermination ? 'Yes' : 'No'}
                                  </span>
                                </div>
                                {inst && (
                                  <>
                                    <div><span className="text-gray-500">Instance Name: </span><span className="text-white">{inst.instance_name || '-'}</span></div>
                                    <div><span className="text-gray-500">Type: </span><span className="text-gray-300 font-mono">{inst.instance_type}</span></div>
                                    <div><span className="text-gray-500">State: </span>
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                        inst.instance_state === 'running' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-orange/10 text-accent-orange'
                                      }`}>{inst.instance_state}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Volume Snapshots / 볼륨 스냅샷 */}
                <div className="bg-navy-900 rounded-lg p-4">
                  <h3 className="text-xs font-semibold text-accent-cyan uppercase tracking-wider mb-3">
                    Snapshots ({snapshots.length})
                  </h3>
                  {snapshots.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-3">No snapshots for this volume</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {snapshots.map((snap: any) => (
                        <div key={snap.snapshot_id} className="flex items-center justify-between bg-navy-800 rounded p-2 text-xs">
                          <div>
                            <span className="font-mono text-accent-cyan">{snap.snapshot_id}</span>
                            <span className="text-gray-500 ml-2">{snap.volume_size} GB</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={snap.encrypted ? 'text-accent-green' : 'text-accent-red'}>
                              {snap.encrypted ? 'Enc' : 'Unenc'}
                            </span>
                            <span className="text-gray-500">{snap.start_time ? new Date(snap.start_time).toLocaleDateString() : '-'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
