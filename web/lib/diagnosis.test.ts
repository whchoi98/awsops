import { describe, it, expect, vi } from 'vitest';
import {
  listReports,
  getReport,
  createReport,
  linkReportJob,
  reportForIdempotencyKey,
  markReportFailed,
  updateReportMeta,
  softDeleteReport,
  canMutateReport,
} from './diagnosis';
import { isAdmin } from './admin';

vi.mock('./admin', () => ({ isAdmin: vi.fn() }));
vi.mock('./auth', () => ({
  matchesIdentity: (owner: any, u: any) => !!owner && (owner === (u.email || u.sub) || owner === u.sub),
}));

const query = vi.fn(async (sql: string) => {
  if (sql.includes('INSERT INTO diagnosis_reports')) return { rows: [{ id: 7 }] };
  if (sql.includes('idempotency_key')) return { rows: [{ id: 9 }] };
  if (sql.includes('LEFT JOIN worker_jobs')) return { rows: [{ id: 1, tier: 'mid', status: 'succeeded', account: '061525506239' }] };
  if (sql.includes('SELECT')) return { rows: [{ id: 1, tier: 'mid', status: 'succeeded' }] };
  return { rows: [] };
});

vi.mock('./db', () => ({ getPool: () => ({ query: (...a: unknown[]) => query(...(a as [string, unknown[]])) }) }));

describe('diagnosis queries', () => {
  it('listReports returns rows ordered', async () => {
    const rows = await listReports(10);
    expect(rows[0].id).toBe(1);
  });
  // pentest-remediation P2-1 (Finding 5): listReports had no per-user filter at all — every
  // authenticated user saw every report. `owner=null` (admin) must skip the predicate.
  it('listReports scopes by owner when given, and passes null through unfiltered for admins', async () => {
    await listReports(10, 'u@x.io');
    let [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('$2::text[] IS NULL OR r.requested_by = ANY($2)');
    expect(args).toEqual([10, ['u@x.io']]);

    await listReports(10, null);
    [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(args).toEqual([10, null]);
  });
  // PR #195 round-4 review MAJOR #1: owner also accepts a string[] (identity() + raw sub) so a
  // legacy row written before the identity() switch still shows up for its real owner.
  it('listReports accepts a string[] owner (identity() + legacy raw sub)', async () => {
    await listReports(10, ['u@x.io', 'u-sub']);
    const [, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(args).toEqual([10, ['u@x.io', 'u-sub']]);
  });
  it('getReport returns one or null', async () => {
    const r = await getReport(1);
    expect(r?.tier).toBe('mid');
  });
  it('createReport inserts a NULL-fk running row, links the latest succeeded same-tier parent, and returns id', async () => {
    const id = await createReport('mid', 'u@x.io');
    expect(id).toBe(7);
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('VALUES (NULL');
    expect(sql).toContain("'running'");
    // [Plan 2] parent_report_id subquery = most-recent succeeded report of the same tier
    expect(sql).toContain('parent_report_id');
    expect(sql).toContain("status = 'succeeded'");
    // model column bound; defaults to 'sonnet' when omitted
    expect(sql).toContain('model');
    // Lineage args appended: dual owner keys (read-path parity) + account.
    expect(args).toEqual(['mid', 'u@x.io', 'sonnet', ['u@x.io'], null]);
  });
  it('createReport binds BOTH owner keys during the legacy window, and scopes by account', async () => {
    // The dual-key path is the one that matters while legacy_email_owner_match is on: the caller's
    // sub AND their email, exactly as ownerKeysForRead() returns them, so the lineage baseline is the
    // same row the read gate would show. Only the single-key shape was covered before
    // (PR #203 review MINOR).
    await createReport('mid', 'sub-1', 'sonnet', { ownerKeys: ['sub-1', 'u@x.io'], account: '1234' });
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('r.requested_by = ANY($4::text[])');
    expect(sql).toContain("j.payload->>'account' = $5");
    expect(args).toEqual(['mid', 'sub-1', 'sonnet', ['sub-1', 'u@x.io'], '1234']);
  });
  it('createReport persists the selected model (deep + opus)', async () => {
    await createReport('deep', 'u@x.io', 'opus');
    const [, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(args).toEqual(['deep', 'u@x.io', 'opus', ['u@x.io'], null]);
  });
  it('reportForIdempotencyKey returns existing report id or null', async () => {
    const id = await reportForIdempotencyKey('report:u@x.io:mid:2026-06-11T00');
    expect(id).toBe(9);
  });
  it('reportForIdempotencyKey resolves through the job PAYLOAD before the link', async () => {
    // The worker renders the report_id the payload names, so when the link and the payload disagree
    // (a link that lost the one-report-per-job race leaves the rendered report unlinked) the link
    // points at a report nothing will ever render (codex stop-gate).
    query.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [{ id: 42 }] })); // payload hit
    const id = await reportForIdempotencyKey('k');
    expect(id).toBe(42);
    expect(query.mock.calls).toHaveLength(1); // the link query is never reached
    expect(query.mock.calls[0][0]).toContain("payload->>'report_id'");
  });
  it('reportForIdempotencyKey returns null when the payload names a DELETED report', async () => {
    // Not the link's report: the payload is what the worker obeyed, so a named-but-deleted report means
    // there is no live report for this key. Falling back here would name one the worker never rendered
    // (codex stop-gate). The fallback query itself excludes jobs whose payload carries an id.
    query.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [] }));  // payload names 42, but it is deleted
    query.mockImplementationOnce(async (sql: string) => {
      expect(sql).toContain("j.payload->>'report_id' IS NULL");
      return { rows: [] };
    });
    expect(await reportForIdempotencyKey('k')).toBeNull();
  });
  it('reportForIdempotencyKey falls back to the link when the payload has no id', async () => {
    query.mockClear();
    query.mockImplementationOnce(async () => ({ rows: [] }));            // no payload match
    query.mockImplementationOnce(async () => ({ rows: [{ id: 9 }] }));   // link match
    expect(await reportForIdempotencyKey('k')).toBe(9);
    expect(query.mock.calls).toHaveLength(2);
    expect(query.mock.calls[1][0]).toContain('r.worker_job_id');
  });
  it('linkReportJob issues an UPDATE setting worker_job_id', async () => {
    await linkReportJob(7, 'job-1');
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('UPDATE diagnosis_reports SET worker_job_id');
    expect(args).toEqual(['job-1', 7]);
  });
  it('markReportFailed only fails a running row', async () => {
    await markReportFailed(7, 'enqueue failed');
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("status = 'running'");
    expect(args).toEqual([7, 'enqueue failed']);
  });
  it('A5: report SELECTs surface the progress column (live per-section status)', async () => {
    await listReports(10);
    expect(query.mock.calls.at(-1)![0]).toContain('progress');
    await getReport(1);
    expect(query.mock.calls.at(-1)![0]).toContain('progress');
  });

  it('soft-delete is honored across list/get/idempotency/parent-lineage', async () => {
    await listReports(10);
    expect(query.mock.calls.at(-1)![0]).toContain('deleted_at IS NULL');
    await getReport(1);
    expect(query.mock.calls.at(-1)![0]).toContain('deleted_at IS NULL');
    await reportForIdempotencyKey('k');
    expect(query.mock.calls.at(-1)![0]).toContain('deleted_at IS NULL');
    await createReport('mid', 'u@x.io');
    expect(query.mock.calls.at(-1)![0]).toContain('deleted_at IS NULL'); // parent subquery
  });

  it('updateReportMeta partial: tags-only does not set title', async () => {
    await updateReportMeta(7, { tags: ['a', 'b'] });
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('tags =');
    expect(sql).not.toContain('title =');
    expect(args).toContain(7);
  });
  it('updateReportMeta partial: title-only does not set tags', async () => {
    await updateReportMeta(7, { title: '핵심' });
    const [sql] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('title =');
    expect(sql).not.toContain('tags =');
  });
  it('softDeleteReport sets deleted_at only when not already deleted', async () => {
    await softDeleteReport(7);
    const [sql, args] = query.mock.calls.at(-1) as [string, unknown[]];
    expect(sql).toContain('deleted_at = now()');
    expect(sql).toContain('deleted_at IS NULL');
    expect(args).toEqual([7]);
  });

  it('canMutateReport: owner yes, stranger no, admin yes', async () => {
    (isAdmin as any).mockResolvedValue(false);
    expect(await canMutateReport({ email: 'u@x.io', sub: 'u' } as any, { requested_by: 'u@x.io' } as any)).toBe(true);
    expect(await canMutateReport({ email: 'other@x.io', sub: 'o' } as any, { requested_by: 'u@x.io' } as any)).toBe(false);
    (isAdmin as any).mockResolvedValue(true);
    expect(await canMutateReport({ email: 'admin@x.io', sub: 'a' } as any, { requested_by: 'u@x.io' } as any)).toBe(true);
  });
  // pentest-remediation P2-1: createReport/diagnosis-route write requested_by via `user.email ||
  // user.sub` (empty-string email falls back to sub). canMutateReport used to compare with `??`,
  // which does NOT treat '' as absent — an owner with an empty-string email claim would fail this
  // check against their own report. Must use the same `||` on both sides of the comparison.
  it('canMutateReport: empty-string email falls back to sub (matches how requested_by is written)', async () => {
    (isAdmin as any).mockResolvedValue(false);
    expect(await canMutateReport({ email: '', sub: 'u' } as any, { requested_by: 'u' } as any)).toBe(true);
  });
  // PR #195 round-4 review MAJOR #1: a report row created before the identity() switch (or before
  // this user's schedule self-heal ran) has requested_by = raw sub, even though the caller's token
  // now also carries an email that differs from that sub. Must still be visible/mutable by them.
  it('canMutateReport: a legacy sub-keyed report is visible even when identity() (email) now differs', async () => {
    (isAdmin as any).mockResolvedValue(false);
    expect(await canMutateReport({ email: 'u@x.io', sub: 'u' } as any, { requested_by: 'u' } as any)).toBe(true);
  });
});
