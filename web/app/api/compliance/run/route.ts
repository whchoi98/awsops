import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/auth';
import { getPool } from '@/lib/db';
import { enqueueJob, EnqueueDeliveryError, IdempotencyKeyCollisionError } from '@/lib/jobs';
import { readJsonBounded, BodyTooLargeError } from '@/lib/http-body';

export const dynamic = 'force-dynamic';

// Mirror compliance.ALLOWED (worker) — defense-in-depth: reject anything else before enqueue so a
// crafted benchmark string can never reach the Powerpipe argv.
const ALLOWED = new Set(['cis_v150', 'cis_v200', 'cis_v300', 'cis_v400']);

export async function POST(req: Request) {
  const user = await verifyUser(req.headers.get('cookie'));
  if (!user) return NextResponse.json({ message: 'unauthenticated' }, { status: 401 });
  if (!process.env.JOBS_QUEUE_URL) {
    return NextResponse.json({ status: 'unconfigured', message: 'workers disabled' }, { status: 503 });
  }
  let body: any;
  try {
    // pentest-remediation P0-2 (Finding 8): raw req.json() had no size cap — a chunked request
    // with no Content-Length bypassed middleware.ts's header-only check entirely.
    body = await readJsonBounded(req, 65_536);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return NextResponse.json({ message: 'request body too large' }, { status: 413 });
    return NextResponse.json({ message: 'invalid JSON body' }, { status: 400 });
  }
  const benchmark = body?.benchmark;
  if (typeof benchmark !== 'string' || !ALLOWED.has(benchmark)) {
    return NextResponse.json({ message: `unknown benchmark; allowed: ${[...ALLOWED].join(', ')}` }, { status: 400 });
  }
  const requestedBy = user.sub;   // immutable ownership key — see the note in app/api/jobs/route.ts

  // Account scoping (diagnosis-route precedent): absent/'' → 'all' (aggregator — every account
  // merged, the previous implicit behavior); a 12-digit id must be a known ENABLED account (host
  // included — Powerpipe scopes via that account's Steampipe connection aws_<id>). Unknown ids
  // fall back to 'all' rather than erroring (same graceful fallback as /api/diagnosis).
  let scope = 'all';
  const requested = typeof body?.account === 'string' ? body.account.trim() : '';
  if (/^[0-9]{12}$/.test(requested)) {
    const { rows } = await getPool().query(`SELECT 1 FROM accounts WHERE account_id = $1 AND enabled`, [requested]);
    if (rows.length > 0) scope = requested;
  }

  // Pre-create the run row (running) — mirrors the _report pattern: fixes the worker_job_id linkage
  // and the UI race (the page can poll the run immediately).
  const ins = await getPool().query(
    `INSERT INTO compliance_runs (benchmark, status, requested_by, account) VALUES ($1, 'running', $2, $3) RETURNING id`,
    [benchmark, requestedBy, scope],
  );
  const runId = ins.rows[0].id;

  try {
    const { job_id } = await enqueueJob('compliance', { benchmark, run_id: runId, requested_by: requestedBy, scope }, { requestedBy });
    // Link the run 1:1 to its worker job (migration documents worker_job_id → worker_jobs).
    await getPool().query(`UPDATE compliance_runs SET worker_job_id = $1 WHERE id = $2`, [job_id, runId]);
    return NextResponse.json({ run_id: runId, job_id }, { status: 202 });
  } catch (e) {
    if (e instanceof EnqueueDeliveryError) {
      await getPool().query(`UPDATE compliance_runs SET worker_job_id = $1 WHERE id = $2`, [e.job_id, runId]).catch(() => {});
      return NextResponse.json({ run_id: runId, job_id: e.job_id, enqueue: 'failed' }, { status: 202 });
    }
    // round-6 review MAJOR: clean 409 for a cross-requester idempotency_key collision, not a raw 500.
    if (e instanceof IdempotencyKeyCollisionError) {
      return NextResponse.json({ status: 'error', message: e.message }, { status: 409 });
    }
    return NextResponse.json({ status: 'error', message: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
