"""AWSops v2 P2 — shared Aurora access (pg8000) + worker_jobs CRUD.

Env: AURORA_ENDPOINT, AURORA_DATABASE, AURORA_USER (default awsops_worker), AWS_REGION. Auth is RDS
IAM database auth (rds-db:connect on the caller's role) — a fresh SigV4-signed token is generated
per connect(), never cached, so a warm Lambda execution environment can never hold a stale
credential across the master secret's rotation cycle (mirrors web/lib/db.ts and steampipe.tf).
Transitions are CONDITIONAL: terminal states (succeeded/failed/canceled) are immutable, so an SFN
Catch cannot overwrite a worker's succeeded, and retries cannot resurrect a done job.
"""
import json
import os
import ssl
import boto3
import pg8000.native

_TERMINAL = ("succeeded", "failed", "canceled", "manual_intervention")  # widen the terminal set


def _auth_token():
    rds = boto3.client("rds", region_name=os.environ.get("AWS_REGION", "ap-northeast-2"))
    return rds.generate_db_auth_token(
        DBHostname=os.environ["AURORA_ENDPOINT"], Port=5432,
        DBUsername=os.environ.get("AURORA_USER", "awsops_worker"),
    )


def _ssl_ctx():
    # Match the web's pg ssl: rejectUnauthorized:false (no RDS CA bundling in dev). Prod: bundle RDS CA.
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def connect():
    return pg8000.native.Connection(
        user=os.environ.get("AURORA_USER", "awsops_worker"), password=_auth_token(),
        host=os.environ["AURORA_ENDPOINT"], database=os.environ["AURORA_DATABASE"],
        port=5432, ssl_context=_ssl_ctx(),
    )


def insert_job(conn, job_id, type_, payload, dry_run=False, idempotency_key=None, requested_by=None):
    """requested_by defaults to NULL (internal-only enqueue — reaper/generic dispatchers with no
    end-user principal; treated admin-only on read, see app/api/jobs/route.ts GET). Callers that
    enqueue on behalf of a specific user MUST pass their domain row's ownership key; for example,
    schedule_dispatcher.py passes report_schedules.user_sub (the immutable Cognito sub)."""
    conn.run(
        "INSERT INTO worker_jobs (job_id, type, payload, dry_run, idempotency_key, requested_by) "
        "VALUES (:id, :t, :p::jsonb, :d, :k, :rb)",
        id=job_id, t=type_, p=json.dumps(payload), d=dry_run, k=idempotency_key, rb=requested_by,
    )


def claim_running(conn, job_id, runtime):
    """queued|running -> running (idempotent re-claim). Returns rows affected (0 = already terminal)."""
    rows = conn.run(
        "UPDATE worker_jobs SET status='running', runtime=:r, attempt=attempt+1 "
        "WHERE job_id=:id AND status NOT IN ('succeeded','failed','canceled') RETURNING job_id",
        id=job_id, r=runtime,
    )
    return len(rows)


def finish_job(conn, job_id, status, result=None, artifact_uri=None, error=None):
    """Set a TERMINAL status only if not already terminal (immutable). Returns rows affected."""
    assert status in _TERMINAL
    rows = conn.run(
        "UPDATE worker_jobs SET status=:s, result=:res::jsonb, artifact_uri=:a, error=:e "
        "WHERE job_id=:id AND status NOT IN ('succeeded','failed','canceled') RETURNING job_id",
        s=status, res=(json.dumps(result) if result is not None else None),
        a=artifact_uri, e=error, id=job_id,
    )
    return len(rows)


# Single source of truth for get_job's SELECT + dict keys (avoids positional-zip drift).
_JOB_COLS = ["job_id", "type", "status", "payload", "result", "artifact_uri", "error", "dry_run"]


def get_job(conn, job_id):
    rows = conn.run(f"SELECT {','.join(_JOB_COLS)} FROM worker_jobs WHERE job_id=:id", id=job_id)
    return dict(zip(_JOB_COLS, rows[0])) if rows else None


def set_manual_intervention(conn, job_id, error):
    rows = conn.run(
        "UPDATE worker_jobs SET status='manual_intervention', error=:e "
        "WHERE job_id=:id AND status NOT IN ('succeeded','failed','canceled','manual_intervention') RETURNING job_id",
        e=error, id=job_id)
    return len(rows)


# ── ai_insights (AI Insights dashboard cache) ────────────────────────────────────────────────────
_INSIGHT_COLS = ["status", "insights", "sources_used", "model", "error", "generated_at"]


def insert_insight(conn, status, insights, sources_used, model=None, error=None):
    """Append one insight row. jsonb fields bound + cast (never inlined)."""
    conn.run(
        "INSERT INTO ai_insights (account_id, status, insights, sources_used, model, error) "
        "VALUES ('self', :st, :ins::jsonb, :src::jsonb, :md, :err)",
        st=status, ins=json.dumps(insights or []), src=json.dumps(sources_used or {}),
        md=model, err=error,
    )


# ── datasource_diag_signals (pre-built Prometheus/Mimir diagnostic signals) ──────────────────────
_DDS_COLS = ["signal_key", "title", "status", "query", "missing_metrics", "meta"]


def _maybe_json(v):
    """pg8000 may return jsonb as a parsed object OR a string depending on type adaptation — normalize."""
    if isinstance(v, str):
        try:
            return json.loads(v)
        except (ValueError, TypeError):
            return v
    return v


def upsert_diag_signals(conn, integration_id, rows, schema_version):
    """Idempotent upsert of built signal rows for one instance. jsonb fields are bound + cast (never
    inlined). Caller sweeps stale keys via sweep_diag_signals. No-op on empty rows."""
    for r in rows or []:
        conn.run(
            "INSERT INTO datasource_diag_signals "
            "(account_id, integration_id, signal_key, title, status, query, missing_metrics, meta, schema_version, built_at) "
            "VALUES ('self', :iid, :sk, :ti, :st, :q::jsonb, :mm::jsonb, :me::jsonb, :sv, now()) "
            "ON CONFLICT (account_id, integration_id, signal_key) DO UPDATE SET "
            "title=EXCLUDED.title, status=EXCLUDED.status, query=EXCLUDED.query, "
            "missing_metrics=EXCLUDED.missing_metrics, meta=EXCLUDED.meta, "
            "schema_version=EXCLUDED.schema_version, built_at=now()",
            iid=integration_id, sk=r["signal_key"], ti=r["title"], st=r["status"],
            q=(json.dumps(r["query"]) if r.get("query") is not None else None),
            mm=(json.dumps(r["missing_metrics"]) if r.get("missing_metrics") is not None else None),
            me=json.dumps(r.get("meta") or {}), sv=schema_version,
        )


def read_signal_schema_version(conn, integration_id):
    """Return a stable schema_version only when all existing rows agree.

    Mixed versions can happen after a historical partial rebuild; treating one arbitrary row as current
    would make datasource_index skip forever with stale/missing signals.
    """
    rows = conn.run(
        "SELECT COUNT(DISTINCT schema_version), MIN(schema_version) "
        "FROM datasource_diag_signals "
        "WHERE account_id='self' AND integration_id=:iid",
        iid=integration_id)
    if not rows:
        return None
    distinct, version = rows[0]
    return version if distinct == 1 and version else None


def list_diag_signals(conn, integration_id):
    """All signal rows for one instance (ready + unavailable), jsonb fields parsed."""
    rows = conn.run(
        f"SELECT {','.join(_DDS_COLS)} FROM datasource_diag_signals "
        "WHERE account_id='self' AND integration_id=:iid ORDER BY signal_key",
        iid=integration_id)
    out = []
    for row in rows:
        d = dict(zip(_DDS_COLS, row))
        d["query"] = _maybe_json(d["query"])
        d["missing_metrics"] = _maybe_json(d["missing_metrics"])
        d["meta"] = _maybe_json(d["meta"])
        out.append(d)
    return out


def sweep_diag_signals(conn, integration_id, keep_keys):
    """Delete this instance's signal rows whose key is NOT in keep_keys (mark-sweep after a rebuild).
    Empty keep_keys → delete all rows for the instance."""
    conn.run(
        "DELETE FROM datasource_diag_signals "
        "WHERE account_id='self' AND integration_id=:iid AND signal_key <> ALL(:keep)",
        iid=integration_id, keep=list(keep_keys or []))


# ── datasource_graph_queries (pre-built topology-graph queries) ─────────────────────────────────
# Mirrors the datasource_diag_signals helpers above exactly, one table over — see graph_catalog.py.


def upsert_graph_queries(conn, integration_id, rows, schema_version):
    """Idempotent upsert of built graph-query rows for one instance. jsonb fields are bound + cast
    (never inlined). Caller sweeps stale keys via sweep_graph_queries. No-op on empty rows."""
    for r in rows or []:
        conn.run(
            "INSERT INTO datasource_graph_queries "
            "(account_id, integration_id, query_key, status, query, missing, meta, schema_version, built_at) "
            "VALUES ('self', :iid, :qk, :st, :q::jsonb, :mi::jsonb, :me::jsonb, :sv, now()) "
            "ON CONFLICT (account_id, integration_id, query_key) DO UPDATE SET "
            "status=EXCLUDED.status, query=EXCLUDED.query, missing=EXCLUDED.missing, "
            "meta=EXCLUDED.meta, schema_version=EXCLUDED.schema_version, built_at=now()",
            iid=integration_id, qk=r["query_key"], st=r["status"],
            q=(json.dumps(r["query"]) if r.get("query") is not None else None),
            mi=(json.dumps(r["missing"]) if r.get("missing") is not None else None),
            me=json.dumps(r.get("meta") or {}), sv=schema_version,
        )


def read_graph_schema_version(conn, integration_id):
    """Return a stable schema_version only when all existing graph-query rows agree (mirrors
    read_signal_schema_version — see its docstring for why mixed versions must not short-circuit)."""
    rows = conn.run(
        "SELECT COUNT(DISTINCT schema_version), MIN(schema_version) "
        "FROM datasource_graph_queries "
        "WHERE account_id='self' AND integration_id=:iid",
        iid=integration_id)
    if not rows:
        return None
    distinct, version = rows[0]
    return version if distinct == 1 and version else None


def sweep_graph_queries(conn, integration_id, keep_keys):
    """Delete this instance's graph-query rows whose key is NOT in keep_keys (mark-sweep after a
    rebuild). Empty keep_keys → delete all rows for the instance."""
    conn.run(
        "DELETE FROM datasource_graph_queries "
        "WHERE account_id='self' AND integration_id=:iid AND query_key <> ALL(:keep)",
        iid=integration_id, keep=list(keep_keys or []))


_MAX_SCHEMA_BYTES = 256_000  # mirrors web/lib/datasource-schema.ts's MAX_SCHEMA_BYTES — same table/cap


def upsert_datasource_schema(conn, account_id, integration_id, kind, schema):
    """Write-back of a freshly re-introspected schema (drift refresh, datasource_index.py only —
    the BFF's normal warm/refresh path uses upsertSchema in web/lib/datasource-schema.ts; this is the
    python-worker-side mirror, same table). jsonb bound + cast, never inlined. Raises (caller falls
    back to the cached schema — see run()'s `fresh is not None` write-back path) when the introspected
    schema exceeds the same size cap the BFF enforces, so an oversized live schema never gets cached."""
    payload = json.dumps(schema)
    if len(payload.encode("utf-8")) > _MAX_SCHEMA_BYTES:
        raise ValueError("introspected schema exceeds size limit")
    conn.run(
        "INSERT INTO datasource_schemas (account_id, integration_id, kind, schema, fetched_at) "
        "VALUES (:acct, :iid, :k, :s::jsonb, now()) "
        "ON CONFLICT (account_id, integration_id) DO UPDATE SET "
        "kind=EXCLUDED.kind, schema=EXCLUDED.schema, fetched_at=now()",
        acct=account_id, iid=integration_id, k=kind, s=payload,
    )
