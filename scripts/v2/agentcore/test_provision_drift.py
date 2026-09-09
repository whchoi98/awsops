"""Regression (PR #197 round 9 MAJOR): ensure_targets must detect an IN-PLACE tool schema edit.

Drift detection used to compare tool-NAME sets only, so round 8's removal of `secret_arn` from
execute_sql's inputSchema (same tool name) was invisible and the deployed gateway kept advertising
the stale contract. Also asserts the comparison is STABLE — an unchanged catalog must not report
drift (key ordering, tool ordering, and API-echoed extra top-level fields must not thrash the
gateway).

Runs with `python3 -m unittest test_provision_drift` (no network — the control plane is a Mock).
"""
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))
import provision  # noqa: E402

_SCHEMA_NEW = {"type": "object", "properties": {"sql": {"type": "string"}}, "required": ["sql"]}
_SCHEMA_OLD = {"type": "object",
               "properties": {"sql": {"type": "string"}, "secret_arn": {"type": "string"}},
               "required": ["sql"]}

_TARGETS = {
    "rds-mcp-target": {
        "gateway": "data",
        "lambda_key": "rds-mcp",
        "description": "RDS",
        "tools": [{"name": "execute_sql", "description": "SQL", "inputSchema": _SCHEMA_NEW}],
    }
}


def _run(deployed_tools):
    ctrl = mock.Mock()
    ctrl.list_gateway_targets.return_value = {
        "items": [{"name": "rds-mcp-target", "targetId": "t-1"}]}
    ctrl.get_gateway_target.return_value = {
        "targetConfiguration": {"mcp": {"lambda": {"toolSchema": {
            "inlinePayload": deployed_tools}}}}}
    provision.report.clear()
    with mock.patch.object(provision.catalog, "TARGETS", _TARGETS):
        provision.ensure_targets(
            ctrl, {"lambda_arns": {"rds-mcp": "arn:aws:lambda:x:1:function:f"}}, {"data": "gw-1"})
    return ctrl, {r[1] for r in provision.report}


def _deployed(schema, **extra):
    """What the API echoes back: the injected target_account_id property plus any extra
    top-level fields this provisioner never sends."""
    schema = {**schema, "properties": {**schema["properties"],
                                       "target_account_id": {
                                           "type": "string",
                                           "description": "Target AWS account ID for cross-account "
                                                          "access (12 digits). Only provide when "
                                                          "instructed."}}}
    return [{"name": "execute_sql", "description": "SQL", "inputSchema": schema, **extra}]


class TestProvisionDrift(unittest.TestCase):
    def test_in_place_schema_edit_is_drift(self):
        ctrl, statuses = _run(_deployed(_SCHEMA_OLD))
        self.assertIn("UPDATED", statuses, "stale inputSchema (same tool name) must re-sync")
        ctrl.update_gateway_target.assert_called_once()

    def test_description_edit_is_drift(self):
        ctrl, statuses = _run([{**_deployed(_SCHEMA_NEW)[0], "description": "old text"}])
        self.assertIn("UPDATED", statuses)
        ctrl.update_gateway_target.assert_called_once()

    def test_unchanged_is_not_drift(self):
        ctrl, statuses = _run(_deployed(_SCHEMA_NEW))
        self.assertEqual({"EXISTS"}, statuses)
        ctrl.update_gateway_target.assert_not_called()

    def test_api_echoed_extra_top_level_fields_are_not_drift(self):
        ctrl, statuses = _run(_deployed(_SCHEMA_NEW, outputSchema=None, annotations={}))
        self.assertEqual({"EXISTS"}, statuses)
        ctrl.update_gateway_target.assert_not_called()

    def test_fingerprint_is_order_stable(self):
        a = [{"name": "b", "description": "B", "inputSchema": {"type": "object", "x": 1}},
             {"name": "a", "description": "A", "inputSchema": {"x": 1, "type": "object"}}]
        b = [{"description": "A", "inputSchema": {"type": "object", "x": 1}, "name": "a"},
             {"inputSchema": {"x": 1, "type": "object"}, "name": "b", "description": "B"}]
        self.assertEqual(provision.tool_fingerprint(a), provision.tool_fingerprint(b))


if __name__ == "__main__":
    unittest.main()
