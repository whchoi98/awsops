-- since: 2.0.0
-- Deploy order: run `make migrate` before this PR's Terraform apply/Lambda deployment; this additive migration is safe first and prevents new worker code from writing a missing column.
-- worker_jobs.requested_by — server-set requester identity (user.email ?? user.sub), NOT the
-- client-controlled `payload` JSONB. Backs the P0-1 pentest-remediation fix: POST /api/jobs had no
-- verifyUser() call and GET /api/jobs / GET /api/jobs/[id] had no ownership filter, so any request
-- that reached the BFF (or bypassed the edge entirely) could enqueue jobs and read every job's
-- result/artifact_uri. NULL = pre-existing rows and jobs enqueued by internal callers that have no
-- end-user principal (the reaper) — canMutateReport()-style checks treat those as admin-only for
-- reads. NOTE: the schedule dispatcher is NOT one of them; it persists the schedule owner's raw
-- Cognito sub, so its jobs are owner-scoped like any user-initiated enqueue.
ALTER TABLE worker_jobs ADD COLUMN IF NOT EXISTS requested_by TEXT;
CREATE INDEX IF NOT EXISTS idx_worker_jobs_requested_by ON worker_jobs(requested_by);
