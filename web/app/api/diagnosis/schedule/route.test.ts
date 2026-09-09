import { describe, it, expect, vi, beforeEach } from 'vitest';

const { verifyUser, readSchedule, upsertSchedule } = vi.hoisted(() => ({
  verifyUser: vi.fn(), readSchedule: vi.fn(), upsertSchedule: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  verifyUser: (...a: unknown[]) => verifyUser(...a),
}));
vi.mock('@/lib/diagnosis-schedule', () => ({
  readSchedule: (...a: unknown[]) => readSchedule(...a),
  upsertSchedule: (...a: unknown[]) => upsertSchedule(...a),
  SCHEDULE_FREQS: ['weekly', 'biweekly', 'monthly'],
}));

import { GET, PUT } from './route';

const req = (body?: unknown, cookie = 'awsops_token=t') =>
  new Request('http://x/api/diagnosis/schedule', {
    method: body === undefined ? 'GET' : 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => { verifyUser.mockReset(); readSchedule.mockReset(); upsertSchedule.mockReset(); });

describe('GET /api/diagnosis/schedule', () => {
  it('401 when unauthenticated', async () => {
    verifyUser.mockResolvedValue(null);
    expect((await GET(req())).status).toBe(401);
  });

  it('returns a disabled default when the user has no schedule', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1' });
    readSchedule.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.schedule.enabled).toBe(false);
    expect(readSchedule).toHaveBeenCalledWith('u1'); // scoped to the caller's immutable sub
  });

  it('returns the stored schedule', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1' });
    readSchedule.mockResolvedValue({ scheduleType: 'weekly', enabled: true, tier: 'deep', model: null, nextRunAt: 'x', lastRunAt: null });
    const body = await (await GET(req())).json();
    expect(body.schedule).toMatchObject({ scheduleType: 'weekly', enabled: true, tier: 'deep' });
  });
});

describe('PUT /api/diagnosis/schedule', () => {
  it('401 when unauthenticated', async () => {
    verifyUser.mockResolvedValue(null);
    expect((await PUT(req({ scheduleType: 'weekly', enabled: true }))).status).toBe(401);
  });

  it('400 on an invalid frequency', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1' });
    expect((await PUT(req({ scheduleType: 'hourly', enabled: true }))).status).toBe(400);
    expect(upsertSchedule).not.toHaveBeenCalled();
  });

  it('upserts under the caller sub and returns the schedule (no inline diagnosis)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1' });
    upsertSchedule.mockResolvedValue({ scheduleType: 'monthly', enabled: true, tier: 'mid', model: null, nextRunAt: 'n', lastRunAt: null });
    const res = await PUT(req({ scheduleType: 'monthly', enabled: true, tier: 'mid' }));
    expect(res.status).toBe(200);
    expect(upsertSchedule).toHaveBeenCalledWith('u1', expect.objectContaining({ scheduleType: 'monthly', enabled: true, tier: 'mid' }));
    expect((await res.json()).schedule.scheduleType).toBe('monthly');
  });

  it('ignores a body-supplied sub (no cross-user write)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1' });
    upsertSchedule.mockResolvedValue({ scheduleType: 'weekly', enabled: false, tier: 'mid', model: null, nextRunAt: 'n', lastRunAt: null });
    await PUT(req({ scheduleType: 'weekly', enabled: false, user_sub: 'victim', userSub: 'victim' }));
    expect(upsertSchedule).toHaveBeenCalledWith('u1', expect.anything()); // authed sub, not the body's
  });
});

describe('GET/PUT /api/diagnosis/schedule scope by immutable Cognito sub', () => {
  it('GET reads the schedule under the sub, not the mutable email, when both claims are present', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1', email: 'u1@x.io' });
    readSchedule.mockResolvedValue(null);
    await GET(req());
    expect(readSchedule).toHaveBeenCalledWith('u1');
  });

  it('PUT upserts the schedule under the sub, not the mutable email, when both claims are present', async () => {
    verifyUser.mockResolvedValue({ sub: 'u1', email: 'u1@x.io' });
    upsertSchedule.mockResolvedValue({ scheduleType: 'weekly', enabled: true, tier: 'mid', model: null, nextRunAt: 'n', lastRunAt: null });
    await PUT(req({ scheduleType: 'weekly', enabled: true }));
    expect(upsertSchedule).toHaveBeenCalledWith('u1', expect.anything());
  });
});
