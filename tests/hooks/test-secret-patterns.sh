#!/bin/bash
# Test that secret patterns are detected / not false-positived
cd "$(dirname "$0")/../.."

pass() { echo "ok - $1"; }
fail() { echo "not ok - $1"; }

HOOK=".claude/hooks/secret-scan.sh"

if [ ! -f "$HOOK" ]; then
  echo "# Skipping secret pattern tests — $HOOK not found"
  exit 0
fi

echo "# Secret pattern true positives"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  [[ "$line" == \#* ]] && continue
  if echo "$line" | bash "$HOOK" >/dev/null 2>&1; then
    fail "Should detect: $line"
  else
    pass "Detected: ${line:0:30}..."
  fi
done < tests/fixtures/secret-samples.txt

echo "# Secret pattern false positives"
while IFS= read -r line; do
  [ -z "$line" ] && continue
  [[ "$line" == \#* ]] && continue
  if echo "$line" | bash "$HOOK" >/dev/null 2>&1; then
    pass "Allowed: ${line:0:30}..."
  else
    fail "False positive: $line"
  fi
done < tests/fixtures/false-positives.txt
