"""Tests for clickhouse_mcp — read-only SQL guard (incl. table-function SSRF block) + query tools."""
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import clickhouse_mcp as ch  # noqa: E402

DS = {"endpoint": "http://ch:8123", "username": "default", "password": "pw"}


class TestReadOnlyGuard(unittest.TestCase):
    def _ok(self, sql):
        ch._assert_read_only(sql)  # no raise

    def _bad(self, sql):
        with self.assertRaises(ValueError, msg=sql):
            ch._assert_read_only(sql)

    def test_accept(self):
        for s in ["SELECT 1", "  select * from t", "WITH x AS (SELECT 1) SELECT * FROM x",
                  "SHOW TABLES", "DESCRIBE TABLE t", "DESC t", "EXISTS TABLE t",
                  "SELECT/**/ 1", "SELECT 1 /* trailing */"]:  # comments between tokens are fine
            self._ok(s)

    def test_reject_dml_ddl(self):
        for s in ["INSERT INTO t VALUES (1)", "DROP TABLE t", "ALTER TABLE t ADD c Int",
                  "CREATE TABLE t (a Int)", "DELETE FROM t", "TRUNCATE TABLE t",
                  "OPTIMIZE TABLE t", "GRANT SELECT ON db.* TO u", "KILL QUERY WHERE 1",
                  "RENAME TABLE a TO b", "SYSTEM RELOAD", "SET max_threads=1"]:
            self._bad(s)

    def test_block_all_system_for_user_queries(self):
        # The general (user) read-only guard blocks ALL system.* — including system.tables, because its
        # create_table_query/engine_full columns can carry plaintext engine credentials (MySQL/Kafka/S3).
        # Cross-DB schema introspection reaches system.tables via _run_sql(trusted=True), not this guard.
        for s in ["SELECT database, name FROM system.tables",        # blocked even for the benign columns
                  "SELECT create_table_query FROM system.tables",    # the credential-exposure case (C1)
                  "SELECT engine_full FROM system.tables",
                  "SELECT * FROM system.columns", "SELECT * FROM system.databases",
                  "SELECT * FROM system.users", "SELECT query FROM system.query_log",
                  "SYSTEM STOP MERGES"]:
            self._bad(s)

    def test_reject_stacked(self):
        self._bad("SELECT 1; DROP TABLE t")
        self._bad("SELECT/**/1 ;  INSERT INTO t VALUES (1)")

    def test_reject_comment_hidden_verb(self):
        self._bad("INS/**/ERT INTO t VALUES (1)")  # strip → INSERT
        self._bad("SELECT 1 -- harmless\n; DROP TABLE t")

    def test_reject_table_functions(self):
        for s in ["SELECT * FROM url('http://169.254.169.254/latest/meta-data/')",
                  "SELECT/**/* FROM mysql('h:3306','db','t','u','p')",
                  "SELECT * FROM s3('https://x/y','CSV')",
                  "SELECT * FROM remote('1.2.3.4','db.t')",
                  "select * from postgresql('h','db','t','u','p')",
                  "SELECT * FROM file('/etc/passwd')"]:
            self._bad(s)

    def test_reject_table_function_siblings_and_obfuscation(self):
        # P4 gate: urlCluster/s3Cluster/remoteSecure/executable/redis siblings + backtick evasion
        for s in ["SELECT * FROM urlCluster('c','http://169.254.169.254/','CSV','x String')",
                  "SELECT * FROM s3Cluster('c','https://x/y','CSV')",
                  "SELECT * FROM remoteSecure('h','db.t')",
                  "SELECT * FROM executable('script.sh','CSV','x String')",
                  "SELECT * FROM redis('h:6379','k','x String')",
                  "SELECT * FROM `url`('http://169.254.169.254/')",
                  "SELECT * FROM url/**/('http://169.254.169.254/')",
                  "SELECT * FROM \"url\"('http://169.254.169.254/')",
                  "SELECT * FROM hudi('http://169.254.169.254/','CSV')"]:
            self._bad(s)

    def test_desync_quote_in_identifier_still_blocks_table_fn(self):
        # a single-quote inside a backtick/double-quote identifier must NOT desync the parser and
        # let url(...) slip past _TABLE_FN (P4 r3 tokenizer fix)
        for s in ["SELECT `x'` , * FROM url('http://169.254.169.254/')",
                  'SELECT "x\'" , * FROM url(\'http://169.254.169.254/\')']:
            self._bad(s)

    def test_heredoc_dollar_quote_no_desync(self):
        # ClickHouse $$...$$ / $tag$...$tag$ heredoc strings carrying a stray quote must not desync
        # the scanner and hide a table function (P4 r4).
        for s in ["SELECT $$ x ' $$ , * FROM url('http://169.254.169.254/')",
                  "SELECT $tag$ a ' b $tag$ FROM s3('https://x/y','CSV')"]:
            self._bad(s)

    def test_hash_comment_hidden_verb(self):
        self._bad("SELECT 1 # ok\n; DROP TABLE t")

    def test_string_literal_not_false_trigger(self):
        # 'set'/'drop' inside a string literal must not trigger (literals are stripped before scan)
        self._ok("SELECT 'please set the drop value' AS note")

    def test_non_nested_comment_still_reveals_table_function(self):
        # PR-review round 6: ClickHouse does NOT nest block comments — it terminates at the FIRST
        # */, same as MySQL. An earlier version of the shared guard defaulted to Postgres-style
        # nesting unconditionally, which would have let this exact adjacent-comments shape swallow
        # the real `url(...)` table-function call as "still inside one big comment". With the
        # dialect-correct non-nested scan, the two comments resolve separately and url(...) stays
        # visible for _TABLE_FN to catch.
        self._bad("SELECT 1 /* a /* */ FROM url('http://169.254.169.254/latest/meta-data/') /* */")


class TestTools(unittest.TestCase):
    def setUp(self):
        self._ld = mock.patch.object(ch, "load_datasource", return_value=DS); self._ld.start(); self.addCleanup(self._ld.stop)
        self._ah = mock.patch.object(ch, "assert_host_allowed", return_value=None); self._ah.start(); self.addCleanup(self._ah.stop)

    def test_query_builds_request(self):
        captured = {}

        def fake_http(method, url, headers=None, body=None, timeout=None):
            captured.update(method=method, url=url, headers=headers, body=body)
            return 200, {"data": [{"x": 1}, {"x": 2}, {"x": 3}], "rows": 3}

        with mock.patch.object(ch, "http_json", side_effect=fake_http):
            out = ch.lambda_handler({"tool_name": "clickhouse_query",
                                     "arguments": {"sql": "SELECT x FROM t", "max_rows": 2}}, None)
        self.assertEqual(out["statusCode"], 200)
        body = json.loads(out["body"])
        self.assertEqual(body["rowCount"], 2)  # truncated to max_rows=2
        self.assertEqual(captured["method"], "POST")
        self.assertIn("readonly=1", captured["url"])
        self.assertIn("max_result_rows=2", captured["url"])
        self.assertIn("FORMAT JSON", captured["body"])
        self.assertEqual(captured["headers"]["Authorization"][:6], "Basic ")

    def test_query_rejects_non_readonly_before_request(self):
        with mock.patch.object(ch, "http_json") as hj:
            out = ch.lambda_handler({"tool_name": "clickhouse_query", "arguments": {"sql": "DROP TABLE t"}}, None)
        self.assertEqual(out["statusCode"], 400)
        hj.assert_not_called()  # no request made

    def test_tables_and_describe(self):
        with mock.patch.object(ch, "http_json", return_value=(200, {"data": []})) as hj:
            ch.lambda_handler({"tool_name": "clickhouse_tables", "arguments": {}}, None)
            self.assertIn("SHOW TABLES", hj.call_args.kwargs.get("body") or hj.call_args.args[3])
            ch.lambda_handler({"tool_name": "clickhouse_describe", "arguments": {"table": "t"}}, None)

    def test_not_connected(self):
        with mock.patch.object(ch, "load_datasource", side_effect=ch.NotConnected("clickhouse not connected")):
            out = ch.lambda_handler({"tool_name": "clickhouse_query", "arguments": {"sql": "SELECT 1"}}, None)
        self.assertEqual(out["statusCode"], 400)
        self.assertIn("not connected", json.loads(out["body"])["error"].lower())

    def test_ssrf_blocked(self):
        with mock.patch.object(ch, "assert_host_allowed", side_effect=ch.SsrfBlocked("endpoint blocked: metadata")):
            out = ch.lambda_handler({"tool_name": "clickhouse_query", "arguments": {"sql": "SELECT 1"}}, None)
        self.assertEqual(out["statusCode"], 400)
        self.assertIn("blocked", json.loads(out["body"])["error"].lower())

    def test_http_error_mapped(self):
        with mock.patch.object(ch, "http_json", return_value=(403, {"raw": "Authentication failed"})):
            out = ch.lambda_handler({"tool_name": "clickhouse_query", "arguments": {"sql": "SELECT 1"}}, None)
        self.assertEqual(out["statusCode"], 400)
        self.assertIn("403", json.loads(out["body"])["error"])

    def test_describe_rejects_injection(self):
        with mock.patch.object(ch, "http_json") as hj:
            out = ch.lambda_handler({"tool_name": "clickhouse_describe", "arguments": {"table": "t; DROP TABLE x"}}, None)
        self.assertEqual(out["statusCode"], 400)
        hj.assert_not_called()

    def test_target_account_id_popped(self):
        with mock.patch.object(ch, "http_json", return_value=(200, {"data": []})):
            out = ch.lambda_handler({"tool_name": "clickhouse_query",
                                     "arguments": {"sql": "SELECT 1", "target_account_id": "222222222222"}}, None)
        self.assertEqual(out["statusCode"], 200)

    def test_gateway_invoke_resolves_tool_name_from_client_context(self):
        # Reproduces the "unknown tool" bug: AgentCore Gateway invokes with no event
        # tool_name at all — only context.client_context.custom.bedrockAgentCoreToolName
        # ('<target>___<tool>'). Before the fix this hit the `fn is None` branch.
        class _ClientContext:
            custom = {"bedrockAgentCoreToolName": "clickhouse-mcp-target___clickhouse_tables"}

        class _Context:
            client_context = _ClientContext()

        with mock.patch.object(ch, "http_json", return_value=(200, {"data": []})) as hj:
            out = ch.lambda_handler({"arguments": {}}, _Context())
        self.assertEqual(out["statusCode"], 200)
        self.assertIn("SHOW TABLES", hj.call_args.kwargs.get("body") or hj.call_args.args[3])



class TestSchema(unittest.TestCase):
    def setUp(self):
        self._ld=mock.patch.object(ch,"load_datasource",return_value=DS); self._ld.start(); self.addCleanup(self._ld.stop)
        self._ah=mock.patch.object(ch,"assert_host_allowed",return_value=None); self._ah.start(); self.addCleanup(self._ah.stop)
    def test_schema_enumerates_across_databases(self):
        # schema probes SELECT version() FIRST, then system.tables (ALL non-system DBs), then DESCRIBE
        # each as db.table — so tables in a NON-default DB (e.g. `otel`) are captured (the prior
        # SHOW-TABLES-only path saw the empty `default` DB and returned 0 tables).
        seq=[(200,{"data":[{"v":"24.3.1"}]}),                                       # SELECT version()
             (200,{"data":[{"database":"otel","name":"otel_traces"}]}),             # system.tables
             (200,{"data":[{"name":"ServiceName","type":"String"},{"name":"Duration","type":"UInt64"}]})]  # DESCRIBE otel.otel_traces
        with mock.patch.object(ch,"http_json",side_effect=lambda *a,**k: seq.pop(0)):
            out=ch.lambda_handler({"tool_name":"clickhouse_schema","arguments":{}},None)
        b=json.loads(out["body"]); self.assertEqual(b["tables"][0]["name"],"otel.otel_traces")  # DB-qualified
        self.assertEqual([c["name"] for c in b["tables"][0]["columns"]],["ServiceName","Duration"])
        self.assertEqual(b["version"],"24.3.1")  # captured for version-aware SQL

    def test_schema_falls_back_to_show_tables_when_system_tables_unavailable(self):
        # If system.tables can't be read (restricted grants → non-200), fall back to current-DB SHOW TABLES.
        seq=[(200,{"data":[{"v":"24.3.1"}]}),               # version()
             (403,{"raw":"Not enough privileges"}),         # system.tables denied
             (200,{"data":[{"name":"events"}]}),            # SHOW TABLES (fallback)
             (200,{"data":[{"name":"ts","type":"DateTime"}]})]  # DESCRIBE events
        with mock.patch.object(ch,"http_json",side_effect=lambda *a,**k: seq.pop(0)):
            out=ch.lambda_handler({"tool_name":"clickhouse_schema","arguments":{}},None)
        b=json.loads(out["body"]); self.assertEqual(b["tables"][0]["name"],"events")

    def test_instance_id_resolves_per_instance_credential_blind(self):
        ch.load_datasource.reset_mock()
        with mock.patch.object(ch,"http_json",return_value=(200,{"data":[],"rows":0})):
            out=ch.lambda_handler({"tool_name":"clickhouse_query","arguments":{"sql":"SELECT 1","instance_id":7}},None)
        self.assertEqual(out["statusCode"],200)
        ch.load_datasource.assert_any_call(ch.SLUG, instance_id=7)


if __name__ == "__main__":
    unittest.main()
