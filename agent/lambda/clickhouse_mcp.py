"""
ClickHouse read-only MCP Lambda — query a user-registered ClickHouse datasource (SQL) for incident
triage. First of the v1 datasource family; uses the shared datasource_http helper (credential load,
SSRF host guard, auth, no-redirect HTTP).

READ-ONLY is enforced on TWO layers:
  1. _assert_read_only(sql): strip comments + string literals, reject stacked statements, require a
     read verb (SELECT/WITH/SHOW/DESCRIBE/DESC/EXISTS), reject DML/DDL/admin verbs, and — critically —
     reject ClickHouse TABLE FUNCTIONS (url/file/remote/s3/mysql/postgresql/jdbc/odbc/mongodb/...),
     which are a syntactically-read-only server-side SSRF / cross-datastore exfil vector that
     `readonly=1` does NOT stop.
  2. readonly=1 + max_result_rows on the ClickHouse HTTP request (server-side backstop).
Stdlib + boto3 only.
"""
import json
import re

from cross_account import resolve_tool_name
from datasource_http import (
    NotConnected,
    SsrfBlocked,
    assert_host_allowed,
    auth_headers,
    health,
    http_json,
    load_datasource,
    set_request_conn,
)
from sql_readonly_guard import assert_read_only as _shared_assert_read_only

SLUG = "clickhouse"
DEFAULT_MAX_ROWS = 100
MAX_ROWS_CAP = 1000

# ClickHouse table functions = server-side SSRF / cross-datastore reads / script exec (readonly=1 does
# NOT block them). Suffix-tolerant `\w*` so siblings like urlCluster/s3Cluster/remoteSecure/executablePool/
# clusterAllReplicas/hdfsCluster are ALSO blocked (a name-anchored `\s*\(` would let urlCluster( through).
# This is ClickHouse-specific (not shared with aws_rds_mcp.py's Postgres/MySQL guard) — RDS Data API
# has no equivalent table-function SSRF surface.
_TABLE_FN = re.compile(
    r"\b(url|file|remote|hdfs|s3|gcs|iceberg|hudi|deltaLake|azureBlobStorage|mongodb|mysql|postgresql|"
    r"redis|sqlite|jdbc|odbc|input|cluster|executable)\w*\s*\(",
    re.IGNORECASE,
)
_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")  # db.table or table


def _validate_identifier(name):
    """Defense-in-depth for the describe table arg: a bare `table` or `db.table` only."""
    if not _IDENTIFIER.match(name or ""):
        raise ValueError("invalid table identifier (expected table or db.table)")


def _assert_read_only(sql):
    # SYSTEM blocked for ALL user queries — the admin command AND every system.* read. system.tables/.*
    # expose create_table_query/engine_full (plaintext creds for MySQL/Kafka/S3 engine tables) and
    # users/grants/query_log, so the general clickhouse_query tool must never reach system.*. Cross-DB
    # schema introspection reads system.tables via _run_sql(trusted=True), which bypasses this guard.
    # (SYSTEM is in the shared DANGER regex; layered here on top with the ClickHouse-only _TABLE_FN.)
    # nested_block_comment=False (explicit, matches the shared default): ClickHouse block comments
    # do NOT nest — they terminate at the FIRST `*/`, like MySQL. PR-review round 6: an earlier
    # version of the shared guard defaulted to Postgres-style nesting unconditionally, which let a
    # single crafted comment swallow real SQL (incl. a _TABLE_FN call) between two adjacent-looking
    # comments; see sql_readonly_guard.py's module docstring for the traced PoC.
    _shared_assert_read_only(
        sql,
        extra_forbidden_re=_TABLE_FN,
        extra_message="read-only: table functions (url/file/remote/s3/mysql/...) are not allowed",
        nested_block_comment=False,
    )


def _clamp_rows(v):
    try:
        n = int(v)
    except (TypeError, ValueError):
        return DEFAULT_MAX_ROWS
    return max(1, min(MAX_ROWS_CAP, n))


def _run_sql(sql, max_rows, trusted=False):
    # user-supplied SQL MUST pass the read-only guard. `trusted=True` is ONLY for the connector's own
    # hardcoded introspection SQL (e.g. SELECT database,name FROM system.tables) — never user input —
    # so the shared guard can keep blocking ALL system.* for the general clickhouse_query tool.
    if not trusted:
        _assert_read_only(sql)
    ds = load_datasource(SLUG)
    assert_host_allowed(ds["endpoint"])
    base = ds["endpoint"].rstrip("/")
    url = f"{base}/?readonly=1&max_result_rows={max_rows}&default_format=JSON"
    headers = dict(auth_headers(ds))
    headers["Content-Type"] = "text/plain; charset=utf-8"
    body = f"{sql}\nFORMAT JSON"
    status, data = http_json("POST", url, headers=headers, body=body)
    if status >= 400:
        snippet = data.get("raw") or data.get("exception") or data
        return err(f"ClickHouse query failed ({status}): {str(snippet)[:300]}")
    rows = data.get("data", []) if isinstance(data, dict) else []
    return ok({"rowCount": len(rows[:max_rows]), "rows": rows[:max_rows],
               "meta": data.get("meta") if isinstance(data, dict) else None})


def clickhouse_query(args):
    sql = (args.get("sql") or "").strip()
    if not sql:
        return err("sql required")
    return _run_sql(sql, _clamp_rows(args.get("max_rows")))


def clickhouse_tables(args):
    return _run_sql("SHOW TABLES", _clamp_rows(args.get("max_rows")))


def clickhouse_describe(args):
    table = (args.get("table") or "").strip()
    if not table:
        return err("table required")
    _validate_identifier(table)  # defense-in-depth (the read-only guard also catches stacked stmts)
    return _run_sql(f"DESCRIBE TABLE {table}", _clamp_rows(args.get("max_rows")))


MAX_SCHEMA_TABLES = 100
MAX_SCHEMA_COLS = 200


def clickhouse_schema(args):
    version = None
    try:  # best-effort server version for version-aware SQL (dialect differs across ClickHouse releases)
        vr = _run_sql("SELECT version() AS v", 1)
        if vr["statusCode"] == 200:
            vrows = json.loads(vr["body"]).get("rows", [])
            if vrows and isinstance(vrows[0], dict) and vrows[0]:
                version = list(vrows[0].values())[0]
    except Exception:  # noqa: BLE001 — version is best-effort, never fail the schema fetch
        version = None
    # Enumerate user tables across ALL non-system databases. `SHOW TABLES` only lists the CURRENT database
    # (usually `default`, which is often empty); real data frequently lives in a named DB (e.g. `otel`), so
    # default-only introspection returned 0 tables and the model never saw the schema. system.tables gives
    # (database, name) for every DB; we DESCRIBE each as `db.table` so the model gets fully-qualified names.
    names: list[str] = []
    st = _run_sql(
        # ONLY database+name — never create_table_query/engine_full/as_select (those can carry plaintext
        # engine credentials). trusted=True: connector-internal hardcoded SQL, bypasses the user guard
        # that (correctly) blocks all system.* for the general clickhouse_query tool.
        "SELECT database, name FROM system.tables "
        "WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema') "
        "ORDER BY database, name",
        MAX_SCHEMA_TABLES,
        trusted=True,
    )
    if st["statusCode"] == 200:
        for r in json.loads(st["body"]).get("rows", []):
            if isinstance(r, dict) and r.get("database") and r.get("name"):
                names.append(f"{r['database']}.{r['name']}")
    else:
        # Fallback to current-database SHOW TABLES if system.tables is unavailable (e.g. restricted grants).
        tbls = _run_sql("SHOW TABLES", MAX_SCHEMA_TABLES)
        if tbls["statusCode"] != 200:
            return tbls
        names = [list(r.values())[0] for r in json.loads(tbls["body"]).get("rows", []) if isinstance(r, dict) and r]
    names = names[:MAX_SCHEMA_TABLES]
    tables = []
    for n in names:
        if not _IDENTIFIER.match(str(n)):  # `db.table` or `table` only (defense-in-depth)
            continue
        d = _run_sql(f"DESCRIBE TABLE {n}", MAX_SCHEMA_COLS)
        if d["statusCode"] != 200:
            continue
        cols = json.loads(d["body"]).get("rows", [])[:MAX_SCHEMA_COLS]
        tables.append({"name": n, "columns": [{"name": c.get("name"), "type": c.get("type")} for c in cols if isinstance(c, dict)]})
    return ok({"version": version, "tables": tables, "truncated": len(names) >= MAX_SCHEMA_TABLES})


def clickhouse_health(args):
    """Connectivity probe for the pre-save Test / status badge: GET /ping."""
    return ok(health(load_datasource(SLUG), "/ping"))


_TOOLS = {
    "clickhouse_query": clickhouse_query,
    "clickhouse_tables": clickhouse_tables,
    "clickhouse_describe": clickhouse_describe, "clickhouse_schema": clickhouse_schema,
    "clickhouse_health": clickhouse_health,
}


def lambda_handler(event, context):
    params = event if isinstance(event, dict) else json.loads(event)
    t = resolve_tool_name(params, context)
    args = params.get("arguments", params)
    inst = args.get("instance_id") if isinstance(args, dict) else None
    conn = params.get("conn_config")
    if isinstance(args, dict):
        args.pop("target_account_id", None)  # ClickHouse is account-agnostic (HTTP endpoint)
        args.pop("instance_id", None)        # routing arg, not a tool arg
    try:
        # BFF inline conn (trusted) > per-instance secret (credential-blind worker) > kind-mirror default.
        if conn:
            set_request_conn(conn)
        elif inst is not None:
            set_request_conn(load_datasource(SLUG, instance_id=inst))
        else:
            set_request_conn(None)
        fn = _TOOLS.get(t)
        if fn is None:
            return err(f"unknown tool: {t}")
        return fn(args)
    except (ValueError, NotConnected, SsrfBlocked) as e:
        return err(str(e))
    except Exception as e:  # noqa: BLE001 — never leak a stack trace (or credentials) to the gateway
        return err(f"clickhouse error: {e}")
    finally:
        set_request_conn(None)  # guaranteed reset — no warm-container bleed


def ok(body):
    return {"statusCode": 200, "body": json.dumps(body, default=str)}


def err(msg):
    return {"statusCode": 400, "body": json.dumps({"error": msg})}
