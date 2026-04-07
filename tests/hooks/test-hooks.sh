#!/bin/bash
# Test hook existence, permissions, and registration
cd "$(dirname "$0")/../.."

pass() { echo "ok - $1"; }
fail() { echo "not ok - $1"; }

echo "# Hook existence and permissions"

# Required hooks
for hook in check-doc-sync.sh accumulate-pending-guides.sh; do
  if [ -f ".claude/hooks/$hook" ]; then
    pass "Hook exists: $hook"
    if [ -r ".claude/hooks/$hook" ]; then
      pass "Hook readable: $hook"
    else
      fail "Hook not readable: $hook"
    fi
  else
    fail "Hook missing: $hook"
  fi
done

# Verify settings.json registers hooks
echo "# Hook registration in settings.json"
if [ -f ".claude/settings.json" ]; then
  if grep -q "PostToolUse" .claude/settings.json; then
    pass "PostToolUse hooks registered"
  else
    fail "PostToolUse hooks not registered"
  fi

  if grep -q "check-doc-sync" .claude/settings.json; then
    pass "check-doc-sync hook registered"
  else
    fail "check-doc-sync hook not registered"
  fi
else
  fail ".claude/settings.json missing"
fi
