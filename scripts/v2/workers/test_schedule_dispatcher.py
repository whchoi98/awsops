import json

import pytest

import schedule_dispatcher as sd


class FakeConn:
    def __init__(self, due_rows):
        self.due_rows = due_rows
        self.closed = False
        self.sql_log = []
        self.calls = []  # (sql, kwargs) — the lineage binds are the point of one test below
        self._rid = 0

    def run(self, sql, **_kw):
        self.sql_log.append(sql)
        self.calls.append((sql, _kw))
        if sql.startswith("UPDATE report_schedules"):
            return self.due_rows
        if sql.startswith("INSERT INTO diagnosis_reports"):
            self._rid += 1
            return [[self._rid]]  # RETURNING id
        return []  # link UPDATE / failure UPDATE

    def close(self):
        self.closed = True


class FakeSqs:
    def __init__(self, fail_for=None):
        self.sent = []
        self.fail_for = set(fail_for or [])

    def send_message(self, QueueUrl, MessageBody):  # noqa: N803 — boto3 kwarg names
        body = json.loads(MessageBody)
        if body["payload"]["requested_by"] in self.fail_for:
            raise RuntimeError("sqs unavailable")
        self.sent.append(body)


def _wire(monkeypatch, due_rows, fail_for=None):
    conn = FakeConn(due_rows)
    inserted = []
    monkeypatch.setattr(sd, "QUEUE_URL", "https://sqs.example/jobs")
    monkeypatch.setattr(sd.db, "connect", lambda: conn)
    monkeypatch.setattr(sd.db, "insert_job", lambda c, jid, t, p, **k: inserted.append((jid, t, p, k)))
    sqs = FakeSqs(fail_for)
    monkeypatch.setattr(sd, "_sqs", sqs)
    return conn, inserted, sqs


def test_enqueues_a_linked_report_per_due_schedule(monkeypatch):
    # report_schedules.user_sub now stores identity() (email-preferring) per the round-2 pentest fix
    # in web/app/api/diagnosis/schedule/route.ts — the column name is legacy, the value isn't
    # necessarily a raw Cognito sub. u1 here stands in for that stored identity value.
    rows = [("u1", "weekly", {"tier": "deep", "model": "opus"}), ("u2", "monthly", {"tier": "mid"})]
    conn, inserted, sqs = _wire(monkeypatch, rows)
    out = sd.lambda_handler({}, None)
    assert out == {"due": 2, "enqueued": 2, "failed": 0}
    # each run pre-creates a visible diagnosis_reports row, then a worker_jobs row carrying its report_id
    assert sum(s.startswith("INSERT INTO diagnosis_reports") for s in conn.sql_log) == 2
    assert [t for _, t, _, _ in inserted] == ["report", "report"]
    assert inserted[0][2]["tier"] == "deep" and inserted[0][2]["requested_by"] == "u1"
    assert inserted[0][2]["model"] == "opus" and inserted[1][2]["model"] == "sonnet"  # deep+opus→opus, mid→sonnet
    assert inserted[0][2]["report_id"] == 1 and inserted[0][2]["scheduled"] is True
    # round-2 MAJOR: worker_jobs.requested_by must match the report's requested_by, or GET
    # /api/jobs/[id] (owner-or-admin) 403s the very user this scheduled run was created for.
    assert inserted[0][3]["requested_by"] == "u1" and inserted[1][3]["requested_by"] == "u2"
    # the report is linked to the job (UPDATE ... SET worker_job_id ...)
    assert any("UPDATE diagnosis_reports SET worker_job_id" in s for s in conn.sql_log)
    assert len(sqs.sent) == 2 and sqs.sent[0]["type"] == "report"
    assert conn.closed is True


def test_no_due_rows_enqueues_nothing(monkeypatch):
    _conn, inserted, sqs = _wire(monkeypatch, [])
    assert sd.lambda_handler({}, None) == {"due": 0, "enqueued": 0, "failed": 0}
    assert inserted == [] and sqs.sent == []


def test_claim_sql_is_advance_first_enabled_only_returning():
    sql = sd._CLAIM_SQL
    assert "UPDATE report_schedules" in sql
    assert "enabled = true" in sql
    assert "next_run_at <= now()" in sql
    assert "RETURNING" in sql  # claim+advance in one statement → concurrent run claims 0 (no double-fire)


def test_lineage_parent_is_scoped_by_owner_and_account(monkeypatch):
    # The parent_report_id subquery must not pick a baseline from another owner or another account —
    # the BFF's createReport() scopes both, and the two paths disagreeing means the same diagnosis
    # reports a different diff depending on who started it (PR #203). The dispatcher can only offer
    # the sub (it has no token, hence no email), so the assertion is: bound, and bound to the sub.
    monkeypatch.setattr(sd, "HOST_ACCOUNT", "180294183052")
    rows = [("u1", "weekly", {"tier": "mid"})]
    conn, _inserted, _sqs = _wire(monkeypatch, rows)
    sd.lambda_handler({}, None)
    sql, kw = next(c for c in conn.calls if c[0].startswith("INSERT INTO diagnosis_reports"))
    assert "r.requested_by = ANY(:ok)" in sql
    # Two tiers: an ATTRIBUTED baseline must match the account; a report that cannot be attributed at all
    # (the _report handler self-creates with worker_job_id NULL and no payload reference) is a LAST RESORT.
    # Requiring attribution made those users' parent permanently NULL; allowing it in one tier let an
    # account-unknown row beat a known-good one.
    assert "COALESCE(" in sql
    assert "(:acct IS NULL OR j.payload->>'account' = :acct)" in sql
    assert "NOT EXISTS (SELECT 1 FROM worker_jobs j2" in sql
    # tier 2 is only reachable when NO account was named: an unattributable row cannot be shown to belong
    # to the account being diagnosed, and a wrong-account baseline is worse than none (it reports a
    # regression that never happened, and parent_report_id is fixed at INSERT).
    tier2 = sql.split("COALESCE(", 1)[1].split("NOT EXISTS", 1)[0].rsplit("(SELECT r.id", 1)[1]
    assert ":acct IS NULL" in tier2
    # link OR payload — a report whose link lost the one-report-per-job race is still the row the
    # worker renders, so it must stay eligible as a baseline. TEXT comparison, never a ::bigint cast of
    # the payload: AND does not order evaluation in Postgres, so a regex guard cannot stop an oversized
    # value from being cast and aborting the query (22003).
    assert "j.payload->>'report_id' = r.id::text" in sql
    assert "::bigint" not in sql
    # and the payload branch is owner-anchored — a type value alone is not provenance
    assert "j.requested_by = r.requested_by" in sql
    assert kw["ok"] == ["u1"] and kw["acct"] == "180294183052"


def test_string_config_is_tolerated(monkeypatch):
    # pg8000 may hand back JSONB as a string — must not throw after the claim advanced next_run_at.
    rows = [("u1", "weekly", '{"tier": "deep", "model": "opus"}')]
    _conn, inserted, sqs = _wire(monkeypatch, rows)
    out = sd.lambda_handler({}, None)
    assert out == {"due": 1, "enqueued": 1, "failed": 0}
    assert inserted[0][2]["tier"] == "deep"


def test_per_row_failure_marks_report_failed_and_continues(monkeypatch):
    rows = [("bad", "weekly", {}), ("good", "weekly", {})]
    conn, _inserted, sqs = _wire(monkeypatch, rows, fail_for={"bad"})
    out = sd.lambda_handler({}, None)
    assert out["due"] == 2 and out["enqueued"] == 1 and out["failed"] == 1
    assert len(sqs.sent) == 1 and sqs.sent[0]["payload"]["requested_by"] == "good"
    # the failed enqueue marks its report failed (never stuck 'running')
    assert any("status = 'failed'" in s for s in conn.sql_log)


def test_missing_queue_url_raises(monkeypatch):
    _wire(monkeypatch, [])
    monkeypatch.setattr(sd, "QUEUE_URL", "")  # simulate the env var unset
    with pytest.raises(RuntimeError):
        sd.lambda_handler({}, None)
