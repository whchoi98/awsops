"""Tests for the shared sql_readonly_guard module (extracted from clickhouse_mcp.py, now also used
by aws_rds_mcp.py — pentest-remediation P2-4)."""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))
import sql_readonly_guard as g  # noqa: E402


class TestAssertReadOnly(unittest.TestCase):
    def _ok(self, sql):
        g.assert_read_only(sql)  # no raise

    def _bad(self, sql):
        with self.assertRaises(ValueError, msg=sql):
            g.assert_read_only(sql)

    def test_accepts_plain_reads(self):
        for s in ["SELECT 1", "  select * from t", "WITH x AS (SELECT 1) SELECT * FROM x",
                  "SHOW TABLES", "DESCRIBE TABLE t", "DESC t", "EXISTS TABLE t"]:
            self._ok(s)

    def test_rejects_the_full_write_admin_verb_set(self):
        # Includes the verbs the pre-extraction aws_rds_mcp.py filter missed entirely:
        # GRANT/REVOKE/SET/CALL/COPY/MERGE/REPLACE/LOCK.
        for s in ["INSERT INTO t VALUES (1)", "DROP TABLE t", "ALTER TABLE t ADD c int",
                  "CREATE TABLE t (a int)", "DELETE FROM t", "TRUNCATE TABLE t",
                  "GRANT SELECT ON t TO u", "REVOKE SELECT ON t FROM u", "SET x = 1",
                  "CALL proc()", "COPY t TO '/tmp/x'", "MERGE INTO t USING s ON 1=1",
                  "LOCK TABLE t"]:
            self._bad(s)

    def test_rejects_stacked_statements(self):
        self._bad("SELECT 1; DROP TABLE t")

    def test_comment_stripping_defeats_the_split_based_bypass(self):
        # This is the exact bypass class the old `kw in sql.lower().split()` filter missed: a keyword
        # glued to a comment never produces the bare token, so a naive split-based check never sees it.
        self._bad("DROP/*x*/TABLE t")
        self._bad("INSERT/**/INTO t VALUES (1)")
        self._bad("UPDATE/*x*/accounts SET a=1")

    def test_string_literal_contents_are_not_false_triggers(self):
        self._ok("SELECT 'please set the drop value' AS note")

    def test_extra_forbidden_re_layers_a_dialect_specific_check(self):
        # Mirrors how clickhouse_mcp.py layers its ClickHouse-only table-function block on top.
        extra = re.compile(r"\bfile\s*\(", re.IGNORECASE)
        with self.assertRaises(ValueError):
            g.assert_read_only("SELECT * FROM file('/etc/passwd')", extra_forbidden_re=extra)
        g.assert_read_only("SELECT 1", extra_forbidden_re=extra)  # unaffected when absent

    def test_replace_scalar_function_no_longer_a_false_positive(self):
        # PR-review MAJOR: bare \bREPLACE\b false-flagged the read-only scalar string function.
        self._ok("SELECT replace(col, 'a', 'b') FROM t")

    def test_replace_into_and_replace_table_still_rejected(self):
        self._bad("REPLACE INTO t VALUES (1)")
        self._bad("REPLACE TABLE t (a int)")

    def test_update_explicitly_rejected(self):
        self._bad("UPDATE t SET x = 1")

    def test_explain_select_allowed_explain_analyze_of_mutation_still_blocked(self):
        # PR-review MINOR: EXPLAIN is a legitimate Aurora diagnostic first-token; the mutating
        # statement it explains is still caught by DANGER regardless of the first-token check.
        self._ok("EXPLAIN SELECT * FROM t")
        self._bad("EXPLAIN DELETE FROM t")

    def test_mysql_executable_comment_fails_closed_for_any_caller(self):
        # PR-review MAJOR: /*! ... */ is executed by MySQL/Aurora-MySQL, not a real comment.
        self._bad("SELECT 1 /*!50000 INTO OUTFILE '/tmp/x'*/")

    def test_nested_block_comment_bypass_rejected(self):
        # PR-review round-5 CRITICAL, round-6 note: real Postgres nests /* */ — this whole comment
        # is one block ending at the OUTERMOST */. The old single-find("*/") scanner stopped at the
        # first (inner) */, leaving a stray ' that then ate the rest of the string as an
        # "unterminated literal", hiding "pg_cancel_backend(123)" from DANGER entirely. Real Postgres
        # parses this as "SELECT 1 , pg_cancel_backend(123)" — must be rejected. nested_block_comment
        # is Postgres-only (round 6): this dialect knob must be passed explicitly, it's not the
        # (non-nesting) default.
        with self.assertRaises(ValueError):
            g.assert_read_only("SELECT 1 /* outer /* inner */ ' */ , pg_cancel_backend(123)",
                                nested_block_comment=True)

    def test_deeply_nested_block_comment_bypass_rejected(self):
        with self.assertRaises(ValueError):
            g.assert_read_only("SELECT 1 /* a /* b /* c */ ' */ */ , pg_cancel_backend(123)",
                                nested_block_comment=True)

    def test_well_formed_nested_comment_still_allows_legitimate_query(self):
        # Proves the fix isn't just fail-closing on ALL comments — a fully-balanced nested comment
        # strips cleanly to a genuinely safe statement.
        g.assert_read_only("SELECT 1 /* outer /* inner */ trailing */ , col FROM t",
                            nested_block_comment=True)  # no raise

    def test_non_nested_default_terminates_at_first_close(self):
        # PR-review round-6 CRITICAL: MySQL/ClickHouse (and the module default) do NOT nest — they
        # terminate at the FIRST */. A block-comment-adjacent payload that would fully hide a
        # dangerous call under Postgres-style nesting must instead reveal it as live SQL here, so
        # the existing DANGER check (INTO) catches it. Traced PoC from the module docstring.
        self._bad("SELECT 1 /* a /* */ INTO OUTFILE '/tmp/x' /* */")

    def test_non_nested_default_still_allows_legitimate_query(self):
        self._ok("SELECT 1 /* a comment */ , col FROM t")

    def test_unresolved_comment_marker_fails_closed(self):
        # Defense-in-depth: if a literal /* or */ somehow survives stripping, reject rather than
        # pass through a partial parse. An unterminated block comment can't leave a marker (the
        # whole tail is consumed), so exercise the safety net directly against strip_sql's output
        # contract instead.
        with self.assertRaises(ValueError):
            g.strip_sql("SELECT 1 */ FROM t")


class TestPostgresDialect(unittest.TestCase):
    """aws_rds_mcp.py's RDS/PostgreSQL call path passes hash_comment=False, backslash_escapes=False
    (Aurora PostgreSQL: no '#' line comments — '#'/'#>'/'#>>' are jsonb operators — and
    standard_conforming_strings=on by default, so '\\' is a literal char, not an escape) and
    (round 6) nested_block_comment=True (real Postgres block comments nest by spec)."""

    def _ok(self, sql):
        g.assert_read_only(sql, hash_comment=False, backslash_escapes=False,
                            nested_block_comment=True)  # no raise

    def _bad(self, sql):
        with self.assertRaises(ValueError, msg=sql):
            g.assert_read_only(sql, hash_comment=False, backslash_escapes=False,
                                nested_block_comment=True)

    def test_jsonb_hash_operator_not_treated_as_comment(self):
        # PR-review CRITICAL: '#' stripped as a comment hid the trailing "INTO write_probe" CTAS.
        self._bad("SELECT '{\"a\":1}'::jsonb #> '{a}' INTO write_probe")

    def test_select_into_ctas_rejected(self):
        # PR-review CRITICAL: Postgres SELECT ... INTO table is CTAS (a real write), not a plain read.
        self._bad("SELECT * INTO write_probe FROM t")

    def test_select_into_outfile_rejected(self):
        self._bad("SELECT * FROM t INTO OUTFILE '/tmp/x'")

    def test_dangerous_pg_functions_rejected(self):
        for fn in ["pg_read_file('/etc/passwd')", "pg_ls_dir('/etc')", "lo_import('/etc/passwd')",
                   "lo_export(1, '/tmp/x')", "lo_create(1)", "lo_unlink(1)",
                   "dblink('host=x', 'select 1')", "pg_terminate_backend(123)"]:
            self._bad(f"SELECT {fn}")

    def test_backslash_terminated_string_hiding_second_statement_rejected(self):
        # PR-review MAJOR: with standard_conforming_strings=on, 'a\' ends the string at the next ',
        # not after the backslash — treating '\' as an escape here mis-scanned past a real DELETE.
        self._bad("SELECT 'a\\' ; DELETE FROM t; SELECT 'b'")

    def test_plain_select_still_allowed(self):
        self._ok("SELECT * FROM t WHERE x = 1")

    def test_replace_scalar_function_still_allowed(self):
        self._ok("SELECT replace(col, 'a', 'b') FROM t")

    def test_e_string_desync_no_longer_hides_a_stacked_statement(self):
        # PR-review round-2 CRITICAL #1: E'...' literals ALWAYS backslash-escape in Postgres
        # regardless of standard_conforming_strings — scanning them under backslash_escapes=False
        # (correct for ordinary '...' literals here) mis-found the closing quote, then treated the
        # real closing `'` as opening a NEW string that swallowed the rest of the input, hiding
        # the trailing DELETE entirely.
        self._bad("SELECT E'a\\'b'; DELETE FROM t")
        # Not a bypass: with the escaped quote correctly consumed, the entire remainder (including
        # "DROP TABLE y") is genuinely still inside this one string literal in real Postgres too —
        # the guard now agrees with the engine's own parse instead of closing the string early.
        self._ok("SELECT E'x\\'; DROP TABLE y; --'")

    def test_e_string_ordinary_content_still_allowed(self):
        self._ok("SELECT E'a\\'b' AS note")

    def test_u_ampersand_string_desync_also_handled(self):
        self._bad("SELECT U&'a\\'b'; DELETE FROM t")

    def test_dblink_exec_word_boundary_now_caught(self):
        # PR-review MAJOR: bare \bdblink\b doesn't end before "_exec" (underscore is a word char).
        self._bad("SELECT dblink_exec('host=x', 'delete from t')")

    def test_setval_nextval_sequence_mutation_rejected(self):
        self._bad("SELECT setval('seq', 100)")
        self._bad("SELECT nextval('seq')")

    def test_pg_cancel_backend_rejected(self):
        # PR-review round-4 MAJOR: pg_cancel_backend is a read-verb-first function call that a
        # Postgres READ ONLY transaction does NOT block (it only blocks data writes, not backend
        # control-plane calls) — this class has to be caught lexically or not at all.
        self._bad("SELECT pg_cancel_backend(123)")

    def test_info_disclosure_and_control_functions_rejected(self):
        for fn in ["pg_read_binary_file('/etc/passwd')", "pg_stat_file('/etc/passwd')",
                   "pg_ls_dir('/etc')", "pg_ls_waldir()"]:
            self._bad(f"SELECT {fn}")

    def test_set_config_rejected(self):
        # PR-review round-4 MAJOR: set_config(...) is permitted by Postgres inside a READ ONLY
        # transaction (GUC changes aren't "writes"), so the DB-level backstop can't catch it —
        # lexical-only.
        self._bad("SELECT set_config('search_path', 'public', false)")

    def test_pg_advisory_lock_functions_rejected(self):
        self._bad("SELECT pg_advisory_lock(1)")
        self._bad("SELECT pg_advisory_unlock(1)")

    def test_lo_put_rejected(self):
        self._bad("SELECT lo_put(1, 0, 'data')")

    def test_mysql_load_file_rejected(self):
        self._bad("SELECT load_file('/etc/passwd')")

    def test_control_plane_dos_functions_rejected(self):
        # MAJOR (round 7): more control-plane/DoS functions a READ ONLY transaction doesn't block.
        self._bad("SELECT pg_reload_conf()")

    def test_dollar_quote_left_boundary_no_false_heredoc_from_identifier_suffix(self):
        # PR-review round-7 CRITICAL #1: `$` is a legal Postgres identifier char, so `foo$tag$` is
        # an ordinary alias, not a heredoc opener. The old scanner had no LEFT boundary check, so it
        # misread this as one heredoc spanning foo$tag$..bar$tag$, hiding pg_cancel_backend(123)
        # (an ordinary function call between the two aliases in real Postgres) as "string content".
        self._bad("SELECT 1 AS foo$tag$, pg_cancel_backend(123) AS bar$tag$")

    def test_dollar_quote_genuine_heredoc_still_works(self):
        # Proves the left-boundary fix didn't break legitimate dollar-quoted strings with no
        # adjacent-identifier collision.
        self._ok("SELECT $tag$hello world$tag$ AS greeting")

    def test_dollar_quote_unterminated_fails_closed(self):
        with self.assertRaises(ValueError):
            g.strip_sql("SELECT $tag$hello")

    def test_unicode_escape_identifier_hiding_dangerous_function_rejected(self):
        # PR-review round-7 CRITICAL #2: U&"..." Unicode-escape identifiers decode \XXXX escapes
        # at parse time — U&"pg_cancel_backen\0064"(123) decodes to pg_cancel_backend(123) in real
        # Postgres, but the literal undecoded text never string-matches DANGER. Fail-closed on any
        # U&"..." usage (option b: blanket reject, not a partial decoder).
        self._bad('SELECT U&"pg_cancel_backen\\0064"(123)')

    def test_lowercase_u_ampersand_identifier_also_rejected(self):
        self._bad('SELECT u&"drop\\0021"(123)')


class TestMysqlDashDashComment(unittest.TestCase):
    """PR-review round 3: MySQL only treats `--` as a comment when the second dash is followed by
    whitespace/a control char (or EOF) — `--1`, `--(`, etc. are ordinary tokens in MySQL, not
    comments. aws_rds_mcp.py's RDS/MySQL call path now passes dash_comment_needs_boundary=True."""

    def _ok(self, sql):
        g.assert_read_only(sql, hash_comment=True, backslash_escapes=True,
                            dash_comment_needs_boundary=True)  # no raise

    def _bad(self, sql):
        with self.assertRaises(ValueError, msg=sql):
            g.assert_read_only(sql, hash_comment=True, backslash_escapes=True,
                                dash_comment_needs_boundary=True)

    def test_dash_dash_without_boundary_is_not_a_comment_and_hidden_write_is_caught(self):
        # PR-review round-3 finding: SELECT 1--1 INTO OUTFILE ... — MySQL parses `1--1` as `1 - -1`
        # (subtraction), NOT a comment, so INTO OUTFILE is real SQL the old unconditional `--`
        # comment stripping hid from the guard.
        self._bad("SELECT 1--1 INTO OUTFILE '/tmp/x'")

    def test_dash_dash_with_trailing_space_is_still_a_real_comment(self):
        self._ok("SELECT 1 -- this is a real comment\n")

    def test_dash_dash_at_end_of_string_is_still_a_real_comment(self):
        self._ok("SELECT 1 --")

    def test_postgres_dialect_keeps_unconditional_dash_dash_comment(self):
        # dash_comment_needs_boundary defaults to False — PostgreSQL/ClickHouse behavior unchanged.
        g.assert_read_only("SELECT 1--1 AS x")  # `--1 AS x` is a comment on the Postgres path


class TestRound8TokenizerBoundaries(unittest.TestCase):
    """PR-review round 8 — the two round-7 leftovers. With the DB-role boundary in place (see the
    module docstring) these are tokenizer-correctness fixes, not privilege-escalation paths."""

    def _bad(self, sql, **kw):
        with self.assertRaises(ValueError, msg=sql):
            g.assert_read_only(sql, **kw)

    def test_u_ampersand_string_literal_is_rejected(self):
        # U&'...' also accepts `UESCAPE '<c>'` to redefine the escape char, so no fixed decoder can
        # be trusted — reject it like round 7 rejected the U&"..." identifier form.
        self._bad("SELECT U&'pg_cancel_backen!0064' UESCAPE '!'")
        self._bad("SELECT u&'\0064rop'")

    def test_plain_e_string_still_works(self):
        g.assert_read_only(r"SELECT 'a' || E'\n' FROM t")  # no raise

    def test_identifier_ending_in_u_ampersand_lookalike_is_not_treated_as_a_prefix(self):
        # `xu&'...'` — the `u&` is part of a longer name, so this is a plain string literal.
        g.assert_read_only("SELECT 1 FROM t WHERE xu = 'a'")  # no raise

    def test_non_ascii_identifier_char_before_a_dollar_tag_is_not_an_opener(self):
        # Round-7 fixed the ASCII case (`foo$tag$`); the check was `[A-Za-z0-9_$]`, so a Unicode
        # letter right before `$tag$` still made it look like a heredoc opener and swallowed the
        # pg_cancel_backend call between the two `$tag$` occurrences.
        self._bad("SELECT 1 AS fooé$tag$, pg_cancel_backend(123) AS baré$tag$")

    def test_real_dollar_quoted_string_still_parses(self):
        g.assert_read_only("SELECT $tag$anything ; DROP TABLE t$tag$ AS x")  # no raise


if __name__ == "__main__":
    unittest.main()
