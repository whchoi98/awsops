'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Header from '@/components/layout/Header';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import LineChartCard from '@/components/charts/LineChartCard';
import DataTable from '@/components/table/DataTable';
import { Sparkles, DollarSign, Zap, Clock, AlertTriangle, Database, Calendar } from 'lucide-react';

type RangeKey = '1h' | '6h' | '24h' | '7d' | '30d';

interface ModelMetric {
  modelId: string;
  label: string;
  invocations: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  clientErrors: number;
  serverErrors: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputCost: number;
  outputCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  cacheSavings: number;
  totalCost: number;
  pricing: { input: number; output: number; cacheRead: number; cacheWrite: number };
  timeSeries: {
    invocations: { timestamp: string; value: number }[];
    inputTokens: { timestamp: string; value: number }[];
    outputTokens: { timestamp: string; value: number }[];
  };
}

interface AwsopsUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  tokensByModel: Record<string, { inputTokens: number; outputTokens: number; calls: number }>;
}

export default function BedrockPage() {
  const [metrics, setMetrics] = useState<ModelMetric[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [totalCacheSavings, setTotalCacheSavings] = useState(0);
  const [awsopsUsage, setAwsopsUsage] = useState<AwsopsUsage>({ totalInputTokens: 0, totalOutputTokens: 0, totalCalls: 0, tokensByModel: {} });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>('7d');
  const [selected, setSelected] = useState<ModelMetric | null>(null);

  const fetchData = useCallback(async (r?: RangeKey) => {
    setLoading(true);
    try {
      const res = await fetch(`/awsops/api/bedrock-metrics?action=summary&range=${r || range}`);
      const data = await res.json();
      setMetrics(data.metrics || []);
      setTotalCost(data.totalCost || 0);
      setTotalCacheSavings(data.totalCacheSavings || 0);
      setAwsopsUsage(data.awsopsUsage || { totalInputTokens: 0, totalOutputTokens: 0, totalCalls: 0, tokensByModel: {} });
    } catch {} finally { setLoading(false); }
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRangeChange = (r: RangeKey) => {
    setRange(r);
    fetchData(r);
  };

  // Aggregated stats / 집계 통계
  const totals = useMemo(() => {
    const t = {
      invocations: 0, inputTokens: 0, outputTokens: 0,
      errors: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      avgLatency: 0,
    };
    metrics.forEach(m => {
      t.invocations += m.invocations;
      t.inputTokens += m.inputTokens;
      t.outputTokens += m.outputTokens;
      t.errors += m.clientErrors + m.serverErrors;
      t.cacheReadTokens += m.cacheReadTokens;
      t.cacheWriteTokens += m.cacheWriteTokens;
    });
    const latencies = metrics.filter(m => m.avgLatencyMs > 0);
    t.avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((s, m) => s + m.avgLatencyMs, 0) / latencies.length) : 0;
    return t;
  }, [metrics]);

  // Cache hit rate / 캐시 적중률
  const cacheHitRate = totals.inputTokens > 0
    ? ((totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)) * 100).toFixed(1)
    : '0';

  // Charts data / 차트 데이터
  const costByModel = metrics.map(m => ({
    name: m.label.length > 18 ? m.label.slice(0, 18) + '…' : m.label,
    value: Number(m.totalCost.toFixed(4)),
  }));

  const invocationsByModel = metrics.map(m => ({
    name: m.label.length > 18 ? m.label.slice(0, 18) + '…' : m.label,
    value: m.invocations,
  }));

  // Aggregated time series / 통합 시계열
  const tokenTimeSeries = useMemo(() => {
    if (metrics.length === 0) return [];
    const timeMap: Record<string, { input: number; output: number }> = {};
    metrics.forEach(m => {
      m.timeSeries.inputTokens.forEach(p => {
        if (!timeMap[p.timestamp]) timeMap[p.timestamp] = { input: 0, output: 0 };
        timeMap[p.timestamp].input += p.value;
      });
      m.timeSeries.outputTokens.forEach(p => {
        if (!timeMap[p.timestamp]) timeMap[p.timestamp] = { input: 0, output: 0 };
        timeMap[p.timestamp].output += p.value;
      });
    });
    return Object.entries(timeMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ts, v]) => ({
        name: range === '7d' || range === '30d'
          ? new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' })
          : new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        value: v.input + v.output,
      }));
  }, [metrics, range]);

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const formatCost = (n: number) => {
    if (n < 0.001) return `$${n.toFixed(5)}`;
    if (n < 1) return `$${n.toFixed(4)}`;
    return `$${n.toFixed(2)}`;
  };

  const RANGES: RangeKey[] = ['1h', '6h', '24h', '7d', '30d'];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Header title="Bedrock Monitoring" subtitle="Model Usage, Token Costs & Prompt Caching" onRefresh={() => fetchData()} />
        <div className="flex items-center gap-1">
          <Calendar size={14} className="text-gray-500 mr-1" />
          {RANGES.map(r => (
            <button key={r} onClick={() => handleRangeChange(r)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                range === r
                  ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/40'
                  : 'bg-navy-800 text-gray-400 border border-navy-600 hover:text-white'
              }`}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="w-full h-1 bg-navy-700 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Stats Cards / 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <StatsCard label="Total Cost" value={formatCost(totalCost)} icon={DollarSign} color="orange" />
        <StatsCard label="Invocations" value={totals.invocations.toLocaleString()} icon={Zap} color="cyan" />
        <StatsCard label="Input Tokens" value={formatTokens(totals.inputTokens)} icon={Sparkles} color="purple" />
        <StatsCard label="Output Tokens" value={formatTokens(totals.outputTokens)} icon={Sparkles} color="green" />
        <StatsCard label="Avg Latency" value={`${(totals.avgLatency / 1000).toFixed(1)}s`} icon={Clock} color="cyan" />
        <StatsCard label="Errors" value={totals.errors} icon={AlertTriangle}
          color={totals.errors > 0 ? 'red' : 'green'} />
        <StatsCard label="Cache Savings" value={formatCost(totalCacheSavings)} icon={Database} color="green"
          change={totalCacheSavings > 0 ? `${cacheHitRate}% hit rate` : undefined} />
        <StatsCard label="Models Used" value={metrics.length} icon={Sparkles} color="purple" />
      </div>

      {/* AWSops vs Account Usage Comparison / AWSops vs 계정 전체 사용량 비교 */}
      {(totals.invocations > 0 || awsopsUsage.totalCalls > 0) && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
          <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-4 flex items-center gap-2">
            <Zap size={14} />
            Account Total vs AWSops Usage / 계정 전체 vs AWSops 사용량
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Account Total (CloudWatch) / 계정 전체 (CloudWatch) */}
            <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-accent-purple" />
                <h4 className="text-xs font-mono uppercase text-accent-purple tracking-wider">Account Total ({range})</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Invocations</p>
                  <p className="text-lg font-bold font-mono text-white">{totals.invocations.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Input Tokens</p>
                  <p className="text-lg font-bold font-mono text-white">{formatTokens(totals.inputTokens)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Output Tokens</p>
                  <p className="text-lg font-bold font-mono text-white">{formatTokens(totals.outputTokens)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Est. Cost</p>
                  <p className="text-lg font-bold font-mono text-accent-orange">{formatCost(totalCost)}</p>
                </div>
              </div>
            </div>
            {/* AWSops App Usage / AWSops 앱 사용량 */}
            <div className="bg-navy-900 rounded-lg border border-accent-cyan/30 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-accent-cyan" />
                <h4 className="text-xs font-mono uppercase text-accent-cyan tracking-wider">AWSops App (Cumulative)</h4>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">AI Queries</p>
                  <p className="text-lg font-bold font-mono text-white">{awsopsUsage.totalCalls.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Input Tokens</p>
                  <p className="text-lg font-bold font-mono text-white">{formatTokens(awsopsUsage.totalInputTokens)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Output Tokens</p>
                  <p className="text-lg font-bold font-mono text-white">{formatTokens(awsopsUsage.totalOutputTokens)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500 uppercase">Models</p>
                  <div className="space-y-0.5 mt-1">
                    {Object.entries(awsopsUsage.tokensByModel).map(([model, data]) => (
                      <p key={model} className="text-[10px] font-mono text-gray-400">
                        {model}: <span className="text-accent-cyan">{data.calls}</span> calls
                      </p>
                    ))}
                    {Object.keys(awsopsUsage.tokensByModel).length === 0 && (
                      <p className="text-[10px] text-gray-600">No data yet</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts / 차트 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PieChartCard title="Cost by Model / 모델별 비용" data={costByModel} />
        <BarChartCard title="Invocations by Model / 모델별 호출" data={invocationsByModel} color="#00d4ff" />
        {tokenTimeSeries.length > 0 && (
          <LineChartCard title="Token Usage Over Time / 토큰 사용 추이" data={tokenTimeSeries} color="#a855f7" />
        )}
      </div>

      {/* Prompt Caching Summary / 프롬프트 캐싱 요약 */}
      {(totals.cacheReadTokens > 0 || totals.cacheWriteTokens > 0) && (
        <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
          <h3 className="text-xs font-mono uppercase text-accent-green tracking-wider mb-3 flex items-center gap-2">
            <Database size={14} />
            Prompt Caching / 프롬프트 캐싱
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-[10px] text-gray-500 uppercase">Cache Read Tokens</p>
              <p className="text-lg font-bold font-mono text-accent-green">{formatTokens(totals.cacheReadTokens)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 uppercase">Cache Write Tokens</p>
              <p className="text-lg font-bold font-mono text-accent-cyan">{formatTokens(totals.cacheWriteTokens)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 uppercase">Hit Rate</p>
              <p className="text-lg font-bold font-mono text-accent-purple">{cacheHitRate}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 uppercase">Cache Cost</p>
              <p className="text-lg font-bold font-mono text-accent-orange">
                {formatCost(metrics.reduce((s, m) => s + m.cacheReadCost + m.cacheWriteCost, 0))}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-500 uppercase">Savings</p>
              <p className="text-lg font-bold font-mono text-accent-green">{formatCost(totalCacheSavings)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Model Usage Table / 모델 사용량 테이블 */}
      {metrics.length > 0 ? (
        <DataTable
          columns={[
            { key: 'label', label: 'Model' },
            { key: 'invocations', label: 'Invocations', render: (v: number) => (
              <span className="font-mono text-accent-cyan">{v.toLocaleString()}</span>
            )},
            { key: 'inputTokens', label: 'Input Tokens', render: (v: number) => (
              <span className="font-mono">{formatTokens(v)}</span>
            )},
            { key: 'outputTokens', label: 'Output Tokens', render: (v: number) => (
              <span className="font-mono">{formatTokens(v)}</span>
            )},
            { key: 'avgLatencyMs', label: 'Avg Latency', render: (v: number) => (
              <span className={`font-mono ${v > 10000 ? 'text-accent-orange' : 'text-gray-300'}`}>
                {(v / 1000).toFixed(1)}s
              </span>
            )},
            { key: 'cacheReadTokens', label: 'Cache Read', render: (v: number) => (
              v > 0 ? <span className="font-mono text-accent-green">{formatTokens(v)}</span> : <span className="text-gray-600">-</span>
            )},
            { key: 'cacheSavings', label: 'Cache Savings', render: (v: number) => (
              v > 0 ? <span className="font-mono text-accent-green">{formatCost(v)}</span> : <span className="text-gray-600">-</span>
            )},
            { key: 'totalCost', label: 'Total Cost', render: (v: number) => (
              <span className="font-mono font-bold text-accent-orange">{formatCost(v)}</span>
            )},
            { key: 'clientErrors', label: 'Errors', render: (_v: number, row: any) => {
              const total = (row.clientErrors || 0) + (row.serverErrors || 0);
              return total > 0
                ? <span className="font-mono text-accent-red">{total}</span>
                : <span className="text-gray-600">0</span>;
            }},
          ]}
          data={loading && !metrics.length ? undefined : metrics}
          onRowClick={(row) => setSelected(row as ModelMetric)}
        />
      ) : !loading ? (
        <div className="text-center py-16 text-gray-500">
          <Sparkles size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-lg">No Bedrock usage data found</p>
          <p className="text-xs mt-2">Bedrock 모델 호출이 이 리전에서 감지되지 않았습니다.</p>
          <p className="text-xs mt-1">Use AI Assistant or invoke Bedrock models to see metrics here.</p>
        </div>
      ) : null}

      {/* Model Detail Panel / 모델 상세 패널 */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.label}</h2>
                <p className="text-xs text-gray-400 font-mono">{selected.modelId}</p>
              </div>
              <button onClick={() => setSelected(null)}
                className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white transition-colors text-xl">
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Cost Breakdown / 비용 분석 */}
              <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-3">Cost Breakdown / 비용 분석</h3>
                <div className="grid grid-cols-2 gap-3">
                  <CostRow label="Input Token Cost" value={selected.inputCost}
                    detail={`${formatTokens(selected.inputTokens)} × $${selected.pricing.input}/1M`} />
                  <CostRow label="Output Token Cost" value={selected.outputCost}
                    detail={`${formatTokens(selected.outputTokens)} × $${selected.pricing.output}/1M`} />
                  {selected.cacheReadCost > 0 && (
                    <CostRow label="Cache Read Cost" value={selected.cacheReadCost}
                      detail={`${formatTokens(selected.cacheReadTokens)} × $${selected.pricing.cacheRead}/1M`} />
                  )}
                  {selected.cacheWriteCost > 0 && (
                    <CostRow label="Cache Write Cost" value={selected.cacheWriteCost}
                      detail={`${formatTokens(selected.cacheWriteTokens)} × $${selected.pricing.cacheWrite}/1M`} />
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-navy-600 flex justify-between items-center">
                  <span className="text-sm text-gray-400">Total Cost</span>
                  <span className="text-xl font-bold font-mono text-accent-orange">{formatCost(selected.totalCost)}</span>
                </div>
                {selected.cacheSavings > 0 && (
                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-sm text-gray-400">Cache Savings</span>
                    <span className="text-lg font-bold font-mono text-accent-green">-{formatCost(selected.cacheSavings)}</span>
                  </div>
                )}
              </div>

              {/* Usage Stats / 사용량 통계 */}
              <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-3">Usage / 사용량</h3>
                <div className="space-y-2">
                  <DetailRow label="Invocations" value={selected.invocations.toLocaleString()} />
                  <DetailRow label="Input Tokens" value={selected.inputTokens.toLocaleString()} />
                  <DetailRow label="Output Tokens" value={selected.outputTokens.toLocaleString()} />
                  <DetailRow label="Avg Latency" value={`${(selected.avgLatencyMs / 1000).toFixed(2)}s`} />
                  <DetailRow label="Client Errors (4xx)" value={String(selected.clientErrors)} />
                  <DetailRow label="Server Errors (5xx)" value={String(selected.serverErrors)} />
                  {selected.cacheReadTokens > 0 && (
                    <DetailRow label="Cache Read Tokens" value={selected.cacheReadTokens.toLocaleString()} />
                  )}
                  {selected.cacheWriteTokens > 0 && (
                    <DetailRow label="Cache Write Tokens" value={selected.cacheWriteTokens.toLocaleString()} />
                  )}
                </div>
              </div>

              {/* Pricing Info / 가격 정보 */}
              <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-3">Pricing / 가격 (per 1M tokens)</h3>
                <div className="space-y-2">
                  <DetailRow label="Input" value={`$${selected.pricing.input}`} />
                  <DetailRow label="Output" value={`$${selected.pricing.output}`} />
                  {selected.pricing.cacheRead > 0 && (
                    <DetailRow label="Cache Read" value={`$${selected.pricing.cacheRead}`} />
                  )}
                  {selected.pricing.cacheWrite > 0 && (
                    <DetailRow label="Cache Write" value={`$${selected.pricing.cacheWrite}`} />
                  )}
                </div>
              </div>

              {/* Time Series Charts / 시계열 차트 */}
              {selected.timeSeries.invocations.length > 0 && (
                <LineChartCard
                  title="Invocations Over Time / 호출 추이"
                  data={selected.timeSeries.invocations.map(p => ({
                    name: range === '7d' || range === '30d'
                      ? new Date(p.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      : new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    value: p.value,
                  }))}
                  color="#00d4ff"
                />
              )}
              {selected.timeSeries.inputTokens.length > 0 && (
                <LineChartCard
                  title="Token Usage / 토큰 사용량"
                  data={selected.timeSeries.inputTokens.map((p, i) => ({
                    name: range === '7d' || range === '30d'
                      ? new Date(p.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      : new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    value: p.value + (selected.timeSeries.outputTokens[i]?.value || 0),
                  }))}
                  color="#a855f7"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CostRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  const formatCost = (n: number) => n < 0.001 ? `$${n.toFixed(5)}` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
  return (
    <div className="bg-navy-800 rounded p-2">
      <p className="text-[10px] text-gray-500 uppercase">{label}</p>
      <p className="text-sm font-bold font-mono text-white">{formatCost(value)}</p>
      <p className="text-[10px] text-gray-600 font-mono">{detail}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 font-mono">{value}</span>
    </div>
  );
}
