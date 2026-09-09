-- since: 2.0.0
-- One ACTIVE schedule per user — enforced by the DATABASE, because a check cannot do it.
--
-- web/lib/diagnosis-schedule.ts upsertSchedule() disables every other frequency for the user before
-- upserting the chosen one, precisely so exactly one row is ever enabled: the dispatcher fires every
-- `enabled` row, and readSchedule()'s LIMIT 1 would hide the extra one from the UI, so two active rows
-- means a silently doubled diagnosis (and doubled Bedrock spend). That invariant lived only in that
-- function, and UNIQUE (user_sub, schedule_type) does not imply it.
--
-- The owner-sub backfill (scripts/v2/backfill-owner-sub.mjs) rewrites report_schedules.user_sub from a
-- legacy email to the Cognito sub, which can move an enabled row onto a sub that already has an enabled
-- row of a DIFFERENT frequency. No constraint fired, so nothing rolled back. Two rounds of review
-- caught successively weaker attempts to fix that in the tool:
--   1. a plan-time check    — anything created between plan and apply walks past it;
--   2. an in-transaction check — better, but still a READ, so it is subject to isolation. Measured on
--      PG 17 with two connections: under READ COMMITTED the check sees a concurrent commit and aborts,
--      but under SERIALIZABLE the apply's snapshot HIDES that commit, the check passes, and both
--      transactions commit — leaving exactly the two active rows it was meant to prevent. Raising the
--      isolation level made it worse, which is the tell that a check is the wrong tool here.
-- A partial unique index fails the second write with 23505 at the one layer that sees both
-- transactions, whatever their isolation. Callers then only have to recognise the error.
--
-- Partial (WHERE enabled) because disabled history rows are kept deliberately: a user who switches
-- weekly -> monthly leaves the weekly row behind with its config, and several disabled rows per user
-- must stay legal.
--
-- The UPDATE first: live data may already violate this (that is what the backfill review found), and a
-- CREATE UNIQUE INDEX against violating rows aborts the migration and blocks the deploy.
--
-- NO TIEBREAK: when a user has more than one active row, ALL of them are disabled.
--
-- Two attempts at picking a winner were both wrong, for the same reason — this schema has no
-- "configured at" column:
--   updated_at — moved by FIRING, not configuring: report_schedules has a BEFORE UPDATE trigger
--                (trg_schedule_touch → touch_updated_at) and schedule_dispatcher UPDATEs every row it
--                fires, so the most recently fired row would win over the user's actual choice.
--   created_at — not configuration recency either: upsertSchedule() is ON CONFLICT DO UPDATE, so a user
--                switching back to weekly REACTIVATES the old row without touching its created_at.
-- Both reviews were right, and the conclusion is that the information is simply not in the table.
--
-- So this does not guess. Every active row of an affected user is disabled: their configs are preserved
-- (disabled rows are kept deliberately) and the UI shows no active schedule, which is visible and
-- correctable in one click — where a wrong guess would silently run the wrong schedule forever. Users
-- with exactly one active row, which is everyone once the index exists, are untouched.
--
-- Each disabled row is RAISE NOTICE'd, and scripts/v2/migrate.mjs now has a notice listener, so the
-- decision actually reaches the operator's log instead of being discarded by the driver.

-- CONCURRENTLY is deliberately NOT used: migrate.mjs runs statements inside an advisory-locked
-- transaction, which CREATE INDEX CONCURRENTLY cannot join. report_schedules holds at most a few rows
-- per user, so the brief write lock is not a concern.

DO $mig$
DECLARE r RECORD;
BEGIN
  FOR r IN
    UPDATE report_schedules s SET enabled = false          -- updated_at: the trigger sets it
     WHERE s.enabled
       AND EXISTS (SELECT 1 FROM report_schedules t
                    WHERE t.user_sub = s.user_sub AND t.enabled AND t.id <> s.id)
    RETURNING s.id, s.user_sub, s.schedule_type
  LOOP
    RAISE NOTICE 'one-active de-dup: disabled report_schedules id=% user_sub=% type=% '
      '(user had multiple active rows; which one they wanted is not recorded anywhere, so none was kept '
      '— they must re-enable one)', r.id, r.user_sub, r.schedule_type;
  END LOOP;
END
$mig$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_schedule_one_active
    ON report_schedules (user_sub) WHERE enabled;
