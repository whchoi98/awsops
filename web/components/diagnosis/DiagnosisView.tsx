'use client';
import { useEffect, useState, useCallback } from 'react';
import SchedulePanel from './SchedulePanel';
import SubscribersPanel from './SubscribersPanel';
import ReportMarkdown from './ReportMarkdown';
import IntentPanel from './IntentPanel';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

interface DiagnosisProgress {
  current?: number;
  total?: number;
  section?: string;
  phase?: 'collect' | 'render' | 'assemble';
}

interface ReportRow {
  id: number;
  tier: string;
  status: string;
  created_at: string;
  model?: string | null;        // deep-tier model (sonnet|opus); shown in the list for deep reports
  account?: string | null;      // diagnosed account id (from the job payload; null on legacy rows)
  title?: string | null;        // LLM auto key-insight title (editable)
  tags?: string[];              // auto-suggested + manual
  can_edit?: boolean;           // owner or admin (BFF-computed) → show edit/delete controls
  error?: string | null;       // A6: surface failed reports (was hidden → looked stuck)
  progress?: DiagnosisProgress; // A3/A6: live per-section progress
}

// Plan-2: intended-vs-actual verdict surfaced in summary.drift; regression diff in summary.diff.
interface DriftVerdict {
  id?: number | string;
  kind?: string;
  target?: string | null;
  severity?: string;
  observed?: string;
}
interface ReportSummary {
  drift?: DriftVerdict[];
  diff?: { regressions?: DriftVerdict[]; improvements?: (number | string)[] };
  [k: string]: unknown;
}

const SEV_CLASS: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-ink-200 bg-ink-100 text-ink-600',
};

// Safe date formatting — tests (and legacy rows) may carry an unparseable value; fall back to raw.
function fmtDate(ds: string | undefined, locale: string) {
  if (!ds) return '';
  const d = new Date(ds);
  return isNaN(d.getTime()) ? ds : d.toLocaleString(locale);
}
function fmtDay(ds: string | undefined, locale: string) {
  if (!ds) return '';
  const d = new Date(ds);
  return isNaN(d.getTime()) ? ds : d.toLocaleDateString(locale);
}

export default function DiagnosisView() {
  const { lang } = useI18n();
  const locale = localeOf(lang);
  const [tier, setTier] = useState<'light' | 'mid' | 'deep'>('mid');
  const [model, setModel] = useState<'sonnet' | 'opus'>('sonnet'); // deep-tier model choice

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [active, setActive] = useState<{ id: number; markdown: string | null; summary: ReportSummary | null; status?: string; error?: string | null; progress?: DiagnosisProgress; title?: string | null; tags?: string[]; can_edit?: boolean } | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null); // non-null while editing the title
  const [tagDraft, setTagDraft] = useState('');
  const [submitting, setSubmitting] = useState(false); // brief: the POST round-trip only
  const [pollTicks, setPollTicks] = useState(0);        // # of 3s polls a running report has survived
  const [notice, setNotice] = useState<string | null>(null); // [PR#37 review] surface deduped reports
  const [deepLinkId, setDeepLinkId] = useState<number | null>(null); // honoring an emailed ?report= link

  const POLL_MS = 3000;
  const LONG_AFTER = 40; // ~2min → show a "taking longer than usual" hint (reaper fails truly-stale rows)

  const loadList = useCallback(async () => {
    const r = await fetch('/api/diagnosis');
    if (r.ok) setReports((await r.json()).reports);
  }, []);

  const open = useCallback(async (id: number) => {
    const r = await fetch(`/api/diagnosis/${id}`);
    if (r.ok) {
      const j = await r.json();
      setActive({
        id, markdown: j.markdown, summary: (j.report?.summary as ReportSummary) ?? null,
        status: j.report?.status, error: j.report?.error ?? null, progress: j.report?.progress,
        title: j.report?.title ?? null, tags: j.report?.tags ?? [], can_edit: j.report?.can_edit ?? false,
      });
    }
  }, []);

  // Soft-delete a report (owner/admin). Confirm → DELETE → reload; clear the pane if it was open.
  const del = useCallback(async (id: number) => {
    if (!window.confirm('이 리포트를 삭제할까요? (목록에서 숨겨집니다)')) return;
    const r = await fetch(`/api/diagnosis/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setActive((a) => (a?.id === id ? null : a));
      await loadList();
    }
  }, [loadList]);

  // Persist title/tags (owner/admin) and reflect locally + in the list.
  const patchMeta = useCallback(async (id: number, meta: { title?: string | null; tags?: string[] }) => {
    const r = await fetch(`/api/diagnosis/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(meta),
    });
    if (r.ok) {
      setActive((a) => (a && a.id === id ? { ...a, ...meta } : a));
      await loadList();
    }
  }, [loadList]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // Deep link: /ai-diagnosis?report=ID (scheduled-report emails link here) auto-opens that report.
  // open(id) is async, so we set deepLinkId synchronously to suppress the newest-report auto-open below
  // until this resolves — otherwise loadList() could populate `top` and hijack the emailed target. On
  // failure (bad/deleted id), deepLinkId clears → the newest-report fallback resumes. Runs once on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = new URLSearchParams(window.location.search).get('report');
    if (raw && /^\d+$/.test(raw)) {
      const id = Number(raw);
      setDeepLinkId(id);
      Promise.resolve(open(id)).finally(() => setDeepLinkId(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const top = reports[0];
  const topRunning = top?.status === 'running';

  // Single poll loop: while the newest report is running, refresh the list every 3s. update_progress
  // advances it; the reaper fails it if the worker dies → it ALWAYS reaches a terminal state, so this
  // never loops forever (replaces the old inline 3s×100 loop that gave up silently).
  useEffect(() => {
    if (!topRunning) return;
    const t = setTimeout(() => { loadList(); setPollTicks((c) => c + 1); }, POLL_MS);
    return () => clearTimeout(t);
  }, [topRunning, reports, loadList]);

  // Auto-open the newest report once it finishes (or on first load) when the user isn't already
  // viewing something — mirrors V1 showing the latest report. Failed rows render the failed panel
  // from `view` (no markdown to open).
  useEffect(() => {
    // Suppress the newest-report auto-open while an emailed deep link is still being honored.
    const deepLinkPending = deepLinkId !== null && !active;
    if (!deepLinkPending && top && (top.status === 'succeeded' || top.status === 'partial') && active?.id !== top.id && !active) {
      open(top.id);
    }
    if (top && top.status !== 'running') setPollTicks(0);
  }, [top, active, open, deepLinkId]);

  const run = async () => {
    setSubmitting(true);
    setNotice(null);
    try {
      const r = await fetch('/api/diagnosis', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(tier === 'deep' ? { tier, model } : { tier }),
      });
      if (!r.ok) return;
      const posted = await r.json();
      // [PR#37 review MAJOR] a same-hour re-run is deduped server-side → open the existing report
      // and tell the user (it can be up to ~60min old) instead of silently showing a stale view.
      if (posted?.deduped && posted?.report_id) {
        setNotice('최근 1시간 내 동일 조건 리포트를 표시합니다 (중복 실행 방지 — 최대 60분 이전 결과일 수 있음).');
        await loadList();
        await open(posted.report_id);
        return;
      }
      setActive(null);  // clear any opened report so the new running one shows its progress
      await loadList(); // the poll effect takes over while the new report is 'running'
    } finally {
      setSubmitting(false);
    }
  };

  // What the main pane shows: an opened report, else the newest report's live state.
  const view = active ?? (top
    ? { id: top.id, markdown: null as string | null, summary: null as ReportSummary | null,
        status: top.status, error: top.error, progress: top.progress,
        title: top.title ?? null, tags: top.tags ?? [], can_edit: top.can_edit ?? false }
    : null);
  const running = submitting || topRunning;

  // Generation date of the opened report (the view object omits created_at → look it up on the row).
  const createdAt = reports.find((r) => r.id === view?.id)?.created_at;

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as 'light' | 'mid' | 'deep')}
            className="rounded-md border border-ink-200 bg-card px-2 py-1 text-sm text-ink-700"
          >
            <option value="light">Light</option>
            <option value="mid">Mid</option>
            <option value="deep">Deep (15섹션)</option>
          </select>
          <button
            onClick={run}
            disabled={running}
            className="rounded-md bg-brand-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? '진단 중…' : '진단 실행'}
          </button>
        </div>
        {tier === 'deep' && (
          <fieldset className="rounded-md border border-ink-200 px-2 py-1.5 text-[13px]">
            <legend className="px-1 text-ink-400">모델</legend>
            <div className="flex items-center gap-3">
              {(['sonnet', 'opus'] as const).map((m) => (
                <label key={m} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="diag-model"
                    value={m}
                    checked={model === m}
                    onChange={() => setModel(m)}
                  />
                  <span className="capitalize">{m}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-ink-400">Opus: 더 깊은 분석, 비용↑</p>
          </fieldset>
        )}
        <SchedulePanel />
        <SubscribersPanel />
        <ul className="space-y-1">
          {reports.map((r) => (
            <li key={r.id} className="flex items-center gap-1">
              <button
                onClick={() => open(r.id)}
                className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left hover:bg-ink-100"
              >
                {/* title leads (auto key-insight); falls back to id·tier when absent */}
                <div className="truncate text-[13px] font-medium text-ink-800">
                  {r.title || `#${r.id} · ${r.tier}`}
                </div>
                <div className="text-[11px] text-ink-400">
                  #{r.id} · {r.tier}
                  {r.tier === 'deep' && r.model ? ` · ${r.model}` : ''}
                  {r.account ? ` · ${r.account}` : ''} ·{' '}
                  <span className={r.status === 'failed' ? 'text-negative' : ''}>
                    {r.status === 'running' && r.progress?.total
                      ? `running ${r.progress.current ?? 0}/${r.progress.total}`
                      : r.status}
                  </span>
                  {r.created_at ? ` · ${fmtDay(r.created_at, locale)}` : ''}
                </div>
              </button>
              {r.can_edit ? (
                <button
                  onClick={() => del(r.id)}
                  aria-label="리포트 삭제"
                  title="삭제"
                  className="shrink-0 rounded-md px-2 py-1 text-ink-300 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </aside>
      <main className="min-w-0 flex-1">
        {notice && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {notice}
          </div>
        )}
        <div className="mb-4">
          <IntentPanel />
        </div>
        {view?.markdown ? (
          <>
            {/* Title — editable inline by owner/admin; read-only otherwise. Plain text (React-escaped). */}
            {view.can_edit ? (
              titleDraft !== null ? (
                <div className="mb-2 flex items-center gap-2">
                  <input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    maxLength={200}
                    aria-label="제목"
                    className="min-w-0 flex-1 rounded-md border border-ink-200 bg-card px-2 py-1 text-base text-ink-800"
                  />
                  <button
                    onClick={async () => { await patchMeta(view!.id, { title: titleDraft!.trim() || null }); setTitleDraft(null); }}
                    className="rounded-md bg-brand-500 px-3 py-1 text-sm font-medium text-white"
                  >저장</button>
                  <button onClick={() => setTitleDraft(null)} className="rounded-md border border-ink-200 px-3 py-1 text-sm">취소</button>
                </div>
              ) : (
                <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink-800">
                  <span className="min-w-0 break-words">{view.title || '(제목 없음)'}</span>
                  <button onClick={() => setTitleDraft(view!.title ?? '')} aria-label="제목 수정" title="제목 수정" className="shrink-0 text-ink-300 hover:text-brand-600">✏️</button>
                </h2>
              )
            ) : view.title ? (
              <h2 className="mb-2 text-lg font-semibold text-ink-800">{view.title}</h2>
            ) : null}
            {/* Tags — chips; owner/admin can add (Enter) / remove (×). */}
            <div className="mb-3 flex flex-wrap items-center gap-1">
              {(view.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[12px] text-ink-700">
                  {t}
                  {view.can_edit ? (
                    <button onClick={() => patchMeta(view!.id, { tags: (view!.tags ?? []).filter((x) => x !== t) })} aria-label={`태그 ${t} 삭제`} className="text-ink-400 hover:text-red-600">×</button>
                  ) : null}
                </span>
              ))}
              {view.can_edit ? (
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && tagDraft.trim()) {
                      const next = Array.from(new Set([...(view!.tags ?? []), tagDraft.trim()]));
                      patchMeta(view!.id, { tags: next });
                      setTagDraft('');
                    }
                  }}
                  placeholder="태그 추가"
                  aria-label="태그 추가"
                  className="w-24 rounded-md border border-ink-200 bg-card px-2 py-0.5 text-[12px] text-ink-800"
                />
              ) : null}
            </div>
            <div className="mb-3 flex items-center justify-between gap-2">
              {createdAt ? (
                <span className="text-[12px] text-ink-400">생성 일시: {fmtDate(createdAt, locale)}</span>
              ) : <span />}
              <div className="flex gap-2">
                {(['md', 'docx', 'pdf'] as const).map((f) => (
                  <a
                    key={f}
                    href={`/api/diagnosis/${view!.id}/download?format=${f}`}
                    download={`awsops-diagnosis-${view!.id}.${f}`}
                    className="rounded-md border border-ink-200 px-3 py-1.5 text-sm hover:bg-ink-100"
                  >
                    {f.toUpperCase()}
                  </a>
                ))}
              </div>
            </div>
            {view.summary && <ReportInsights summary={view.summary} />}
            <ReportMarkdown markdown={view.markdown} />
          </>
        ) : view?.status === 'running' ? (
          <ProgressPanel progress={view.progress} stalled={pollTicks >= LONG_AFTER} />
        ) : view?.status === 'failed' ? (
          <FailedPanel error={view.error} onRetry={run} disabled={running} />
        ) : (
          <p className="text-sm text-ink-400">리포트를 선택하거나 “진단 실행”을 누르세요.</p>
        )}
      </main>
    </div>
  );
}

// A6 (V1 parity): live per-section progress while a report is running — never a bare spinner, so a
// stalled run is visible. The reaper (B2) turns a dead worker into a 'failed' row within minutes.
function ProgressPanel({ progress, stalled }: { progress?: DiagnosisProgress; stalled?: boolean }) {
  const cur = progress?.current ?? 0;
  const total = progress?.total ?? 0;
  const pct = total > 0 ? Math.round((cur / total) * 100) : 0;
  const phaseLabel =
    progress?.phase === 'collect' ? '데이터 수집'
    : progress?.phase === 'assemble' ? '리포트 조립'
    : '섹션 분석';
  return (
    <div className="rounded-md border border-ink-200 bg-paper p-4">
      <div className="mb-2 flex items-center justify-between text-[13px] text-ink-700">
        <span className="font-medium">AI 진단 진행 중… {phaseLabel}</span>
        {total > 0 && <span className="tabular-nums text-ink-500">{cur} / {total}</span>}
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
        role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      {progress?.section && (
        <div className="mt-2 text-[12px] text-ink-600">
          현재 섹션: <span className="font-medium text-ink-800">{progress.section}</span>
        </div>
      )}
      {stalled && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          예상보다 오래 걸리고 있습니다. 계속 확인 중이며, 워커 장애 시 자동으로 ‘실패’로 정리됩니다.
        </div>
      )}
    </div>
  );
}

// A6: surface a failed report (was hidden → the row sat in 'running' and looked stuck) + a retry.
function FailedPanel({ error, onRetry, disabled }: { error?: string | null; onRetry: () => void; disabled?: boolean }) {
  return (
    <div className="rounded-md border border-red-300 bg-red-50 p-4">
      <div className="mb-1 text-[13px] font-semibold text-red-800">AI 진단 실패</div>
      <p className="mb-3 break-words text-[12px] text-red-700">
        {error || '워커가 진단을 완료하지 못했습니다.'}
      </p>
      <button
        onClick={onRetry}
        disabled={disabled}
        className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
      >
        재시도
      </button>
    </div>
  );
}

// Plan-2: intended-vs-actual drift + regression-vs-previous diff, surfaced as small badge sections.
function ReportInsights({ summary }: { summary: ReportSummary }) {
  const drift = summary.drift ?? [];
  const regressions = summary.diff?.regressions ?? [];
  const improvements = summary.diff?.improvements ?? [];
  if (drift.length === 0 && regressions.length === 0 && improvements.length === 0) return null;
  return (
    <div className="mb-4 space-y-3">
      {drift.length > 0 && (
        <div className="rounded-md border border-ink-200 bg-paper p-3">
          <div className="mb-2 text-[12px] font-semibold text-ink-700">의도 대비 실제 (intended vs actual) — 위반 {drift.length}건</div>
          <div className="flex flex-wrap gap-1.5">
            {drift.map((v, idx) => (
              <span
                key={`${v.id}-${idx}`}
                title={v.observed}
                className={`rounded border px-1.5 py-0.5 text-[11px] ${SEV_CLASS[v.severity ?? 'info'] ?? SEV_CLASS.info}`}
              >
                {v.kind}{v.target ? ` → ${v.target}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {(regressions.length > 0 || improvements.length > 0) && (
        <div className="rounded-md border border-ink-200 bg-paper p-3">
          <div className="mb-2 text-[12px] font-semibold text-ink-700">이전 리포트 대비 변화 (diff)</div>
          <div className="flex flex-wrap gap-1.5">
            {regressions.map((v, idx) => (
              <span key={`reg-${idx}`} title={v.observed} className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
                ▲ 악화: {v.kind ?? 'posture'}{v.target ? ` → ${v.target}` : ''}
              </span>
            ))}
            {improvements.map((id, idx) => (
              <span key={`imp-${idx}`} className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">
                ▼ 해소: #{String(id)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
