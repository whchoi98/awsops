import { randomUUID } from 'crypto';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { getPool } from '@/lib/db';

let sqs: SQSClient | null = null;
function getSqs(): SQSClient {
  if (!sqs) sqs = new SQSClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
  return sqs;
}

export interface EnqueueOpts {
  idempotencyKey?: string | null;
  dryRun?: boolean;
  // Caller-supplied job id (so the BFF can link worker_job_id before the job runs).
  jobId?: string;
  // Server-derived requester identity (user.email || user.sub) — NEVER taken from the client
  // payload. Null for internal-only enqueues (scheduler dispatcher, reaper) with no end-user
  // principal; those rows are admin-only on read (see app/api/jobs/route.ts GET).
  requestedBy?: string | null;
}

export interface EnqueueResult {
  job_id: string;
  status: string;
  /**
   * The LEDGER's payload for this job — this request's on a fresh insert, the FIRST request's on an
   * idempotent replay. Callers that create a domain row per request must compare against it: the
   * worker runs THIS payload, so a caller whose row is not named here owns a row that will never be
   * rendered and never be failed (PR #195 review MAJOR: permanent `running`).
   */
  payload: Record<string, unknown>;
}

/**
 * Raised when the durable ledger row was written but the SQS delivery failed. The job_id is
 * already 'queued' (a redrive/reaper recovers), so callers can return 202 instead of 500.
 */
export class EnqueueDeliveryError extends Error {
  constructor(public readonly job_id: string, public readonly status: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = 'EnqueueDeliveryError';
  }
}

/**
 * Raised when an idempotency_key collides with a row that does NOT belong to this requester and
 * no fresh row of the caller's own could be inserted or found — i.e. a genuine cross-requester
 * key collision on the legacy global UNIQUE(idempotency_key) constraint (round-6 review MAJOR:
 * that column-level constraint still exists alongside the new per-requester partial indexes
 * during this Phase-1-only rollout — see migration 01KYVDMY8Y7Q90YPTGK23QNR3B). Callers should
 * surface this as a clean 409, never let a raw pg 23505 leak through as an opaque 500.
 */
export class IdempotencyKeyCollisionError extends Error {
  constructor() {
    super('idempotency key collision: please retry with a different idempotency_key');
    this.name = 'IdempotencyKeyCollisionError';
  }
}

// Requester-scoped lookup for an idempotency_key conflict (NULL-safe on requested_by). Shared by
// both conflict paths below: the ON CONFLICT ... DO NOTHING no-op (the named partial index
// covered this row) and the legacy global UNIQUE(idempotency_key) violation (a different
// constraint entirely, not named as our ON CONFLICT arbiter, so Postgres raises 23505 instead of
// invoking DO NOTHING — round-6 review).
async function findOwnJob(
  pool: ReturnType<typeof getPool>,
  idempotencyKey: string | null,
  requestedBy: string | null,
): Promise<{ job_id: string; status: string; type: string; payload: Record<string, unknown> | null; dry_run: boolean } | null> {
  // type/payload/dry_run come back too: on an idempotent replay the SQS message must describe the
  // job that the LEDGER holds, not whatever the replaying request happened to carry (see below).
  const existing = await pool.query(
    `SELECT job_id, status, type, payload, dry_run FROM worker_jobs
      WHERE idempotency_key = $1 AND requested_by IS NOT DISTINCT FROM $2`,
    [idempotencyKey, requestedBy],
  );
  return existing.rows.length > 0 ? existing.rows[0] : null;
}

/**
 * Enqueue a worker job: durable ledger write to worker_jobs (source of truth) then a best-effort
 * SQS SendMessage. Extracted verbatim from app/api/jobs/route.ts so both routes share one seam.
 *
 * Phase 1 — insert-or-get on idempotency_key (NULLs are distinct → keyless jobs always insert).
 * Phase 2 — enqueue (re-send on idempotent replay is safe; the dispatcher dedups via SFN exec name).
 * Throws if JOBS_QUEUE_URL is unset (caller keeps the 503 behavior) or on a DB/SQS failure.
 */
export async function enqueueJob(
  type: string,
  payload: Record<string, unknown>,
  opts: EnqueueOpts = {},
): Promise<EnqueueResult> {
  const queueUrl = process.env.JOBS_QUEUE_URL;
  if (!queueUrl) throw new Error('JOBS_QUEUE_URL not set (workers disabled)');

  const dryRun = Boolean(opts.dryRun);
  const idempotencyKey = opts.idempotencyKey ?? null;
  // SECURITY (consensus gate): `scheduled` is a scheduler-provenance marker the report worker uses to
  // decide whether to email the mailing list. It must originate ONLY from the EventBridge dispatcher,
  // which writes SQS directly (bypassing this function) — never from a client. Strip it from every
  // web-originated enqueue so a caller can't POST {type:"report", payload:{scheduled:true}} to force a
  // mailing-list blast. (No legitimate BFF caller sets it.)
  const safePayload: Record<string, unknown> = { ...(payload ?? {}) };
  delete safePayload.scheduled;
  const payloadJson = JSON.stringify(safePayload);

  const pool = getPool();
  let jobId = '';
  let status = 'queued';
  const requestedBy = opts.requestedBy ?? null;
  // idempotency_key is no longer a single global UNIQUE column (round-2 pentest fix: a globally
  // guessable key let one requester's pre-inserted row DoS another requester's real request) — it's
  // now two partial unique indexes, one per requested_by IS [NOT] NULL (see migration
  // 01KYVDMY8Y7Q90YPTGK23QNR3B). The ON CONFLICT target must name whichever partial index actually
  // covers this row; Postgres can't pick between two partial arbiters based on the row's own values.
  const conflictTarget = requestedBy === null
    ? 'ON CONFLICT (idempotency_key) WHERE requested_by IS NULL'
    : 'ON CONFLICT (requested_by, idempotency_key) WHERE requested_by IS NOT NULL';
  // What actually goes on the queue. Equal to this request on a fresh insert; replaced by the
  // ledger's own values on an idempotent replay so the message can never contradict the row.
  let sendType = type;
  let sendPayload: Record<string, unknown> = safePayload;
  let sendDryRun = dryRun;
  let ins: { rows: Array<{ job_id: string }> } | null = null;
  try {
    ins = await pool.query(
      `INSERT INTO worker_jobs (job_id, type, payload, dry_run, idempotency_key, requested_by, status)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, 'queued')
       ${conflictTarget} DO NOTHING
       RETURNING job_id`,
      [opts.jobId || randomUUID(), type, payloadJson, dryRun, idempotencyKey, requestedBy],
    );
  } catch (e) {
    // round-6 review MAJOR: the legacy global UNIQUE(idempotency_key) constraint (kept
    // deliberately — dropping it is a separate Phase-2 migration) isn't our ON CONFLICT arbiter
    // above, so a collision on IT (e.g. a different requester's row with the same key) surfaces
    // as a raw 23505 instead of being caught by DO NOTHING. Fall through to the same
    // requester-scoped recovery lookup the named-arbiter conflict path uses below — `ins` stays
    // null, so the `!ins` branch runs findOwnJob() for us.
    // Narrow to the idempotency constraint. A 23505 from worker_jobs_pkey (a duplicate caller-
    // supplied jobId) is a different failure and must not be reported as an idempotency conflict
    // (review MINOR). Unnamed 23505s still take the recovery path — the legacy global constraint is
    // the one we are catching and older Postgres error payloads do not always carry `constraint`.
    const err = e as { code?: string; constraint?: string };
    if (err?.code !== '23505') throw e;
    if (err.constraint && !err.constraint.includes('idempotency_key')) throw e;
  }
  if (ins && ins.rows.length > 0) {
    jobId = ins.rows[0].job_id;
  } else {
    // Scope the conflict lookup to the same requester (NULL-safe): idempotency keys can be
    // deterministic and guessable (e.g. report:${email}:${tier}:...:${hour}), so without this an
    // attacker who knows a victim's email could read the victim's job_id/status here and have
    // their own payload attached to it via the SQS send below (pentest-remediation PR #195 review).
    // Also the recovery path for the legacy-constraint 23505 caught above: if no row of the
    // caller's own turns up, the collision genuinely belongs to a different requester — fail
    // cleanly instead of leaking the raw pg exception.
    const existing = await findOwnJob(pool, idempotencyKey, requestedBy);
    if (!existing) throw new IdempotencyKeyCollisionError();
    jobId = existing.job_id;
    status = existing.status;
    // Enqueue what the LEDGER says this job is, not what this request asked for. The insert above
    // was a no-op, so worker_jobs still describes the FIRST request; sending this request's
    // type/payload/dry_run under that job_id would have the worker execute P2 while the ledger row
    // — and therefore /api/jobs/[id], the audit trail, and the reaper — all say P1. Replaying a
    // key is how a caller RETRIES, so this is reachable without any adversary; with one (a
    // deterministic key is guessable by design, cf. report:${email}:...) it is a way to swap the
    // payload of an already-recorded job. Round-2 scoped the lookup to the caller's own rows,
    // which stopped cross-requester capture but left same-requester divergence in place.
    sendType = existing.type;
    sendPayload = existing.payload ?? {};
    sendDryRun = existing.dry_run;
  }

  try {
    await getSqs().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          job_id: jobId, type: sendType, payload: sendPayload, dry_run: sendDryRun,
        }),
      }),
    );
  } catch (e) {
    // Ledger row is durable; surface a distinct error so the caller can return 202 (not 500).
    throw new EnqueueDeliveryError(jobId, status, e);
  }

  return { job_id: jobId, status, payload: sendPayload };
}
