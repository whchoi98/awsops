-- since: 2.0.0
-- Backfill worker_jobs.requested_by for rows written before the column existed.
--
-- 01KYP36SGRNZK2VCHADSRVGE5N only ADDS the column, so every pre-existing job comes out NULL — and a
-- NULL requester is treated as admin-only on read (it means "internal enqueue, no end-user
-- principal"). The moment the ownership gate ships, users lose sight of their own past report and
-- compliance jobs: status, error, artifact link, all invisible to the person who ran them
-- (PR #195 review MAJOR, 2 models).
--
-- The owner is recoverable, which is why this is a backfill and not a documented loss: the domain
-- rows point back at their job (diagnosis_reports.worker_job_id, compliance_runs.worker_job_id) and
-- each carries its own requested_by. Note the contrast with the email->sub ownership backfill in
-- PR #203, which deliberately refuses to infer: there the mapping is unknowable and guessing would
-- MISATTRIBUTE a row to the wrong person. Here the join IS the record of who ran it — no inference.
--
-- Jobs with no domain row stay NULL on purpose. Those are the internal enqueues (insight,
-- datasource_index) plus any job whose report was hard-deleted; inventing a requester for them would
-- be the misattribution this avoids. Admin-only is the correct reading of "no end-user principal".
--
-- Idempotent: only touches rows that are still NULL, so a re-run is a no-op.

UPDATE worker_jobs j
   SET requested_by = r.requested_by
  FROM diagnosis_reports r
 WHERE r.worker_job_id = j.job_id
   AND j.requested_by IS NULL
   AND r.requested_by IS NOT NULL;

UPDATE worker_jobs j
   SET requested_by = c.requested_by
  FROM compliance_runs c
 WHERE c.worker_job_id = j.job_id
   AND j.requested_by IS NULL
   AND c.requested_by IS NOT NULL;
