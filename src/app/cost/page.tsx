'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import { useAccountContext } from '@/contexts/AccountContext';
import StatsCard from '@/components/dashboard/StatsCard';
import LineChartCard from '@/components/charts/LineChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import PieChartCard from '@/components/charts/PieChartCard';
import DataTable from '@/components/table/DataTable';
import { DollarSign, Info, X, TrendingUp, Filter, Calendar } from 'lucide-react';
import { queries as costQ } from '@/lib/queries/cost';

// Period options / 기간 옵션
const PERIODS = [
  { label: 'This Month', value: '1m' },
  { label: '3 Months', value: '3m' },
  { label: '6 Months', value: '6m' },
  { label: '1 Year', value: '12m' },
];

export default function CostPage() {
  const { currentAccountId, isMultiAccount } = useAccountContext();
  const [data, setData] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [period, setPeriod] = useState('3m');
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [showServiceFilter, setShowServiceFilter] = useState(false);
  const [costAvailable, setCostAvailable] = useState<boolean | null>(null);
  const [costReason, setCostReason] = useState('');
  const [usingSnapshot, setUsingSnapshot] = useState(false);
  const [snapshotDate, setSnapshotDate] = useState('');

  const fetchData = useCallback(async (bustCache = false) => {
    setLoading(true);
    try {
      const res = await fetch(bustCache ? '/awsops/api/steampipe?bustCache=true' : '/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccountId,
          queries: { monthlyCost: costQ.monthlyCost, dailyCost: costQ.dailyCost, serviceCost: costQ.serviceCost },
        }),
      });
      const result = await res.json();
      const hasRows = result['monthlyCost']?.rows?.length > 0;
      if (hasRows) {
        setData(result);
        setUsingSnapshot(false);
        return;
      }
    } catch {}

    // Live query failed or empty — try cached snapshot
    await loadSnapshot();
    setLoading(false);
  }, [currentAccountId]);

  const loadSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/awsops/api/steampipe?action=cost-snapshot');
      if (!res.ok) return;
      const snap = await res.json();
      setData({
        monthlyCost: { rows: snap.monthlyCost || [] },
        dailyCost: { rows: snap.dailyCost || [] },
        serviceCost: { rows: snap.serviceCost || [] },
      });
      setUsingSnapshot(true);
      setSnapshotDate(snap.timestamp || snap.date || '');
    } catch {}
    setLoading(false);
  }, []);

  // Cost Explorer 가용성 먼저 확인 후 데이터 로딩
  useEffect(() => {
    fetch('/awsops/api/steampipe?action=cost-check')
      .then(r => r.json())
      .then(d => {
        setCostAvailable(d.available !== false);
        setCostReason(d.reason || '');
        if (d.available !== false) {
          fetchData();
        } else {
          // Cost Explorer unavailable — try loading snapshot
          loadSnapshot();
        }
      })
      .catch(() => {
        setCostAvailable(false);
        setCostReason('Failed to check Cost Explorer availability');
        loadSnapshot();
      });
  }, [fetchData, loadSnapshot]);

  const fetchServiceDetail = async (service: string) => {
    setDetailLoading(true);
    try {
      const sql = costQ.serviceDetail.replace('{service}', service);
      const res = await fetch('/awsops/api/steampipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: { detail: sql } }),
      });
      const result = await res.json();
      setSelected({ service, rows: result.detail?.rows || [] });
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const monthlyRows = get('monthlyCost');
  const dailyRows = get('dailyCost');

  const hasData = monthlyRows.length > 0 || dailyRows.length > 0;
  const hasError = data['monthlyCost']?.error || data['dailyCost']?.error;

  // Period filter — months to include / 기간 필터 — 포함할 월 수
  const monthsToShow = parseInt(period);

  // All unique services / 전체 서비스 목록
  const allServices = useMemo(() => {
    const svcs = new Set<string>();
    monthlyRows.forEach((r: any) => { if (r.service) svcs.add(String(r.service)); });
    return Array.from(svcs).sort();
  }, [monthlyRows]);

  // Filter monthly rows by period + service / 기간 + 서비스 필터 적용
  const filteredMonthly = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsToShow);
    return monthlyRows.filter((r: any) => {
      const date = new Date(r.period_start);
      const matchPeriod = date >= cutoff;
      const matchService = selectedServices.size === 0 || selectedServices.has(String(r.service));
      return matchPeriod && matchService;
    });
  }, [monthlyRows, monthsToShow, selectedServices]);

  const filteredDaily = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - monthsToShow);
    return dailyRows.filter((r: any) => {
      const date = new Date(r.period_start);
      const matchPeriod = date >= cutoff;
      const matchService = selectedServices.size === 0 || selectedServices.has(String(r.service));
      return matchPeriod && matchService;
    });
  }, [dailyRows, monthsToShow, selectedServices]);

  // Monthly totals / 월별 합계
  const monthlyTotals: Record<string, number> = {};
  filteredMonthly.forEach((r: any) => {
    const p = String(r.period_start || '').slice(0, 7);
    monthlyTotals[p] = (monthlyTotals[p] || 0) + (Number(r.cost) || 0);
  });
  const sortedMonths = Object.keys(monthlyTotals).sort();
  const thisMonth = sortedMonths.length > 0 ? monthlyTotals[sortedMonths[sortedMonths.length - 1]] || 0 : 0;
  const lastMonth = sortedMonths.length > 1 ? monthlyTotals[sortedMonths[sortedMonths.length - 2]] || 0 : 0;
  const momChange = lastMonth > 0 ? (((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1) : '0';

  // Projected month-end cost / 예상 월말 비용
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayOfMonth = today.getDate();
  const projectedCost = dayOfMonth > 0 ? (thisMonth / dayOfMonth) * daysInMonth : 0;

  // Daily totals / 일별 합계
  const dailyTotals: Record<string, number> = {};
  filteredDaily.forEach((r: any) => {
    const day = String(r.period_start || '').slice(0, 10);
    dailyTotals[day] = (dailyTotals[day] || 0) + (Number(r.cost) || 0);
  });
  const sortedDays = Object.keys(dailyTotals).sort();
  const dailyAvg = sortedDays.length > 0 ? sortedDays.reduce((sum, d) => sum + dailyTotals[d], 0) / sortedDays.length : 0;

  // Chart data / 차트 데이터
  const dailyLineData = sortedDays.slice(-30).map(day => ({
    name: day.slice(5),
    value: Math.round(dailyTotals[day] * 100) / 100,
  }));

  const monthlyLineData = sortedMonths.map(m => ({
    name: m,
    value: Math.round(monthlyTotals[m] * 100) / 100,
  }));

  // Service cost for current period / 현재 기간 서비스별 비용
  const serviceTotals: Record<string, { current: number; previous: number }> = {};
  const currentMonth = sortedMonths[sortedMonths.length - 1];
  const previousMonth = sortedMonths.length > 1 ? sortedMonths[sortedMonths.length - 2] : null;

  filteredMonthly.forEach((r: any) => {
    const svc = String(r.service || 'Unknown');
    const p = String(r.period_start || '').slice(0, 7);
    if (!serviceTotals[svc]) serviceTotals[svc] = { current: 0, previous: 0 };
    if (p === currentMonth) serviceTotals[svc].current += Number(r.cost) || 0;
    if (p === previousMonth) serviceTotals[svc].previous += Number(r.cost) || 0;
  });

  const serviceTableRows = Object.entries(serviceTotals)
    .map(([service, { current, previous }]) => {
      const change = previous > 0 ? ((current - previous) / previous * 100) : 0;
      const share = thisMonth > 0 ? (current / thisMonth * 100) : 0;
      return { service, current: Math.round(current * 100) / 100, previous: Math.round(previous * 100) / 100, change: Math.round(change * 10) / 10, share: Math.round(share * 10) / 10 };
    })
    .sort((a, b) => b.current - a.current);

  // Pie chart — top services / 파이 차트 — 상위 서비스
  const pieData = serviceTableRows.slice(0, 8).map(r => ({ name: r.service, value: r.current }));

  // Service filter toggle / 서비스 필터 토글
  const toggleService = (svc: string) => {
    setSelectedServices(prev => {
      const next = new Set(prev);
      if (next.has(svc)) next.delete(svc); else next.add(svc);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Cost Explorer" subtitle="AWS Billing & Cost Management" onRefresh={() => fetchData(true)} />

      {costAvailable === false && !usingSnapshot && (
        <div className="bg-navy-800 rounded-lg border border-accent-purple/30 p-8 text-center">
          <DollarSign size={48} className="text-accent-purple mx-auto mb-4 opacity-50" />
          <h2 className="text-xl font-bold text-white mb-2">Cost Explorer Unavailable</h2>
          <p className="text-sm text-gray-400 mb-1">
            {costReason || 'Cost data cannot be retrieved in this environment.'}
          </p>
          <p className="text-xs text-gray-500 mb-6">
            No cached cost snapshots available. Visit this page when Cost Explorer is accessible to build a local cache.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                setCostAvailable(null);
                fetch('/awsops/api/steampipe?action=cost-check&bustCache=true')
                  .then(r => r.json())
                  .then(d => {
                    setCostAvailable(d.available !== false);
                    setCostReason(d.reason || '');
                    if (d.available !== false) fetchData();
                  })
                  .catch(() => setCostAvailable(false));
              }}
              className="px-4 py-2 rounded-lg bg-accent-purple/20 text-accent-purple border border-accent-purple/40 hover:bg-accent-purple/30 transition-colors text-sm"
            >
              Re-check Availability
            </button>
            <a href="/awsops/inventory"
              className="px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40 hover:bg-accent-cyan/30 transition-colors text-sm"
            >
              View Resource Inventory
            </a>
          </div>
        </div>
      )}

      {usingSnapshot && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-accent-orange/10 border border-accent-orange/30">
          <Info size={18} className="text-accent-orange flex-shrink-0" />
          <div className="flex-1">
            <span className="text-sm text-accent-orange font-medium">Showing cached data</span>
            <span className="text-xs text-gray-400 ml-2">
              Last fetched: {snapshotDate ? new Date(snapshotDate).toLocaleString() : 'unknown'}
            </span>
          </div>
          <button
            onClick={() => {
              setCostAvailable(null);
              setUsingSnapshot(false);
              fetch('/awsops/api/steampipe?action=cost-check&bustCache=true')
                .then(r => r.json())
                .then(d => {
                  setCostAvailable(d.available !== false);
                  setCostReason(d.reason || '');
                  if (d.available !== false) fetchData();
                  else loadSnapshot();
                })
                .catch(() => { setCostAvailable(false); loadSnapshot(); });
            }}
            className="px-3 py-1 rounded-lg bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 transition-colors text-xs"
          >
            Retry Live
          </button>
        </div>
      )}

      {!loading && !hasData && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30">
          <Info size={20} className="text-accent-cyan flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-accent-cyan">Cost Explorer may not be enabled</p>
            <p className="text-xs text-gray-400 mt-0.5">Enable Cost Explorer in the AWS Billing console. Data may take 24h to appear.</p>
          </div>
        </div>
      )}

      {hasError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-accent-orange/10 border border-accent-orange/30">
          <Info size={20} className="text-accent-orange flex-shrink-0" />
          <p className="text-sm text-accent-orange">Could not fetch cost data. Ensure Cost Explorer is enabled.</p>
        </div>
      )}

      {(costAvailable !== false || usingSnapshot) && (<>
      {/* Period + Service Filter / 기간 + 서비스 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Calendar size={14} className="text-gray-500" />
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                period === p.value
                  ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                  : 'bg-navy-800 text-gray-400 border border-navy-600 hover:text-white'
              }`}>{p.label}</button>
          ))}
        </div>
        <button onClick={() => setShowServiceFilter(!showServiceFilter)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            showServiceFilter || selectedServices.size > 0
              ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
              : 'bg-navy-800 text-gray-400 border border-navy-600 hover:text-white'
          }`}>
          <Filter size={12} />
          Services {selectedServices.size > 0 && <span className="bg-accent-purple/30 px-1.5 py-0.5 rounded-full">{selectedServices.size}</span>}
        </button>
        {selectedServices.size > 0 && (
          <button onClick={() => setSelectedServices(new Set())} className="text-xs text-gray-500 hover:text-white">Clear</button>
        )}
      </div>

      {showServiceFilter && (
        <div className="bg-navy-800 border border-navy-600 rounded-lg p-4">
          <p className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-2">Filter by Service</p>
          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
            {allServices.map(svc => (
              <button key={svc} onClick={() => toggleService(svc)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                  selectedServices.has(svc)
                    ? 'bg-accent-purple/20 text-accent-purple border border-accent-purple/40'
                    : 'bg-navy-900 text-gray-500 border border-navy-700 hover:text-white'
                }`}>{svc}</button>
            ))}
          </div>
        </div>
      )}

      {/* Stats Cards / 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatsCard label="This Month" value={`$${thisMonth.toFixed(2)}`} icon={DollarSign} color="cyan" />
        <StatsCard label="Last Month" value={`$${lastMonth.toFixed(2)}`} icon={DollarSign} color="purple" />
        <StatsCard label="Projected" value={`$${projectedCost.toFixed(2)}`} icon={TrendingUp} color="orange"
          change={`Day ${dayOfMonth}/${daysInMonth}`} />
        <StatsCard label="Daily Avg" value={`$${dailyAvg.toFixed(2)}`} icon={DollarSign} color="green" />
        <StatsCard label="MoM Change" value={`${Number(momChange) > 0 ? '+' : ''}${momChange}%`} icon={DollarSign}
          color={Number(momChange) > 10 ? 'red' : Number(momChange) < 0 ? 'green' : 'orange'} />
        <StatsCard label="Services" value={Object.keys(serviceTotals).length} icon={DollarSign} color="pink"
          change={`${serviceTableRows.filter(s => s.change > 20).length} increasing >20%`} />
      </div>

      {/* Charts Row 1 / 차트 행 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineChartCard title="Daily Cost Trend (Last 30 Days)" data={dailyLineData} color="#00d4ff" />
        <LineChartCard title="Monthly Cost Trend" data={monthlyLineData} color="#a855f7" />
      </div>

      {/* Charts Row 2 / 차트 행 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PieChartCard title="Cost by Service (Top 8)" data={pieData} />
        <BarChartCard title="Top 10 Services" data={serviceTableRows.slice(0, 10).map(r => ({ name: r.service, value: r.current }))} color="#f59e0b" />
      </div>

      {/* Service Table / 서비스 테이블 */}
      <DataTable
        columns={[
          { key: 'service', label: 'Service' },
          { key: 'current', label: 'This Month', render: (v: number) => <span className="font-mono">${(v || 0).toFixed(2)}</span> },
          { key: 'previous', label: 'Last Month', render: (v: number) => <span className="font-mono text-gray-500">${(v || 0).toFixed(2)}</span> },
          { key: 'change', label: 'Change', render: (v: number) => (
            <span className={`font-mono text-xs ${v > 20 ? 'text-accent-red' : v > 0 ? 'text-accent-orange' : v < 0 ? 'text-accent-green' : 'text-gray-500'}`}>
              {v > 0 ? '+' : ''}{(v || 0).toFixed(1)}%
            </span>
          )},
          { key: 'share', label: 'Share', render: (v: number) => (
            <div className="flex items-center gap-2">
              <div className="w-16 h-2 bg-navy-900 rounded-full overflow-hidden">
                <div className="h-full bg-accent-cyan rounded-full" style={{ width: `${Math.min(v, 100)}%` }} />
              </div>
              <span className="font-mono text-xs text-gray-400">{(v || 0).toFixed(1)}%</span>
            </div>
          )},
        ]}
        data={loading && !serviceTableRows.length ? undefined : serviceTableRows}
        onRowClick={(row) => fetchServiceDetail(row.service)}
      />

      {/* Service Detail Panel / 서비스 상세 패널 */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">{selected?.service || 'Loading...'}</h2>
                <p className="text-sm text-gray-400">Monthly Cost Breakdown</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 space-y-4">{[1,2,3,4].map(i => <div key={i} className="h-12 skeleton rounded" />)}</div>
            ) : selected ? (
              <div className="p-6 space-y-6">
                <Section title="Cost Summary" icon={DollarSign}>
                  {isMultiAccount && (
                    <Row label="Account" value={currentAccountId === '__all__' ? 'All Accounts' : currentAccountId} />
                  )}
                  <Row label="Service" value={selected.service} />
                  <Row label="Total Cost" value={`$${selected.rows.reduce((s: number, r: any) => s + (Number(r.cost) || 0), 0).toFixed(2)}`} />
                  <Row label="Periods" value={`${selected.rows.length} months`} />
                </Section>

                {/* Monthly line chart in detail / 상세 월별 라인 차트 */}
                <LineChartCard title="Monthly Trend" color="#00d4ff"
                  data={selected.rows.slice().reverse().map((r: any) => ({
                    name: String(r.period_start || '').slice(0, 7),
                    value: Math.round((Number(r.cost) || 0) * 100) / 100,
                  }))} />

                <Section title="Monthly Breakdown" icon={TrendingUp}>
                  {selected.rows.length > 0 ? (
                    <div className="space-y-2">
                      {selected.rows.map((r: any, i: number) => {
                        const period2 = String(r.period_start || '').slice(0, 7);
                        const cost = Number(r.cost) || 0;
                        return (
                          <div key={i} className="flex items-center justify-between bg-navy-800 rounded p-2">
                            <span className="text-sm font-mono text-gray-300">{period2}</span>
                            <span className="text-sm font-mono text-white">${cost.toFixed(2)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p className="text-gray-500 text-sm">No cost data</p>}
                </Section>
              </div>
            ) : null}
          </div>
        </div>
      )}
      </>)}
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
