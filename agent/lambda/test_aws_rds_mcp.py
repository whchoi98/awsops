"""Tests for aws_rds_mcp's execute_sql read-only guard.

pentest-remediation P2-4: the old guard was `kw in sql.lower().split()` — whitespace-only
tokenization. These reproduce the pentest's exact bypass payloads and confirm the shared
sql_readonly_guard now rejects them (and still allows real SELECTs through).
"""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import aws_rds_mcp as rds_mcp  # noqa: E402
import cross_account  # noqa: E402


# PR-review round 8: execute_sql's Data API credential now comes from env (the dedicated
# least-privilege awsops_sql_reader secret, wired by ai.tf) and the caller-supplied `secret_arn`
# argument is IGNORED — the tests keep passing a master-looking ARN in the arguments precisely to
# prove it never reaches the rds-data client.
MASTER_SECRET_ARN = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:rds!cluster-abc-master-AbCdEf"
READER_SECRET_ARN = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:ops/awsops-v2/agent/sql-reader-XyZw12"
# PR-review round 10 MAJOR: the reader secret belongs to exactly one cluster, so execute_sql now
# validates resource_arn against AURORA_CLUSTER_ARN (injected by ai.tf) instead of letting the Data
# API blow up with an unhandled 500. Every env patch below carries it; _event() defaults to it.
CLUSTER_ARN = "arn:aws:rds:ap-northeast-2:123456789012:cluster:c1"
DATABASE_NAME = "awsops"
_READER_ENV = {
    "AURORA_SQL_READER_SECRET_ARN": READER_SECRET_ARN,
    "AURORA_CLUSTER_ARN": CLUSTER_ARN,
    "AURORA_DATABASE": DATABASE_NAME,
}


def _event(sql, resource_arn=CLUSTER_ARN, secret_arn=MASTER_SECRET_ARN):
    return {
        "tool_name": "execute_sql",
        "arguments": {
            "sql": sql,
            "resource_arn": resource_arn,
            "secret_arn": secret_arn,
        },
    }


class TestExecuteSqlGuard(unittest.TestCase):
    def setUp(self):
        self.rds_client = mock.MagicMock()
        # These tests exercise the Postgres dialect path (the tool's historical hardcoded flags,
        # now resolved dynamically per PR-review round-2 CRITICAL #2) — default the cluster lookup
        # to aurora-postgresql. MySQL-dialect behavior has its own test class below.
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-postgresql"}]}
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()
        self.env_patch = mock.patch.dict(os.environ, _READER_ENV)
        self.env_patch.start()

    def tearDown(self):
        self.get_client_patch.stop()
        self.env_patch.stop()

    def _status(self, sql):
        resp = rds_mcp.lambda_handler(_event(sql), None)
        return resp["statusCode"], json.loads(resp["body"])

    def test_plain_select_reaches_the_data_api(self):
        # PR-review round 3: execute_sql now wraps the query in a DB-level READ ONLY transaction —
        # begin_transaction, then TWO execute_statement calls (SET TRANSACTION READ ONLY, then the
        # real query) both carrying the SAME transactionId, then rollback_transaction in `finally`.
        status, body = self._status("SELECT id, requested_by FROM diagnosis_reports LIMIT 10")
        self.assertEqual(status, 200)
        self.rds_data_client.begin_transaction.assert_called_once()
        calls = self.rds_data_client.execute_statement.call_args_list
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0].kwargs["sql"], "SET TRANSACTION READ ONLY")
        self.assertEqual(calls[1].kwargs["sql"], "SELECT id, requested_by FROM diagnosis_reports LIMIT 10")
        self.assertEqual(calls[0].kwargs["transactionId"], "txn-1")
        self.assertEqual(calls[1].kwargs["transactionId"], "txn-1")
        self.assertEqual(self.rds_data_client.begin_transaction.call_args.kwargs["database"], DATABASE_NAME)
        self.assertEqual({call.kwargs["database"] for call in calls}, {DATABASE_NAME})
        self.rds_data_client.rollback_transaction.assert_called_once_with(
            resourceArn="arn:aws:rds:ap-northeast-2:123456789012:cluster:c1",
            secretArn=READER_SECRET_ARN, transactionId="txn-1")
        self.rds_data_client.commit_transaction.assert_not_called()

    def test_benign_select_with_a_decoy_comment_still_passes(self):
        # The pentest's own repro used SELECT/*delete*/table_name FROM information_schema.tables to
        # PROVE the old filter's block-comment bypass — the query itself is a plain read (the "delete"
        # is a decoy word inside a comment, not a real DML verb) and must still succeed.
        status, _ = self._status("SELECT/*delete*/table_name FROM/**/information_schema.tables")
        self.assertEqual(status, 200)
        self.assertEqual(self.rds_data_client.execute_statement.call_count, 2)

    def test_the_exact_pentest_bypass_is_now_blocked(self):
        # These chain the same block-comment technique onto REAL write verbs — the pentest report's
        # follow-on steps once the decoy above proved the filter was bypassable. The old
        # `kw in sql.lower().split()` check tokenized on whitespace only, so a keyword glued to a
        # comment never produced the bare token "insert"/"update" and sailed through.
        for sql in [
            "INSERT/*delete*/INTO/**/diagnosis_subscribers(email) VALUES('pentester@test.com')",
            "UPDATE/*delete*/accounts SET alias='pwned' WHERE account_id=1",
        ]:
            status, body = self._status(sql)
            self.assertEqual(status, 400, msg=sql)
            self.assertIn("read-only", body["error"])
        self.rds_data_client.execute_statement.assert_not_called()

    def test_rejects_keywords_the_old_filter_never_covered(self):
        for sql in ["GRANT SELECT ON t TO u", "SET search_path = evil", "CALL do_something()", "COPY t TO '/tmp/x'"]:
            status, _ = self._status(sql)
            self.assertEqual(status, 400, msg=sql)
        self.rds_data_client.execute_statement.assert_not_called()

    def test_rejects_stacked_statements(self):
        status, _ = self._status("SELECT 1; DROP TABLE t")
        self.assertEqual(status, 400)
        self.rds_data_client.execute_statement.assert_not_called()


class TestExecuteSqlEngineDialect(unittest.TestCase):
    """PR-review round-2 CRITICAL #2 found execute_sql was registered for both engines but always
    forced Postgres guard flags. Rounds 3-6 kept finding new MySQL-only lexical bypasses (backslash
    escaping, `--` boundary, `$` dollar-quoting, block-comment nesting) because MySQL has no
    dedicated low-privilege credential and no DB-level read-only backstop, so a lexical guard alone
    can never fully close that class. Round-6 preferred fix: fail closed for MySQL/MariaDB targets
    entirely, before any dialect-specific lexical scanning or Data API call happens — removing the
    surface instead of chasing more bypasses. These tests assert that fail-closed behavior; they
    replace the old MySQL bypass-repro tests (which exercised, and had to keep re-defending, the
    lexical-guard-only path)."""

    def setUp(self):
        self.rds_client = mock.MagicMock()
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()
        self.env_patch = mock.patch.dict(os.environ, _READER_ENV)
        self.env_patch.start()

    def tearDown(self):
        self.get_client_patch.stop()
        self.env_patch.stop()

    def _status(self, sql):
        resp = rds_mcp.lambda_handler(_event(sql), None)
        return resp["statusCode"], json.loads(resp["body"])

    def test_mysql_target_fails_closed_even_for_a_plain_select(self):
        # Round 6: MySQL/MariaDB is now unsupported outright — not "supported but lexically risky".
        # Even an entirely benign SELECT never reaches the guard or the Data API.
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-mysql"}]}
        status, body = self._status("SELECT * FROM t WHERE x = 1")
        self.assertEqual(status, 400)
        self.assertIn("MySQL", body["error"])
        self.rds_data_client.execute_statement.assert_not_called()
        self.rds_data_client.begin_transaction.assert_not_called()

    def test_mariadb_target_also_fails_closed(self):
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "mariadb"}]}
        status, body = self._status("SELECT 1")
        self.assertEqual(status, 400)
        self.assertIn("MySQL", body["error"])
        self.rds_data_client.execute_statement.assert_not_called()

    def test_unresolvable_engine_fails_closed_rather_than_guessing(self):
        self.rds_client.describe_db_clusters.side_effect = Exception("boom")
        status, body = self._status("SELECT 1")
        self.assertEqual(status, 400)
        self.assertIn("read-only", body["error"])
        self.rds_data_client.execute_statement.assert_not_called()
        self.rds_data_client.begin_transaction.assert_not_called()

    def test_unrecognized_engine_string_fails_closed(self):
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "some-future-engine"}]}
        status, body = self._status("SELECT 1")
        self.assertEqual(status, 400)
        self.rds_data_client.execute_statement.assert_not_called()
        self.rds_data_client.begin_transaction.assert_not_called()


class TestExecuteSqlReadOnlyTransaction(unittest.TestCase):
    """PR-review round 3 CRITICAL: a lexical denylist can't practically enumerate every present/
    future write-capable string function on Postgres/MySQL (query_to_xml(...RETURNING...), lo_put,
    set_config, ...) given this tool runs with the app's own Aurora MASTER credentials. These prove
    the structural fix — every execute_sql call runs inside a DB-level READ ONLY transaction — via
    the call sequence (begin -> SET TRANSACTION READ ONLY -> user SQL -> rollback), since a plain
    mock can't itself enforce Postgres/MySQL transaction semantics."""

    def setUp(self):
        self.rds_client = mock.MagicMock()
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-postgresql"}]}
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()
        self.env_patch = mock.patch.dict(os.environ, _READER_ENV)
        self.env_patch.start()

    def tearDown(self):
        self.get_client_patch.stop()
        self.env_patch.stop()

    def _status(self, sql):
        resp = rds_mcp.lambda_handler(_event(sql), None)
        return resp["statusCode"], json.loads(resp["body"])

    def test_set_config_is_rejected_lexically_not_by_the_transaction(self):
        # Round-3's version of this test simulated the engine rejecting `set_config(...)` inside a
        # READ ONLY transaction (READ_ONLY_SQL_TRANSACTION) — that's not real Postgres behavior:
        # GUC/session-variable changes are explicitly PERMITTED inside a read-only transaction (they
        # aren't "writes" from the engine's point of view), so that test encoded a false guarantee.
        # Round-4 fix: `set_config` is now in sql_readonly_guard's DANGER pattern, so this is caught
        # at the assert_read_only layer, before the Data API (or any transaction) is ever touched.
        status, body = self._status("SELECT set_config('search_path', 'public', false)")
        self.assertEqual(status, 400)
        self.assertIn("read-only", body["error"])
        self.rds_data_client.begin_transaction.assert_not_called()
        self.rds_data_client.execute_statement.assert_not_called()
        self.rds_data_client.rollback_transaction.assert_not_called()

    def test_normal_select_works_end_to_end_through_the_transaction_wrapped_flow(self):
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        status, body = self._status("SELECT 1")
        self.assertEqual(status, 200)
        calls = self.rds_data_client.execute_statement.call_args_list
        self.assertEqual([c.kwargs["transactionId"] for c in calls], ["txn-1", "txn-1"])
        self.rds_data_client.rollback_transaction.assert_called_once()
        self.rds_data_client.commit_transaction.assert_not_called()

    def test_set_transaction_read_only_failure_aborts_without_running_the_query(self):
        def fake_execute_statement(transactionId, sql, **kwargs):
            if sql == "SET TRANSACTION READ ONLY":
                raise Exception("boom")
            raise AssertionError("must not execute the user SQL if READ ONLY setup failed")

        self.rds_data_client.execute_statement.side_effect = fake_execute_statement
        status, body = self._status("SELECT 1")
        self.assertEqual(status, 400)
        self.assertIn("read-only", body["error"])
        self.assertEqual(self.rds_data_client.execute_statement.call_count, 1)
        self.rds_data_client.rollback_transaction.assert_called_once_with(
            resourceArn="arn:aws:rds:ap-northeast-2:123456789012:cluster:c1",
            secretArn=READER_SECRET_ARN, transactionId="txn-1")


class TestExecuteSqlUsesTheLeastPrivilegeSecret(unittest.TestCase):
    """PR-review round 8 (STRUCTURAL fix for the bypass class rounds 3-7 kept re-finding).

    Rounds 3-7 each found a new way past the lexical guard, and reviewers concluded the denylist
    cannot enumerate the vulnerable set (any core function taking SQL as a *string* — e.g.
    `query_to_xml('SELECT pg_cancel_backend(...)')` — is invisible to a filter that strips string
    literals, and `SET TRANSACTION READ ONLY` does not block control-plane calls). Each bypass only
    mattered because the tool ran under the Aurora MASTER secret. So the boundary moved into the
    database: execute_sql authenticates as the dedicated `awsops_sql_reader` role (NOSUPERUSER,
    SELECT-only, default_transaction_read_only=on). These assert the security-relevant, DB-free
    fact: the secretArn handed to rds-data is the low-privilege one, never the master."""

    def setUp(self):
        self.rds_client = mock.MagicMock()
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-postgresql"}]}
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()

    def tearDown(self):
        self.get_client_patch.stop()

    def _run(self, sql="SELECT 1"):
        return rds_mcp.lambda_handler(_event(sql), None)

    def test_every_data_api_call_uses_the_reader_secret_not_the_master_secret(self):
        with mock.patch.dict(os.environ, _READER_ENV):
            resp = self._run()
        self.assertEqual(resp["statusCode"], 200)
        seen = [self.rds_data_client.begin_transaction.call_args.kwargs["secretArn"]]
        seen += [c.kwargs["secretArn"] for c in self.rds_data_client.execute_statement.call_args_list]
        seen.append(self.rds_data_client.rollback_transaction.call_args.kwargs["secretArn"])
        self.assertEqual(len(seen), 4)  # begin + SET TRANSACTION READ ONLY + user SQL + rollback
        self.assertEqual(set(seen), {READER_SECRET_ARN})
        self.assertNotIn(MASTER_SECRET_ARN, seen)

    def test_caller_supplied_secret_arn_is_ignored(self):
        # The model/gateway does not get to choose the credential. Even an explicit master ARN in the
        # tool arguments (still tolerated for back-compat) must never be used.
        other = "arn:aws:secretsmanager:ap-northeast-2:123456789012:secret:attacker-chosen-AAAAAA"
        event = _event("SELECT 1", secret_arn=other)
        with mock.patch.dict(os.environ, _READER_ENV):
            resp = rds_mcp.lambda_handler(event, None)
        self.assertEqual(resp["statusCode"], 200)
        used = {c.kwargs["secretArn"] for c in self.rds_data_client.execute_statement.call_args_list}
        self.assertEqual(used, {READER_SECRET_ARN})
        self.assertNotIn(other, used)

    def test_caller_supplied_database_is_ignored(self):
        event = _event("SELECT 1")
        event["arguments"]["database"] = "attacker_chosen_database"
        with mock.patch.dict(os.environ, _READER_ENV):
            resp = rds_mcp.lambda_handler(event, None)
        self.assertEqual(resp["statusCode"], 200)
        seen = [self.rds_data_client.begin_transaction.call_args.kwargs["database"]]
        seen += [c.kwargs["database"] for c in self.rds_data_client.execute_statement.call_args_list]
        self.assertEqual(set(seen), {DATABASE_NAME})
        self.assertNotIn("attacker_chosen_database", seen)

    def test_unset_or_empty_database_config_fails_closed_before_any_data_api_call(self):
        without_database = {k: v for k, v in _READER_ENV.items() if k != "AURORA_DATABASE"}
        for label, env in [
            ("unset", without_database),
            ("empty", {**_READER_ENV, "AURORA_DATABASE": "  "}),
        ]:
            with self.subTest(label=label), mock.patch.dict(os.environ, env, clear=True):
                resp = self._run()
            self.assertEqual(resp["statusCode"], 400)
            self.assertIn("AURORA_DATABASE", json.loads(resp["body"])["error"])
            self.rds_data_client.begin_transaction.assert_not_called()
            self.rds_data_client.execute_statement.assert_not_called()

    def test_missing_reader_secret_fails_closed_before_any_data_api_call(self):
        # No fallback to the master secret (or to the caller's argument) — the tool refuses.
        with mock.patch.dict(os.environ, {**_READER_ENV, "AURORA_SQL_READER_SECRET_ARN": ""}):
            resp = self._run()
        self.assertEqual(resp["statusCode"], 400)
        self.assertIn("read-only", json.loads(resp["body"])["error"])
        self.rds_data_client.begin_transaction.assert_not_called()
        self.rds_data_client.execute_statement.assert_not_called()

    def test_unset_reader_secret_env_also_fails_closed(self):
        env = {k: v for k, v in os.environ.items() if k != "AURORA_SQL_READER_SECRET_ARN"}
        with mock.patch.dict(os.environ, env, clear=True):
            resp = self._run()
        self.assertEqual(resp["statusCode"], 400)
        self.rds_data_client.begin_transaction.assert_not_called()


class TestExecuteSqlCrossAccountFailsClosed(unittest.TestCase):
    """PR-review round 9 MAJOR: the Data API credential is the HOST account's least-privilege reader
    secret, so a genuinely different target account can never work — say so instead of attempting a
    doomed call. Host detection reuses cross_account.get_role_arn (None when target == host)."""

    HOST = "180294183052"
    OTHER = "999988887777"

    def setUp(self):
        self.rds_client = mock.MagicMock()
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-postgresql"}]}
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()
        self.env_patch = mock.patch.dict(os.environ, {
            **_READER_ENV,
            "AWSOPS_HOST_ACCOUNT_ID": self.HOST,
        })
        self.env_patch.start()
        cross_account._host_account_id.cache_clear()

    def tearDown(self):
        self.get_client_patch.stop()
        self.env_patch.stop()
        cross_account._host_account_id.cache_clear()

    def _run(self, account_id):
        event = _event("SELECT 1")
        event["arguments"]["target_account_id"] = account_id
        return rds_mcp.lambda_handler(event, None)

    def test_other_account_target_fails_closed_before_any_data_api_call(self):
        resp = self._run(self.OTHER)
        self.assertEqual(resp["statusCode"], 400)
        self.assertIn("cross-account", json.loads(resp["body"])["error"])
        self.rds_data_client.begin_transaction.assert_not_called()
        self.rds_data_client.execute_statement.assert_not_called()

    def test_host_account_target_still_works(self):
        # v2 is single-account: agent.py passes the host id explicitly, and get_role_arn returns
        # None for it — that must NOT be treated as cross-account.
        resp = self._run(self.HOST)
        self.assertEqual(resp["statusCode"], 200)
        self.rds_data_client.begin_transaction.assert_called_once()


class TestExecuteSqlNonFoundationCluster(unittest.TestCase):
    """PR-review round 10 MAJOR: a NON-foundation cluster in the SAME account (so the round-9
    cross-account guard doesn't fire) used to reach `begin_transaction` with a secret that belongs to
    a different cluster — BadRequestException from outside any try, i.e. an unhandled 500 + stack
    trace instead of a tool error the model can act on."""

    OTHER_CLUSTER = "arn:aws:rds:ap-northeast-2:123456789012:cluster:some-other-cluster"

    def setUp(self):
        self.rds_client = mock.MagicMock()
        self.rds_client.describe_db_clusters.return_value = {"DBClusters": [{"Engine": "aurora-postgresql"}]}
        self.rds_data_client = mock.MagicMock()
        self.rds_data_client.execute_statement.return_value = {"columnMetadata": [], "records": []}
        self.rds_data_client.begin_transaction.return_value = {"transactionId": "txn-1"}

        def fake_get_client(service, region, role_arn):
            return self.rds_data_client if service == "rds-data" else self.rds_client

        self.get_client_patch = mock.patch.object(rds_mcp, "get_client", side_effect=fake_get_client)
        self.get_client_patch.start()
        self.env_patch = mock.patch.dict(os.environ, _READER_ENV)
        self.env_patch.start()

    def tearDown(self):
        self.get_client_patch.stop()
        self.env_patch.stop()

    def test_other_cluster_returns_a_tool_error_not_a_500(self):
        resp = rds_mcp.lambda_handler(_event("SELECT 1", resource_arn=self.OTHER_CLUSTER), None)
        self.assertEqual(resp["statusCode"], 400)
        self.assertIn("foundation Aurora cluster", json.loads(resp["body"])["error"])
        # Fails closed BEFORE any Data API call (and before the DescribeDBClusters engine lookup).
        self.rds_data_client.begin_transaction.assert_not_called()
        self.rds_data_client.execute_statement.assert_not_called()
        self.rds_client.describe_db_clusters.assert_not_called()

    def test_bare_cluster_identifier_is_canonicalized_to_the_full_arn(self):
        # PR #197 review MAJOR: the guard accepts the bare identifier, but the RDS Data API requires
        # the FULL ARN — passing "c1" through made begin_transaction raise BadRequestException, which
        # surfaced as an unhandled 500. This is the normal path, not an edge case: list_db_clusters /
        # describe_db_cluster expose cluster identifiers only, never ARNs.
        #
        # Asserting statusCode 200 was what hid it — the mock happily accepted "c1". Assert the value
        # that actually reached the Data API instead.
        resp = rds_mcp.lambda_handler(_event("SELECT 1", resource_arn="c1"), None)
        self.assertEqual(resp["statusCode"], 200)
        self.rds_data_client.begin_transaction.assert_called_once()
        self.assertEqual(
            self.rds_data_client.begin_transaction.call_args.kwargs["resourceArn"], CLUSTER_ARN)
        self.assertEqual(
            self.rds_data_client.execute_statement.call_args.kwargs["resourceArn"], CLUSTER_ARN)
        # The engine lookup must not see the bare id either.
        self.assertEqual(
            self.rds_client.describe_db_clusters.call_args.kwargs["DBClusterIdentifier"], CLUSTER_ARN)

    def test_full_arn_is_passed_through_unchanged(self):
        resp = rds_mcp.lambda_handler(_event("SELECT 1", resource_arn=CLUSTER_ARN), None)
        self.assertEqual(resp["statusCode"], 200)
        self.assertEqual(
            self.rds_data_client.begin_transaction.call_args.kwargs["resourceArn"], CLUSTER_ARN)

    def test_cross_account_returns_400_even_when_assume_role_fails(self):
        # PR #197 review MAJOR: get_client() assumes the target role EAGERLY, so a foreign account
        # whose role is absent/untrusted used to raise before the branch's cross-account guard ran,
        # producing a raw 500. The previous tests could not catch this because their mocked
        # get_client never assumes. Make it raise, the way the real one does.
        def _boom(service, region, role_arn=None):
            if role_arn:
                raise Exception("AccessDenied: not authorized to perform sts:AssumeRole")
            return self.rds_client
        with mock.patch.object(rds_mcp, "get_client", side_effect=_boom), \
             mock.patch.object(rds_mcp, "get_role_arn", return_value="arn:aws:iam::999999999999:role/X"):
            resp = rds_mcp.lambda_handler(
                {**_event("SELECT 1", resource_arn=CLUSTER_ARN),
                 "arguments": {**_event("SELECT 1", resource_arn=CLUSTER_ARN)["arguments"],
                               "target_account_id": "999999999999"}}, None)
        self.assertEqual(resp["statusCode"], 400)
        self.assertIn("cross-account execute_sql is unsupported", json.loads(resp["body"])["error"])

    def test_missing_cluster_arn_env_fails_closed(self):
        env = {k: v for k, v in _READER_ENV.items() if k != "AURORA_CLUSTER_ARN"}
        with mock.patch.dict(os.environ, env, clear=True):
            resp = rds_mcp.lambda_handler(_event("SELECT 1"), None)
        self.assertEqual(resp["statusCode"], 400)
        self.assertIn("AURORA_CLUSTER_ARN", json.loads(resp["body"])["error"])
        self.rds_data_client.begin_transaction.assert_not_called()

    def test_a_prefix_of_the_cluster_arn_is_not_accepted(self):
        # Guard against a substring/startswith-style comparison sneaking back in.
        resp = rds_mcp.lambda_handler(_event("SELECT 1", resource_arn=CLUSTER_ARN + "-replica"), None)
        self.assertEqual(resp["statusCode"], 400)
        self.rds_data_client.begin_transaction.assert_not_called()


if __name__ == "__main__":
    unittest.main()
