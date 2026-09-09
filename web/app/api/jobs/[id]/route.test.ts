import { describe, it, expect, vi, beforeEach } from 'vitest';
// pentest-remediation P0-1: this route previously had NO verifyUser() call at all — any UUID
// returned the job's full result/artifact_uri/error to anyone. These tests lock in auth + ownership.
const verifyUser = vi.fn();
const isAdmin = vi.fn();
const query = vi.fn();
const identity = (u: any) => u.email || u.sub;
vi.mock('@/lib/auth', () => ({
  verifyUser: (...a: unknown[]) => verifyUser(...a),
  identity,
  matchesIdentity: (owner: any, u: any) => !!owner && (owner === identity(u) || owner === u.sub),
}));
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...a) }) }));

const UUID = '11111111-1111-1111-1111-111111111111';
const req = (cookie = 'awsops_token=t') => new Request(`http://x/api/jobs/${UUID}`, { headers: { cookie } });
const ctx = { params: { id: UUID } };

beforeEach(() => {
  verifyUser.mockReset(); isAdmin.mockReset(); query.mockReset();
  isAdmin.mockResolvedValue(false);
});

describe('GET /api/jobs/[id]', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(401);
  });
  it('400 on a malformed id (checked only after auth)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    const { GET } = await import('./route');
    const res = await GET(req(), { params: { id: 'not-a-uuid' } });
    expect(res.status).toBe(400);
  });
  it('404 job not found', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValue({ rows: [] });
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(404);
  });
  it('403 when the job belongs to a different requester and the caller is not admin', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValue({ rows: [{ job_id: UUID, requested_by: 'someone-else', status: 'succeeded' }] });
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(403);
  });
  it('200 with the job when the caller owns it, and strips requested_by from the response', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValue({ rows: [{ job_id: UUID, requested_by: 'u', status: 'succeeded', result: { ok: true } }] });
    const { GET } = await import('./route');
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.job_id).toBe(UUID);
    expect(body.requested_by).toBeUndefined();
  });
  it('200 for an admin reading a job owned by someone else', async () => {
    verifyUser.mockResolvedValue({ sub: 'admin-u' });
    isAdmin.mockResolvedValue(true);
    query.mockResolvedValue({ rows: [{ job_id: UUID, requested_by: 'someone-else', status: 'succeeded' }] });
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(200);
  });
  // PR #195 round-4 review MAJOR #1: a job row created before the identity() switch (or before
  // this user's schedule self-heal ran) is stuck with requested_by = raw sub forever otherwise —
  // even though the caller's token now also carries an email that differs from that sub.
  it('200 for a legacy sub-keyed job even though the caller now has a different identity() (email)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    query.mockResolvedValue({ rows: [{ job_id: UUID, requested_by: 'u', status: 'succeeded' }] });
    const { GET } = await import('./route');
    expect((await GET(req(), ctx)).status).toBe(200);
  });
});
