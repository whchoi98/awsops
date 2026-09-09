"""
AWS RDS MCP Lambda - MySQL/PostgreSQL instance management, queries via RDS Data API
AWS RDS MCP 람다 - MySQL/PostgreSQL 인스턴스 관리, RDS Data API를 통한 쿼리
"""
import json
import logging
import os
from cross_account import get_client, get_role_arn, resolve_tool_name
from sql_readonly_guard import assert_read_only

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    # Parse event and route to appropriate tool handler / 이벤트 파싱 후 적절한 도구 핸들러로 라우팅
    params = event if isinstance(event, dict) else json.loads(event)
    t = resolve_tool_name(params, context)
    args = params.get("arguments", params)
    target_account_id = args.pop('target_account_id', None)
    role_arn = get_role_arn(target_account_id) if target_account_id else None
    region = args.get("region", "ap-northeast-2")

    # Auto-detect tool from parameters if not specified / tool_name 미지정 시 파라미터로 도구 자동 감지
    if not t:
        if "sql" in params and "resource_arn" in params: t = "execute_sql"
        elif "db_instance_identifier" in params: t = "describe_db_instance"
        elif "db_cluster_identifier" in params: t = "describe_db_cluster"
        else: t = "list_db_instances"
        args = params

    # PR #197 review MAJOR (L2, 2 models): this check must come BEFORE the RDS client is built.
    # get_client() assumes the target role eagerly, so for a genuinely foreign target_account_id whose
    # role is missing or does not trust us, the AssumeRole raised on the first line of the try below
    # and surfaced as a raw 500 — the execute_sql branch's own cross-account guard never ran. The PR's
    # stated goal ("say so instead of attempting a doomed call") was defeated on the error path, and
    # the unit tests hid it because a mocked get_client never assumes anything.
    if t == "execute_sql" and role_arn:
        return err("read-only: cross-account execute_sql is unsupported — the Data API "
                   "credential is the host account's least-privilege reader role "
                   "(awsops_sql_reader); host-account PostgreSQL only")

    try:
        rds = get_client('rds', region, role_arn)

        # List all RDS instances with basic info / 모든 RDS 인스턴스 기본 정보 조회
        if t == "list_db_instances":
            # Describe all DB instances / 모든 DB 인스턴스 조회
            instances = rds.describe_db_instances().get("DBInstances", [])
            return ok({"instances": [{"id": i["DBInstanceIdentifier"], "engine": i["Engine"],
                "version": i.get("EngineVersion"), "class": i["DBInstanceClass"],
                "status": i["DBInstanceStatus"], "az": i.get("AvailabilityZone"),
                "multiAZ": i.get("MultiAZ"), "storage": i.get("AllocatedStorage"),
                "endpoint": i.get("Endpoint", {}).get("Address", "")}
                for i in instances[:20]]})

        # List all Aurora DB clusters / 모든 Aurora DB 클러스터 조회
        elif t == "list_db_clusters":
            clusters = rds.describe_db_clusters().get("DBClusters", [])
            return ok({"clusters": [{"id": c["DBClusterIdentifier"], "engine": c["Engine"],
                "version": c.get("EngineVersion"), "status": c["Status"],
                "members": len(c.get("DBClusterMembers", [])),
                "endpoint": c.get("Endpoint", ""), "readerEndpoint": c.get("ReaderEndpoint", "")}
                for c in clusters[:20]]})

        # Get detailed DB instance info / DB 인스턴스 상세 정보 조회
        elif t == "describe_db_instance":
            # Fetch instance details including networking and encryption / 네트워킹·암호화 포함 인스턴스 상세 조회
            i = rds.describe_db_instances(DBInstanceIdentifier=args["db_instance_identifier"])["DBInstances"][0]
            return ok({"id": i["DBInstanceIdentifier"], "engine": i["Engine"], "version": i.get("EngineVersion"),
                "class": i["DBInstanceClass"], "status": i["DBInstanceStatus"],
                "az": i.get("AvailabilityZone"), "multiAZ": i.get("MultiAZ"),
                "storage": i.get("AllocatedStorage"), "storageType": i.get("StorageType"),
                "encrypted": i.get("StorageEncrypted"), "vpcId": i.get("DBSubnetGroup", {}).get("VpcId"),
                "endpoint": i.get("Endpoint", {}).get("Address", ""),
                "port": i.get("Endpoint", {}).get("Port"),
                "securityGroups": [sg["VpcSecurityGroupId"] for sg in i.get("VpcSecurityGroups", [])],
                "parameterGroup": i.get("DBParameterGroups", [{}])[0].get("DBParameterGroupName", ""),
                "backupRetention": i.get("BackupRetentionPeriod"),
                "publiclyAccessible": i.get("PubliclyAccessible")})

        # Get detailed Aurora cluster info / Aurora 클러스터 상세 정보 조회
        elif t == "describe_db_cluster":
            c = rds.describe_db_clusters(DBClusterIdentifier=args["db_cluster_identifier"])["DBClusters"][0]
            return ok({"id": c["DBClusterIdentifier"], "engine": c["Engine"], "version": c.get("EngineVersion"),
                "status": c["Status"], "endpoint": c.get("Endpoint"), "readerEndpoint": c.get("ReaderEndpoint"),
                "port": c.get("Port"), "encrypted": c.get("StorageEncrypted"),
                "members": [{"id": m["DBInstanceIdentifier"], "writer": m.get("IsClusterWriter")}
                    for m in c.get("DBClusterMembers", [])],
                "backupRetention": c.get("BackupRetentionPeriod"),
                "deletionProtection": c.get("DeletionProtection")})

        # Execute read-only SQL via RDS Data API / RDS Data API를 통한 읽기 전용 SQL 실행
        elif t == "execute_sql":
            # PR-review round 9 MAJOR: fail closed on a genuine cross-account target. The Data API
            # credential is now the HOST account's least-privilege reader secret
            # (AURORA_SQL_READER_SECRET_ARN) and the caller-supplied secret_arn is ignored — so
            # pointing this at another account's cluster would send host credentials to a foreign
            # engine and fail anyway. Say so instead of attempting a doomed call. `role_arn` is
            # already None when target_account_id is absent OR equals the host account
            # (cross_account.get_role_arn) — so a truthy role_arn means a genuinely different
            # account. The other rds-mcp tools keep their cross-account path unchanged.
            if role_arn:
                # Defence-in-depth. The authoritative check is at the top of lambda_handler, before
                # the RDS client (and therefore before AssumeRole) — see the comment there. Keeping
                # this one means a future refactor that moves the eager client cannot silently
                # reopen the cross-account path.
                return err("read-only: cross-account execute_sql is unsupported — the Data API "
                           "credential is the host account's least-privilege reader role "
                           "(awsops_sql_reader); host-account PostgreSQL only")
            rds_data = get_client('rds-data', region, role_arn)
            # pentest-remediation P2-4: the old guard was `kw in sql.lower().split()` — whitespace-only
            # tokenization, so a keyword not surrounded by spaces (e.g. DROP/*x*/TABLE) never produced
            # the bare token "drop" and sailed through. Also missing UPDATE was covered but GRANT/
            # REVOKE/SET/CALL/COPY/MERGE were not, and there was no stacked-statement or first-token
            # read-verb check. Shares the same comment/string-stripping guard clickhouse_mcp.py uses.
            # PR-review round 2: this tool is registered for BOTH MySQL and PostgreSQL targets, but
            # was always passing Postgres dialect flags (hash_comment=False, backslash_escapes=
            # False) — on a real MySQL target (which DOES backslash-escape by default) that mis-
            # scans a string literal and can hide a mutating construct (e.g. `INTO OUTFILE`) past
            # the closing quote. Determine engine from the cluster itself (same `rds` client this
            # Lambda already uses for list_db_clusters) rather than trusting a caller-supplied flag.
            # Data API only targets Aurora clusters, so resource_arn is a cluster ARN/id either way.
            sql = args["sql"].strip()
            # PR-review round 8 (STRUCTURAL FIX for the bypass class rounds 3-7 kept re-finding):
            # this tool used to run under the Aurora MASTER secret — a superuser-equivalent role —
            # with the lexical guard + `SET TRANSACTION READ ONLY` as the only barriers. Neither is
            # a real boundary: the guard strips string literals before matching, so any core function
            # that takes SQL as a *string argument* (`query_to_xml('...pg_cancel_backend...')`,
            # `aws_lambda.invoke`, `aws_s3.query_export_to_s3`) is invisible to it, and a READ ONLY
            # transaction only blocks data WRITES — control-plane/side-effect calls sail through it.
            # That set is unbounded; a denylist cannot enumerate it. So the boundary is now the
            # DATABASE: this path authenticates as the dedicated `awsops_sql_reader` Postgres role
            # (NOSUPERUSER, `default_transaction_read_only=on`, SELECT on redacted VIEWS ONLY and no
            # privilege at all on any base table — round 10 replaced the round-9 table allowlist,
            # which had leaked `worker_jobs.task_token`) whose
            # credentials live in their own secret — see the ULID `agent_sql_reader_role` migration.
            # The caller-supplied `secret_arn` is deliberately IGNORED (and removed from the tool
            # schema): credential choice is server-side config, never a model-controlled argument.
            # The Lambda role no longer has GetSecretValue on the master secret at all, so a lexical
            # bypass now lands in an unprivileged session instead of a superuser one.
            secret_arn = os.environ.get("AURORA_SQL_READER_SECRET_ARN", "").strip()
            if not secret_arn:
                return err("read-only: no dedicated low-privilege DB credential is configured "
                           "(AURORA_SQL_READER_SECRET_ARN unset) — refusing to execute")
            # PR-review round 10 MAJOR: the reader secret belongs to ONE cluster (the host's own
            # foundation Aurora). Pointed at any OTHER cluster — same account, so round 9's
            # cross-account fail-closed above does not catch it — begin_transaction would raise
            # BadRequestException from inside the un-try'd Data API block and surface as an
            # unhandled 500 + stack trace instead of a tool error the model can act on. Compare
            # against the foundation cluster ARN (AURORA_CLUSTER_ARN, injected by ai.tf alongside
            # the secret) and refuse cleanly. Fail closed when the env var is missing: without it
            # there is nothing to validate against.
            cluster_arn = os.environ.get("AURORA_CLUSTER_ARN", "").strip()
            if not cluster_arn:
                return err("read-only: the foundation cluster ARN is not configured "
                           "(AURORA_CLUSTER_ARN unset) — refusing to execute")
            # Database selection is server-side configuration too: ai.tf injects the foundation
            # cluster's database_name (awsops), matching inventory_read_mcp.py. Never let a model
            # redirect the least-privilege credential to a caller-selected database.
            database = os.environ.get("AURORA_DATABASE", "").strip()
            if not database:
                return err("read-only: the foundation database is not configured "
                           "(AURORA_DATABASE unset or empty) — refusing to execute")
            if not _is_foundation_cluster(args["resource_arn"], cluster_arn):
                return err("read-only: execute_sql only supports the host's own foundation Aurora "
                           f"cluster ({cluster_arn.rsplit(':', 1)[-1]}) — the Data API credential is "
                           "that cluster's least-privilege reader role (awsops_sql_reader) and is not "
                           "valid anywhere else. Use the describe_* tools for other clusters.")
            # PR #197 review MAJOR (L2/L4, 2 models): the guard above deliberately accepts the bare
            # cluster identifier as well as the full ARN — but the RDS Data API requires the FULL
            # ARN, so passing the caller's spelling straight through made begin_transaction throw
            # BadRequestException, which left this tool as an unhandled 500: exactly the "clean tool
            # error, not a 500" property the earlier round was added to establish. And it is the
            # NORMAL path, not an edge case — list_db_clusters/describe_db_cluster expose cluster
            # IDENTIFIERS only, never ARNs, so an identifier is what the model has to hand.
            # Both accepted spellings designate this one cluster, so canonicalize to the env ARN and
            # use it for every downstream call. (The mock-based test passed because the mock accepted
            # the identifier; the test now asserts the canonical ARN actually reached the Data API.)
            resource_arn = cluster_arn
            try:
                engine = _engine_family(rds, resource_arn)
            except Exception as e:
                # Logged (not silently swallowed) — this can be a real AccessDenied on
                # DescribeDBClusters, not just an unrecognized dialect string, and the fail-closed
                # 400 below reads identically to a dialect-detection miss unless this is visible.
                logger.warning("execute_sql: engine lookup failed for %s: %s", resource_arn, e)
                engine = None
            if engine is None:
                logger.warning("execute_sql: could not determine engine family for %s — failing closed",
                                resource_arn)
            # Fail closed: the Postgres and MySQL dialect flags are each unsafe for the OTHER
            # engine (backslash_escapes=True hides real Postgres SQL as "still inside a string";
            # =False hides a MySQL backslash-escaped quote past `INTO OUTFILE`) — there is no
            # single "stricter" combo that's safe for both, so an unresolved engine means the
            # query is rejected outright rather than executed under a guessed dialect.
            # PR-review round 3: MySQL's `--` comment additionally requires a trailing whitespace/
            # control char (or EOF) — `--1` is subtraction, not a comment, in MySQL. Postgres has
            # no such requirement, so its path keeps dash_comment_needs_boundary=False (default).
            # PR-review round 5 MAJOR: `$tag$` dollar-quoting is Postgres-only syntax — MySQL treats
            # `$` as a plain identifier char, so `SELECT 1 AS $x$ INTO OUTFILE ...` isn't a heredoc
            # there; scanning for one anyway swallowed the real `INTO OUTFILE` as "still in string".
            # PR-review round 6 (MAJOR, MAJOR-preferred-fix): this tool runs under the Aurora MASTER
            # secret with no dedicated low-privilege MySQL credential, and MySQL has no DB-level
            # read-only backstop (unlike Postgres's `SET TRANSACTION READ ONLY` below) — rounds 3-6
            # kept finding new MySQL-only lexical bypasses (comment/escape desync, `--` boundary,
            # `$` dollar-quote, block-comment nesting) because the lexical guard alone can never fully
            # enumerate that class. Rather than keep patching individual MySQL edge cases, fail closed
            # for MySQL entirely — a third fail-closed case alongside "engine lookup failed" and
            # "unrecognized engine string" above — until a dedicated low-priv MySQL user/secret exists.
            if engine == "mysql":
                return err("read-only: execute_sql is not supported for MySQL/MariaDB targets "
                           "(no dedicated low-privilege credential exists yet) — refusing to execute")
            elif engine == "postgres":
                # nested_block_comment=True: Postgres block comments genuinely nest by spec, and this
                # dialect ALSO gets the DB-level READ ONLY transaction backstop below — see round-6
                # module docstring note in sql_readonly_guard.py for why nesting is unsafe elsewhere.
                dialect = {"hash_comment": False, "backslash_escapes": False,
                           "nested_block_comment": True}
            else:
                return err("read-only: could not determine target DB engine — refusing to execute")
            try:
                assert_read_only(sql, **dialect)
            except ValueError as e:
                return err(str(e))

            # PR-review round 3 CRITICAL: this tool reaches the app's own Aurora cluster with MASTER
            # credentials (rds-data:ExecuteStatement + GetSecretValue on the master secret), so the
            # lexical guard above is the ONLY thing standing between a clever bypass and a real write
            # — and three rounds of finding-and-patching individual bypasses (comment/escape desync,
            # INTO, dangerous functions, ...) prove a denylist can never fully enumerate that class
            # (arbitrary present/future string-returning functions that mutate data). So on Postgres
            # (the only engine reaching this point — MySQL fails closed above), every execute_sql call
            # is ALSO wrapped in a DB-level READ ONLY transaction: even a query that evades the regex
            # entirely is rejected by the engine itself, not by pattern-matching its text. Never commit
            # either way — this tool is read-only by contract, so there's nothing to persist — and
            # always rollback in `finally` so the transaction never lingers on an error path.
            txn_args = dict(resourceArn=resource_arn, secretArn=secret_arn,
                             database=database)
            transaction_id = rds_data.begin_transaction(**txn_args)["transactionId"]
            try:
                try:
                    rds_data.execute_statement(transactionId=transaction_id,
                        sql="SET TRANSACTION READ ONLY", **txn_args)
                except Exception as e:
                    # Abort rather than fall through to running the query without the read-only
                    # guarantee — the lexical guard is defense-in-depth, not the primary barrier.
                    return err("read-only: could not establish a read-only transaction — refusing to execute: " + str(e))
                resp = rds_data.execute_statement(transactionId=transaction_id, sql=sql, **txn_args)
            finally:
                try:
                    rds_data.rollback_transaction(resourceArn=resource_arn,
                        secretArn=secret_arn, transactionId=transaction_id)
                except Exception as e:
                    # Logged, not silently swallowed — a leaked transaction (rds-data has a
                    # 3-minute idle transaction timeout, but this could still mask a real
                    # AccessDenied on RollbackTransaction rather than a benign already-closed txn).
                    logger.warning("execute_sql: rollback_transaction failed for txn %s: %s",
                                   transaction_id, e)
            columns = [c.get("label", c.get("name", "")) for c in resp.get("columnMetadata", [])]
            rows = []
            for record in resp.get("records", [])[:100]:
                row = {}
                for i, field in enumerate(record):
                    col = columns[i] if i < len(columns) else "col{}".format(i)
                    val = field.get("stringValue", field.get("longValue", field.get("doubleValue",
                        field.get("booleanValue", field.get("isNull", None)))))
                    row[col] = val
                rows.append(row)
            return ok({"columns": columns, "rows": rows, "rowCount": len(rows)})

        # List DB snapshots (automated or manual) / DB 스냅샷 목록 조회 (자동 또는 수동)
        elif t == "list_snapshots":
            snaps = rds.describe_db_snapshots(SnapshotType=args.get("snapshot_type", "automated")).get("DBSnapshots", [])
            return ok({"snapshots": [{"id": s["DBSnapshotIdentifier"], "instance": s.get("DBInstanceIdentifier"),
                "engine": s["Engine"], "status": s["Status"], "size": s.get("AllocatedStorage"),
                "created": str(s.get("SnapshotCreateTime", ""))} for s in snaps[:20]]})

        return err("Unknown tool: " + t)
    except Exception as e:
        return {"statusCode": 500, "body": json.dumps({"error": str(e)})}

# Resolve a Data API resource_arn's engine family so execute_sql picks the right guard dialect.
# `rds` (boto3 RDS, not rds-data) already has DescribeDBClusters perms via list_db_clusters above;
# Data API only targets Aurora clusters, and describe_db_clusters accepts either the identifier
# or the ARN for DBClusterIdentifier. Returns None (never guesses) if the engine string is
# unrecognized or the lookup itself fails — caller fails closed on None.
def _is_foundation_cluster(resource_arn, cluster_arn):
    """True when resource_arn designates the host's own foundation Aurora cluster.

    describe_db_clusters / the Data API both accept either the full cluster ARN or the bare cluster
    identifier, so accept both spellings of the same cluster and nothing else. RDS identifiers and
    ARNs are lowercase, but casefold anyway so a hand-typed argument isn't a spurious refusal.
    """
    want = (cluster_arn or "").strip().lower()
    got = (resource_arn or "").strip().lower()
    return bool(want) and got in (want, want.rsplit(":", 1)[-1])


def _engine_family(rds, resource_arn):
    engine = rds.describe_db_clusters(DBClusterIdentifier=resource_arn)["DBClusters"][0]["Engine"].lower()
    if "mysql" in engine or "mariadb" in engine:
        return "mysql"
    if "postgres" in engine:
        return "postgres"
    return None

# Return success response / 성공 응답 반환
def ok(body): return {"statusCode": 200, "body": json.dumps(body, default=str)}
# Return error response / 오류 응답 반환
def err(msg): return {"statusCode": 400, "body": json.dumps({"error": msg})}
