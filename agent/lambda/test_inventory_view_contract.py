"""The sql_reader views and the inventory-read connector are one contract — pin it.

A previous revision removed `data`/`meta` from the views to close a JSONB fail-open hole and broke
`find_unused_resources`, `query_inventory` and `get_topology` at runtime: the connector selects those
columns, the reader role resolves the unqualified table name to the view, and Postgres answered
"column data does not exist". Nothing caught it, because the connector's unit tests mock `_execute`
and so never exercise the view/role contract at all (PR #197 review CRITICAL).

A real end-to-end check needs a live cluster and the reader role, which CI does not have. What CI can
do is refuse the drift that caused the outage: every key the connector projects must be exposed by
the view, and the row-copy key must never be. These assertions read the migration text, so they fail
on either side of the contract moving.
"""
import os
import re
import unittest

import inventory_read_mcp as inv

MIGRATION = os.path.join(
    os.path.dirname(__file__), "..", "..", "terraform", "v2", "foundation", "migrations",
    "01KYVY9J2E8AMF35WR4J7036A3_agent_sql_reader_role.sql")


def _entries():
    """Every (table, column-list) pair the migration's VALUES list declares.

    Parsed by walking the quoting rather than by one big regex: the column list may be a chain of
    '…' fragments OR a $$…$$ block, and the earlier single-regex version was fragile enough that
    three panel models flagged it — and, worse, it happily matched a migration whose SQL did not
    parse at all, because matching text says nothing about validity (PR #197 review).
    """
    src = open(MIGRATION, encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"\(\s*'([a-z_]+)'\s*,\s*", src):
        table, i = m.group(1), m.end()
        m2 = re.match(r"\$([A-Za-z_]*)\$", src[i:])
        if m2:
            tag = m2.group(0)
            j = src.index(tag, i + len(tag))
            out[table] = src[i + len(tag):j]
        elif src[i] == "'":
            # chain of adjacent single-quoted fragments
            frags, k = [], i
            while k < len(src) and src[k] == "'":
                e = src.index("'", k + 1)
                frags.append(src[k + 1:e])
                k = e + 1
                while k < len(src) and src[k] in " \t\r\n":
                    k += 1
            out[table] = "".join(frags)
    return out


def _view_columns(table):
    """The column-list literal the migration builds this view from."""
    e = _entries()
    assert table in e, "no view definition for " + table
    return e[table]


def _sql_literal_is_intact(raw_src, table):
    """A '…'-quoted column list must not contain an unescaped quote.

    This is the failure that shipped: the projection was written inside a '…' literal while
    containing ARRAY['key',…], so the literal ENDED at the first inner quote and the migration would
    not have parsed. $$…$$ entries are immune, which is why the file uses them.
    """
    m = re.search(r"\(\s*'" + re.escape(table) + r"'\s*,\s*(\$[A-Za-z_]*\$)?", raw_src)
    assert m, table
    return m.group(1) is not None or "ARRAY[" not in _view_columns(table)


def _allowlisted_keys(table):
    """Keys named in the view's jsonb_object_agg ... k = ANY(ARRAY[...]) projection."""
    cols = _view_columns(table)
    m = re.search(r"k = ANY\(ARRAY\[(.*?)\]\)", cols, re.S)
    if not m:
        return set()
    return set(re.findall(r"'([^']+)'", m.group(1)))


class TestInventoryViewContract(unittest.TestCase):
    def test_every_projected_key_is_exposed_by_the_view(self):
        exposed = _allowlisted_keys("inventory_resources")
        self.assertTrue(exposed, "inventory_resources view exposes no projected data keys")
        for rtype, keys in inv.PROJECTIONS.items():
            for k in keys:
                self.assertIn(k, exposed,
                              f"PROJECTIONS[{rtype!r}] asks for data->{k!r} but the sql_reader view "
                              f"does not expose it — the connector would read null under the reader "
                              f"role. Add it to the migration's allowlist (a rule-3 widening) or stop "
                              f"projecting it.")

    def test_the_row_copy_key_is_never_exposed(self):
        # flow-topology.ts stores the ENTIRE source row under meta.row; exposing it would re-expose
        # every column the views deliberately omit.
        self.assertNotIn("row", _allowlisted_keys("topology_nodes"))

    def test_neither_jsonb_column_is_selected_raw(self):
        # A bare `data` / `meta` in the column list (not inside a projection) is the fail-open shape.
        for table, col in (("inventory_resources", "data"), ("topology_nodes", "meta")):
            cols = _view_columns(table)
            # Strip the projection expression itself (it legitimately ends "…)) AS data"), which
            # spans several quoted SQL fragments, then look for a bare mention in what is left.
            bare = re.sub(r"\(SELECT.*?AS\s+" + col, "", cols, flags=re.S)
            self.assertNotRegex(bare, r"(^|[,\s'])" + col + r"($|[,\s'])",
                                f"{table}.{col} appears to be selected raw — INVARIANT rule 5")

    def test_the_views_still_carry_the_columns_the_connector_selects(self):
        # The outage was a missing column, so assert presence explicitly rather than inferring it.
        for table, needed in (
            ("inventory_resources", ["resource_type", "account_id", "resource_id", "data"]),
            ("topology_nodes", ["account_id", "id", "kind", "label", "class", "meta"]),
        ):
            cols = _view_columns(table)
            for c in needed:
                self.assertIn(c, cols, f"{table} view lost {c!r}, which inventory_read_mcp selects")


    def test_a_projection_is_dollar_quoted_so_its_inner_quotes_survive(self):
        # The shipped bug: ARRAY['k',…] inside a '…' column list terminates the literal and the
        # migration does not parse. Text-matching tests cannot see that, so assert the quoting choice.
        src = open(MIGRATION, encoding="utf-8").read()
        for table in ("inventory_resources", "topology_nodes"):
            self.assertTrue(_sql_literal_is_intact(src, table),
                            f"{table}'s column list embeds SQL literals inside a '…' string — use "
                            f"$$…$$ (PR #197 review CRITICAL)")

    def test_customheaders_never_appears_in_the_origins_projection(self):
        """`origins` IS on the allowlist (PR #197 review MAJOR: dropping it broke the CloudFront
        "empty origin" finding, which reads only origin.DomainName). What must never survive is
        CustomHeaders[].HeaderValue — the origin secret. The column-list SQL builds each origins[]
        element with a per-key CASE, not a blanket pass-through; assert that shape rather than a key
        name, since "origins is absent" is no longer the invariant this migration holds."""
        cols = _view_columns("inventory_resources")
        self.assertIn("origins", _allowlisted_keys("inventory_resources"))
        self.assertNotIn("CustomHeaders", cols)
        self.assertNotIn("custom_headers", cols.lower().replace("customheaders", ""))
        # The transform must be a per-element rebuild keyed to exactly one field, not a pass-through
        # of the raw array (which is what would let CustomHeaders back in).
        self.assertRegex(cols, r"jsonb_build_object\('DomainName'")
        self.assertRegex(cols, r"CASE WHEN k = 'origins'")

    def test_inventory_read_mcp_projections_keeps_origins_on_the_cloudfront_list(self):
        # The connector-side allowlist must ask for the key the view now safely exposes — otherwise
        # the fix on the SQL side is inert.
        self.assertIn("origins", inv.PROJECTIONS.get("cloudfront", []))


    def test_every_do_block_closes_where_it_should(self):
        """Pair the BARE $$ delimiters in order; each DO block must end at its own END.

        The failure this catches: a bare $$ used for a column list inside `DO $$ … $$` closes the
        block early, so everything after it is parsed as top-level SQL and the file is invalid
        (codex stop-gate). An earlier version of this test looked for "a bare $$ between DO $$ and
        the next $$", which models the bug as if it were correct — the next $$ IS the premature
        close. Pairing the delimiters and checking where each block actually ends is the property.
        """
        src = open(MIGRATION, encoding="utf-8").read()
        # Remove TAGGED dollar-quoted regions ($cols$ … $cols$) — those nest legally.
        stripped = re.sub(r"\$([A-Za-z_]+)\$.*?\$\1\$", "", src, flags=re.S)
        parts = stripped.split("$$")
        self.assertEqual(len(parts) % 2, 1,
                         "odd number of bare $$ delimiters — one is unclosed")
        for k in range(1, len(parts), 2):          # parts[k] = inside a $$ … $$ region
            body = parts[k].strip()
            opener = parts[k - 1].rstrip().split("\n")[-1].strip()
            if opener.upper().endswith("DO"):
                self.assertRegex(
                    body, r"END\s*;?\s*$",
                    "a DO $$ … $$ block does not end at its own END — a bare $$ inside it closed "
                    "it early; use a tagged quote like $cols$")


if __name__ == "__main__":
    unittest.main()
