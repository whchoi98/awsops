'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShieldCheck, ListChecks, CheckCircle2, AlertTriangle, CircleMinus, AlertCircle } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatTile, { passVariant } from '@/components/ui/StatTile';
import Meter from '@/components/ui/Meter';
import DataTable from '@/components/ui/DataTable';
import DetailPanel from '@/components/ui/DetailPanel';
import DonutBreakdown from '@/components/charts/DonutBreakdown';
import { useActiveAccount } from '@/lib/account-context';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

interface Benchmark { id: string; name: string; description: string }
interface Run {
  id: number; benchmark: string; status: string; account?: string; pass_rate: number | null;
  total_controls: number | null; ok: number | null; alarm: number | null;
  info: number | null; skip: number | null; error: number | null;
  started_at?: string; finished_at?: string; error_message?: string | null;
}
interface Result {
  control_id: string; title: string; section: string; status: string;
  reason: string; resource: string; region: string; severity: string;
}

const RESULT_COLS = [
  { key: 'control_id', label: 'Control' },
  { key: 'section', label: 'Section' },
  { key: 'status', label: 'Status' },
  { key: 'resource', label: 'Resource' },
  { key: 'region', label: 'Region' },
];

export default function CompliancePage() {
  const { lang } = useI18n();
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [benchmark, setBenchmark] = useState('cis_v300');
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState<Result | null>(null);
  // v1 parity: clicking a section card filters the Controls table to that section.
  const [sectionFilter, setSectionFilter] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // latestRunIdRef = the run currently DISPLAYED; activeJobIdRef = the just-started running job.
  // Keeping them separate means viewing a past run never cancels the live job's poll loop or its
  // busy gate — the running benchmark stays tracked (Run disabled) while you browse history.
  const latestRunIdRef = useRef<number | null>(null);
  const activeJobIdRef = useRef<number | null>(null);

  // Run history list (saved compliance_runs). Best-effort — never blocks the page.
  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch('/api/compliance/runs');
      const b = (await r.json()) as { runs?: Run[] };
      setRuns(b.runs ?? []);
    } catch {
      /* history is best-effort */
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetch('/api/compliance/benchmarks');
        const b = (await r.json()) as { benchmarks?: Benchmark[] };
        if (b.benchmarks?.length) {
          setBenchmarks(b.benchmarks);
          if (!b.benchmarks.some((x) => x.id === 'cis_v300')) setBenchmark(b.benchmarks[0].id);
        }
      } catch {
        /* selector falls back to the default id */
      }
    })();
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // Fetch one run's detail. Updates the displayed run/results only while it's still the shown run
  // (stale-guard). Returns {ok} so callers can tell a TRANSIENT fetch failure (retry) apart from a
  // real terminal/missing run (stop) — a failed poll must never be mistaken for "job finished".
  const fetchRun = useCallback(async (id: number): Promise<{ ok: boolean; run: Run | null }> => {
    let r: Response;
    try {
      r = await fetch(`/api/compliance/runs/${id}`);
    } catch {
      if (id === latestRunIdRef.current) setErr('run 조회 중 오류가 발생했습니다.');
      return { ok: false, run: null };
    }
    if (!r.ok) {
      if (id === latestRunIdRef.current) setErr(`run 조회 실패 (${r.status})`);
      return { ok: false, run: null };
    }
    const body = (await r.json().catch(() => ({}))) as { run?: Run; results?: Result[] };
    if (id === latestRunIdRef.current && body.run) {
      setErr(''); // a successful load clears any stale "조회 실패" banner from a prior transient error
      setRun(body.run);
      setResults(body.results ?? []);
    }
    return { ok: true, run: body.run ?? null };
  }, []);

  // Poll loop for the ACTIVE (just-started) job — owns the recurring timer + the busy gate.
  // A transient fetch error is RETRIED (≤3) — it must not re-enable Run on a still-running job.
  const pollActive = useCallback(async (id: number, errs = 0) => {
    const { ok, run } = await fetchRun(id);
    if (id !== activeJobIdRef.current) return; // a newer job started — this loop is obsolete
    if (!ok) {
      if (errs >= 3) { // give up after repeated failures; surface it, stop tracking
        if (id === latestRunIdRef.current) setErr('실행 상태 조회에 반복 실패했습니다.'); // only for the shown run
        setBusy(false);
        activeJobIdRef.current = null;
        return;
      }
      pollRef.current = setTimeout(() => void pollActive(id, errs + 1), 5000); // retry; keep busy
      return;
    }
    if (run && run.status === 'running') {
      pollRef.current = setTimeout(() => void pollActive(id, 0), 5000);
    } else {
      setBusy(false);                // genuinely terminal (or run gone) → re-enable Run
      activeJobIdRef.current = null;
      void loadHistory();            // refresh the saved-runs list
    }
  }, [fetchRun, loadHistory]);

  // Adopt a still-running run whenever the history list changes (covers a refresh / new tab landing
  // while a heavy compliance job is already in flight): track it as the active job so Run stays
  // disabled → no duplicate enqueue. Only when nothing is already tracked.
  useEffect(() => {
    if (activeJobIdRef.current !== null) return;
    const running = runs.find((x) => x.status === 'running');
    if (!running) return;
    latestRunIdRef.current = running.id;
    activeJobIdRef.current = running.id;
    setBusy(true);
    if (pollRef.current) clearTimeout(pollRef.current);
    void pollActive(running.id);
  }, [runs, pollActive]);

  // View a past run's saved results — one-shot, no re-run. Does NOT touch the live job's timer or
  // busy gate, so a running benchmark keeps being tracked (Run stays disabled) while you browse.
  const viewRun = useCallback((id: number) => {
    setErr('');
    setSelected(null);           // drop stale control-detail from the previously shown run
    latestRunIdRef.current = id; // switch the display; the live job's poll won't overwrite it
    void (async () => {
      const { run } = await fetchRun(id);
      // If the opened row is itself still running and nothing else is being tracked, adopt it as the
      // active job: disable Run (no duplicate heavy job) + auto-refresh until it reaches terminal.
      if (run?.status === 'running' && id === latestRunIdRef.current && activeJobIdRef.current === null) {
        if (pollRef.current) clearTimeout(pollRef.current);
        activeJobIdRef.current = id;
        setBusy(true);
        void pollActive(id);
      }
    })();
  }, [fetchRun, pollActive]);

  const [activeAccount] = useActiveAccount();
  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const runBenchmark = useCallback(async () => {
    setErr('');
    setBusy(true);
    setSelected(null);
    setRun(null);
    setResults([]);
    try {
      // Scope: a selected 12-digit member account pins the benchmark to that account's Steampipe
      // connection; host/'전체' runs the aggregator (all accounts merged — BFF maps '' → 'all').
      const r = await fetch('/api/compliance/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ benchmark, account: /^[0-9]{12}$/.test(activeAccount) ? activeAccount : '' }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        setErr(e.message || `Failed to start (${r.status})`);
        setBusy(false);
        return;
      }
      const { run_id } = (await r.json()) as { run_id: number };
      if (pollRef.current) clearTimeout(pollRef.current);
      activeJobIdRef.current = run_id; // the live job
      latestRunIdRef.current = run_id; // and the displayed run
      void pollActive(run_id);
    } catch {
      setErr('벤치마크 실행을 시작하지 못했습니다.');
      setBusy(false);
    }
  }, [benchmark, pollActive, activeAccount]);

  // Per-section pass% (client-side rollup over the leaf results).
  const sections = useMemo(() => {
    const m = new Map<string, { ok: number; alarm: number; skip: number; error: number; total: number }>();
    for (const r of results) {
      const s = m.get(r.section) ?? { ok: 0, alarm: 0, skip: 0, error: 0, total: 0 };
      s.total += 1;
      if (r.status === 'ok') s.ok += 1;
      else if (r.status === 'alarm') s.alarm += 1;
      else if (r.status === 'skip') s.skip += 1;
      else s.error += 1;
      m.set(r.section, s);
    }
    return [...m.entries()]
      .map(([section, v]) => ({ section, pct: v.total ? (v.ok / v.total) * 100 : 0, ...v }))
      .sort((a, b) => a.pct - b.pct);
  }, [results]);

  // Selected section may vanish when a different run loads — drop the stale filter.
  useEffect(() => {
    if (sectionFilter && !sections.some((s) => s.section === sectionFilter)) setSectionFilter(null);
  }, [sections, sectionFilter]);

  const shownResults = useMemo(
    () => (sectionFilter ? results.filter((r) => r.section === sectionFilter) : results),
    [results, sectionFilter],
  );

  const statusDist = run
    ? [
        { name: 'OK', value: run.ok ?? 0 },
        { name: 'Alarm', value: run.alarm ?? 0 },
        { name: 'Info', value: run.info ?? 0 },
        { name: 'Skip', value: run.skip ?? 0 },
        { name: 'Error', value: run.error ?? 0 },
      ]
    : [];

  const passRate = run?.pass_rate != null ? Number(run.pass_rate) : null;

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="CIS AWS Foundations Benchmark — Powerpipe (read-only) against the live account"
        right={
          <div className="flex items-center gap-2">
            <select
              value={benchmark}
              onChange={(e) => setBenchmark(e.target.value)}
              disabled={busy}
              className="rounded-md border border-ink-100 bg-card px-2.5 py-1.5 text-[13px] text-ink-800"
            >
              {(benchmarks.length ? benchmarks : [{ id: 'cis_v300', name: 'CIS AWS v3.0.0', description: '' }]).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={runBenchmark} disabled={busy}>
              {busy ? '실행 중…' : 'Run Benchmark'}
            </Button>
          </div>
        }
      />
      <div className="px-8 py-6">
        {err && <Card className="mb-4 text-[14px] text-brand-700">{err}</Card>}

        {!run && !busy && (
          <Card className="text-[14px] text-ink-500">
            Select a benchmark and run it. Results (pass rate, per-section breakdown, and per-control
            findings) appear here and are saved as run history. Requires the Steampipe inventory
            (steampipe_enabled) to be active.
          </Card>
        )}

        {busy && !run && <Card className="text-[14px] text-ink-500">벤치마크 실행 중… (수 분 소요될 수 있습니다)</Card>}

        {runs.length > 0 && (
          <Card className="mb-4">
            <div className="mb-2 text-[13px] font-semibold text-ink-700">Recent runs</div>
            <div className="flex flex-col divide-y divide-ink-100">
              {runs.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => viewRun(h.id)}
                  className={`flex items-center justify-between gap-3 py-2 text-left text-[13px] hover:bg-ink-50 ${run?.id === h.id ? 'text-brand-700' : 'text-ink-700'}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="font-medium">{h.benchmark}</span>
                    {h.account && h.account !== 'all' && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-500">{h.account}</span>
                    )}
                    {/* execution time distinguishes repeated runs of the same benchmark (v1 parity) */}
                    <span className="tabular-nums truncate text-ink-400">{h.started_at ? new Date(h.started_at).toLocaleString(localeOf(lang)) : ''}</span>
                  </span>
                  <span className="flex items-center gap-3 text-ink-500">
                    <span>{h.status}</span>
                    <span className="tabular-nums w-12 text-right">{h.pass_rate != null ? `${Number(h.pass_rate).toFixed(0)}%` : '—'}</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {run && (
          <>
            {/* identify WHICH run is shown — benchmark + execution time (v1 parity), so repeated
                runs of the same benchmark are distinguishable, not duplicated-looking. */}
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[13px]">
              <span className="font-semibold text-ink-800">{run.benchmark}</span>
              {run.started_at && (
                <span className="tabular-nums text-ink-500">
                  실행 {new Date(run.started_at).toLocaleString(localeOf(lang))}
                  {run.finished_at ? ` · 완료 ${new Date(run.finished_at).toLocaleString(localeOf(lang))}` : ''}
                </span>
              )}
              <span className="text-ink-400">#{run.id}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <StatTile
                label="Pass Rate"
                value={passRate != null ? `${passRate.toFixed(1)}%` : '—'}
                variant={passRate != null ? passVariant(passRate) : 'default'}
                icon={<ShieldCheck size={16} />}
              />
              <StatTile label="Total" value={run.total_controls ?? 0} icon={<ListChecks size={16} />} />
              <StatTile label="Passed" value={run.ok ?? 0} variant="accent" icon={<CheckCircle2 size={16} />} />
              <StatTile label="Alarm" value={run.alarm ?? 0} variant="danger" icon={<AlertTriangle size={16} />} />
              <StatTile label="Skipped" value={run.skip ?? 0} icon={<CircleMinus size={16} />} />
              <StatTile label="Error" value={run.error ?? 0} variant={run.error ? 'warn' : 'default'} icon={<AlertCircle size={16} />} />
            </div>

            {run.status === 'failed' && (
              <Card className="mt-4 text-[14px] text-brand-700">
                Benchmark failed: {run.error_message || 'unknown error'}
              </Card>
            )}

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <DonutBreakdown title="Controls by status" data={statusDist} nameKey="name" valueKey="value" />
              <Card>
                <div className="mb-3 text-[13px] font-semibold text-ink-700">Pass rate by section</div>
                <div className="flex flex-col gap-2">
                  {sections.length === 0 && <div className="text-[13px] text-ink-400">데이터 없음</div>}
                  {sections.map((s) => (
                    <button
                      key={s.section}
                      type="button"
                      onClick={() => setSectionFilter((cur) => (cur === s.section ? null : s.section))}
                      className={
                        'rounded-md px-2 py-1.5 text-left transition ' +
                        (sectionFilter === s.section ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-ink-50')
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-[13px] text-ink-700" title={s.section}>{s.section}</span>
                        <span className="shrink-0 tabular text-[11px] text-ink-400">
                          <span className="text-positive-text">{s.ok}</span>
                          {' / '}
                          <span className={s.alarm > 0 ? 'text-negative' : ''}>{s.alarm}</span>
                          {' / '}{s.skip}
                        </span>
                      </div>
                      {/* v1-parity stacked status bar: ok / alarm / skip+error */}
                      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-ink-100">
                        <span style={{ width: `${(s.ok / s.total) * 100}%` }} className="bg-positive" />
                        <span style={{ width: `${(s.alarm / s.total) * 100}%` }} className="bg-negative" />
                        <span style={{ width: `${((s.skip + s.error) / s.total) * 100}%` }} className="bg-ink-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ink-700">
                Controls
                {sectionFilter && (
                  <button
                    type="button"
                    onClick={() => setSectionFilter(null)}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100"
                  >
                    {sectionFilter} ×
                  </button>
                )}
                <span className="font-normal text-ink-400">{shownResults.length} / {results.length}</span>
              </div>
              <DataTable
                columns={RESULT_COLS}
                rows={shownResults as unknown as Record<string, unknown>[]}
                onRowClick={(row) => setSelected(row as unknown as Result)}
                cardTitleKey="control_id"
              />
            </div>
          </>
        )}
      </div>

      <DetailPanel
        title={selected ? `${selected.control_id} — ${selected.title}` : undefined}
        data={selected as unknown as Record<string, unknown> | null}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
