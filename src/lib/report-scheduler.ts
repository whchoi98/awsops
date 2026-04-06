// Report Scheduler — periodic diagnosis report generation
// 리포트 스케줄러 — 주기적 종합진단 리포트 자동 생성
import * as fs from 'fs';
import * as path from 'path';

const SCHEDULE_FILE = path.join(process.cwd(), 'data', 'report-schedule.json');

export type ScheduleFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface ReportSchedule {
  enabled: boolean;
  frequency: ScheduleFrequency;
  dayOfWeek: number;       // 0=Sun..6=Sat (for weekly/biweekly)
  dayOfMonth: number;      // 1-28 (for monthly)
  hour: number;            // 0-23 (KST)
  accountId?: string;      // target account (undefined = all)
  lang: string;            // 'ko' | 'en'
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_SCHEDULE: ReportSchedule = {
  enabled: false,
  frequency: 'weekly',
  dayOfWeek: 1,       // Monday
  dayOfMonth: 1,
  hour: 6,            // 06:00 KST
  lang: 'ko',
  lastRunAt: null,
  nextRunAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export function readSchedule(): ReportSchedule {
  try {
    if (fs.existsSync(SCHEDULE_FILE)) {
      const raw = fs.readFileSync(SCHEDULE_FILE, 'utf-8');
      return { ...DEFAULT_SCHEDULE, ...JSON.parse(raw) };
    }
  } catch { /* use default */ }
  return { ...DEFAULT_SCHEDULE };
}

export function writeSchedule(schedule: ReportSchedule): void {
  const dir = path.dirname(SCHEDULE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  schedule.updatedAt = new Date().toISOString();
  if (schedule.enabled) {
    schedule.nextRunAt = computeNextRun(schedule);
  } else {
    schedule.nextRunAt = null;
  }
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(schedule, null, 2));
}

export function computeNextRun(schedule: ReportSchedule): string {
  const now = new Date();
  // Work in KST (UTC+9)
  const kstOffset = 9 * 60 * 60 * 1000;
  const nowKst = new Date(now.getTime() + kstOffset);

  let next: Date;

  if (schedule.frequency === 'monthly') {
    // Next occurrence of dayOfMonth at the given hour
    next = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), schedule.dayOfMonth, schedule.hour, 0, 0));
    if (next.getTime() - kstOffset <= now.getTime()) {
      // Move to next month
      next = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth() + 1, schedule.dayOfMonth, schedule.hour, 0, 0));
    }
  } else {
    // weekly or biweekly — find next dayOfWeek
    const currentDayOfWeek = nowKst.getUTCDay();
    let daysUntil = (schedule.dayOfWeek - currentDayOfWeek + 7) % 7;
    if (daysUntil === 0) {
      // Same day — check if hour has passed
      const currentHour = nowKst.getUTCHours();
      if (currentHour >= schedule.hour) {
        daysUntil = schedule.frequency === 'biweekly' ? 14 : 7;
      }
    }
    if (schedule.frequency === 'biweekly' && daysUntil < 14 && daysUntil > 0) {
      // For biweekly, ensure at least 7 days from last run
      if (schedule.lastRunAt) {
        const lastRun = new Date(schedule.lastRunAt);
        const daysSinceLastRun = (now.getTime() - lastRun.getTime()) / (24 * 60 * 60 * 1000);
        if (daysSinceLastRun < 13 && daysUntil < 7) {
          daysUntil += 7;
        }
      }
    }
    next = new Date(Date.UTC(
      nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate() + daysUntil,
      schedule.hour, 0, 0,
    ));
  }

  // Convert from KST to UTC
  return new Date(next.getTime() - kstOffset).toISOString();
}

export function isDue(schedule: ReportSchedule): boolean {
  if (!schedule.enabled || !schedule.nextRunAt) return false;
  return new Date().getTime() >= new Date(schedule.nextRunAt).getTime();
}

// ---------------------------------------------------------------------------
// In-process scheduler — checks every 5 minutes
// ---------------------------------------------------------------------------

let schedulerTimer: NodeJS.Timeout | null = null;
let triggerCallback: ((schedule: ReportSchedule) => Promise<void>) | null = null;

export function startScheduler(onTrigger: (schedule: ReportSchedule) => Promise<void>): void {
  triggerCallback = onTrigger;
  if (schedulerTimer) return; // already running

  const check = async () => {
    try {
      const schedule = readSchedule();
      if (isDue(schedule)) {
        console.log('[Report Scheduler] Schedule is due, triggering report generation...');
        schedule.lastRunAt = new Date().toISOString();
        schedule.nextRunAt = computeNextRun(schedule);
        writeSchedule(schedule);
        if (triggerCallback) {
          await triggerCallback(schedule);
        }
      }
    } catch (err) {
      console.error('[Report Scheduler] Check failed:', err);
    }
  };

  // Check immediately on startup, then every 5 minutes
  check();
  schedulerTimer = setInterval(check, 5 * 60 * 1000);
  console.log('[Report Scheduler] Started (5-min check interval)');
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
