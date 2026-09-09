import { describe, it, expect, vi, beforeEach } from 'vitest';

const { queryMock, releaseMock } = vi.hoisted(() => ({ queryMock: vi.fn(), releaseMock: vi.fn() }));
// upsertSchedule takes a CLIENT now (the disable + upsert pair has to be one transaction), so the mock
// pool hands back a client backed by the same query mock: BEGIN/COMMIT show up in the call log.
vi.mock('@/lib/db', () => ({
  getPool: () => ({
    query: queryMock,
    connect: async () => ({ query: queryMock, release: releaseMock }),
  }),
}));

import { computeNextRun, readSchedule, upsertSchedule } from './diagnosis-schedule';

beforeEach(() => { queryMock.mockReset(); releaseMock.mockReset(); });

describe('computeNextRun', () => {
  const from = '2026-06-18T00:00:00.000Z';
  it('weekly adds 7 days', () => expect(computeNextRun('weekly', from)).toBe('2026-06-25T00:00:00.000Z'));
  it('biweekly adds 14 days', () => expect(computeNextRun('biweekly', from)).toBe('2026-07-02T00:00:00.000Z'));
  it('monthly adds 1 calendar month', () => expect(computeNextRun('monthly', from)).toBe('2026-07-18T00:00:00.000Z'));
});

describe('readSchedule', () => {
  it('returns null when the user has no schedule', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    expect(await readSchedule('u1')).toBeNull();
    expect(queryMock.mock.calls[0][1]).toEqual(['u1']); // scoped by user_sub
  });

  it('maps a row (tier/model from config) when present', async () => {
    queryMock.mockResolvedValue({
      rows: [{ schedule_type: 'weekly', enabled: true, next_run_at: '2026-06-25T00:00:00.000Z', last_run_at: null, config: { tier: 'deep', model: 'opus' } }],
    });
    const s = await readSchedule('u1');
    expect(s).toMatchObject({ scheduleType: 'weekly', enabled: true, tier: 'deep', model: 'opus', nextRunAt: '2026-06-25T00:00:00.000Z', lastRunAt: null });
  });

});

describe('upsertSchedule', () => {
  it('upserts with a recomputed next_run_at and config, returns the mapped row', async () => {
    queryMock.mockResolvedValue({
      rows: [{ schedule_type: 'weekly', enabled: true, next_run_at: '2026-06-25T00:00:00.000Z', last_run_at: null, config: { tier: 'mid', model: null } }],
    });
    const s = await upsertSchedule('u1', { scheduleType: 'weekly', enabled: true, tier: 'mid', nowISO: '2026-06-18T00:00:00.000Z' });
    // disable-others UPDATE runs first (no cross-frequency double-fire)
    const disable = queryMock.mock.calls.find((c) => /UPDATE report_schedules SET enabled = false/.test(c[0] as string));
    expect(disable).toBeTruthy();
    expect(disable![1]).toEqual(['u1', 'weekly']);
    // then the upsert
    const insert = queryMock.mock.calls.find((c) => /INSERT INTO report_schedules/.test(c[0] as string))!;
    expect(insert[0]).toMatch(/ON CONFLICT \(user_sub, schedule_type\)/);
    const params = insert[1] as unknown[];
    expect(params[0]).toBe('u1');
    expect(params[1]).toBe('weekly');
    expect(params[2]).toBe(true);
    expect(params[3]).toBe('2026-06-25T00:00:00.000Z'); // recomputed next_run_at
    expect(JSON.parse(params[4] as string)).toEqual({ tier: 'mid', model: null });
    expect(s.scheduleType).toBe('weekly');
  });

  it('still sets next_run_at when disabled (NOT NULL column); enabled flag gates firing', async () => {
    queryMock.mockResolvedValue({
      rows: [{ schedule_type: 'monthly', enabled: false, next_run_at: '2026-07-18T00:00:00.000Z', last_run_at: null, config: { tier: 'mid', model: null } }],
    });
    await upsertSchedule('u1', { scheduleType: 'monthly', enabled: false, nowISO: '2026-06-18T00:00:00.000Z' });
    const insert = (queryMock.mock.calls.find((c) => /INSERT INTO report_schedules/.test(c[0] as string))!)[1] as unknown[];
    expect(insert[2]).toBe(false);
    expect(insert[3]).toBe('2026-07-18T00:00:00.000Z'); // next_run_at present even when disabled
  });

  it('runs the disable + upsert as ONE transaction on ONE client', async () => {
    // Two pool queries meant two autocommit transactions: between them the user has no enabled
    // schedule at all (a dispatcher tick in that gap skips them), and two concurrent saves could
    // interleave disable/disable/insert/insert — which uq_schedule_one_active turns into a hard 23505
    // (PR #203 review MAJOR).
    queryMock.mockResolvedValue({ rows: [{ schedule_type: 'weekly', enabled: true,
      next_run_at: '2026-06-25T00:00:00.000Z', last_run_at: null, config: {} }] });
    await upsertSchedule('u1', { scheduleType: 'weekly', enabled: true, nowISO: '2026-06-18T00:00:00.000Z' });
    const sqls = queryMock.mock.calls.map((c) => String(c[0]).trim());
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls[1]).toContain('SET enabled = false');
    expect(sqls[2]).toContain('INSERT INTO report_schedules');
    expect(sqls[3]).toBe('COMMIT');
    expect(releaseMock).toHaveBeenCalled();
  });

  it('disables other-frequency rows even when the target is the only one (idempotent)', async () => {
    queryMock.mockResolvedValue({ rows: [{ schedule_type: 'weekly', enabled: true, next_run_at: '2026-06-25T00:00:00.000Z', last_run_at: null, config: {} }] });
    await upsertSchedule('u1', { scheduleType: 'weekly', enabled: true });
    expect(queryMock.mock.calls.some((c) => /UPDATE report_schedules SET enabled = false/.test(c[0] as string) && (c[1] as unknown[])[1] === 'weekly')).toBe(true);
  });

});
