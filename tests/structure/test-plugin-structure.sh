#!/bin/bash
# Validate AWSops project structure integrity
cd "$(dirname "$0")/../.."

pass() { echo "ok - $1"; }
fail() { echo "not ok - $1"; }

echo "# Project structure validation"

# Required directories
for dir in src/app src/lib src/components agent infra-cdk scripts docs docs/decisions docs/runbooks; do
  [ -d "$dir" ] && pass "Dir exists: $dir" || fail "Dir missing: $dir"
done

# Required config files
for f in next.config.mjs tailwind.config.ts tsconfig.json .eslintrc.json; do
  [ -f "$f" ] && pass "Config exists: $f" || fail "Config missing: $f"
done

# Skills registered in settings.json
echo "# Skill registration"
if [ -f ".claude/settings.json" ]; then
  for skill in code-review refactor release sync-docs; do
    if grep -q "\"$skill\"" .claude/settings.json; then
      pass "Skill registered: $skill"
    else
      fail "Skill not registered: $skill"
    fi
  done
fi

# Verify basePath in next.config
echo "# Next.js config"
if grep -q "basePath.*awsops" next.config.mjs; then
  pass "basePath set to /awsops"
else
  fail "basePath not set to /awsops"
fi

# Agent module
echo "# Agent module"
[ -f "agent/agent.py" ] && pass "agent.py exists" || fail "agent.py missing"
[ -f "agent/Dockerfile" ] && pass "Dockerfile exists" || fail "Dockerfile missing"

LAMBDA_COUNT=$(ls agent/lambda/*.py 2>/dev/null | wc -l)
[ "$LAMBDA_COUNT" -ge 15 ] && pass "Lambda files: $LAMBDA_COUNT (expected >= 15)" || fail "Lambda files: $LAMBDA_COUNT"
