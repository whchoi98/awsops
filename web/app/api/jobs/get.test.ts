import { describe, it, expect, vi, beforeEach } from 'vitest';
const verifyUser = vi.fn();
const isAdmin = vi.fn();
const query = vi.fn();
const enqueueJob = vi.fn();
vi.mock('@/lib/auth', () => ({
  verifyUser: (...a: unknown[]) => verifyUser(...a),
  identity: (u: any) => u.email || u.sub,
  ownerKeysForRead: (u: any) => (u.email ? [u.email, u.sub] : [u.sub]),
}));
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...a) }) }));
vi.mock('@/lib/jobs', () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
  EnqueueDeliveryError: class EnqueueDeliveryError extends Error {},
  IdempotencyKeyCollisionError: class IdempotencyKeyCollisionError extends Error {},
}));
const req = (cookie = 'awsops_token=t') => new Request('http://x/api/jobs', { headers: { cookie } });
const postReq = (body: unknown, cookie = 'awsops_token=t') =>
  new Request('http://x/api/jobs', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  verifyUser.mockReset(); isAdmin.mockReset(); query.mockReset(); enqueueJob.mockReset();
  isAdmin.mockResolvedValue(false);
  process.env.JOBS_QUEUE_URL = 'https://sqs.local/q';
});

describe('GET /api/jobs', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { GET } = await import('./route');
    expect((await GET(req())).status).toBe(401);
  });
  it('200 with jobs list, filtered to the caller (pentest-remediation P0-1)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    query.mockResolvedValue({ rows: [{ job_id: 'j1', type: 'noop', status: 'succeeded', runtime: 'lambda', error: null, created_at: 't', updated_at: 't' }] });
    const { GET } = await import('./route');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).jobs[0].job_id).toBe('j1');
    // non-admin caller: query must be scoped by requested_by, not the unfiltered ORDER BY-only form.
    expect(query.mock.calls[0][0]).toMatch(/WHERE requested_by = ANY\(\$1\)/);
    // A user with no email yields just the sub — ownerKeysForRead() adds the legacy email
    // key only when there is one and only while LEGACY_EMAIL_OWNER_MATCH is on.
    expect(query.mock.calls[0][1]).toEqual([['u']]);
  });
  // round-5 review MAJOR: jobs/[id] and listReports already fall back to the raw sub for legacy
  // rows; the LIST endpoint must too, or an owner can never discover the UUID to fetch it directly.
  it('includes a legacy sub-keyed row (identity() differs from sub) in the list', async () => {
    verifyUser.mockResolvedValue({ sub: 'u-sub', email: 'u@x.io' });
    query.mockResolvedValue({ rows: [{ job_id: 'legacy', type: 'noop', status: 'succeeded', runtime: 'lambda', error: null, created_at: 't', updated_at: 't' }] });
    const { GET } = await import('./route');
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).jobs[0].job_id).toBe('legacy');
    expect(query.mock.calls[0][1]).toEqual([['u@x.io', 'u-sub']]);
  });
  it('admin sees the unfiltered query', async () => {
    verifyUser.mockResolvedValue({ sub: 'admin-u' });
    isAdmin.mockResolvedValue(true);
    query.mockResolvedValue({ rows: [] });
    const { GET } = await import('./route');
    await GET(req());
    expect(query.mock.calls[0][0]).not.toMatch(/WHERE requested_by/);
  });
});

// PR #195 review MAJOR: 'report'/'compliance' trust client-supplied report_id/run_id/requested_by
// with no ownership check in the worker (handlers.py _report/_compliance) — reachable via this
// generic route they were a cross-user IDOR write. Only /api/diagnosis and /api/compliance/run
// (which compute requestedBy server-side) may enqueue them now.
describe('POST /api/jobs', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(postReq({ type: 'noop' }))).status).toBe(401);
  });
  it('rejects "report" — no longer in the generic allowlist', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    const { POST } = await import('./route');
    const res = await POST(postReq({ type: 'report', payload: { report_id: 'victim-report' } }));
    expect(res.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it('rejects "compliance" — no longer in the generic allowlist', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    const { POST } = await import('./route');
    const res = await POST(postReq({ type: 'compliance', payload: { run_id: 'victim-run' } }));
    expect(res.status).toBe(400);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
  it('202s an allowed type with the authenticated requester bound server-side', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    enqueueJob.mockResolvedValue({ job_id: 'j1', status: 'queued' });
    const { POST } = await import('./route');
    const res = await POST(postReq({ type: 'noop' }));
    expect(res.status).toBe(202);
    expect(enqueueJob.mock.calls[0][2]).toMatchObject({ requestedBy: 'u' });
  });
  // round-6 review MAJOR: a cross-requester idempotency_key collision on the legacy global
  // UNIQUE(idempotency_key) constraint (still present alongside the new per-requester partial
  // indexes) must surface as a clean 409, never an opaque 500 from a raw pg 23505.
  it('409s cleanly on a cross-requester idempotency_key collision', async () => {
    const { IdempotencyKeyCollisionError } = await import('@/lib/jobs');
    verifyUser.mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    enqueueJob.mockRejectedValue(new IdempotencyKeyCollisionError());
    const { POST } = await import('./route');
    const res = await POST(postReq({ type: 'noop', idempotency_key: 'shared-key' }));
    expect(res.status).toBe(409);
  });

  // round-7 review MAJOR: with the legacy global UNIQUE(idempotency_key) still in place (Phase 1),
  // an authenticated attacker could POST a *victim's* deterministic diagnosis key here to squat it,
  // making the victim's own /api/diagnosis 409 + markReportFailed for the whole hour bucket.
  // Namespacing the caller-supplied key per requester makes that structurally impossible.
  it('namespaces a caller-supplied idempotency_key per requester so it cannot squat another user key', async () => {
    verifyUser.mockResolvedValue({ sub: 'attacker-sub', email: 'attacker@x.io' });
    enqueueJob.mockResolvedValue({ job_id: 'j1', status: 'queued' });
    const { POST } = await import('./route');
    // The exact shape of a victim's server-minted diagnosis key.
    const victimKey = 'report:victim@x.io:mid:sonnet:self:2026-07-31T11';
    await POST(postReq({ type: 'noop', idempotency_key: victimKey }));
    const passedKey = enqueueJob.mock.calls[0][2].idempotencyKey;
    // Must NOT reach the ledger as the victim's key...
    expect(passedKey).not.toBe(victimKey);
    // ...and must be scoped to the attacker's own identity instead.
    expect(passedKey).toBe(`u:attacker-sub:${victimKey}`);
  });

  it('leaves idempotencyKey null when the caller supplies none', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    enqueueJob.mockResolvedValue({ job_id: 'j1', status: 'queued' });
    const { POST } = await import('./route');
    await POST(postReq({ type: 'noop' }));
    expect(enqueueJob.mock.calls[0][2].idempotencyKey).toBeNull();
  });
});
