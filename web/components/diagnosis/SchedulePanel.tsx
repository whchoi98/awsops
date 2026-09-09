'use client';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/shell/LanguageProvider';
import { localeOf } from '@/lib/i18n';

// Per-user scheduled auto-diagnosis (v1 report-scheduler parity). Reads/writes /api/diagnosis/schedule;
// the EventBridge dispatcher (worker tier) does the actual enqueueing — this panel only edits the row.
interface Schedule {
  scheduleType: 'weekly' | 'biweekly' | 'monthly';
  enabled: boolean;
  tier: string;
  model: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

function fmtKst(iso: string | null, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function SchedulePanel() {
  const { lang } = useI18n();
  const locale = localeOf(lang);
  const [sched, setSched] = useState<Schedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/diagnosis/schedule')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.schedule) setSched(d.schedule as Schedule); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!sched) return null;

  const patch = (p: Partial<Schedule>) => { setSched({ ...sched, ...p }); setSaved(false); };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch('/api/diagnosis/schedule', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scheduleType: sched.scheduleType, enabled: sched.enabled, tier: sched.tier, model: sched.model }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d?.schedule) setSched(d.schedule as Schedule);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <fieldset className="rounded-md border border-ink-200 px-2 py-1.5 text-[13px]">
      <legend className="px-1 text-ink-400">자동 진단 예약</legend>
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={sched.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
        <span>주기적으로 진단 실행</span>
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          aria-label="진단 주기"
          value={sched.scheduleType}
          onChange={(e) => patch({ scheduleType: e.target.value as Schedule['scheduleType'] })}
          className="rounded-md border border-ink-200 bg-card px-2 py-1 text-[13px] text-ink-700"
        >
          <option value="weekly">매주</option>
          <option value="biweekly">격주</option>
          <option value="monthly">매월</option>
        </select>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-brand-500 px-2.5 py-1 text-[13px] font-medium text-white disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>
      {sched.enabled && <p className="mt-1 text-[11px] text-ink-400">다음 실행: {fmtKst(sched.nextRunAt, locale)} (KST)</p>}
      {saved && <p className="mt-1 text-[11px] text-green-600">저장됨</p>}
    </fieldset>
  );
}
