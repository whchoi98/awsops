#!/bin/bash
# Detect documentation sync needs after file changes.
# Triggered by PostToolUse (Write|Edit) events.

FILE_PATH="${1:-}"
[ -z "$FILE_PATH" ] && exit 0

# Detect missing CLAUDE.md in src/ subdirectories
if [[ "$FILE_PATH" == src/* ]]; then
    DIR=$(dirname "$FILE_PATH")
    if [ ! -f "$DIR/CLAUDE.md" ] && [ "$DIR" != "src" ]; then
        echo "[doc-sync] $DIR/CLAUDE.md is missing. Create module documentation."
    fi
fi

# Alert if no ADRs exist when source or architecture files change
if [[ "$FILE_PATH" == src/* ]] || [[ "$FILE_PATH" == docs/architecture.md ]]; then
    ADR_COUNT=$(find docs/decisions -name 'ADR-*.md' 2>/dev/null | wc -l)
    if [ "$ADR_COUNT" -eq 0 ]; then
        echo "[doc-sync] No ADRs found. Record architectural decisions."
    fi
fi
