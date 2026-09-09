import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { verifyUser, ownerKeysForRead } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { enqueueJob, EnqueueDeliveryError, IdempotencyKeyCollisionError } from '@/lib/jobs';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

// Mirror scripts/v2/workers/handlers.py REGISTRY, minus 'report'/'compliance': those two trust
// client-supplied payload.report_id/run_id/requested_by with no ownership check (handlers.py
// _report/_compliance), so a generic authenticated caller could overwrite another user's report
// artifact or forge one under someone else's identity (pentest-remediation follow-up, PR #195
// review). They stay reachable only via /api/diagnosis and /api/compliance/run, which compute
// requestedBy server-side and don't accept an attacker-controlled report_id/run_id.
const ALLOWED = new Set(['noop', 'noop-heavy']);

// pentest-remediation P0-1: this generic job-submission endpoint had NO verifyUser() call — any
// request reaching the BFF (or the ALB directly, since /api/jobs is not in the edge's is_public()
// allowlist) could enqueue a job, triggering billed Bedrock/Powerpipe work unauthenticated.
// GET had verifyUser but no ownership filter, exposing every job's result/error.
// Also (P2-review MAJOR-2, merged from #199): Lambda@Edge only validates JWT signature/expiry, so
// without this call a token that had been revoked on logout — but not yet expired — could keep
// enqueueing billable work for its full remaining lifetime. verifyUser() is revocation-aware, so
// one call covers both the unauthenticated and the revoked-but-unexpired case.
export async function POST(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  const queueUrl = process.env.JOBS_QUEUE_URL;
  if (!queueUrl) {
    return NextResponse.json(
      { status: 'unconfigured', message: 'JOBS_QUEUE_URL not set (workers disabled)' },
      { status: 503 },
    );
  }

  let body: any;
  try {
    body = await readJsonBounded(req); // bound BEFORE parse (OOM guard)
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    return NextResponse.json({ message: 'invalid JSON body' }, { status: 400 });
  }

  const type = body?.type;
  if (typeof type !== 'string' || !ALLOWED.has(type)) {
    return NextResponse.json(
      { message: `unknown job type; allowed: ${[...ALLOWED].join(', ')}` },
      { status: 400 },
    );
  }
  const payload = body?.payload && typeof body.payload === 'object' ? body.payload : {};
  const dryRun = Boolean(body?.dry_run);
  const rawIdempotencyKey =
    typeof body?.idempotency_key === 'string' && body.idempotency_key ? body.idempotency_key : null;

  // M3: bound the payload well under the SQS 256 KB message cap (the body also wraps
  // job_id/type/dry_run), and keep the JSONB column sane. Reject early, before any write.
  const payloadJson = JSON.stringify(payload);
  if (payloadJson.length > 200_000) {
    return NextResponse.json({ message: 'payload too large (max ~200KB)' }, { status: 413 });
  }

  // enqueueJob (lib/jobs.ts) owns the durable ledger write + SQS send. Status-code contract:
  // ledger-write failure → 500; SQS delivery failure after the row is durably 'queued' → 202 with
  // enqueue:'failed' (the client can poll; a redrive/reaper recovers).
  try {
    // PR #195 review MAJOR (4 models, three lenses): ownership must not hang off a MUTABLE
    // attribute. Cognito has username_attributes = ["email"], so an email change leaves the old
    // email-keyed rows matching neither key — list gone, detail 403, permanently orphaned — and a
    // reused address lets a new sub reach the previous holder's rows. New writes therefore record
    // the immutable sub. matchesIdentity() still accepts identity(user), so rows written before
    // this stay readable by their owner; converging those rows (backfill + retiring the email
    // branch) is the follow-up, PR #203.
    const requestedBy = user.sub;
    // round-7 review MAJOR: this route accepts a caller-supplied idempotency_key, and the legacy
    // global UNIQUE(idempotency_key) is still in place during Phase 1 — so an authenticated
    // attacker could squat a *victim's* key and deny them service. The diagnosis keys are
    // deterministic and guessable (`report:${email}:${tier}:${model}:${scope}:${hour}`), so
    // POSTing that exact string here would make the victim's own /api/diagnosis hit 23505 on the
    // legacy constraint, fail its requester-scoped recovery lookup, and 409 + markReportFailed for
    // the whole hour bucket. Namespacing the client-supplied key per requester makes squatting
    // structurally impossible — the attacker can only ever collide with their own keys — and it
    // closes the DoS inside this PR, with no dependency on the Phase 2 constraint drop. Keys
    // minted server-side (diagnosis, compliance) are NOT namespaced here: they're already derived
    // from the requester's own identity and must stay byte-stable across callers.
    const idempotencyKey = rawIdempotencyKey ? `u:${requestedBy}:${rawIdempotencyKey}` : null;
    const { job_id, status } = await enqueueJob(type, payload, { idempotencyKey, dryRun, requestedBy });
    return NextResponse.json({ job_id, status }, { status: 202 });
  } catch (e) {
    if (e instanceof EnqueueDeliveryError) {
      return NextResponse.json(
        { job_id: e.job_id, status: e.status, enqueue: 'failed', message: e.message },
        { status: 202 },
      );
    }
    // round-6 review MAJOR: a cross-requester idempotency_key collision on the legacy global
    // constraint is a clean conflict, not a server error — 409, not an opaque 500.
    if (e instanceof IdempotencyKeyCollisionError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: 409 });
    }
    return NextResponse.json(
      { status: 'error', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) {
    return NextResponse.json({ status: 'error', message: 'unauthenticated' }, { status: 401 });
  }
  try {
    // Ownership filter: admins see every job; everyone else sees only jobs they requested.
    // requested_by IS NULL rows are internal-only enqueues (scheduler/reaper) — admin-only.
    // round-5 review MAJOR: match jobs/[id] and listReports — also scope by the raw sub, so a
    // legacy row (requested_by = sub, written before the identity() switch) still shows up in
    // the LIST, not just when fetched directly by UUID.
    const admin = await isAdmin(user);
    const r = admin
      ? await getPool().query(
          `SELECT job_id, type, status, runtime, error, created_at, updated_at
           FROM worker_jobs ORDER BY created_at DESC LIMIT 50`,
        )
      : await getPool().query(
          `SELECT job_id, type, status, runtime, error, created_at, updated_at
           FROM worker_jobs WHERE requested_by = ANY($1) ORDER BY created_at DESC LIMIT 50`,
          [[...ownerKeysForRead(user)]],
        );
    return NextResponse.json({ jobs: r.rows });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
