-- since: 2.0.0
-- worker_jobs.idempotency_key was a single GLOBAL UNIQUE constraint. Diagnosis idempotency keys
-- are deterministic and guessable from a victim's email (report:${email}:${tier}:${model}:
-- ${scope}:${hour}), and /api/jobs accepts a client-supplied idempotency_key for type 'noop'. An
-- attacker who pre-inserts a row under a victim's future key made the victim's real INSERT hit
-- the global UNIQUE constraint (0 rows affected), while the requester-scoped conflict-recovery
-- SELECT (added in the prior PR #195 review round) found no row belonging to the victim's own
-- requester — surfacing as "idempotency conflict but no existing row" (a 500 / failed report for
-- the victim). Round-2 pentest-remediation MAJOR: cross-user idempotency-key DoS.
--
-- (Comment corrected: an earlier revision said a cross-requester collision surfaces as an uncaught
-- 23505 / 500. It does not any more — the same PR made lib/jobs.ts catch that code, fall back to the
-- requester-scoped lookup, and return a clean 409 when no row of the caller's own turns up.)
--
-- Fix: scope the uniqueness by requester instead of globally, via two partial unique indexes.
-- requested_by IS NULL rows (internal-only enqueues with no end-user principal, e.g. the reaper)
-- have nothing to scope by, and must stay deduped globally amongst themselves exactly like before,
-- so they get their own global-among-NULLs partial index. The schedule dispatcher is NOT in that
-- bucket — it persists the schedule owner's identity() value, so its jobs land in the
-- (requested_by, idempotency_key) index like any user-initiated enqueue.
--
-- PR #195 round-4 review MAJOR #2: this file is PHASE 1 of a two-phase rollout — it only ADDS the
-- new partial indexes and deliberately does NOT drop the old global `UNIQUE(idempotency_key)`
-- constraint yet. Dropping it here would race the code deploy: whichever of {this migration, the
-- web/lib/jobs.ts ON CONFLICT-target change} lands second would 500 on every enqueue in the gap,
-- because an `ON CONFLICT` target must resolve to an existing index at plan time — old code naming
-- the (now-gone) global constraint, or new code naming the (not-yet-created) partial indexes,
-- both fail hard on every insert, not just on an actual conflict.
--
-- Keeping the old constraint alongside the new indexes makes ordering safe: old code's
-- `ON CONFLICT (idempotency_key)` still resolves (old constraint untouched), and once this
-- migration has run, new code's `ON CONFLICT` targets resolve too (indexes now exist) — so
-- migrate-then-deploy works regardless of exactly when the deploy follows. The old constraint is
-- strictly narrower than the new indexes (global uniqueness implies per-requester uniqueness), so
-- during the transition a genuine cross-user idempotency-key collision surfaces as an uncaught
-- unique_violation (500) rather than being silently misattributed — a safe, temporary regression
-- versus the round-2 DoS this migration fixes, not a new one.
--
-- PHASE 2 (drop the old constraint) is a separate migration
-- (01KYVGNKX0PQF7AGBAPFZKS4NW_worker_jobs_idempotency_drop_global_unique.sql) that must only be
-- applied after the web code from this PR is confirmed deployed and stable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_jobs_idem_internal
  ON worker_jobs (idempotency_key) WHERE requested_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_worker_jobs_idem_per_requester
  ON worker_jobs (requested_by, idempotency_key) WHERE requested_by IS NOT NULL;
