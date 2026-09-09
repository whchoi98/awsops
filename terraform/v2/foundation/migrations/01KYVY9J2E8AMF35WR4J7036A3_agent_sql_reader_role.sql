-- since: 2.0.0
-- Dedicated least-privilege Postgres role for the agent `execute_sql` MCP tool (aws_rds_mcp.py) and
-- the inventory-read connector (inventory_read_mcp.py) — replaces running those RDS Data API calls
-- under the Aurora MASTER secret (a superuser-equivalent role).
--
-- ══ INVARIANT — read this before touching anything below ═══════════════════════════════════════════
--   1. `awsops_sql_reader` gets data access ONLY through views in the `sql_reader` schema.
--   2. NEVER grant this role anything in `public` (no schema USAGE beyond what PUBLIC already has,
--      no table grant, no column grant). If you find yourself writing `GRANT ... ON public.x`, stop.
--   3. Adding a column to a view here is a SECURITY-RELEVANT change. It widens what a
--      model-invocable tool can print. It needs review, not a drive-by edit.
--   4. Adding a whole new view is likewise a widening — justify the diagnostic need in the diff.
--   5. NEVER list a JSONB blob column RAW (inventory_resources.data, topology_nodes.meta). They hold
--      raw provider payloads — CloudFront origin CustomHeaders values among them — and topology
--      copies the ENTIRE source row into meta.row, so listing one reopens column-level fail-open one
--      level down, inside the JSON, defeating rule 3. Expose a NAMED-KEY projection instead, as the
--      two views below do. A key blocklist would be fail-open by construction — do not.
--      Dropping the column outright is not the answer either: a previous revision did that and broke
--      the inventory-read connector at runtime (PR #197 review CRITICAL) — a leak traded for an
--      outage. Adding a key to a projection is a rule-3 widening and takes the same review.
--      The data allowlist must stay a SUPERSET of inventory_read_mcp.PROJECTIONS —
--      agent/lambda/test_inventory_view_contract.py fails if the two drift apart.
-- ══════════════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY (PR #197 rounds 3-7): execute_sql's read-only guarantee rested on two things that are not
-- boundaries. (1) A lexical denylist in sql_readonly_guard.py — it strips string literals BEFORE
-- matching, so any core function that takes SQL as a *string argument* is invisible to it:
--   SELECT query_to_xml('SELECT pg_cancel_backend(pid) FROM pg_stat_activity', true, false, '')
-- is a first-token SELECT with no DANGER token, and query_to_xml is core PostgreSQL (no extension).
-- (2) `SET TRANSACTION READ ONLY` — which only blocks data WRITES; control-plane and side-effect
-- functions (pg_cancel_backend, pg_reload_conf, set_config, aws_lambda.invoke, ...) are explicitly
-- permitted inside a read-only transaction. Seven rounds of review each found a new way through the
-- text filter, because "functions that execute a string" is an unbounded set.
--
-- So the boundary moves into the DATABASE: the tool now authenticates as this role, and the agent
-- Lambda IAM role no longer has GetSecretValue on the Aurora master secret at all (ai.tf). The
-- lexical guard and the READ ONLY transaction both stay in place — cheap, and they catch honest
-- mistakes early — but they are defense-in-depth, not the boundary.
--
-- WHY VIEWS AND NOT A TABLE ALLOWLIST (PR-review round 10 CRITICAL — the pivot):
-- Round 8 granted `SELECT ON ALL TABLES` and missed `eks_registrations.auth` (a raw k8s bearer
-- token). Round 9 replaced that with an explicit ~38-table allowlist and missed
-- `worker_jobs.task_token` — a Step Functions task token, i.e. a transferable CAPABILITY: whoever
-- holds it can SendTaskSuccess/SendTaskFailure on a live workflow execution. Two rounds, same
-- structural failure: a TABLE-level allowlist fails OPEN per column. Every table is one
-- `ALTER TABLE ... ADD COLUMN secret` away from silent exposure, with no review signal, and
-- correctness depends on a human re-auditing ~38 tables × every column, forever.
--
-- So the default is inverted. This role is granted SELECT on VIEWS ONLY, each with an EXPLICIT
-- column list, in a schema it does not own and cannot write. Consequences:
--   * A new column on any base table is INVISIBLE to this role until someone adds it to a view.
--     The failure mode flips from "silently exposed" to "silently absent" — the correct direction
--     for a model-invocable tool: a missing column is a bug report, a leaked token is an incident.
--   * Each view is a self-documenting contract. Widening shows up in review as a deliberate diff.
--   * The role's search_path points at `sql_reader` first, so an unqualified `FROM worker_jobs` in a
--     model-written query resolves to the redacted view. Explicitly qualifying `public.worker_jobs`
--     is DENIED — there is no grant on it. (search_path is convenience, not the boundary: the role
--     can change its own search_path and can always fully-qualify. The boundary is the grants.)
--   * The privilege chain: views are owned by the migration role (the Aurora master user, normally
--     `awsops_admin`) and created with the DEFAULT `security_invoker = false`, so the view body runs
--     with the OWNER's privileges on the base table. That is precisely what lets a grant on the view
--     work while the role has zero privilege on the table underneath. `security_invoker = false` is
--     stated explicitly below rather than left to the default — if it were ever flipped, every view
--     would start failing (fail-closed), but being explicit keeps the intent reviewable.
--
-- Unlike awsops_web / awsops_worker / steampipe_reader (all rds_iam, no password), this role needs a
-- password: the RDS Data API REQUIRES a Secrets Manager `secretArn` on every ExecuteStatement /
-- BeginTransaction / RollbackTransaction call (see botocore's rds-data model — secretArn is a
-- required member) and sends that username/password to the engine. IAM database auth is therefore
-- not reachable on this path. The password is generated and owned by Terraform
-- (random_password.agent_sql_reader -> aws_secretsmanager_secret.agent_sql_reader in ai.tf) and
-- pushed into this role by `make migrate` (scripts/v2/migrate.mjs), so the secret stays the single
-- source of truth and a Terraform-side rotation re-syncs on the next migrate.
--
-- PASSWORD-SYNC ORDERING WINDOW (PR-review round 10 MAJOR — documented, not "fixed"):
-- `syncSqlReaderPassword` in migrate.mjs runs `ALTER ROLE ... PASSWORD <secret value>` on every
-- `make migrate`, so the DB converges to the secret. The window is between Terraform writing a new
-- `random_password` into the secret version and the next `make migrate`: during it, the Lambda reads
-- the NEW password from the secret while the DB role still has the OLD one → `execute_sql` returns a
-- Data API auth error. Bounds and why this is acceptable:
--   * `random_password` is only regenerated when its own arguments change or it is tainted — there is
--     no rotation schedule on this secret (no `aws_secretsmanager_secret_rotation` resource), so the
--     window opens only on a deliberate operator action, never spontaneously. This is the opposite of
--     the RDS-managed master secret's 7-day auto-rotation.
--   * `make deploy` runs `migrate` first (see the Makefile), and the documented apply order is
--     `terraform apply` → `make migrate`/`make deploy`, so the normal path closes the window within
--     the same operator session.
--   * Failure mode is a clean tool-level error on one read-only diagnostic tool. No data loss, no
--     partial write, no effect on web/worker (those use rds_iam and are unaffected).
-- A true fix (have the Lambda tolerate both passwords, or drive the ALTER ROLE from a Terraform-side
-- rotation Lambda) means new infrastructure this PR should not add, so the window is documented here
-- and in docs/runbooks/agent-sql-reader.md rather than engineered away (that runbook also carries the
-- required `apply -> make migrate -> make agentcore` order, which `make agentcore` alone does NOT
-- satisfy). Recovery is one command: `make migrate`.
--
-- NOTE on re-running: migrate.mjs enforces checksum immutability for APPLIED migrations, so on a
-- cluster where an earlier version of THIS file already ran, `make migrate` will refuse with
-- "checksum drift" and the REVOKEs below will not execute. That is intended (migrations are
-- immutable); this file is still editable because it has never shipped on `main`. The REVOKEs are
-- kept so the file is self-converging on a fresh apply and for a cluster where the row was cleared.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'awsops_sql_reader') THEN
    CREATE ROLE awsops_sql_reader WITH LOGIN;
  END IF;
END $$;

-- Idempotent + explicit: state every attribute rather than relying on CREATE ROLE defaults, so
-- re-running against a pre-existing role converges to the same least-privilege shape.
ALTER ROLE awsops_sql_reader WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
  NOREPLICATION NOBYPASSRLS;

-- Session-level read-only for this principal specifically: every connection starts read-only even
-- if a future code path forgets the explicit `SET TRANSACTION READ ONLY` wrapper. (A USERSET GUC —
-- the role could turn it off — so it is convenience, not the boundary. The boundary is that this
-- role holds no INSERT/UPDATE/DELETE anywhere and only SELECT on non-updatable views.)
ALTER ROLE awsops_sql_reader SET default_transaction_read_only = on;
-- Resolve unqualified names to the redacted views. `public` is deliberately ABSENT.
ALTER ROLE awsops_sql_reader SET search_path = sql_reader, pg_catalog;

GRANT CONNECT ON DATABASE awsops TO awsops_sql_reader;

-- ── Converge a cluster that ran round 8's blanket grant or round 9's table allowlist ──────────────
-- Revoking a table-level privilege also drops the column-level grants derived from it, but the
-- round-9 column grants on eks_registrations/accounts were granted independently, so revoke
-- ALL PRIVILEGES (which in PostgreSQL covers column privileges on those tables too — verified on
-- postgres:17-alpine, see the round-10 test evidence in the PR).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM awsops_sql_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE awsops_admin IN SCHEMA public
  REVOKE SELECT ON TABLES FROM awsops_sql_reader;
-- Drops the explicit round-8/9 grant. Honest caveat: PostgreSQL grants USAGE on `public` to PUBLIC
-- by default, and this file does NOT revoke that (other roles depend on it) — so the role may still
-- resolve `public.x`. That does not matter: with no table or column privilege, every
-- `SELECT ... FROM public.<anything>` is "permission denied for table". The denial rests on the
-- absence of table privileges, not on schema USAGE.
REVOKE USAGE ON SCHEMA public FROM awsops_sql_reader;

-- ── The boundary: a schema of read-only views, one per thing the tool genuinely needs ─────────────
CREATE SCHEMA IF NOT EXISTS sql_reader;
-- No CREATE/USAGE on this schema for anyone but the owner (PostgreSQL's default for a new schema);
-- stated as a REVOKE so re-running against a schema someone widened converges back.
REVOKE ALL ON SCHEMA sql_reader FROM PUBLIC;
GRANT USAGE ON SCHEMA sql_reader TO awsops_sql_reader;

-- Views are named IDENTICALLY to their base tables so `search_path` makes an unqualified
-- `FROM worker_jobs` resolve here. Each is DROP+CREATE (not CREATE OR REPLACE) so a column-list
-- change re-runs cleanly; nothing depends on these views.
--
-- Derived from what the two consumers genuinely need — deliberately much SMALLER than round 9's
-- 38-table allowlist, because this is an Aurora *diagnostics* tool, not general data access:
--   * inventory-read connector (inventory_read_mcp.py): inventory_resources, inventory_sync_runs,
--     topology_nodes, topology_edges — the only tables it queries.
--   * rds-mcp `execute_sql`: "is the DB healthy, are jobs/diagnoses/compliance runs progressing,
--     is inventory fresh, what accounts/clusters are registered, what does AI cost".
--
-- COLUMNS EXCLUDED (capability- or arbitrary-content-bearing). Do not add these back:
--   worker_jobs.task_token        — Step Functions task token. A CAPABILITY, not data: the holder
--                                   can SendTaskSuccess/SendTaskFailure on a live execution. This is
--                                   the round-10 CRITICAL that killed the table allowlist.
--   worker_jobs.payload           — arbitrary job input; carries caller-supplied content.
--   worker_jobs.result            — arbitrary job output.
--   worker_jobs.error             — arbitrary error text (can echo payload contents).
--   worker_jobs.automation_execution_id, .plan_id
--                                 — SSM Automation / remediation-plan handles (ADR-005 FROZEN
--                                   surface); no diagnostic need.
--   eks_registrations.auth        — JSONB holding a plaintext k8s ServiceAccount bearer token. The
--                                   read APIs return `mode` only; this mirrors that at the DB level.
--   accounts.external_id          — documented as a confused-deputy guard rather than a secret, but
--                                   still an AssumeRole input.
--   inventory_sync_runs.error     — arbitrary AWS SDK error text; status + row_count answer "is the
--                                   sync healthy".
--   diagnosis_reports.summary, .error, .progress, .tags, .sources_used, .artifact_uri
--                                 — LLM output and free text; the metadata columns answer "did the
--                                   report run". (`error` count columns on compliance_runs are
--                                   INTEGERS — CIS status tallies — and are kept; the TEXT
--                                   `compliance_runs.error_message` is excluded.)
--
-- TABLES DELIBERATELY NOT EXPOSED AT ALL (were in round 9's allowlist):
--   integrations                  — the credential registry (credentials_ref / inbound_auth_ref /
--                                   private_connection_ref). Secrets Manager ARNs, not plaintext,
--                                   but no consumer needs it.
--   chat_threads / chat_messages / agentcore_memory
--                                 — cross-user conversation content (users do paste credentials
--                                   into chat).
--   agentcore_stats, ai_insights, ai_token_budget, cost_snapshots, inventory_snapshots,
--   alert_diagnosis, architecture_intent, event_scaling_plans, opencost_config, action_catalog,
--   action_plans, remediation_audit, customization_audit, report_schedules, prevention_*,
--   incident_* , datasource_*, agents, agent_spaces, agent_skills, skills
--                                 — each either carries a `payload`/`config`/`inputs` JSONB of
--                                   arbitrary content, or has no concrete diagnostic need. YAGNI:
--                                   add a view when a real query needs one.
DO $$
DECLARE
  v record;
BEGIN
  FOR v IN
    -- (base table in public, explicit column list). The column list is literal SQL from THIS file —
    -- never user input — so raw %s interpolation below is safe.
    SELECT * FROM (VALUES
      -- inventory / topology (the inventory-read connector's own queries)
      -- `data` (JSONB) is exposed ONLY as a NAMED-KEY PROJECTION. Listing the raw column would undo
      -- the inversion this migration is for: an explicit column list replaces a table allowlist so
      -- anything unnamed is absent — but a whole JSONB column is fail-open again one level down, at
      -- JSON-key granularity. sync_lambda.py stores raw provider payloads there, CloudFront origin
      -- CustomHeaders values (origin secrets) among them, and nothing stops a future provider field
      -- from landing in it.
      -- A previous revision simply dropped the column, which broke the inventory-read connector at
      -- runtime (find_unused_resources / query_inventory / get_topology all failed with
      -- "column data does not exist") — trading a leak for an outage (PR #197 review CRITICAL).
      -- The key list is the union of inventory_read_mcp.PROJECTIONS; a blocklist would be fail-open
      -- by construction, so it is an allowlist, and a new key is absent until named here.
      -- NOTE the TAGGED dollar quoting on these column lists (the tag matters): this column list contains SQL string literals, and inside a
      -- '…'-quoted literal their quotes TERMINATE it — the previous revision did exactly that and the
      -- migration would not have parsed at all (PR #197 review CRITICAL). Dollar-quoting removes the
      -- hazard rather than relying on doubling every quote correctly forever.
      -- The tag is not decoration: this VALUES list sits inside the enclosing DO block (line ~192),
      -- whose body is itself dollar-quoted with the UNTAGGED delimiter. An untagged inner delimiter
      -- therefore CLOSES that block and the file stops parsing — which is exactly what the first
      -- attempt at this fix did (codex stop-gate). Tagged delimiters nest; untagged ones do not.
      -- For the same reason this comment does not spell the untagged delimiter out: a dollar-quoted
      -- body is not comment-aware, so writing it here would end the block just as surely.
      -- `origins`: PR #197 round-1 removed it entirely (CloudFront origins carry
      -- CustomHeaders[].HeaderValue — an origin secret), which broke the "CloudFront (empty
      -- origin)" high-severity finding in detect_unused() and build_topology_chain(): both read
      -- ONLY origin.DomainName (grepped — no other field of an origin object is read anywhere in
      -- inventory_read_mcp.py) (PR #197 review MAJOR, 3 models). Neither "expose the whole array"
      -- nor "drop the key" was survivable, so this projects each origins[] element down to just
      -- DomainName — the one field actually consumed — which cannot carry CustomHeaders because
      -- nothing else survives the projection.
      ('inventory_resources',
       $cols$resource_type, account_id, region, resource_id, captured_at,
         (SELECT jsonb_object_agg(
            k,
            CASE WHEN k = 'origins' THEN (
              SELECT jsonb_agg(jsonb_build_object('DomainName', o -> 'DomainName'))
              FROM jsonb_array_elements(v) o
            ) ELSE v END
          ) FROM jsonb_each(data) AS e(k, v)
           WHERE k = ANY(ARRAY['target_group_arn','target_group_name','load_balancer_arns','target_health_descriptions','name','dns_name','arn','id','domain_name','enabled','origins','aliases','volume_id','state','size','volume_type'])) AS data$cols$),
      ('inventory_sync_runs',
       'resource_type, account_id, started_at, finished_at, status, row_count'),
      -- `meta` (JSONB) likewise projected, and the stakes are sharper here: flow-topology.ts copies
      -- the ENTIRE source row into meta.row, so exposing meta raw would re-expose every column this
      -- file excludes. `row` is therefore absent while the scalar hints flow-topology writes beside
      -- it are named. get_topology returns meta to the model, so dropping it outright degraded the
      -- topology tool; projecting keeps the diagnosis useful without the row copy.
      ('topology_nodes',
       $cols$account_id, id, kind, label, run_id, captured_at, class,
         (SELECT jsonb_object_agg(k, v) FROM jsonb_each(meta) AS e(k, v)
           WHERE k = ANY(ARRAY['invType','targetType','recordType','service','bucket','domain','unresolved','resolvedTarget','ecsService','task','cluster','groupLabel','members','aliases','port','health'])) AS meta$cols$),
      ('topology_edges',
       'id, account_id, source, target, rel, confidence, run_id, captured_at, class'),
      -- async job tier: metadata only (no task_token / payload / result / error)
      ('worker_jobs',
       'job_id, type, runtime, status, artifact_uri, dry_run, idempotency_key, attempt,
        sfn_execution_arn, created_at, updated_at'),
      -- "what schema is this cluster on" — the single most useful DB-diagnostic table
      ('schema_migrations',
       'version, applied_at, description'),
      -- diagnosis / compliance run bookkeeping (no LLM output, no free-text errors)
      ('diagnosis_reports',
       'id, worker_job_id, parent_report_id, tier, status, requested_by, model, title,
        created_at, updated_at, notified_at, deleted_at'),
      ('compliance_runs',
       'id, worker_job_id, benchmark, status, requested_by, pass_rate, total_controls,
        ok, alarm, info, skip, error, started_at, finished_at, created_at, updated_at, account'),
      ('compliance_results',
       'id, run_id, control_id, title, section, status, reason, resource, region, severity'),
      -- account / cluster scoping (minus external_id, minus auth)
      ('accounts',
       'account_id, alias, region, is_host, role_name, enabled, status, last_verified_at,
        created_at, all_regions'),
      ('account_regions',
       'account_id, region, enabled, created_at, updated_at'),
      ('eks_registrations',
       'cluster_name, registered_by, created_at'),
      -- AI spend (aggregate counters only)
      ('ai_usage_daily',
       'day, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, updated_at')
    ) AS t(tbl, cols)
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = v.tbl) THEN
      EXECUTE format('DROP VIEW IF EXISTS sql_reader.%I', v.tbl);
      EXECUTE format(
        'CREATE VIEW sql_reader.%I WITH (security_invoker = false) AS SELECT %s FROM public.%I',
        v.tbl, v.cols, v.tbl);
      EXECUTE format('GRANT SELECT ON sql_reader.%I TO awsops_sql_reader', v.tbl);
    ELSE
      RAISE NOTICE 'awsops_sql_reader: base table public.% not present — view skipped', v.tbl;
    END IF;
  END LOOP;
END $$;

-- Explicitly NOT granted: INSERT/UPDATE/DELETE/TRUNCATE anywhere, any privilege on any table in
-- `public`, any sequence, CREATE on any schema, any EXECUTE grant, membership in any predefined role
-- (pg_read_server_files, pg_write_server_files, pg_execute_server_program, pg_signal_backend,
-- rds_superuser, aws_lambda, aws_s3). NOINHERIT means even a future accidental group grant does not
-- take effect without an explicit SET ROLE. No ALTER DEFAULT PRIVILEGES anywhere — a future
-- migration's new table reaches this role only by someone adding a view above.

-- ── Best-effort belt-and-braces: revoke PUBLIC EXECUTE on the side-effect function classes ────────
-- Which of these actually need this, for a plain NOSUPERUSER role:
--   * ALREADY DENIED by PostgreSQL itself (EXECUTE revoked from PUBLIC out of the box; usable only
--     by superusers or members of a predefined role this role is not in):
--     pg_read_file, pg_read_binary_file, pg_stat_file, pg_ls_dir (+ pg_ls_*dir), server-side
--     lo_import/lo_export, pg_reload_conf, pg_rotate_logfile, pg_switch_wal, pg_stat_reset*,
--     pg_create_*_replication_slot / pg_drop_replication_slot (also NOREPLICATION here),
--     aws_lambda.invoke / aws_s3.query_export_to_s3 (extension functions are not PUBLIC-executable
--     and neither extension is installed on this cluster).
--   * PUBLIC-EXECUTABLE and therefore genuinely reachable — these are the ones worth revoking:
--     query_to_xml / query_to_xmlschema / table_to_xml* / schema_to_xml* / database_to_xml* /
--     cursor_to_xml (the round-7 vector: SQL-as-a-string), pg_cancel_backend / pg_terminate_backend
--     (PostgreSQL additionally limits these to backends owned by the SAME role unless the caller is
--     in pg_signal_backend — so this role could only ever signal its own sessions, never the web or
--     worker roles' — but revoking removes even that), lo_create / lo_put / lo_unlink /
--     lo_from_bytea (large-object writes; also blocked by the read-only transaction), pg_sleep*
--     (no data access, but a free connection-holding DoS), dblink* (only if the extension is ever
--     installed — it is not today).
-- On Amazon RDS/Aurora the pg_catalog functions are owned by `rdsadmin`, and the master user
-- (awsops_admin, a member of rds_superuser) is NOT a member of that role — so these REVOKEs may
-- fail with insufficient_privilege. That is tolerated per-function (NOTICE, not abort): they are
-- hardening on top of the boundary, not the boundary.
-- PR-review round 9 MAJOR — do NOT read these REVOKEs as a guarantee that PUBLIC EXECUTE is gone.
-- They are best-effort and may all be skipped. The boundary is the ROLE + the VIEW-ONLY grants:
-- NOSUPERUSER, no privilege on any base table, SELECT only on the explicit-column views above, no
-- predefined-role membership. That argument holds whether or not a single REVOKE lands:
-- `query_to_xml(...)` invoked BY this role executes its inner SQL AS this role, so it can only reach
-- what this role can already reach (the views), and `pg_cancel_backend` is limited by PostgreSQL to
-- backends owned by the same role, so it can only signal its own sessions — never web's or worker's.
-- Making the revoke failures fatal is deliberately NOT done: on Aurora that would likely make this
-- migration unrunnable. Instead the post-state is reported below so an operator can see the truth.
DO $$
DECLARE
  f record;
  still_public text[] := ARRAY[]::text[];
BEGIN
  FOR f IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('pg_catalog', 'public')
      AND (
        p.proname IN ('query_to_xml', 'query_to_xmlschema', 'query_to_xml_and_xmlschema',
                      'pg_cancel_backend', 'pg_terminate_backend',
                      'lo_create', 'lo_put', 'lo_unlink', 'lo_from_bytea',
                      'pg_sleep', 'pg_sleep_for', 'pg_sleep_until')
        OR p.proname LIKE 'table_to_xml%'
        OR p.proname LIKE 'schema_to_xml%'
        OR p.proname LIKE 'database_to_xml%'
        OR p.proname LIKE 'cursor_to_xml%'
        OR p.proname LIKE 'dblink%'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not revoke PUBLIC EXECUTE on % (%) — hardening skipped, boundary is the role itself', f.sig, SQLERRM;
    END;
    -- Report the ACTUAL post-state, so "no PUBLIC EXECUTE" is never assumed from a silent run.
    IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
      still_public := still_public || f.sig::text;
    END IF;
  END LOOP;
  IF array_length(still_public, 1) IS NULL THEN
    RAISE NOTICE 'awsops_sql_reader hardening: PUBLIC EXECUTE revoked on all targeted functions';
  ELSE
    RAISE NOTICE 'awsops_sql_reader hardening: % targeted function(s) STILL have PUBLIC EXECUTE (expected on RDS/Aurora — boundary is the role, not this revoke): %',
      array_length(still_public, 1), array_to_string(still_public, ', ');
  END IF;
END $$;
