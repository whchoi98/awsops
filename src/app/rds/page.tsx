'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Database, X, HardDrive, Network, Shield, Tag, Activity, Search } from 'lucide-react';
import { LineChart, Line, Tooltip, XAxis } from 'recharts';
import SafeResponsiveContainer from '@/components/charts/SafeResponsiveContainer';
import { queries as rdsQ } from '@/lib/queries/rds';
import { useAccountContext } from '@/contexts/AccountContext';
import AccountBadge from '@/components/dashboard/AccountBadge';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function RDSPage() {
  const { t } = useLanguage();
  const { currentAccountId, isMultiAccount } = useAccountContext();

  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sgDetails, setSgDetails] = useState<any[]>([]);
  const [rdsMetrics, setRdsMetrics] = useState<Record<string, any[]>>({});
  const [searchText, setSearchText] = useState('');
  const [instanceMetrics, setInstanceMetrics] = useState<Record<string, Record<string, number>>>({});

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: {
            summary: rdsQ.summary,
            engineDistribution: rdsQ.engineDistribution,
            list: rdsQ.list,
          },
        }),
      });
      const result = await res.json();
      setData(result);

      // CloudWatch 메트릭 조회 / Fetch CloudWatch metrics for all instances
      const instanceList = result.list?.rows || [];
      if (instanceList.length > 0) {
        const ids = instanceList.map((r: any) => r.db_instance_identifier).filter(Boolean);
        try {
          const mRes = await fetch(`/awsops/api/rds?instanceIds=${encodeURIComponent(ids.join(','))}&accountId=${currentAccountId}`);
          const mData = await mRes.json();
          setInstanceMetrics(mData.metrics || {});
        } catch {}
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (id: string) => {
    setDetailLoading(true);
    setSgDetails([]);
    setRdsMetrics({});
    try {
      const detailSql = rdsQ.detail.replace(/{id}/g, id);
      const metricSql = rdsQ.rdsMetrics.replace(/{id}/g, id);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: currentAccountId, queries: { detail: detailSql, metrics: metricSql } }),
      });
      const result = await res.json();
      const detail = result.detail?.rows?.[0];
      if (detail) {
        setSelected(detail);
        // Fetch SG details for each SG / 각 SG 상세 조회
        try {
          const sgs = JSON.parse(detail.security_groups || '[]');
          const sgIds = sgs.map((sg: any) => sg.VpcSecurityGroupId || sg.vpc_security_group_id).filter(Boolean);
          if (sgIds.length > 0) {
            const sgQueries: Record<string, string> = {};
            sgIds.forEach((sgId: string) => { sgQueries[sgId] = rdsQ.sgInbound.replace('{sg_id}', sgId); });
            const sgRes = await fetch('/awsops/api/steampipe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId: currentAccountId, queries: sgQueries }),
            });
            const sgResult = await sgRes.json();
            const sgList: any[] = [];
            Object.entries(sgResult).forEach(([, val]: [string, any]) => {
              if (val?.rows?.[0]) sgList.push(val.rows[0]);
            });
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
      setRdsMetrics(grouped);
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as Record<string, unknown>;
  const engineData = get('engineDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));
  const list = get('list');

  const totalInstances = Number(summary?.total_instances) || 0;
  const multiAz = Number(summary?.multi_az_instances) || 0;
  const uniqueEngines = engineData.length;

  const storageData = list
    .filter((r: Record<string, unknown>) => r.allocated_storage)
    .map((r: Record<string, unknown>) => ({
      name: String(r.db_instance_identifier || '').slice(0, 20),
      value: Number(r.allocated_storage) || 0,
    }))
    .slice(0, 10);

  const filteredList = searchText
    ? list.filter((r: any) => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(searchText.toLowerCase())))
    : list;

  const totalStorage = list.reduce(
    (sum: number, r: Record<string, unknown>) => sum + (Number(r.allocated_storage) || 0),
    0
  );

  const parseTags = (tags: any) => {
    if (!tags) return {};
    if (typeof tags === 'string') try { return JSON.parse(tags); } catch { return {}; }
    return typeof tags === 'object' ? tags : {};
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title={t('rds.title')} subtitle={t('rds.subtitle')} onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label={t('rds.totalInstances')} value={totalInstances} icon={Database} color="cyan" />
        <StatsCard label={t('rds.totalStorage')} value={totalStorage} icon={Database} color="purple" />
        <StatsCard label={t('rds.multiAzCount')} value={multiAz} icon={Database} color="green" />
        <StatsCard label={t('rds.engine')} value={uniqueEngines} icon={Database} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Engine Distribution" data={engineData} />
        <BarChartCard title="Storage by Instance (GB)" data={storageData} color="#a855f7" />
      </div>

      {/* Search / 검색 */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
          <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search identifier, engine..."
            className="bg-navy-800 border border-navy-600 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder-gray-600 w-56 focus:ring-accent-cyan focus:border-accent-cyan focus:outline-none" />
        </div>
        {searchText && <button onClick={() => setSearchText('')} className="text-xs text-gray-500 hover:text-white">Clear</button>}
        <span className="text-xs text-gray-500 ml-auto">{filteredList.length} / {list.length} instances</span>
      </div>

      <DataTable
        columns={[
          { key: 'db_instance_identifier', label: t('rds.dbIdentifier') },
          { key: 'engine', label: t('rds.engine') },
          { key: 'engine_version', label: t('rds.engineVersion') },
          { key: 'db_instance_class', label: t('rds.dbClass') },
          {
            key: 'status',
            label: t('common.status'),
            render: (value: string) => <StatusBadge status={value || 'unknown'} />,
          },
          { key: 'allocated_storage', label: t('rds.storage') },
          {
            key: 'multi_az',
            label: t('rds.multiAz'),
            render: (v: boolean) => (
              <span className={`text-xs font-medium ${v ? 'text-accent-green' : 'text-gray-500'}`}>
                {v ? 'Yes' : 'No'}
              </span>
            ),
          },
          { key: 'region', label: t('common.region') },
        ]}
        data={loading && !filteredList.length ? undefined : filteredList}
        onRowClick={(row) => fetchDetail(row.db_instance_identifier)}
      />

      {/* Instance Metrics Table / 인스턴스 메트릭 테이블 */}
      {!loading && filteredList.length > 0 && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Database size={16} className="text-accent-cyan" />
            {t('rds.metrics')}
            <span className="text-xs text-gray-500 font-normal ml-1">({filteredList.length} instances · last 1h)</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-navy-700">
                  {[...(isMultiAccount ? ['Account'] : []), 'Identifier', 'Engine', 'Class', 'Status', 'CPU', 'Free Memory', 'Connections', 'Read IOPS', 'Write IOPS', 'Net In', 'Net Out', 'Free Storage'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-mono font-semibold uppercase tracking-wider text-accent-cyan">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredList.map((inst: any) => {
                  const m = instanceMetrics[inst.db_instance_identifier] || {};
                  const cpu = m.cpu || 0;
                  const freeMem = m.mem || 0;
                  const conn = m.conn || 0;
                  const riops = m.riops || 0;
                  const wiops = m.wiops || 0;
                  const netRx = m.net_rx || 0;
                  const netTx = m.net_tx || 0;
                  const freeStorage = m.storage || 0;
                  return (
                    <tr key={inst.db_instance_identifier} className="border-b border-navy-600 hover:bg-navy-700 transition-colors cursor-pointer"
                      onClick={() => fetchDetail(inst.db_instance_identifier)}>
                      {isMultiAccount && (
                        <td className="px-3 py-2 text-sm">
                          {inst.account_id ? <AccountBadge accountId={inst.account_id} /> : '-'}
                        </td>
                      )}
                      <td className="px-3 py-2 text-sm text-white">{inst.db_instance_identifier}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-cyan/10 text-accent-cyan">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan" />{inst.engine}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs font-mono text-accent-green">{inst.db_instance_class}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          inst.status === 'available' ? 'bg-accent-green/10 text-accent-green' : 'bg-accent-orange/10 text-accent-orange'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${inst.status === 'available' ? 'bg-accent-green' : 'bg-accent-orange'}`} />
                          {inst.status}
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
                      {/* Free Memory */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {freeMem > 0 ? `${(freeMem / (1024 * 1024 * 1024)).toFixed(2)} GB` : '-'}
                      </td>
                      {/* Connections */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {conn > 0 ? Math.round(conn).toLocaleString() : '-'}
                      </td>
                      {/* Read IOPS */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {riops > 0 ? riops.toFixed(1) : '-'}
                      </td>
                      {/* Write IOPS */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {wiops > 0 ? wiops.toFixed(1) : '-'}
                      </td>
                      {/* Net In */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {netRx > 0 ? `${(netRx / 1024).toFixed(1)} KB/s` : '-'}
                      </td>
                      {/* Net Out */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {netTx > 0 ? `${(netTx / 1024).toFixed(1)} KB/s` : '-'}
                      </td>
                      {/* Free Storage */}
                      <td className="px-3 py-2 text-xs font-mono text-gray-300">
                        {freeStorage > 0 ? `${(freeStorage / (1024 * 1024 * 1024)).toFixed(1)} GB` : '-'}
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
                  {selected?.db_instance_identifier || 'Loading...'}
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
                  <StatusBadge status={selected.status || 'unknown'} />
                  <span className="text-sm text-gray-400 font-mono">{selected.class}</span>
                </div>

                <Section title="Instance" icon={Database}>
                  {selected.account_id && isMultiAccount && (
                    <Row label="Account" value={selected.account_id} />
                  )}
                  <Row label="Identifier" value={selected.db_instance_identifier} />
                  <Row label="Engine" value={selected.engine} />
                  <Row label="Version" value={selected.engine_version} />
                  <Row label="Class" value={selected.class} />
                  <Row label="Status" value={selected.status} />
                  <Row label="Multi-AZ" value={selected.multi_az ? 'Yes' : 'No'} />
                  <Row label="Publicly Accessible" value={selected.publicly_accessible ? 'Yes' : 'No'} />
                  <Row label="ARN" value={selected.arn} />
                </Section>

                <Section title="Storage" icon={HardDrive}>
                  <Row label="Allocated Storage" value={`${selected.allocated_storage} GB`} />
                  <Row label="Storage Type" value={selected.storage_type} />
                  <Row label="Encrypted" value={selected.storage_encrypted ? 'Yes' : 'No'} />
                  <Row label="KMS Key ID" value={selected.kms_key_id} />
                </Section>

                <Section title="Network" icon={Network}>
                  <Row label="VPC ID" value={selected.vpc_id} />
                  <Row label="Subnet Group" value={selected.db_subnet_group_name} />
                  <Row label="Availability Zone" value={selected.availability_zone} />
                  <Row label="Endpoint" value={selected.endpoint_address} />
                  <Row label="Port" value={selected.endpoint_port} />
                </Section>

                <Section title="Backup" icon={Shield}>
                  <Row label="Retention Period" value={selected.backup_retention_period ? `${selected.backup_retention_period} days` : '--'} />
                  <Row label="Backup Window" value={selected.preferred_backup_window} />
                  <Row label="Latest Restorable" value={selected.latest_restorable_time ? new Date(selected.latest_restorable_time).toLocaleString() : '--'} />
                </Section>

                {/* Security Groups with Inbound Rules / SG + 인바운드 규칙 */}
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
                                    {(r.IpRanges || []).map((ip: any, j: number) => (
                                      <span key={j} className="text-gray-300">{ip.CidrIp}{ip.Description ? ` (${ip.Description})` : ''}</span>
                                    ))}
                                    {(r.UserIdGroupPairs || []).map((g: any, j: number) => (
                                      <span key={`g${j}`} className="text-accent-purple">{g.GroupId}{g.Description ? ` (${g.Description})` : ''}</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            ) : <p className="text-gray-600 text-xs">No inbound rules</p>}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">{detailLoading ? 'Loading...' : 'No security groups'}</p>
                  )}
                </Section>

                {/* Configuration extras / 추가 설정 */}
                <Section title="Features" icon={Database}>
                  <Row label="Deletion Protection" value={selected.deletion_protection ? 'Yes' : 'No'} />
                  <Row label="IAM Auth" value={selected.iam_database_authentication_enabled ? 'Enabled' : 'Disabled'} />
                  <Row label="Performance Insights" value={selected.performance_insights_enabled ? 'Enabled' : 'Disabled'} />
                  <Row label="Auto Minor Upgrade" value={selected.auto_minor_version_upgrade ? 'Yes' : 'No'} />
                  <Row label="Copy Tags to Snapshot" value={selected.copy_tags_to_snapshot ? 'Yes' : 'No'} />
                </Section>

                {/* CloudWatch Metrics / CloudWatch 메트릭 */}
                {Object.keys(rdsMetrics).length > 0 && (
                  <Section title="Metrics (Last 1h)" icon={Activity}>
                    <div className="space-y-3">
                      {Object.entries(rdsMetrics).map(([name, points]) => {
                        const sorted = [...points].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
                        const latest = points[0];
                        const chartData = sorted.map(p => ({
                          name: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          value: Math.round((Number(p.average) || 0) * 100) / 100,
                        }));
                        const formatVal = (v: number) => {
                          if (name === 'FreeableMemory' || name === 'FreeStorageSpace') return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                          if (name === 'CPUUtilization') return `${v.toFixed(1)}%`;
                          return v.toFixed(0);
                        };
                        return (
                          <div key={name} className="bg-navy-800 rounded p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-mono text-accent-cyan">{name}</span>
                              <span className="text-xs font-mono text-white">{formatVal(Number(latest?.average) || 0)}</span>
                            </div>
                            {chartData.length > 2 ? (
                              <div className="h-20">
                                <SafeResponsiveContainer>
                                  <LineChart data={chartData}>
                                    <XAxis dataKey="name" hide />
                                    <Tooltip contentStyle={{ background: '#0f1629', border: '1px solid #1a2540', borderRadius: 8, fontSize: 11 }} labelStyle={{ color: '#6b7280' }} />
                                    <Line type="monotone" dataKey="value" stroke={name === 'CPUUtilization' ? '#ef4444' : '#00d4ff'} strokeWidth={1.5} dot={false} />
                                  </LineChart>
                                </SafeResponsiveContainer>
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
