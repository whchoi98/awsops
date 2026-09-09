import { describe, it, expect, vi, beforeEach } from 'vitest';
const verifyUser = vi.fn();
const query = vi.fn();
const enqueueJob = vi.fn();
vi.mock('@/lib/auth', () => ({ verifyUser: (...a: unknown[]) => verifyUser(...a) }));
vi.mock('@/lib/db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...a) }) }));
vi.mock('@/lib/jobs', () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
  EnqueueDeliveryError: class extends Error {},
  // The route imports this too (the 409 path). The two other test files that mock @/lib/jobs got
  // the shim; this one was missed, and vitest throws on a missing named export — every test in this
  // file would fail (PR #195 review MAJOR).
  IdempotencyKeyCollisionError: class extends Error {},
}));
const req = (body: unknown) =>
  new Request('http://x/api/compliance/run', {
    method: 'POST',
    headers: { cookie: 'awsops_token=t', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  verifyUser.mockReset();
  query.mockReset();
  enqueueJob.mockReset();
  process.env.JOBS_QUEUE_URL = 'https://sqs/x';
});

describe('POST /api/compliance/run', () => {
  it('401 unauth', async () => {
    verifyUser.mockResolvedValue(null);
    const { POST } = await import('./route');
    expect((await POST(req({ benchmark: 'cis_v300' }))).status).toBe(401);
  });
  it('400 on disallowed benchmark (argv-injection guard)', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'a@b' });
    const { POST } = await import('./route');
    expect((await POST(req({ benchmark: 'evil; rm -rf' }))).status).toBe(400);
  });
  it('202 pre-creates run row then enqueues', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'a@b' });
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] }); // INSERT ... RETURNING id
    enqueueJob.mockResolvedValue({ job_id: 'j1', status: 'queued' });
    const { POST } = await import('./route');
    const res = await POST(req({ benchmark: 'cis_v300' }));
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ run_id: 42, job_id: 'j1' });
    expect(enqueueJob).toHaveBeenCalledWith(
      'compliance',
      expect.objectContaining({ benchmark: 'cis_v300', run_id: 42 }),
      expect.anything(),
    );
    // links the run 1:1 to its worker job
    expect(query.mock.calls.some((c) => /UPDATE compliance_runs SET worker_job_id/.test(String(c[0])))).toBe(true);
  });
  it('503 when workers unconfigured', async () => {
    verifyUser.mockResolvedValue({ sub: 'u' });
    delete process.env.JOBS_QUEUE_URL;
    const { POST } = await import('./route');
    expect((await POST(req({ benchmark: 'cis_v300' }))).status).toBe(503);
  });
  // pentest-remediation P0-2 (Finding 8): raw req.json() had no size cap, bypassable via chunked
  // transfer encoding (no Content-Length for middleware.ts to reject on).
  it('413 when the body exceeds the bound cap', async () => {
    verifyUser.mockResolvedValue({ sub: 'u', email: 'a@b' });
    const big = new Request('http://x/api/compliance/run', {
      method: 'POST',
      headers: { cookie: 'awsops_token=t', 'content-type': 'application/json' },
      body: JSON.stringify({ benchmark: 'cis_v300', pad: 'x'.repeat(70_000) }),
    });
    const { POST } = await import('./route');
    expect((await POST(big)).status).toBe(413);
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});
