'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import StatusBadge from '@/components/dashboard/StatusBadge';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { Bell, X, Settings } from 'lucide-react';
import { queries as cwQ } from '@/lib/queries/cloudwatch';

interface PageData {
  [key: string]: { rows: Record<string, unknown>[]; error?: string };
}

export default function CloudWatchPage() {
  const [data, setData] = useState<PageData>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: {
            summary: cwQ.summary,
            alarmList: cwQ.alarmList,
            namespaceDistribution: cwQ.namespaceDistribution,
          },
        }),
      });
      const result = await res.json();
      setData(result);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fetchDetail = async (name: string) => {
    setDetailLoading(true);
    try {
      const sql = cwQ.detail.replace('{name}', name);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      if (result.detail?.rows?.[0]) {
        setSelected(result.detail.rows[0]);
      }
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const getFirst = (key: string) => get(key)[0] || {};

  const summary = getFirst('summary') as Record<string, unknown>;
  const alarmList = get('alarmList');
  const namespaceData = get('namespaceDistribution').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));

  const okCount = Number(summary?.ok_state) || 0;
  const alarmCount = Number(summary?.in_alarm) || 0;
  const insufficientCount = Number(summary?.insufficient_data) || 0;

  const alarmStatePie = [
    { name: 'OK', value: okCount, color: '#00ff88' },
    { name: 'ALARM', value: alarmCount, color: '#ef4444' },
    { name: 'INSUFFICIENT_DATA', value: insufficientCount, color: '#6b7280' },
  ].filter(d => d.value > 0);

  const parseArray = (val: any) => {
    if (!val) return [];
    if (typeof val === 'string') try { return JSON.parse(val); } catch { return []; }
    return Array.isArray(val) ? val : [];
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="CloudWatch" subtitle="Monitoring & Alarms" onRefresh={() => fetchData(true)} />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatsCard label="OK" value={okCount} icon={Bell} color="green" />
        <StatsCard label="ALARM" value={alarmCount} icon={Bell} color="red"
          change={alarmCount > 0 ? 'Active alarms!' : undefined} />
        <StatsCard label="INSUFFICIENT DATA" value={insufficientCount} icon={Bell} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Alarm State Distribution" data={alarmStatePie} />
        <BarChartCard title="Alarms by Namespace" data={namespaceData.slice(0, 10)} color="#f59e0b" />
      </div>

      {loading && !alarmList.length && (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      )}

      <DataTable
        columns={[
          { key: 'name', label: 'Alarm Name' },
          { key: 'namespace', label: 'Namespace' },
          { key: 'metric_name', label: 'Metric' },
          {
            key: 'state_value',
            label: 'State',
            render: (value: string) => <StatusBadge status={value || 'unknown'} />,
          },
          {
            key: 'state_reason',
            label: 'Reason',
            render: (v: string) => (
              <span className="text-xs text-gray-400 max-w-xs truncate block" title={v}>
                {v ? (v.length > 80 ? v.slice(0, 80) + '...' : v) : '--'}
              </span>
            ),
          },
          {
            key: 'actions_enabled',
            label: 'Actions',
            render: (v: boolean) => (
              <span className={`text-xs ${v ? 'text-accent-green' : 'text-gray-500'}`}>
                {v ? 'Enabled' : 'Disabled'}
              </span>
            ),
          },
        ]}
        data={loading && !alarmList.length ? undefined : alarmList}
        onRowClick={(row) => fetchDetail(row.name)}
      />

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
                  {selected?.name || 'Loading...'}
                </h2>
                <p className="text-sm text-gray-400">{selected?.namespace} / {selected?.metric_name}</p>
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
                  <StatusBadge status={selected.state_value || 'unknown'} />
                </div>

                <Section title="Alarm" icon={Bell}>
                  <Row label="Name" value={selected.name} />
                  <Row label="ARN" value={selected.arn} />
                  <Row label="State" value={selected.state_value} />
                  <Row label="State Reason" value={selected.state_reason} />
                  <Row label="Namespace" value={selected.namespace} />
                  <Row label="Metric" value={selected.metric_name} />
                </Section>

                <Section title="Configuration" icon={Settings}>
                  <Row label="Comparison" value={selected.comparison_operator} />
                  <Row label="Threshold" value={selected.threshold} />
                  <Row label="Period" value={selected.period ? `${selected.period}s` : '--'} />
                  <Row label="Eval Periods" value={selected.evaluation_periods} />
                  <Row label="Statistic" value={selected.statistic} />
                  <Row label="Actions Enabled" value={selected.actions_enabled ? 'Yes' : 'No'} />
                </Section>

                <Section title="Actions" icon={Bell}>
                  {(() => {
                    const alarmActions = parseArray(selected.alarm_actions);
                    const okActions = parseArray(selected.ok_actions);
                    const insuffActions = parseArray(selected.insufficient_data_actions);
                    return (
                      <>
                        <div>
                          <p className="text-xs text-gray-500 uppercase mb-1">Alarm Actions ({alarmActions.length})</p>
                          {alarmActions.length > 0 ? alarmActions.map((a: string, i: number) => (
                            <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-navy-600 mb-1">{a}</div>
                          )) : <p className="text-gray-500 text-sm pl-2">None</p>}
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 uppercase mb-1">OK Actions ({okActions.length})</p>
                          {okActions.length > 0 ? okActions.map((a: string, i: number) => (
                            <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-navy-600 mb-1">{a}</div>
                          )) : <p className="text-gray-500 text-sm pl-2">None</p>}
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 uppercase mb-1">Insufficient Data Actions ({insuffActions.length})</p>
                          {insuffActions.length > 0 ? insuffActions.map((a: string, i: number) => (
                            <div key={i} className="text-xs font-mono text-gray-300 pl-2 border-l border-navy-600 mb-1">{a}</div>
                          )) : <p className="text-gray-500 text-sm pl-2">None</p>}
                        </div>
                      </>
                    );
                  })()}
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
