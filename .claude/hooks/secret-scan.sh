#!/bin/bash
# PreToolUse hook: scan file content for secrets before committing
# Blocks Write/Edit if content contains AWS keys, passwords, or tokens

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && exit 0

# Skip non-source files
case "$FILE_PATH" in
  *.md|*.txt|*.json|*.yml|*.yaml|*.sh) ;;
  *.ts|*.tsx|*.js|*.jsx|*.py) ;;
  *) exit 0 ;;
esac

# Skip test fixtures and examples
case "$FILE_PATH" in
  */fixtures/*|*.example|*.sample) exit 0 ;;
esac

# Check for common secret patterns
if [ -f "$FILE_PATH" ]; then
  # AWS Access Key ID (starts with AKIA)
  if grep -qP 'AKIA[0-9A-Z]{16}' "$FILE_PATH" 2>/dev/null; then
    echo "[secret-scan] Potential AWS Access Key detected in $FILE_PATH"
    exit 1
  fi

  # AWS Secret Access Key (40 char base64)
  if grep -qP 'aws_secret_access_key\s*=\s*[A-Za-z0-9/+=]{40}' "$FILE_PATH" 2>/dev/null; then
    echo "[secret-scan] Potential AWS Secret Key detected in $FILE_PATH"
    exit 1
  fi

  # Generic password assignment with actual value
  if grep -qP '(password|secret|token)\s*[:=]\s*["\x27][^"\x27]{8,}["\x27]' "$FILE_PATH" 2>/dev/null; then
    # Exclude known safe patterns
    if ! grep -qP '(steampipe|example|placeholder|XXXXX|REGION|ACCOUNT|process\.env)' "$FILE_PATH" 2>/dev/null; then
      echo "[secret-scan] Potential secret detected in $FILE_PATH"
      exit 1
    fi
  fi
fi

exit 0
