'use client';
import { useCallback, useEffect, useState } from 'react';
import { Cpu, Wifi, Boxes, Terminal, Database } from 'lucide-react';
import StatTile from '@/components/ui/StatTile';
import PageHeader from '@/components/ui/PageHeader';
import RefreshButton from '@/components/ui/RefreshButton';
import Badge from '@/components/ui/Badge';
import ChatOpsStatsCard from '@/components/chat/ChatOpsStatsCard';
import type { AgentCoreStatus } from '@/lib/agentcore-status';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

// v1-parity AgentCore console (v1 /agentcore): control-plane status (runtime / gateways / memory /
// code interpreter) + the chat-invoke ops stats (reused ChatOpsStatsCard). Read-only.

// READY-ish → positive; failed/absent → negative; transitional (CREATING/UPDATING) → warning.
function tone(status: string | undefined | null): 'positive' | 'warning' | 'negative' {
  if (!status) return 'negative';
  const s = status.toUpperCase();
  if (s === 'READY' || s === 'ACTIVE' || s === 'AVAILABLE') return 'positive';
  if (s.includes('FAIL') || s === 'DELETING') return 'negative';
  return 'warning';
}
// Badge has no 'warning' tone (neutral|brand|positive|negative|inverse) — map transitional→neutral.
function badgeTone(status: string): 'positive' | 'negative' | 'neutral' {
  const t = tone(status);
  return t === 'warning' ? 'neutral' : t;
}

export default function AgentCorePage() {
  const { lang } = useI18n();
  const [d, setD] = useState<AgentCoreStatus | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [capturedAt, setCapturedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/agentcore?bustCache=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: AgentCoreStatus = await res.json();
      setD(body);
      setCapturedAt(body.timestamp);
      setErr('');
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const gateways = d?.gateways ?? [];
  const readyGw = gateways.filter((g) => g.status.toUpperCase() === 'READY').length;
  const totalTargets = gateways.reduce((s, g) => s + g.targets, 0);
  const rtStatus = d?.runtime ? (d.runtime.endpointStatus ?? d.runtime.status) : null;

  return (
    <>
      <PageHeader
        title="AgentCore"
        subtitle="Bedrock AgentCore 런타임 · 게이트웨이 · 메모리 · 코드 인터프리터 상태 및 호출 통계"
        right={<RefreshButton busy={busy} onClick={load} capturedAt={capturedAt} />}
      />
      <div className="px-4 lg:px-8 py-8 flex flex-col gap-6">
        {err && <div className="text-[13px] text-rose-600">로드 실패: {err} (control-plane 권한 또는 세션 만료 확인)</div>}
        {!d && !err && <div className="text-ink-400">로딩 중…</div>}

        {d && (
          <>
            {/* Top-line status tiles */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile label="Runtime" icon={<Cpu size={16} />} value={rtStatus ?? '미배포'} variant={tone(rtStatus) === 'positive' ? 'accent' : tone(rtStatus) === 'negative' ? 'danger' : 'warn'} hint={d.runtime?.version ? `v${d.runtime.version}` : undefined} />
              <StatTile label="Gateways" icon={<Boxes size={16} />} value={`${readyGw}/${gateways.length}`} variant={gateways.length && readyGw === gateways.length ? 'accent' : 'warn'} hint={`${totalTargets} targets`} />
              <StatTile label="Memory" icon={<Database size={16} />} value={d.memory ? d.memory.status : '미배포'} variant={tone(d.memory?.status) === 'positive' ? 'accent' : 'warn'} />
              <StatTile label="Code Interpreter" icon={<Terminal size={16} />} value={d.interpreter ? d.interpreter.status : '미배포'} variant={tone(d.interpreter?.status) === 'positive' ? 'accent' : 'warn'} />
            </div>

            {/* Runtime detail */}
            {d.runtime && (
              <section className="rounded-lg border border-ink-100 bg-card p-5">
                <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Cpu size={15} className="text-brand-500" /> Runtime</h2>
                <div className="grid grid-cols-2 gap-3 font-mono text-[12px] md:grid-cols-3 lg:grid-cols-4">
                  <div><span className="text-ink-400">ID</span> <span className="text-ink-700">{d.runtime.id}</span></div>
                  <div><span className="text-ink-400">Status</span> <span className={tone(d.runtime.status) === 'positive' ? 'text-positive-text' : 'text-warning-text'}>{d.runtime.status}</span></div>
                  <div><span className="text-ink-400">Endpoint</span> <span className={tone(d.runtime.endpointStatus) === 'positive' ? 'text-positive-text' : 'text-warning-text'}>{d.runtime.endpointStatus ?? '—'}</span></div>
                  <div><span className="text-ink-400">Version</span> <span className="text-ink-700">{d.runtime.version ?? '—'}</span></div>
                  <div><span className="text-ink-400">Region</span> <span className="text-ink-700">{d.region}</span></div>
                  <div><span className="text-ink-400">Created</span> <span className="text-ink-600">{d.runtime.createdAt ? new Date(d.runtime.createdAt).toLocaleString(localeOf(lang)) : '—'}</span></div>
                  <div><span className="text-ink-400">Updated</span> <span className="text-ink-600">{d.runtime.lastUpdatedAt ? new Date(d.runtime.lastUpdatedAt).toLocaleString(localeOf(lang)) : '—'}</span></div>
                </div>
              </section>
            )}

            {/* Gateways grid */}
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Wifi size={15} className="text-brand-500" /> Gateways ({gateways.length})</h2>
              {gateways.length === 0 ? (
                <div className="rounded-md border border-ink-100 bg-paper-muted px-3 py-3 text-[13px] text-ink-400">배포된 게이트웨이가 없습니다.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {gateways.map((gw) => (
                    <div key={gw.id} className="rounded-lg border border-ink-100 bg-card p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg bg-brand-50 p-1.5"><Boxes size={15} className="text-brand-600" /></div>
                          <span className="text-[13px] font-semibold capitalize text-ink-800">{gw.shortName}</span>
                        </div>
                        <Badge tone={badgeTone(gw.status)} variant="soft">{gw.status}</Badge>
                      </div>
                      <div className="space-y-1 text-[12px]">
                        <div className="flex justify-between"><span className="text-ink-400">Targets</span><span className="font-mono font-semibold text-brand-700">{gw.targets}</span></div>
                        <div className="flex justify-between"><span className="text-ink-400">ID</span><span className="font-mono text-[9px] text-ink-400">{gw.id}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Memory + Interpreter detail */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-ink-100 bg-card p-5">
                <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Database size={15} className="text-brand-500" /> Memory</h2>
                {d.memory
                  ? <div className="font-mono text-[12px]"><span className="text-ink-400">ID</span> <span className="text-ink-700">{d.memory.id}</span> · <span className={tone(d.memory.status) === 'positive' ? 'text-positive-text' : 'text-warning-text'}>{d.memory.status}</span></div>
                  : <div className="text-[13px] text-ink-400">프로비저닝되지 않음</div>}
              </section>
              <section className="rounded-lg border border-ink-100 bg-card p-5">
                <h2 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink-800"><Terminal size={15} className="text-brand-500" /> Code Interpreter</h2>
                {d.interpreter
                  ? <div className="font-mono text-[12px]"><span className="text-ink-400">ID</span> <span className="text-ink-700">{d.interpreter.id}</span> · <span className={tone(d.interpreter.status) === 'positive' ? 'text-positive-text' : 'text-warning-text'}>{d.interpreter.status}</span></div>
                  : <div className="text-[13px] text-ink-400">프로비저닝되지 않음</div>}
              </section>
            </div>

            {/* Chat-invoke ops stats (reused; self-hides when nothing recorded) */}
            <ChatOpsStatsCard />
          </>
        )}
      </div>
    </>
  );
}
