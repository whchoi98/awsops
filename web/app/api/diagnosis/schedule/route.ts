// Per-user auto-diagnosis schedule. THIN-BFF: this route ONLY reads/writes the report_schedules row — it never
// runs a diagnosis inline. The EventBridge-driven schedule_dispatcher (worker tier) scans report_schedules and
// enqueues the runs. Scoped by the authenticated user's immutable Cognito sub (no cross-user access).
import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import {
  readSchedule, upsertSchedule, ScheduleSlotTakenError, SCHEDULE_FREQS, type ScheduleFreq,
} from '@/lib/diagnosis-schedule';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

const DISABLED_DEFAULT = { scheduleType: 'weekly' as ScheduleFreq, enabled: false, tier: 'mid', model: null, nextRunAt: null, lastRunAt: null };

export async function GET(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  const schedule = await readSchedule(user.sub);
  return NextResponse.json({ schedule: schedule ?? DISABLED_DEFAULT });
}

export async function PUT(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = (await readJsonBounded(req)) as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    /* empty/invalid body → validation below rejects */
  }

  const scheduleType = body?.scheduleType as ScheduleFreq;
  if (!SCHEDULE_FREQS.includes(scheduleType)) {
    return NextResponse.json({ message: 'invalid frequency' }, { status: 400 });
  }
  const enabled = body?.enabled === true;
  const tier = ['light', 'mid', 'deep'].includes(body?.tier as string) ? (body.tier as string) : 'mid';
  const model = typeof body?.model === 'string' ? (body.model as string) : null;

  // Persist only — the dispatcher (not this route) enqueues runs.
  let schedule;
  try {
    schedule = await upsertSchedule(user.sub, { scheduleType, enabled, tier, model });
  } catch (e) {
    if (e instanceof ScheduleSlotTakenError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ schedule });
}
