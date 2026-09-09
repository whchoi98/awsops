import { getPool } from './db';
import { isAdmin } from './admin';
import { matchesIdentity, type User } from './auth';

export type DiagnosisTier = 'light' | 'mid' | 'deep';
// Bedrock model for the report. Only the deep tier may select 'opus'; light/mid are always 'sonnet'.
export type DiagnosisModel = 'sonnet' | 'opus';
export interface DiagnosisReport {
  id: number;
  worker_job_id: string | null;
  /** Diagnosed account id (from the linked job payload; null on legacy rows). */
  account?: string | null;
  tier: DiagnosisTier;
  status: 'running' | 'succeeded' | 'failed' | 'partial';
  requested_by: string;
  sources_used: string[];
  summary: Record<string, unknown>;
  artifact_uri: string | null;
  error: string | null;
  created_at: string;
  // Bedrock model used (NULL on legacy rows → render as 'sonnet'). Display metadata only.
  model: string | null;
  // LLM auto key-insight title (editable) + tags (auto-suggested + manual); soft-delete timestamp.
  title: string | null;
  tags: string[];
  deleted_at: string | null;
  // BFF-enriched: may the current user edit/delete this report (owner or admin)? Not a DB column.
  can_edit?: boolean;
  // A3/A5 (V1 parity): live per-section progress written by the worker as generate() advances.
  progress: DiagnosisProgress;
}

export interface DiagnosisProgress {
  current?: number;
  total?: number;
  section?: string;
  phase?: 'collect' | 'render' | 'assemble';
}

const COLS =
  'id, worker_job_id, tier, status, requested_by, sources_used, summary, artifact_uri, error, created_at, model, title, tags, deleted_at, progress';

// pentest-remediation P2-1 (Finding 5): the list had no per-user filter — every authenticated user
// saw every report (48/48 in the pentest run) regardless of who requested it. `owner` = the
// caller's `email ?? sub` (matches canMutateReport's ownership comparison); pass null for an admin
// caller to see every report (mirrors the existing GET [id]/download admin-bypass).
// PR #195 round-4 review MAJOR #1: `owner` also accepts a string[] (identity() + raw sub) so a
// legacy row written before the identity() switch still shows up for its real owner.
export async function listReports(
  limit = 50,
  owner: string | string[] | null = null,
): Promise<DiagnosisReport[]> {
  const owners = owner == null ? null : Array.isArray(owner) ? owner : [owner];
  const { rows } = await getPool().query(
    `SELECT ${COLS.split(', ').map((c) => `r.${c}`).join(', ')}, j.payload->>'account' AS account
     FROM diagnosis_reports r LEFT JOIN worker_jobs j ON j.job_id = r.worker_job_id
     WHERE r.deleted_at IS NULL AND ($2::text[] IS NULL OR r.requested_by = ANY($2))
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit, owners],
  );
  return rows as DiagnosisReport[];
}

export async function getReport(id: number): Promise<DiagnosisReport | null> {
  // Filters soft-deleted → a deleted report is 404 on GET/download/PATCH/DELETE.
  const { rows } = await getPool().query(
    `SELECT ${COLS} FROM diagnosis_reports WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
  return (rows[0] as DiagnosisReport) ?? null;
}

// [GATE-FIX R2 CRITICAL] FK ORDERING: diagnosis_reports.worker_job_id REFERENCES worker_jobs(job_id).
// The row must be created with worker_job_id=NULL (column is nullable), and LINKED only AFTER the
// worker_jobs row exists (post-enqueue) — otherwise the FK insert fails on the first request.
// The worker finds its row via payload.report_id (not the FK), so NULL-at-insert is safe.
// [Plan 2] parent_report_id = the most-recent SUCCEEDED report of the SAME tier (diff lineage). Set
// atomically in the INSERT via a subquery so the worker can compute summary.diff vs the prior run.
/**
 * `lineage` scopes the `parent_report_id` subquery. Without it the parent was the most recent
 * succeeded report of the same TIER, by anyone, for any account — so once reads became owner-scoped,
 * a user's regression diff was computed against a report they cannot even open, and parts of that
 * report's summary leaked into their diff. It also disagreed with schedule_dispatcher, which scopes
 * by owner+account: the same diagnosis got a different baseline depending on which path created it
 * (PR #203 review MAJOR, 3 models across 5 cells).
 *
 * `ownerKeys` mirrors the READ path (ownerKeysForRead) so the lineage narrows to sub-only exactly
 * when LEGACY_EMAIL_OWNER_MATCH is turned off; matching the new key alone would silently drop the
 * baseline for every user whose earlier reports are still email-keyed, and `parent_report_id` is
 * stamped at INSERT so nothing recovers it afterwards. Empty keys narrow (they fall back to
 * `requestedBy`) — no parent beats the wrong one. A null `account` is the opposite: it drops the
 * account predicate entirely, so the baseline may come from another account. That is the "account
 * not applicable" case (the value is optional in the job payload), NOT a safe default — every
 * caller that knows the account must pass it, and both current callers do (PR #203 review MINOR:
 * this comment used to claim a null account narrowed too).
 */
export async function createReport(
  tier: DiagnosisTier,
  requestedBy: string,
  model: DiagnosisModel = 'sonnet',
  lineage: { ownerKeys?: string[]; account?: string | null } = {},
): Promise<number> {
  const ownerKeys = lineage.ownerKeys?.length ? lineage.ownerKeys : [requestedBy];
  const account = lineage.account ?? null;
  const { rows } = await getPool().query(
    `INSERT INTO diagnosis_reports (worker_job_id, tier, requested_by, status, parent_report_id, model)
     VALUES (NULL, $1, $2, 'running',
       -- Two tiers, in this order (PR #203 review, both directions):
       --   1. a properly ATTRIBUTED baseline — its job is found through the link or the payload, and its
       --      account must then match. Attributed rows are never allowed across accounts.
       --   2. only if there is none AND this call is not account-scoped: a row we cannot attribute at all
       --      (NOT EXISTS any job). The worker's fallback path (scripts/v2/workers/handlers.py) creates
       --      reports with worker_job_id NULL and never writes the id into the payload, so a user's whole
       --      history can be like that, and requiring attribution leaves those users with no baseline.
       --      But when the caller DID name an account, an unattributable row cannot be shown to belong to
       --      it — and a baseline from the wrong account is worse than none, because the diff then reports
       --      a regression that never happened, permanently (parent_report_id is fixed at INSERT). Two
       --      reviews pulled in opposite directions here; misleading output loses to missing output, so
       --      tier 2 is limited to calls with no account ($5 IS NULL). The consequence, stated: a user
       --      whose history is entirely unattributed gets no baseline for an account-scoped diagnosis
       --      until they have one report from the current code, which always attributes.
       -- The payload branch is fenced three ways, because a payload is client-adjacent data:
       --   type = 'report'  — the generic POST /api/jobs allowlist is {noop, noop-heavy}, so a report job
       --                      can only come from /api/diagnosis (server-computed report_id, account
       --                      validated against the accounts table) or the dispatcher;
       --   text compare     — r.id::text, never (payload->>'report_id')::bigint: AND does not order
       --                      evaluation in Postgres, so a regex guard cannot stop an oversized value from
       --                      being cast and aborting the query with 22003;
       --   same owner       — a type value is not provenance, so the job that supplies the account must
       --                      belong to the same principal as the report.
       COALESCE(
         (SELECT r.id FROM diagnosis_reports r
            JOIN worker_jobs j ON (j.job_id = r.worker_job_id
              OR (j.type = 'report' AND j.payload->>'report_id' = r.id::text
                  AND j.requested_by = r.requested_by))
           WHERE r.tier = $1 AND r.requested_by = ANY($4::text[])
             AND r.status = 'succeeded' AND r.deleted_at IS NULL
             AND ($5::text IS NULL OR j.payload->>'account' = $5)
           ORDER BY r.created_at DESC LIMIT 1),
         (SELECT r.id FROM diagnosis_reports r
           WHERE $5::text IS NULL                       -- see the tier-2 note above
             AND r.tier = $1 AND r.requested_by = ANY($4::text[])
             AND r.status = 'succeeded' AND r.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM worker_jobs j2
                              WHERE j2.job_id = r.worker_job_id
                                 OR (j2.type = 'report' AND j2.payload->>'report_id' = r.id::text
                                     AND j2.requested_by = r.requested_by))
           ORDER BY r.created_at DESC LIMIT 1)),
       $3)
     RETURNING id`,
    [tier, requestedBy, model, ownerKeys, account],
  );
  // Number() as well as the pool-level int8 parser: a unit test with a mocked pool, or any future
  // client that skips getPool(), would otherwise hand a string to callers typed `number`.
  return Number(rows[0].id);
}

// Link the report to its job AFTER enqueueJob has inserted worker_jobs(job_id) (FK now satisfiable).
// One report per job is enforced by a partial unique index (migration 01KZ2A4M…), so this UPDATE can
// legitimately lose a race: a concurrent same-key request linked its own report to the same job first.
// Postgres reports that as 23505, and the caller's job is to recognise it rather than surface a 500
// with a permanently `running` orphan behind it (PR #203 review MAJOR).
export class ReportJobAlreadyLinkedError extends Error {
  constructor(public readonly workerJobId: string) {
    super(`worker job ${workerJobId} already has a report`);
    this.name = 'ReportJobAlreadyLinkedError';
  }
}

export async function linkReportJob(reportId: number, workerJobId: string): Promise<void> {
  try {
    await getPool().query(
      `UPDATE diagnosis_reports SET worker_job_id = $1 WHERE id = $2`,
      [workerJobId, reportId],
    );
  } catch (e) {
    if ((e as { code?: string }).code === '23505') throw new ReportJobAlreadyLinkedError(workerJobId);
    throw e;
  }
}

// Idempotency-first: return the report already attached to an existing job for this key, if any.
export async function reportForIdempotencyKey(key: string): Promise<number | null> {
  // Resolve through the job PAYLOAD first, because that is what the worker obeys: it renders the
  // report_id the payload names, whatever the link says. Those two can disagree — a link that lost the
  // one-report-per-job race leaves the rendered report unlinked — and following the link then returned a
  // report nothing will ever render (codex stop-gate). Fall back to the link for jobs whose payload
  // carries no usable id (older rows, other enqueue paths).
  const byPayload = await getPool().query(
    `SELECT r.id FROM worker_jobs j
       JOIN diagnosis_reports r ON j.payload->>'report_id' = r.id::text
      WHERE j.idempotency_key = $1 AND j.type = 'report'
        AND r.deleted_at IS NULL
      ORDER BY r.id DESC LIMIT 1`,
    [key],
  );
  if (byPayload.rows[0]) return Number(byPayload.rows[0].id);
  // The fallback is for jobs whose payload names NO report — not for jobs whose named report is gone.
  // Without that predicate, a payload naming a soft-deleted report fell through to the link and handed
  // back a report the worker never rendered, which is the exact confusion the payload-first order was
  // added to remove (codex stop-gate). A named-but-deleted report means "no live report for this key",
  // and the caller's own deleted-ledger branch already knows what to do with that.
  const { rows } = await getPool().query(
    `SELECT r.id FROM diagnosis_reports r JOIN worker_jobs j ON j.job_id = r.worker_job_id
     WHERE j.idempotency_key = $1 AND r.deleted_at IS NULL
       AND j.payload->>'report_id' IS NULL
     ORDER BY r.id DESC LIMIT 1`,
    [key],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

// Fail an orphaned 'running' row (e.g. when enqueue throws after createReport).
export async function markReportFailed(reportId: number, msg: string): Promise<void> {
  await getPool().query(
    `UPDATE diagnosis_reports SET status = 'failed', error = $2 WHERE id = $1 AND status = 'running'`,
    [reportId, msg],
  );
}

// Partial metadata update — only sets the columns provided (tags-only must not clobber title).
export async function updateReportMeta(
  id: number,
  meta: { title?: string | null; tags?: string[] },
): Promise<void> {
  const sets: string[] = [];
  const args: unknown[] = [];
  if (meta.title !== undefined) {
    args.push(meta.title);
    sets.push(`title = $${args.length}`);
  }
  if (meta.tags !== undefined) {
    args.push(meta.tags);
    sets.push(`tags = $${args.length}`);
  }
  if (sets.length === 0) return;
  args.push(id);
  await getPool().query(
    `UPDATE diagnosis_reports SET ${sets.join(', ')} WHERE id = $${args.length} AND deleted_at IS NULL`,
    args,
  );
}

// Soft delete — hide from the list (recoverable; S3 retained). Idempotent (re-delete = no-op).
export async function softDeleteReport(id: number): Promise<void> {
  await getPool().query(
    `UPDATE diagnosis_reports SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );
}

// Edit/delete gate: report owner (requested_by) OR an admin. Fail-closed (server-side enforced).
// pentest-remediation P2-1: use `||` (not `??`) to match how requested_by is WRITTEN everywhere
// (diagnosis/route.ts, compliance/run/route.ts) — an empty-string email must fall back to sub on
// both sides, or an owner with an empty email claim would be locked out of their own report.
// PR #195 round-4 review MAJOR #1: also accept a legacy row keyed by the raw sub (matchesIdentity),
// since rows created before the identity() switch (or before this user's schedule self-heal ran)
// are stuck with requested_by = sub forever otherwise.
export async function canMutateReport(
  user: Pick<User, 'email' | 'sub' | 'groups'>,
  report: Pick<DiagnosisReport, 'requested_by'>,
): Promise<boolean> {
  if (await isAdmin(user)) return true;
  return matchesIdentity(report.requested_by, user as User);
}
