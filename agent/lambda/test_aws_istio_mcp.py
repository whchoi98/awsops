"""Tests for aws_istio_mcp (Steampipe CRD-table variant) — the namespace argument is the only
caller-controlled value that reaches SQL, so pin both layers of the guard: it must arrive as a
bound %s parameter (never interpolated into the SQL string), and non-RFC-1123 input must 400
before run_sql is reached. pg8000 is stubbed via sys.modules (no live Steampipe), mirroring the
other lambda test loaders."""
import json
import os
import sys
import types
import unittest
from unittest import mock

sys.modules.setdefault("pg8000", types.SimpleNamespace(connect=lambda **kw: None))
sys.path.insert(0, os.path.dirname(__file__))
import aws_istio_mcp as im  # noqa: E402


class TestNamespaceGuard(unittest.TestCase):
    def _call(self, tool, **args):
        with mock.patch.object(im, "run_sql",
                               side_effect=lambda sql, params=None: {"sql": sql, "rows": [], "count": 0}) as rs:
            out = im.lambda_handler({"tool_name": tool, "arguments": args}, None)
        return out, rs

    def test_valid_namespace_binds_as_parameter(self):
        out, rs = self._call("list_virtual_services", namespace="bookinfo-prod")
        self.assertEqual(out["statusCode"], 200)
        sql, params = rs.call_args[0][0], rs.call_args[0][1]
        self.assertIn("WHERE namespace = %s", sql)
        self.assertNotIn("bookinfo-prod", sql)  # value never lands in the SQL string
        self.assertEqual(params, ("bookinfo-prod",))

    def test_sidecar_join_binds_parameter_on_both_pod_queries(self):
        out, rs = self._call("check_sidecar_injection", namespace="bookinfo-prod")
        self.assertEqual(out["statusCode"], 200)
        bound = [c.args for c in rs.call_args_list if len(c.args) > 1 and c.args[1]]
        self.assertEqual(len(bound), 2)  # podsWithSidecar + podsWithoutSidecar
        for sql, params in bound:
            self.assertIn("= %s", sql)
            self.assertNotIn("bookinfo-prod", sql)
            self.assertEqual(params, ("bookinfo-prod",))

    def test_injection_string_is_rejected_before_sql(self):
        out, rs = self._call("list_virtual_services", namespace="x' UNION SELECT usename, passwd, '' FROM pg_shadow --")
        self.assertEqual(out["statusCode"], 400)
        self.assertIn("invalid namespace", json.loads(out["body"])["error"])
        rs.assert_not_called()

    def test_non_label_chars_rejected(self):
        for bad in ("Bookinfo", "book_info", "-lead", "trail-", "a" * 64):
            out, rs = self._call("list_destination_rules", namespace=bad)
            self.assertEqual(out["statusCode"], 400, bad)
            rs.assert_not_called()

    def test_empty_namespace_means_no_filter(self):
        out, rs = self._call("list_service_entries")
        self.assertEqual(out["statusCode"], 200)
        self.assertNotIn("WHERE namespace", rs.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
