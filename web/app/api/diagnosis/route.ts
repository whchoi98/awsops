import { NextResponse } from 'next/server';
import { verifyUser, identity, matchesIdentity, ownerKeysForRead } from '@/lib/auth';
import {
  getReport,
  listReports,
  createReport,
  linkReportJob,
  ReportJobAlreadyLinkedError,
  reportForIdempotencyKey,
  markReportFailed,
  softDeleteReport,
  type DiagnosisModel,
} from '@/lib/diagnosis';
import { isAdmin } from '@/lib/admin';
import { enqueueJob, IdempotencyKeyCollisionError } from '@/lib/jobs';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  // can_edit per report: compute isAdmin ONCE (async + SSM-backed), then compare requested_by.
  const admin = await isAdmin(user);
  const me = identity(user); // pentest-remediation P2-1: match canMutateReport's `||`
  // PR #195 round-4 review MAJOR #1: also scope by the raw sub, so a legacy row (requested_by =
  // sub, written before the identity() switch) still shows up for its real owner.
  const reports = await listReports(50, admin ? null : ownerKeysForRead(user));
  return NextResponse.json({
    reports: reports.map((r) => ({ ...r, can_edit: admin || matchesIdentity(r.requested_by, user) })),
  });
}

export async function POST(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });

  let body: any = {};
  try {
    body = await readJsonBounded(req); // bound BEFORE parse (OOM guard)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    /* empty/invalid body OK — defaults apply */
  }
  const tier = ['light', 'mid', 'deep'].includes(body?.tier) ? body.tier : 'mid';
  // Only the deep tier may select Opus; every other tier is pinned to Sonnet (cost guard).
  const model: DiagnosisModel = tier === 'deep' && body?.model === 'opus' ? 'opus' : 'sonnet';
  const hostAccount = process.env.AWS_ACCOUNT_ID || '';
  // [PR#37 review MAJOR] fail fast — an empty account would silently reach the LLM context.
  if (!hostAccount) {
    return NextResponse.json(
      { message: 'AWS_ACCOUNT_ID not configured on the web task' },
      { status: 503 },
    );
  }
  // v1 parity: diagnose a selected member account. Validated against the registered accounts
  // table (12-digit + enabled member) — anything else falls back to the host. The worker's
  // Aurora collectors filter by `scope`; host-credentialed live collectors degrade honestly.
  let account = hostAccount;
  let scope = 'self';
  const requested = typeof body?.account === 'string' ? body.account.trim() : '';
  if (requested && requested !== hostAccount && /^[0-9]{12}$/.test(requested)) {
    try {
      const { rows } = await (await import('@/lib/db')).getPool().query(
        `SELECT 1 FROM accounts WHERE account_id = $1 AND enabled AND NOT is_host`,
        [requested],
      );
      if (rows.length > 0) { account = requested; scope = requested; }
    } catch { /* fall back to host */ }
  }
  const owner = user.sub;   // immutable ownership key — see the note in app/api/jobs/route.ts

  // [GATE-FIX R2 CRITICAL] Idempotency-FIRST → create the report with NULL fk → enqueue (inserts
  // worker_jobs) → LINK. The FK is only set once worker_jobs(job_id) exists.
  const hour = new Date().toISOString().slice(0, 13);
  // The idempotency key deliberately stays on identity(), NOT on the ownership key. They are separate
  // concerns — this one only has to be stable per requester within the hour — and switching it to the
  // sub bought nothing while creating a rolling-deploy discontinuity: a new pod writing
  // `report:<sub>:…` is invisible to an old pod that only knows `report:<email>:…`, so the same user
  // gets a SECOND Bedrock run. A fallback lookup only covered one direction, which is why the
  // key itself is left alone (PR #195 review MAJOR). requested_by below is the immutable sub.
  const key = `report:${identity(user)}:${tier}:${model}:${scope}:${hour}`;

  const existing = await reportForIdempotencyKey(key);
  if (existing) {
    return NextResponse.json({ report_id: existing, tier, model, deduped: true }, { status: 202 });
  }

  // Lineage keys mirror the READ path, and the account keeps the baseline inside the account being
  // diagnosed — same predicate schedule_dispatcher uses, so both paths pick the same parent.
  const reportId = await createReport(tier, owner, model, {
    ownerKeys: ownerKeysForRead(user), account,
  }); // worker_job_id = NULL (FK-safe)
  let job: { job_id: string; status: string; payload?: Record<string, unknown> };
  try {
    job = await enqueueJob(
      'report',
      { account, scope, tier, model, requested_by: owner, report_id: reportId },
      { idempotencyKey: key, requestedBy: owner },
    );
  } catch (e) {
    await markReportFailed(reportId, 'enqueue failed'); // no orphan running row
    // round-6 review MAJOR: clean 409 for a cross-requester idempotency_key collision (this
    // route's key is email-namespaced so it shouldn't fire in practice, but stay consistent with
    // the other enqueueJob callers rather than letting any raw error propagate unhandled).
    if (e instanceof IdempotencyKeyCollisionError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: 409 });
    }
    throw e;
  }
  // Concurrent same-key requests both pass the check above (it joins through worker_job_id, which is
  // NULL until the link happens), so the second one gets the FIRST job from the conflict path. The
  // LEDGER payload decides who owns it, because the worker obeys the payload — linking our row to a
  // job whose payload names another report strands ours as `running` for good, with no
  // markReportFailed and no reaper coverage (the reaper only reconciles worker_jobs).
  // Only a POSITIVE INTEGER counts as a ledger report id. `Number(null)` is 0 and
  // `Number.isFinite(0)` is true, so the previous guard treated a payload carrying
  // `report_id: null` — or no id at all, stored as null — as "the ledger names report 0", then
  // soft-deleted the FRESH report and answered with id 0 (codex stop-gate). Absent must mean absent.
  // The payload is JSON out of Aurora, and node-pg used to hand int8 ids back as STRINGS, so rows
  // written by any earlier deploy carry `report_id: "42"`. `typeof === 'number'` rejected those, the
  // loser skipped this whole branch, and both reports raced into linkReportJob — silently sharing one
  // job before the partial unique index existed, and a 500 with a permanent `running` orphan after it
  // (PR #203 review MAJOR). Accept a numeric string; keep rejecting absent/null/0/negative/fractional.
  const rawLedgerId = (job.payload as { report_id?: unknown } | undefined)?.report_id;
  const parsedLedgerId = typeof rawLedgerId === 'number'
    ? rawLedgerId
    : (typeof rawLedgerId === 'string' && /^\d+$/.test(rawLedgerId) ? Number(rawLedgerId) : NaN);
  const ledgerReportId = Number.isInteger(parsedLedgerId) && parsedLedgerId > 0 ? parsedLedgerId : null;
  if (ledgerReportId !== null && ledgerReportId !== reportId) {
    // Is the ledger's report still there? reportForIdempotencyKey filters deleted_at, so it never
    // sees a soft-deleted report and lets a same-key retry through to createReport — but
    // findOwnJob() (lib/jobs.ts) matches worker_jobs purely on idempotency_key with no such filter,
    // so it can still return the OLD job whose payload names the now-deleted report (PR #195 review
    // MAJOR: deduped onto a deleted id → 202 with a report_id that 404s, for the rest of the hour
    // bucket). Keeping our fresh row is not available either — enqueueJob already deduped, so no
    // message carrying our report_id was ever sent and the worker will never render it. Say what is
    // true instead of handing back a broken pointer.
    const ledgerLive = await getReport(ledgerReportId);
    if (!ledgerLive) {
      await softDeleteReport(reportId);
      return NextResponse.json({
        status: 'error',
        message: `the report this window already produced (${ledgerReportId}) was deleted; this `
          + `${tier} diagnosis can be re-run once the hour bucket rolls over`,
      }, { status: 409 });
    }
    await softDeleteReport(reportId);   // never ran, never will — not a FAILED diagnosis
    return NextResponse.json(
      { job_id: job.job_id, report_id: ledgerReportId, tier, model, deduped: true }, { status: 202 });
  }
  try {
    await linkReportJob(reportId, job.job_id); // FK now satisfiable
  } catch (e) {
    // Someone else's report got there first (partial unique index). Our row will never be rendered —
    // enqueueJob deduped, so no message names it — so retire it and answer with the one that exists,
    // the same shape the ledger branch above returns.
    if (e instanceof ReportJobAlreadyLinkedError) {
      // The worker resolves which report to render from the JOB PAYLOAD, not from this link. So if the
      // payload names OUR report, the render is going to happen to our row whatever the link says —
      // deleting it would destroy the row the worker is about to write, and pointing the caller at
      // another report would name one this job will never render (codex stop-gate). Only the
      // convenience link (used for idempotency lookups and lineage) is lost.
      if (ledgerReportId === reportId) {
        return NextResponse.json({ job_id: job.job_id, report_id: reportId, tier, model }, { status: 202 });
      }
      await softDeleteReport(reportId);
      const winner = await reportForIdempotencyKey(key);
      if (winner) {
        return NextResponse.json(
          { job_id: job.job_id, report_id: winner, tier, model, deduped: true }, { status: 202 });
      }
      return NextResponse.json({
        status: 'error',
        message: `another request already produced the report for this ${tier} window; re-run once the `
          + 'hour bucket rolls over',
      }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ job_id: job.job_id, report_id: reportId, tier, model }, { status: 202 });
}
