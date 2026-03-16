'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/layout/Header';
import { useAccountContext } from '@/contexts/AccountContext';
import StatsCard from '@/components/dashboard/StatsCard';
import PieChartCard from '@/components/charts/PieChartCard';
import BarChartCard from '@/components/charts/BarChartCard';
import { ShieldCheck, Play, Loader2, X, CheckCircle, AlertTriangle, XCircle, MinusCircle, Info } from 'lucide-react';

interface BenchmarkSummary {
  status: { alarm: number; ok: number; info: number; skip: number; error: number };
}

interface BenchmarkGroup {
  group_id: string;
  title: string;
  summary: BenchmarkSummary;
  groups?: BenchmarkGroup[];
  controls?: any[];
}

export default function CompliancePage() {
  const { currentAccountId } = useAccountContext();
  const [benchmarkId, setBenchmarkId] = useState('cis_v300');
  const [status, setStatus] = useState<string>('none');
  const [data, setData] = useState<any>(null);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [selectedControl, setSelectedControl] = useState<any>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const BASE = '/awsops/api/benchmark';

  const checkStatus = useCallback(async () => {
    const res = await fetch(`${BASE}?benchmark=${benchmarkId}&action=status&accountId=${currentAccountId}`);
    const result = await res.json();
    setStatus(result.status);
    if (result.hasResult && result.status !== 'running') {
      const resData = await fetch(`${BASE}?benchmark=${benchmarkId}&action=result&accountId=${currentAccountId}`);
      const benchData = await resData.json();
      if (!benchData.error) setData(benchData);
    }
  }, [benchmarkId, currentAccountId]);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (status === 'running') {
      pollRef.current = setInterval(async () => {
        const res = await fetch(`${BASE}?benchmark=${benchmarkId}&action=status&accountId=${currentAccountId}`);
        const result = await res.json();
        if (result.status !== 'running') {
          setStatus(result.status);
          if (result.hasResult) {
            const resData = await fetch(`${BASE}?benchmark=${benchmarkId}&action=result&accountId=${currentAccountId}`);
            const benchData = await resData.json();
            if (!benchData.error) setData(benchData);
          }
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 5000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, benchmarkId]);

  const runBenchmark = async () => {
    setData(null);
    setStatus('running');
    await fetch(`${BASE}?benchmark=${benchmarkId}&action=run&accountId=${currentAccountId}`);
  };

  const summary = data?.summary?.status || { alarm: 0, ok: 0, info: 0, skip: 0, error: 0 };
  const total = summary.alarm + summary.ok + summary.info + summary.skip + summary.error;
  const passRate = total > 0 ? ((summary.ok / total) * 100).toFixed(1) : '0';

  const topGroups: BenchmarkGroup[] = data?.groups?.[0]?.groups || [];

  const pieData = [
    { name: 'OK', value: summary.ok, color: '#00ff88' },
    { name: 'Alarm', value: summary.alarm, color: '#ef4444' },
    { name: 'Skip', value: summary.skip, color: '#6b7280' },
    { name: 'Error', value: summary.error, color: '#f59e0b' },
    { name: 'Info', value: summary.info, color: '#00d4ff' },
  ].filter(d => d.value > 0);

  const sectionBarData = topGroups.map(g => ({
    name: g.title.length > 20 ? g.title.slice(0, 20) + '...' : g.title,
    value: g.summary?.status?.alarm || 0,
  })).filter(d => d.value > 0);

  // Extract all controls from a group recursively
  const extractControls = (group: any): any[] => {
    const controls: any[] = [];
    if (group.controls) {
      group.controls.forEach((c: any) => {
        if (c.results) {
          c.results.forEach((r: any) => {
            controls.push({
              control_id: c.control_id,
              title: c.title,
              description: c.description,
              status: r.status,
              reason: r.reason,
              resource: r.resource,
            });
          });
        }
      });
    }
    if (group.groups) {
      group.groups.forEach((g: any) => {
        controls.push(...extractControls(g));
      });
    }
    return controls;
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case 'ok': return <CheckCircle size={14} className="text-accent-green" />;
      case 'alarm': return <XCircle size={14} className="text-accent-red" />;
      case 'error': return <AlertTriangle size={14} className="text-accent-orange" />;
      case 'skip': return <MinusCircle size={14} className="text-gray-500" />;
      case 'info': return <Info size={14} className="text-accent-cyan" />;
      default: return <MinusCircle size={14} className="text-gray-500" />;
    }
  };

  const benchmarks = [
    { id: 'cis_v300', name: 'CIS v3.0.0' },
    { id: 'cis_v400', name: 'CIS v4.0.0' },
    { id: 'cis_v200', name: 'CIS v2.0.0' },
    { id: 'cis_v150', name: 'CIS v1.5.0' },
  ];

  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <Header title="CIS Compliance" subtitle="AWS CIS Benchmark Assessment" />

      {/* Benchmark selector + Run button */}
      <div className="flex items-center gap-4">
        <select value={benchmarkId} onChange={(e) => { setBenchmarkId(e.target.value); setData(null); setStatus('none'); }}
          className="bg-navy-800 border border-navy-600 rounded-lg px-4 py-2 text-sm text-gray-200 focus:ring-accent-cyan focus:border-accent-cyan">
          {benchmarks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button onClick={runBenchmark} disabled={status === 'running'}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            status === 'running'
              ? 'bg-navy-700 text-gray-500 cursor-not-allowed'
              : 'bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 border border-accent-cyan/30'
          }`}>
          {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {status === 'running' ? 'Running...' : 'Run Benchmark'}
        </button>
        {status === 'running' && (
          <span className="text-xs text-gray-500 animate-pulse">This may take 2-5 minutes...</span>
        )}
      </div>

      {/* Results */}
      {data && (<>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatsCard label="Pass Rate" value={`${passRate}%`} icon={ShieldCheck}
            color={Number(passRate) >= 80 ? 'green' : Number(passRate) >= 50 ? 'orange' : 'red'} />
          <StatsCard label="Total Controls" value={total} icon={ShieldCheck} color="cyan" />
          <StatsCard label="OK" value={summary.ok} icon={CheckCircle} color="green" />
          <StatsCard label="Alarm" value={summary.alarm} icon={XCircle} color="red" />
          <StatsCard label="Skipped" value={summary.skip} icon={MinusCircle} color="purple" />
          <StatsCard label="Errors" value={summary.error} icon={AlertTriangle} color="orange" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <PieChartCard title="Compliance Status" data={pieData} />
          <BarChartCard title="Alarms by Section" data={sectionBarData} color="#ef4444" />
        </div>

        {/* Section cards */}
        <div>
          <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider mb-3">Sections</h3>
          <div className="space-y-2">
            {topGroups.map((group) => {
              const s = group.summary?.status || { alarm: 0, ok: 0, info: 0, skip: 0, error: 0 };
              const gTotal = s.alarm + s.ok + s.info + s.skip + s.error;
              const gPass = gTotal > 0 ? ((s.ok / gTotal) * 100).toFixed(0) : '0';
              return (
                <div key={group.group_id}
                  onClick={() => setSelectedGroup(selectedGroup?.group_id === group.group_id ? null : group)}
                  className={`bg-navy-800 rounded-lg border p-4 cursor-pointer transition-colors ${
                    selectedGroup?.group_id === group.group_id ? 'border-accent-cyan' : 'border-navy-600 hover:border-navy-500'
                  }`}>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-white">{group.title}</h4>
                    <div className="flex items-center gap-3 text-xs font-mono">
                      <span className="text-accent-green">{s.ok} OK</span>
                      <span className="text-accent-red">{s.alarm} ALARM</span>
                      {s.skip > 0 && <span className="text-gray-500">{s.skip} SKIP</span>}
                      <span className={`px-2 py-0.5 rounded-full ${Number(gPass) >= 80 ? 'bg-accent-green/10 text-accent-green' : Number(gPass) >= 50 ? 'bg-accent-orange/10 text-accent-orange' : 'bg-accent-red/10 text-accent-red'}`}>
                        {gPass}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-navy-900 rounded-full overflow-hidden flex">
                    {s.ok > 0 && <div className="bg-accent-green h-full" style={{ width: `${(s.ok / gTotal) * 100}%` }} />}
                    {s.alarm > 0 && <div className="bg-accent-red h-full" style={{ width: `${(s.alarm / gTotal) * 100}%` }} />}
                    {s.skip > 0 && <div className="bg-gray-600 h-full" style={{ width: `${(s.skip / gTotal) * 100}%` }} />}
                    {s.error > 0 && <div className="bg-accent-orange h-full" style={{ width: `${(s.error / gTotal) * 100}%` }} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Expanded section controls */}
        {selectedGroup && (
          <div className="bg-navy-800 rounded-lg border border-navy-600 p-4">
            <h3 className="text-sm font-medium text-accent-cyan mb-3">{selectedGroup.title} - Controls</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {extractControls(selectedGroup).map((ctrl, i) => (
                <div key={i}
                  onClick={() => setSelectedControl(selectedControl === ctrl ? null : ctrl)}
                  className={`flex items-start gap-2 p-2 rounded text-xs cursor-pointer transition-colors ${
                    selectedControl === ctrl ? 'bg-navy-700 border border-navy-500' : 'hover:bg-navy-900'
                  }`}>
                  {statusIcon(ctrl.status)}
                  <div className="flex-1 min-w-0">
                    <span className="text-gray-300">{ctrl.title}</span>
                    {ctrl.resource && (
                      <span className="text-gray-500 ml-2 font-mono text-[11px]">{ctrl.resource.length > 60 ? '...' + ctrl.resource.slice(-50) : ctrl.resource}</span>
                    )}
                  </div>
                  <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    ctrl.status === 'ok' ? 'bg-accent-green/10 text-accent-green' :
                    ctrl.status === 'alarm' ? 'bg-accent-red/10 text-accent-red' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>{ctrl.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Control detail panel */}
        {selectedControl && (
          <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedControl(null)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full max-w-2xl h-full bg-navy-800 border-l border-navy-600 overflow-y-auto shadow-2xl animate-fade-in"
              onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-navy-800 border-b border-navy-600 px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  {statusIcon(selectedControl.status)}
                  <div>
                    <h2 className="text-sm font-bold text-white">{selectedControl.control_id}</h2>
                    <p className="text-xs text-gray-400">{selectedControl.title}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedControl(null)} className="p-2 rounded-lg hover:bg-navy-700 text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                  <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-2">Status</h3>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${
                    selectedControl.status === 'ok' ? 'bg-accent-green/10 text-accent-green' :
                    selectedControl.status === 'alarm' ? 'bg-accent-red/10 text-accent-red' :
                    'bg-gray-500/10 text-gray-400'
                  }`}>{selectedControl.status.toUpperCase()}</span>
                </div>
                {selectedControl.reason && (
                  <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                    <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-2">Reason</h3>
                    <p className="text-sm text-gray-300">{selectedControl.reason}</p>
                  </div>
                )}
                {selectedControl.resource && (
                  <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                    <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-2">Resource</h3>
                    <p className="text-xs font-mono text-gray-300 break-all">{selectedControl.resource}</p>
                  </div>
                )}
                {selectedControl.description && (
                  <div className="bg-navy-900 rounded-lg border border-navy-600 p-4">
                    <h3 className="text-xs font-mono uppercase text-accent-cyan tracking-wider mb-2">Description</h3>
                    <p className="text-xs text-gray-400 leading-relaxed">{selectedControl.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </>)}

      {/* No data state */}
      {!data && status !== 'running' && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <ShieldCheck size={48} className="mb-4 text-gray-600" />
          <p className="text-lg">No benchmark results available</p>
          <p className="text-sm mt-1">Select a benchmark and click &quot;Run Benchmark&quot; to start</p>
        </div>
      )}
    </div>
  );
}
