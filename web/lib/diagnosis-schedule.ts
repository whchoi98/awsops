// Scheduled auto-diagnosis — read/upsert the per-user row in the existing `report_schedules` table
// (singleton per (user_sub, schedule_type); tier/model live in the `config` JSONB; `next_run_at` is NOT NULL
// so it is always set — the `enabled` flag, not a null next-run, gates firing). v1 parity for
// src/lib/report-scheduler.ts. The worker-side dispatcher (EventBridge) scans this table; this module is the
// BFF read/write seam only. Stored times are UTC (TIMESTAMPTZ); KST is a display concern in the UI.
import { getPool } from '@/lib/db';

export type ScheduleFreq = 'weekly' | 'biweekly' | 'monthly';
export const SCHEDULE_FREQS: ScheduleFreq[] = ['weekly', 'biweekly', 'monthly'];

export interface DiagnosisSchedule {
  scheduleType: ScheduleFreq;
  enabled: boolean;
  tier: string;
  model: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

/** Next run = `from` + one interval, returned as a UTC ISO string. weekly=+7d, biweekly=+14d, monthly=+1 month. */
export function computeNextRun(type: ScheduleFreq, fromISO: string): string {
  const d = new Date(fromISO);
  if (type === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (type === 'biweekly') d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}

interface Row {
  schedule_type: string;
  enabled: boolean;
  next_run_at: string | Date | null;
  last_run_at: string | Date | null;
  config: { tier?: string; model?: string | null } | null;
}

const iso = (v: string | Date | null): string | null => (v == null ? null : new Date(v).toISOString());

function mapRow(r: Row): DiagnosisSchedule {
  const cfg = r.config ?? {};
  return {
    scheduleType: r.schedule_type as ScheduleFreq,
    enabled: r.enabled,
    tier: cfg.tier ?? 'mid',
    model: cfg.model ?? null,
    nextRunAt: iso(r.next_run_at),
    lastRunAt: iso(r.last_run_at),
  };
}

const SELECT_SQL = `SELECT schedule_type, enabled, next_run_at, last_run_at, config
     FROM report_schedules WHERE user_sub = $1 ORDER BY enabled DESC, updated_at DESC LIMIT 1`;

/** The caller's current schedule, or null if they have none yet. Scoped by immutable Cognito sub. */
export async function readSchedule(userSub: string): Promise<DiagnosisSchedule | null> {
  const { rows } = await getPool().query<Row>(SELECT_SQL, [userSub]);
  return rows.length ? mapRow(rows[0]) : null;
}

/** Another writer holds this user's single active-schedule slot (see uq_schedule_one_active). */
export class ScheduleSlotTakenError extends Error {
  constructor() {
    super('another write is holding this user\'s active schedule slot; retry in a moment');
    this.name = 'ScheduleSlotTakenError';
  }
}

/** Create/replace the caller's schedule. next_run_at is always recomputed (NOT NULL); `enabled` gates firing. */
export async function upsertSchedule(
  userSub: string,
  input: { scheduleType: ScheduleFreq; enabled: boolean; tier?: string; model?: string | null; nowISO?: string },
): Promise<DiagnosisSchedule> {
  const nextRunAt = computeNextRun(input.scheduleType, input.nowISO ?? new Date().toISOString());
  const config = { tier: input.tier ?? 'mid', model: input.model ?? null };
  // One active schedule per user. The table's conflict key is (user_sub, schedule_type), so changing
  // frequency (e.g. weekly→monthly) would INSERT a new row and leave the previous one enabled — the
  // dispatcher (WHERE enabled) would then fire BOTH, and readSchedule (LIMIT 1) would hide the leak.
  // Disable every other-frequency row for this user, then upsert the chosen one.
  //
  // ONE TRANSACTION on ONE connection. These were two separate pool queries, which means two separate
  // autocommit transactions on possibly different connections: between them the user has NO enabled
  // schedule (a dispatcher tick in that gap silently skips them), and two concurrent saves can
  // interleave as disable/disable/insert/insert — which uq_schedule_one_active now turns into a hard
  // 23505 for the second, where before it merely left the table wrong (PR #203 review MAJOR). Inside
  // one transaction the pair is atomic and the second saver waits on the first's row locks.
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE report_schedules SET enabled = false WHERE user_sub = $1 AND schedule_type <> $2`,
      [userSub, input.scheduleType],
    );
    const { rows } = await client.query<Row>(
      `INSERT INTO report_schedules (user_sub, schedule_type, enabled, next_run_at, config)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (user_sub, schedule_type)
       DO UPDATE SET enabled = EXCLUDED.enabled, next_run_at = EXCLUDED.next_run_at, config = EXCLUDED.config
       RETURNING schedule_type, enabled, next_run_at, last_run_at, config`,
      [userSub, input.scheduleType, input.enabled, nextRunAt, JSON.stringify(config)],
    );
    await client.query('COMMIT');
    return mapRow(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // uq_schedule_one_active (migration 01KZ3C7Q…) now enforces one enabled row per user at the DB.
    // The disable above means this insert cannot collide with the caller's own rows, so reaching here
    // means something else claimed the slot concurrently — in practice the owner-sub backfill moving a
    // legacy email-keyed row onto this sub. Say so with a 409 rather than letting a raw 23505 surface
    // as a 500.
    const code = (e as { code?: string }).code;
    // 23505 = the index refused a second active row. 40P01/40001 = two concurrent saves for the same
    // user deadlocked or failed to serialize (opposing frequency changes lock the same rows in opposite
    // order). All three mean "someone else was writing this user's schedule" and all three are
    // retryable, so none of them should surface as a 500 (codex stop-gate).
    if ((code === '23505'
          && String((e as { constraint?: string }).constraint || '').includes('one_active'))
        || code === '40P01' || code === '40001') {
      throw new ScheduleSlotTakenError();
    }
    throw e;
  } finally {
    client.release();
  }
}
