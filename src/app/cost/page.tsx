'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import LineChartCard from '@/components/charts/LineChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import DataTable from '@/components/table/DataTable';
import { DollarSign, Info, X, TrendingUp } from 'lucide-react';
import { queries as costQ } from '@/lib/queries/cost';

export default function CostPage() {
  const [data, setData] = useState<any>({});
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
          queries: { monthlyCost: costQ.monthlyCost, dailyCost: costQ.dailyCost, serviceCost: costQ.serviceCost },
        }),
      });
      setData(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      const rows = result.detail?.rows || [];
      setSelected({ service, rows });
    } catch {} finally { setDetailLoading(false); }
  };

  const get = (key: string) => data[key]?.rows || [];
  const monthlyRows = get('monthlyCost');
  const dailyRows = get('dailyCost');
  const serviceCostData = get('serviceCost').map((r: any) => ({ name: String(r.name), value: Number(r.value) || 0 }));

  const hasData = monthlyRows.length > 0 || dailyRows.length > 0;
  const hasError = data['monthlyCost']?.error || data['dailyCost']?.error;

  const monthlyTotals: Record<string, number> = {};
  monthlyRows.forEach((r: any) => {
    const period = String(r.period_start || '').slice(0, 7);
    monthlyTotals[period] = (monthlyTotals[period] || 0) + (Number(r.blended_cost) || 0);
  });
  const sortedMonths = Object.keys(monthlyTotals).sort();
  const thisMonth = sortedMonths.length > 0 ? monthlyTotals[sortedMonths[sortedMonths.length - 1]] || 0 : 0;
  const lastMonth = sortedMonths.length > 1 ? monthlyTotals[sortedMonths[sortedMonths.length - 2]] || 0 : 0;

  const dailyTotals: Record<string, number> = {};
  dailyRows.forEach((r: any) => {
    const day = String(r.period_start || '').slice(0, 10);
    dailyTotals[day] = (dailyTotals[day] || 0) + (Number(r.blended_cost) || 0);
  });
  const sortedDays = Object.keys(dailyTotals).sort();
  const dailyAvg = sortedDays.length > 0 ? sortedDays.reduce((sum, d) => sum + dailyTotals[d], 0) / sortedDays.length : 0;
  const momChange = lastMonth > 0 ? (((thisMonth - lastMonth) / lastMonth) * 100).toFixed(1) : '0';

  const dailyLineData = sortedDays.slice(-30).map(day => ({
    name: day.slice(5),
    value: Math.round(dailyTotals[day] * 100) / 100,
  }));

  const serviceTable: Record<string, number> = {};
  monthlyRows.forEach((r: any) => {
    const svc = String(r.service || 'Unknown');
    serviceTable[svc] = (serviceTable[svc] || 0) + (Number(r.blended_cost) || 0);
  });
  const serviceTableRows = Object.entries(serviceTable)
    .map(([service, cost]) => ({ service, blended_cost_amount: Math.round(cost * 100) / 100 }))
    .sort((a, b) => b.blended_cost_amount - a.blended_cost_amount);

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="Cost Explorer" subtitle="AWS Billing & Cost Management" onRefresh={() => fetchData(true)} />

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard label="This Month" value={`$${thisMonth.toFixed(2)}`} icon={DollarSign} color="cyan" />
        <StatsCard label="Last Month" value={`$${lastMonth.toFixed(2)}`} icon={DollarSign} color="purple" />
        <StatsCard label="Daily Avg" value={`$${dailyAvg.toFixed(2)}`} icon={DollarSign} color="green" />
        <StatsCard label="MoM Change" value={`${Number(momChange) > 0 ? '+' : ''}${momChange}%`} icon={DollarSign}
          color={Number(momChange) > 10 ? 'red' : Number(momChange) < 0 ? 'green' : 'orange'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LineChartCard title="Daily Cost Trend" data={dailyLineData} color="#00d4ff" />
        <BarChartCard title="Cost by Service" data={serviceCostData.slice(0, 10)} color="#a855f7" />
      </div>

      <DataTable
        columns={[
          { key: 'service', label: 'Service' },
          { key: 'blended_cost_amount', label: 'Blended Cost', render: (v: number) => <span className="font-mono">${(v || 0).toFixed(2)}</span> },
        ]}
        data={loading && !serviceTableRows.length ? undefined : serviceTableRows}
        onRowClick={(row) => fetchServiceDetail(row.service)}
      />

      {/* Service Detail Panel */}
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
                {/* Total */}
                <Section title="Cost Summary" icon={DollarSign}>
                  <Row label="Service" value={selected.service} />
                  <Row label="Total Cost" value={`$${selected.rows.reduce((s: number, r: any) => s + (Number(r.blended_cost) || 0), 0).toFixed(4)}`} />
                  <Row label="Periods" value={`${selected.rows.length} months`} />
                </Section>

                {/* Monthly breakdown */}
                <Section title="Monthly Breakdown" icon={TrendingUp}>
                  {selected.rows.length > 0 ? (
                    <div className="space-y-2">
                      {selected.rows.map((r: any, i: number) => {
                        const period = String(r.period_start || '').slice(0, 7);
                        const cost = Number(r.blended_cost) || 0;
                        const unblended = Number(r.unblended_cost) || 0;
                        return (
                          <div key={i} className="flex items-center justify-between bg-navy-800 rounded p-2">
                            <span className="text-sm font-mono text-gray-300">{period}</span>
                            <div className="text-right">
                              <span className="text-sm font-mono text-white">${cost.toFixed(4)}</span>
                              {unblended !== cost && (
                                <span className="text-xs text-gray-500 ml-2">(unblended: ${unblended.toFixed(4)})</span>
                              )}
                            </div>
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
