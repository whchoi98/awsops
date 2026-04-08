#!/bin/bash
# Validate agent YAML files define required contract fields
cd "$(dirname "$0")/../.."

pass() { echo "ok - $1"; }
fail() { echo "not ok - $1"; }

echo "# Agent contract validation"

for agent in .claude/agents/*.yml; do
  [ ! -f "$agent" ] && continue
  NAME=$(basename "$agent" .yml)

  # Check required fields exist
  if grep -q "^name:" "$agent"; then
    pass "$NAME has name field"
  else
    fail "$NAME missing name field"
  fi

  if grep -q "^description:" "$agent"; then
    pass "$NAME has description field"
  else
    fail "$NAME missing description field"
  fi

  if grep -q "^model:" "$agent"; then
    pass "$NAME has model field"
  else
    fail "$NAME missing model field"
  fi

  if grep -q "^tools:" "$agent"; then
    pass "$NAME has tools field"
  else
    fail "$NAME missing tools field"
  fi

  # Check output_schema exists (contract)
  if grep -q "output_schema:" "$agent"; then
    pass "$NAME has output_schema (contract defined)"
  else
    fail "$NAME missing output_schema"
  fi

  # Check input block exists
  if grep -q "^input:" "$agent"; then
    pass "$NAME has input block"
  else
    fail "$NAME missing input block"
  fi

  # Check Bash tool is NOT in tools list (least privilege)
  if grep -A5 "^tools:" "$agent" | grep -q "Bash"; then
    fail "$NAME has Bash tool (should be read-only)"
  else
    pass "$NAME uses read-only tools only"
  fi

  # Check prompt exists
  if grep -q "^prompt:" "$agent"; then
    pass "$NAME has prompt"
  else
    fail "$NAME missing prompt"
  fi
done

# Verify at least 1 agent exists
AGENT_COUNT=$(ls .claude/agents/*.yml 2>/dev/null | wc -l)
if [ "$AGENT_COUNT" -ge 1 ]; then
  pass "At least 1 agent file exists ($AGENT_COUNT found)"
else
  fail "No agent files found"
fi
