'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Header from '@/components/layout/Header';
import DataTable from '@/components/table/DataTable';
import { TrendingUp, Info, BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

interface InventorySnapshot {
  date: string;
  timestamp: string;
  resources: Record<string, number>;
}

interface TrendRow {
  label: string;
  current: number;
  d7ago: number | null;
  d30ago: number | null;
  delta7: number | null;
  delta30: number | null;
  pct7: number | null;
  pct30: number | null;
}

// Primary resources (visible by default)
const PRIMARY_RESOURCES = [
  'EC2 Instances',
  'RDS Instances',
  'S3 Buckets',
  'EBS Volumes',
  'Lambda Functions',
];

// Color palette for resource lines
const RESOURCE_COLORS: Record<string, string> = {
  'EC2 Instances': '#00d4ff',
  'RDS Instances': '#a855f7',
  'S3 Buckets': '#00ff88',
  'Lambda Functions': '#f59e0b',
  'EBS Volumes': '#fb923c',
  'EBS Snapshots': '#fdba74',
  'VPCs': '#ef4444',
  'Subnets': '#fb923c',
  'NAT Gateways': '#ec4899',
  'ALBs': '#14b8a6',
  'NLBs': '#0ea5e9',
  'Route Tables': '#64748b',
  'IAM Users': '#fbbf24',
  'IAM Roles': '#a78bfa',
  'ECS Tasks': '#8b5cf6',
  'ECS Services': '#c084fc',
  'DynamoDB Tables': '#f97316',
  'EKS Nodes': '#06b6d4',
  'K8s Pods': '#e879f9',
  'K8s Deployments': '#22d3ee',
  'ElastiCache Clusters': '#84cc16',
  'CloudFront Distributions': '#f472b6',
  'WAF Web ACLs': '#fb7185',
  'ECR Repositories': '#34d399',
  'Public S3 Buckets': '#ef4444',
  'Open Security Groups': '#f87171',
  'Unencrypted EBS': '#fca5a5',
};

import { useAccountContext } from '@/contexts/AccountContext';

const FALLBACK_COLORS = ['#38bdf8', '#c084fc', '#4ade80', '#facc15', '#fb923c', '#f87171', '#2dd4bf', '#818cf8'];

function getResourceColor(label: string, idx: number): string {
  return RESOURCE_COLORS[label] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// Cost weight per resource for estimation
const COST_WEIGHTS: Record<string, number> = {
  'RDS Instances': 200,
  'ElastiCache Clusters': 150,
  'EKS Nodes': 100,
  'NAT Gateways': 45,
  'EC2 Instances': 80,
  'ECS Tasks': 30,
  'Lambda Functions': 5,
  'S3 Buckets': 10,
  'DynamoDB Tables': 25,
  'CloudFront Distributions': 3,
  'ALBs': 22,
  'NLBs': 22,
  'EBS Volumes': 15,
  'EBS Snapshots': 1,
};

// Custom tooltip for multi-line chart
function MultiLineTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-lg px-3 py-2 shadow-xl max-h-72 overflow-auto">
      <p className="text-xs text-gray-400 mb-1.5 font-medium">{label}</p>
      <div className="space-y-0.5">
        {[...payload]
          .sort((a: any, b: any) => (b.value || 0) - (a.value || 0))
          .map((entry: any) => (
            <div key={entry.dataKey} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
              <span className="text-gray-300 truncate max-w-[140px]">{entry.dataKey}</span>
              <span className="font-mono text-white ml-auto">{entry.value}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useLanguage();
  const { currentAccountId } = useAccountContext();

  const [history, setHistory] = useState<InventorySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleResources, setVisibleResources] = useState<Set<string>>(new Set(PRIMARY_RESOURCES));
  const [period, setPeriod] = useState<30 | 90>(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const acctParam = currentAccountId && currentAccountId !== '__all__' ? `&accountId=${currentAccountId}` : '';
      const res = await fetch(`/awsops/api/steampipe?action=inventory&days=90${acctParam}`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {} finally { setLoading(false); }
  }, [currentAccountId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // All resource labels from history
  const allResources = useMemo(() => {
    const labels = new Set<string>();
    history.forEach(snap => Object.keys(snap.resources).forEach(k => labels.add(k)));
    return Array.from(labels).sort((a, b) => {
      const aP = PRIMARY_RESOURCES.includes(a) ? 0 : 1;
      const bP = PRIMARY_RESOURCES.includes(b) ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return a.localeCompare(b);
    });
  }, [history]);

  // Secondary resources (not primary)
  const secondaryResources = useMemo(() => {
    return allResources.filter(r => !PRIMARY_RESOURCES.includes(r));
  }, [allResources]);

  // Chart data — only include visible resource keys
  const chartData = useMemo(() => {
    const sliced = history.slice(-period);
    return sliced.map(snap => {
      const point: Record<string, number | string> = { name: snap.date.slice(5) };
      for (const label of Array.from(visibleResources)) {
        point[label] = snap.resources[label] || 0;
      }
      return point;
    });
  }, [history, period, visibleResources]);

  // Toggle resource visibility
  const toggleResource = (label: string) => {
    setVisibleResources(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Find closest snapshot within tolerance days
  const findClosest = useCallback((targetDate: Date, toleranceDays: number): InventorySnapshot | null => {
    let best: InventorySnapshot | null = null;
    let bestDiff = Infinity;
    const toleranceMs = toleranceDays * 86400000;
    for (const snap of history) {
      const diff = Math.abs(new Date(snap.date).getTime() - targetDate.getTime());
      if (diff < bestDiff && diff <= toleranceMs) {
        bestDiff = diff;
        best = snap;
      }
    }
    return best;
  }, [history]);

  // Compute trends from history
  const trends = useMemo<TrendRow[]>(() => {
    if (history.length === 0) return [];

    const latest = history[history.length - 1];
    const now = new Date(latest.date);
    const d7target = new Date(now); d7target.setDate(d7target.getDate() - 7);
    const d30target = new Date(now); d30target.setDate(d30target.getDate() - 30);

    const snap7 = findClosest(d7target, 2);
    const snap30 = findClosest(d30target, 2);

    const allLabels = new Set<string>();
    Object.keys(latest.resources).forEach(k => allLabels.add(k));
    if (snap7) Object.keys(snap7.resources).forEach(k => allLabels.add(k));
    if (snap30) Object.keys(snap30.resources).forEach(k => allLabels.add(k));

    const rows: TrendRow[] = Array.from(allLabels).map(label => {
      const current = latest.resources[label] || 0;
      const d7ago = snap7 ? (snap7.resources[label] ?? null) : null;
      const d30ago = snap30 ? (snap30.resources[label] ?? null) : null;
      const delta7 = d7ago !== null ? current - d7ago : null;
      const delta30 = d30ago !== null ? current - d30ago : null;
      const pct7 = delta7 !== null && d7ago !== null && d7ago !== 0 ? (delta7 / d7ago) * 100 : null;
      const pct30 = delta30 !== null && d30ago !== null && d30ago !== 0 ? (delta30 / d30ago) * 100 : null;

      return { label, current, d7ago, d30ago, delta7, delta30, pct7, pct30 };
    });

    return rows.sort((a, b) => b.current - a.current);
  }, [history, findClosest]);

  // Cost impact estimation (30d growth)
  const costImpacts = useMemo(() => {
    return trends
      .filter(t => t.delta30 !== null && t.delta30 !== 0 && COST_WEIGHTS[t.label])
      .map(t => ({
        label: t.label,
        delta30: t.delta30!,
        impact: t.delta30! * (COST_WEIGHTS[t.label] || 0),
      }))
      .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  }, [trends]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (trends.length === 0) return null;
    const totalTypes = trends.length;
    const totalCount = trends.reduce((sum, t) => sum + t.current, 0);
    const netChange7d = trends.reduce((sum, t) => sum + (t.delta7 || 0), 0);
    return { totalTypes, totalCount, netChange7d };
  }, [trends]);

  // Format change string for table
  const formatChange = (delta: number | null, pct: number | null) => {
    if (delta === null) return null;
    if (delta === 0) return { text: '\u00B10', className: 'text-gray-500' };
    const sign = delta > 0 ? '+' : '';
    const pctStr = pct !== null ? ` (${sign}${pct.toFixed(1)}%)` : '';
    return {
      text: `${sign}${delta}${pctStr}`,
      className: delta > 0 ? 'text-accent-orange' : 'text-accent-cyan',
    };
  };

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title={t('inventory.title')} subtitle={t('inventory.subtitle')} onRefresh={fetchData} />

      {/* Empty data notice */}
      {history.length === 0 && !loading && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-accent-cyan/10 border border-accent-cyan/30">
          <Info size={20} className="text-accent-cyan flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-accent-cyan">{t('inventory.noInventory')}</p>
            <p className="text-xs text-gray-400 mt-0.5">Snapshots are captured automatically when the Dashboard loads.</p>
          </div>
        </div>
      )}

      {/* Summary Stats - compact inline bar */}
      {summaryStats && (
        <div className="flex flex-wrap items-center gap-6 bg-navy-800 rounded-lg border border-navy-600 px-5 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-accent-cyan" />
            <span className="text-sm text-gray-400">Resource Types</span>
            <span className="text-lg font-bold font-mono text-white">{summaryStats.totalTypes}</span>
          </div>
          <div className="w-px h-6 bg-navy-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Total Count</span>
            <span className="text-lg font-bold font-mono text-white">{summaryStats.totalCount.toLocaleString()}</span>
          </div>
          <div className="w-px h-6 bg-navy-600" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">7d Net Change</span>
            <span className={`text-lg font-bold font-mono ${
              summaryStats.netChange7d > 0 ? 'text-accent-orange' : summaryStats.netChange7d < 0 ? 'text-accent-cyan' : 'text-gray-500'
            }`}>
              {summaryStats.netChange7d > 0 ? '+' : ''}{summaryStats.netChange7d}
            </span>
          </div>
        </div>
      )}

      {/* Multi-line Trend Chart */}
      {history.length > 0 && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          {/* Chart header with period toggle */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Resource Trend</h3>
            <div className="flex items-center gap-1 bg-navy-900 rounded-lg p-0.5">
              {([30, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setPeriod(d)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    period === d ? 'bg-navy-600 text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  interval={period === 90 ? 6 : 2}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  width={45}
                />
                <Tooltip content={<MultiLineTooltip />} />
                {Array.from(visibleResources).map((label, idx) => (
                  <Line
                    key={label}
                    type="monotone"
                    dataKey={label}
                    stroke={getResourceColor(label, idx)}
                    strokeWidth={PRIMARY_RESOURCES.includes(label) ? 2 : 1.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Resource Toggle Chips */}
          <div className="mt-4 space-y-3">
            {/* Core Resources */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Core Resources</p>
              <div className="flex flex-wrap gap-2">
                {PRIMARY_RESOURCES.filter(r => allResources.includes(r)).map((label, idx) => {
                  const active = visibleResources.has(label);
                  const color = getResourceColor(label, idx);
                  return (
                    <button
                      key={label}
                      onClick={() => toggleResource(label)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all border ${
                        active
                          ? 'border-transparent text-white'
                          : 'border-navy-600 text-gray-500 hover:text-gray-300'
                      }`}
                      style={active ? { background: `${color}20`, borderColor: `${color}40` } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ background: active ? color : '#4b5563' }}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Other Resources */}
            {secondaryResources.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Other Resources</p>
                <div className="flex flex-wrap gap-2">
                  {secondaryResources.map((label, idx) => {
                    const active = visibleResources.has(label);
                    const color = getResourceColor(label, PRIMARY_RESOURCES.length + idx);
                    return (
                      <button
                        key={label}
                        onClick={() => toggleResource(label)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all border ${
                          active
                            ? 'border-transparent text-white'
                            : 'border-navy-600 text-gray-500 hover:text-gray-300'
                        }`}
                        style={active ? { background: `${color}20`, borderColor: `${color}40` } : {}}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: active ? color : '#4b5563' }}
                        />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DataTable - full resource inventory */}
      <DataTable
        columns={[
          { key: 'label', label: t('inventory.resourceType') },
          {
            key: 'current',
            label: 'Current',
            render: (v: number) => <span className="font-mono text-white">{v}</span>,
          },
          {
            key: 'd7ago',
            label: '7d Ago',
            render: (v: number | null) => (
              <span className="font-mono text-gray-500">{v !== null ? v : '--'}</span>
            ),
          },
          {
            key: 'd30ago',
            label: '30d Ago',
            render: (v: number | null) => (
              <span className="font-mono text-gray-500">{v !== null ? v : '--'}</span>
            ),
          },
          {
            key: 'delta7',
            label: '7d Change',
            render: (v: number | null, row: TrendRow) => {
              const fmt = formatChange(v, row.pct7);
              if (!fmt) return <span className="font-mono text-xs text-gray-500">--</span>;
              return <span className={`font-mono text-xs ${fmt.className}`}>{fmt.text}</span>;
            },
          },
          {
            key: 'delta30',
            label: '30d Change',
            render: (v: number | null, row: TrendRow) => {
              const fmt = formatChange(v, row.pct30);
              if (!fmt) return <span className="font-mono text-xs text-gray-500">--</span>;
              return <span className={`font-mono text-xs ${fmt.className}`}>{fmt.text}</span>;
            },
          },
        ]}
        data={loading ? undefined : trends}
      />

      {/* Cost Impact Estimation */}
      {costImpacts.length > 0 && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-accent-cyan" />
            <h3 className="text-sm font-semibold text-white">{t('inventory.costImpact')}</h3>
          </div>
          <p className="text-xs text-gray-400 mb-4">Approximate monthly cost impact based on resource count changes.</p>
          <div className="space-y-2">
            {costImpacts.map(item => (
              <div key={item.label} className="flex items-center justify-between bg-navy-900 rounded p-2">
                <span className="text-sm text-gray-300">{item.label}</span>
                <span className={`text-sm font-mono ${item.impact > 0 ? 'text-accent-orange' : 'text-accent-green'}`}>
                  {item.impact > 0 ? '+' : '-'}${Math.abs(item.impact).toLocaleString()}/mo est.
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
