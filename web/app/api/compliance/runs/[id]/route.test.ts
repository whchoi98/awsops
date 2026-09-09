import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const req = () => new Request('http://x/api/compliance/runs/2', { headers: { cookie: 'awsops_token=t' } });
const ctx = (id = '2') => ({ params: { id } });

beforeEach(() => {
  verifyUser.mockReset(); isAdmin.mockReset(); query.mockReset();
  isAdmin.mockResolvedValue(false);
});

// pentest-remediation P2-1: this route had NO ownership check — any authenticated user could read
// any run's full CIS benchmark results (alarmed controls, resource ids, regions) by id.
describe('GET /api/compliance/runs/[id]', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(req() as any, ctx())).status).toBe(401);
  });
  it('400 invalid id', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    const { GET } = await import('./route');
    expect((await GET(req() as any, ctx('abc'))).status).toBe(400);
  });
  it('404 run not found', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValueOnce({ rows: [] });
    const { GET } = await import('./route');
    expect((await GET(req() as any, ctx())).status).toBe(404);
  });
  it('403 when the run belongs to a different requester and the caller is not admin', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValueOnce({ rows: [{ id: 2, requested_by: 'someone-else' }] });
    const { GET } = await import('./route');
    const res = await GET(req() as any, ctx());
    expect(res.status).toBe(403);
    // must not have gone on to query compliance_results
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('200 with run + results when the caller owns it', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValueOnce({ rows: [{ id: 2, requested_by: 'u' }] });
    query.mockResolvedValueOnce({ rows: [{ control_id: 'c1', status: 'alarm' }] });
    const { GET } = await import('./route');
    const res = await GET(req() as any, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run.id).toBe(2);
    expect(body.results[0].control_id).toBe('c1');
  });
  it('200 for an admin reading a run owned by someone else', async () => {
    verifyUser.mockResolvedValue({ sub: 'admin-u' });
    isAdmin.mockResolvedValue(true);
    query.mockResolvedValueOnce({ rows: [{ id: 2, requested_by: 'someone-else' }] });
    query.mockResolvedValueOnce({ rows: [] });
    const { GET } = await import('./route');
    expect((await GET(req() as any, ctx())).status).toBe(200);
  });
  // round-6 review MAJOR: this route compared raw `run.requested_by !== identity(user)` while
  // LIST (compliance/runs/route.ts) and jobs/[id] both used matchesIdentity (also accepts a
  // legacy row keyed by the raw sub) — a legacy-sub-keyed run showed up in LIST but 403'd here.
  it('200 for a legacy sub-keyed run even though the caller now has a different identity() (email)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    query.mockResolvedValueOnce({ rows: [{ id: 2, requested_by: 'u' }] });
    query.mockResolvedValueOnce({ rows: [] });
    const { GET } = await import('./route');
    expect((await GET(req() as any, ctx())).status).toBe(200);
  });
});
