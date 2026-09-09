import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => {
  const identity = (u: any) => u.email || u.sub;
  return {
    verifyUser: vi.fn(),
    identity,
    matchesIdentity: (owner: any, u: any) => !!owner && (owner === identity(u) || owner === u.sub),
    ownerKeysForRead: (u: any) => (u.email ? [u.email, u.sub] : [u.sub]),
  };
});
vi.mock('@/lib/diagnosis', () => ({
  listReports: vi.fn(async () => [
    { id: 1, requested_by: 'u@x.io' },
    { id: 2, requested_by: 'other@x.io' },
  ]),
  createReport: vi.fn(async () => 42),
  linkReportJob: vi.fn(async () => undefined),
  reportForIdempotencyKey: vi.fn(async () => null),
  markReportFailed: vi.fn(async () => undefined),
  softDeleteReport: vi.fn(async () => undefined),
  getReport: vi.fn(async () => ({ id: 7 })),
  // real class: the route narrows on `instanceof`, so a plain object would take the rethrow path
  ReportJobAlreadyLinkedError: class ReportJobAlreadyLinkedError extends Error {},
}));
vi.mock('@/lib/admin', () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock('@/lib/jobs', () => ({
  enqueueJob: vi.fn(async () => ({ job_id: 'j1', status: 'queued' })),
  IdempotencyKeyCollisionError: class IdempotencyKeyCollisionError extends Error {},
}));

import { verifyUser } from '@/lib/auth';
import {
  listReports,
  createReport,
  linkReportJob,
  ReportJobAlreadyLinkedError,
  reportForIdempotencyKey,
  markReportFailed,
  softDeleteReport,
  getReport,
} from '@/lib/diagnosis';
import { enqueueJob } from '@/lib/jobs';
import { GET, POST } from './route';

const req = (body?: unknown) =>
  new Request('http://x/api/diagnosis', {
    method: 'POST',
    headers: { cookie: 'awsops_token=t', 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AWS_ACCOUNT_ID = '123456789012'; // POST fails fast (503) without it — set the default
  // Re-establish default implementations (clearAllMocks wipes call history, not implementations,
  // so a per-test override like mockRejectedValue would otherwise leak into the next test).
  (createReport as any).mockResolvedValue(42);
  (linkReportJob as any).mockResolvedValue(undefined);
  (reportForIdempotencyKey as any).mockResolvedValue(null);
  (markReportFailed as any).mockResolvedValue(undefined);
  // payload names the report this request created — the ledger arbiter compares against it.
  (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 42 } });
});

describe('GET /api/diagnosis', () => {
  it('401 when unauthenticated', async () => {
    (verifyUser as any).mockResolvedValue(null);
    const r = await GET(req());
    expect(r.status).toBe(401);
  });
  it('lists when authed', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    const r = await GET(req());
    expect(r.status).toBe(200);
    expect((await r.json()).reports[0].id).toBe(1);
  });
  it('attaches can_edit per report (owner true, others false for a non-admin)', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    const reports = (await (await GET(req())).json()).reports;
    expect(reports.find((r: any) => r.id === 1).can_edit).toBe(true);   // owner
    expect(reports.find((r: any) => r.id === 2).can_edit).toBe(false);  // someone else's
  });
  it('scopes listReports by both identity() and the raw sub (legacy-row escape hatch)', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    await GET(req());
    expect(listReports).toHaveBeenCalledWith(50, ['u@x.io', 'u']);
  });
  // PR #195 round-4 review MAJOR #1: a report row created before the identity() switch (or before
  // this user's schedule self-heal ran) has requested_by = raw sub — even though the caller's
  // token now carries an email that differs from that sub. Must still be visible/editable.
  it('can_edit is true for a legacy sub-keyed report even when identity() (email) now differs', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    (listReports as any).mockResolvedValue([{ id: 3, requested_by: 'u' }]);
    const reports = (await (await GET(req())).json()).reports;
    expect(reports[0].can_edit).toBe(true);
  });
});

describe('POST /api/diagnosis', () => {
  it('401 when unauthenticated', async () => {
    (verifyUser as any).mockResolvedValue(null);
    const r = await POST(req({ tier: 'mid' }));
    expect(r.status).toBe(401);
  });

  it('enqueues a mid report (FK-safe order: create → enqueue → link)', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    const r = await POST(req({ tier: 'mid' }));
    expect(r.status).toBe(202);
    const j = await r.json();
    expect(j.job_id).toBe('j1');
    expect(j.report_id).toBe(42);
    expect(j.tier).toBe('mid');
    // create BEFORE enqueue (FK-safe), with NULL fk; link AFTER enqueue with the canonical job_id.
    expect(createReport).toHaveBeenCalledWith('mid', 'u', 'sonnet', expect.objectContaining({ ownerKeys: expect.any(Array) }));
    expect(enqueueJob).toHaveBeenCalledWith(
      'report',
      expect.objectContaining({ tier: 'mid', model: 'sonnet', requested_by: 'u', report_id: 42 }),
      expect.objectContaining({ idempotencyKey: expect.stringContaining('report:u@x.io:mid:sonnet:') }),
    );
    expect(linkReportJob).toHaveBeenCalledWith(42, 'j1');
  });

  it('accepts a deep tier (no longer coerced) and defaults to sonnet', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    const r = await POST(req({ tier: 'deep' }));
    const j = await r.json();
    expect(j.tier).toBe('deep');
    expect(j.model).toBe('sonnet');
    expect(createReport).toHaveBeenCalledWith('deep', 'u', 'sonnet', expect.objectContaining({ ownerKeys: expect.any(Array) }));
  });

  it('honors model=opus only on the deep tier', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    await POST(req({ tier: 'deep', model: 'opus' }));
    expect(createReport).toHaveBeenCalledWith('deep', 'u', 'opus', expect.objectContaining({ ownerKeys: expect.any(Array) }));
  });

  it('pins model to sonnet when opus is requested on a non-deep tier', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    await POST(req({ tier: 'mid', model: 'opus' }));
    expect(createReport).toHaveBeenCalledWith('mid', 'u', 'sonnet', expect.objectContaining({ ownerKeys: expect.any(Array) }));
  });

  it('returns the existing report on idempotency hit (deduped)', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    (reportForIdempotencyKey as any).mockResolvedValue(7);
    const r = await POST(req({ tier: 'mid' }));
    expect(r.status).toBe(202);
    expect((await r.json())).toMatchObject({ report_id: 7, deduped: true });
    expect(createReport).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  it('fails the orphan report row when enqueue throws', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    (enqueueJob as any).mockRejectedValue(new Error('boom'));
    await expect(POST(req({ tier: 'mid' }))).rejects.toThrow('boom');
    expect(markReportFailed).toHaveBeenCalledWith(42, 'enqueue failed');
  });

  it('coerces an unknown tier to mid', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    await POST(req({ tier: 'bogus' }));
    expect(createReport).toHaveBeenCalledWith('mid', 'u', 'sonnet', expect.objectContaining({ ownerKeys: expect.any(Array) }));
  });

  it('503 + no work when AWS_ACCOUNT_ID is unset (fails fast, no empty account to the LLM)', async () => {
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    delete process.env.AWS_ACCOUNT_ID;
    const r = await POST(req({ tier: 'mid' }));
    expect(r.status).toBe(503);
    expect(createReport).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

// PR #195 review MAJOR: concurrent same-key requests both pass the pre-check (it joins through
// worker_job_id, NULL until the link), so the second gets the FIRST job from the conflict path. The
// ledger payload names the first report, so linking the second one to that job strands it as
// `running` forever — no markReportFailed, and the reaper only reconciles worker_jobs.
describe('POST /api/diagnosis — idempotency conflict must not strand the second report', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_ACCOUNT_ID = '123456789012';
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    (reportForIdempotencyKey as any).mockResolvedValue(null);
    (createReport as any).mockResolvedValue(42);
  });

  it('retires its own report and returns the one the ledger payload names', async () => {
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 7 } });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    const body = await res.json();
    expect(body).toMatchObject({ report_id: 7, deduped: true });
    expect(softDeleteReport).toHaveBeenCalledWith(42);
    expect(linkReportJob).not.toHaveBeenCalled();
  });

  it('does not treat a null ledger report_id as report 0 (fresh run must survive)', async () => {
    // Number(null) === 0 and Number.isFinite(0) is true, so the earlier guard read "the ledger names
    // report 0", soft-deleted the fresh report and answered with 0 (codex stop-gate).
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: null } });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    const body = await res.json();
    expect(body.report_id).toBe(42);
    expect(softDeleteReport).not.toHaveBeenCalled();
    expect(linkReportJob).toHaveBeenCalledWith(42, 'j1');
  });

  it('links its own report when the ledger payload names it', async () => {
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 42 } });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    const body = await res.json();
    expect(body.report_id).toBe(42);
    expect(linkReportJob).toHaveBeenCalledWith(42, 'j1');
    expect(softDeleteReport).not.toHaveBeenCalled();
  });

  it('treats a STRING ledger report_id the same as a number (node-pg int8 -> string)', async () => {
    // The payload is JSON out of Aurora and node-pg hands int8 back as a string, so rows written by
    // any earlier deploy carry report_id: "7". `typeof === 'number'` rejected those, so the loser
    // skipped the arbiter entirely and linked its own report to the winner's job — silently sharing a
    // job before the partial unique index, a 500 plus a permanent `running` orphan after it
    // (PR #203 review MAJOR).
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: '7' } });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(await res.json()).toMatchObject({ report_id: 7, deduped: true });
    expect(softDeleteReport).toHaveBeenCalledWith(42);
    expect(linkReportJob).not.toHaveBeenCalled();
  });

  it('ignores a non-numeric ledger report_id string rather than reading it as an id', async () => {
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 'abc' } });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect((await res.json()).report_id).toBe(42);
    expect(softDeleteReport).not.toHaveBeenCalled();
  });

  it('answers 202 deduped when the link loses the one-report-per-job race', async () => {
    // payload carries no id, so the arbiter has nothing to compare and the link is the only signal
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: {} });
    (linkReportJob as any).mockRejectedValueOnce(new ReportJobAlreadyLinkedError('j1'));
    (reportForIdempotencyKey as any).mockResolvedValueOnce(null).mockResolvedValueOnce(9);
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(res.status).toBe(202);
    expect(await res.json()).toMatchObject({ report_id: 9, deduped: true });
    expect(softDeleteReport).toHaveBeenCalledWith(42);
  });

  it('keeps its own report when the ledger names it and only the link lost', async () => {
    // The worker resolves the report from the payload, so if the payload names OUR report the render
    // happens to our row whether or not the link was recorded. Deleting it would destroy the row the
    // worker writes to, and answering with another report would name one this job never renders
    // (codex stop-gate).
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 42 } });
    (linkReportJob as any).mockRejectedValueOnce(new ReportJobAlreadyLinkedError('j1'));
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(res.status).toBe(202);
    expect((await res.json()).report_id).toBe(42);
    expect(softDeleteReport).not.toHaveBeenCalled();
  });

  it('answers 409 when the link loses and the winner cannot be found', async () => {
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: {} });
    (linkReportJob as any).mockRejectedValueOnce(new ReportJobAlreadyLinkedError('j1'));
    (reportForIdempotencyKey as any).mockResolvedValue(null);
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(res.status).toBe(409);
    expect(softDeleteReport).toHaveBeenCalledWith(42);
  });

  it('keeps the idempotency key on identity(), not the ownership key', async () => {
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 42 } });
    const { POST } = await import('./route');
    await POST(req({ tier: 'mid' }) as any);
    // Switching this to the sub created a rolling-deploy discontinuity for no benefit.
    expect((reportForIdempotencyKey as any).mock.calls[0][0]).toContain('report:u@x.io:');
  });
});

// PR #195 review MAJOR: reportForIdempotencyKey filters deleted_at, so a soft-deleted report is
// invisible to it — but findOwnJob() (lib/jobs.ts) matches worker_jobs purely on idempotency_key and
// has no such filter, so a same-key retry can still dedupe onto the OLD job whose payload names the
// now-deleted report. Deduping onto it returned 202 with an id that 404s on fetch, for the rest of
// the hour bucket.
describe('POST /api/diagnosis — the deduped-to report was deleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_ACCOUNT_ID = '123456789012';
    (verifyUser as any).mockResolvedValue({ sub: 'u', email: 'u@x.io' });
    (reportForIdempotencyKey as any).mockResolvedValue(null);
    (createReport as any).mockResolvedValue(42);
    (enqueueJob as any).mockResolvedValue({ job_id: 'j1', status: 'queued', payload: { report_id: 7 } });
  });

  it('409s instead of handing back a deleted report id', async () => {
    (getReport as any).mockResolvedValue(null);           // 7 was soft-deleted
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(res.status).toBe(409);
    expect((await res.json()).message).toContain('was deleted');
    expect(softDeleteReport).toHaveBeenCalledWith(42);    // no orphan running row
  });

  it('still dedupes normally when the ledger report is alive', async () => {
    (getReport as any).mockResolvedValue({ id: 7 });
    const { POST } = await import('./route');
    const res = await POST(req({ tier: 'mid' }) as any);
    expect(res.status).toBe(202);
    expect((await res.json())).toMatchObject({ report_id: 7, deduped: true });
  });
});
