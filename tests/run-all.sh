#!/bin/bash
# AWSops test runner — TAP-style output
# Usage: bash tests/run-all.sh

set -euo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
TOTAL=0

pass() { TOTAL=$((TOTAL+1)); PASS=$((PASS+1)); echo "ok $TOTAL - $1"; }
fail() { TOTAL=$((TOTAL+1)); FAIL=$((FAIL+1)); echo "not ok $TOTAL - $1"; }

echo "TAP version 13"
echo "# AWSops Project Structure Tests"
echo ""

# ── Hook Tests ──
echo "# Hook tests"
for f in tests/hooks/test-*.sh; do
  [ -f "$f" ] && bash "$f"
done

# ── Structure Tests ──
echo "# Structure tests"
for f in tests/structure/test-*.sh; do
  [ -f "$f" ] && bash "$f"
done

# ── Core Structure Assertions ──
echo "# Core structure"

[ -f "CLAUDE.md" ] && pass "CLAUDE.md exists" || fail "CLAUDE.md missing"
[ -f "package.json" ] && pass "package.json exists" || fail "package.json missing"
[ -f "next.config.mjs" ] && pass "next.config.mjs exists" || fail "next.config.mjs missing"
[ -f "docs/architecture.md" ] && pass "docs/architecture.md exists" || fail "docs/architecture.md missing"
[ -f ".claude/settings.json" ] && pass ".claude/settings.json exists" || fail ".claude/settings.json missing"

# Check all src/ subdirs have CLAUDE.md
MISSING_DOCS=0
for dir in src/lib src/app src/components; do
  if [ -d "$dir" ] && [ ! -f "$dir/CLAUDE.md" ]; then
    fail "$dir/CLAUDE.md missing"
    MISSING_DOCS=$((MISSING_DOCS+1))
  else
    pass "$dir/CLAUDE.md exists"
  fi
done

# Check ADR count
ADR_COUNT=$(find docs/decisions -name '*.md' -not -name '.template.md' 2>/dev/null | wc -l)
[ "$ADR_COUNT" -ge 1 ] && pass "ADRs exist ($ADR_COUNT found)" || fail "No ADRs found"

# Check page count
PAGE_COUNT=$(find src/app -name 'page.tsx' 2>/dev/null | wc -l)
[ "$PAGE_COUNT" -ge 30 ] && pass "Pages: $PAGE_COUNT (expected >= 30)" || fail "Pages: $PAGE_COUNT (expected >= 30)"

# Check API route count
API_COUNT=$(find src/app/api -name 'route.ts' 2>/dev/null | wc -l)
[ "$API_COUNT" -ge 10 ] && pass "API routes: $API_COUNT (expected >= 10)" || fail "API routes: $API_COUNT (expected >= 10)"

# Check query file count
QUERY_COUNT=$(find src/lib/queries -name '*.ts' -not -name 'CLAUDE.md' 2>/dev/null | wc -l)
[ "$QUERY_COUNT" -ge 20 ] && pass "Query files: $QUERY_COUNT (expected >= 20)" || fail "Query files: $QUERY_COUNT (expected >= 20)"

echo ""
echo "# Results: $PASS passed, $FAIL failed, $TOTAL total"
echo "1..$TOTAL"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
