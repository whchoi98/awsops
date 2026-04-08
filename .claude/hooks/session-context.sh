#!/bin/bash
# SessionStart hook: load project context at session start
# Outputs key project stats for Claude's context window

cd "$(dirname "$0")/../.." 2>/dev/null || exit 0

echo "# AWSops Dashboard v1.7.0"
echo ""

# Git branch and recent changes
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "no commits")
echo "Branch: $BRANCH | Last: $LAST_COMMIT"

# Quick project stats
PAGE_COUNT=$(find src/app -name 'page.tsx' 2>/dev/null | wc -l)
API_COUNT=$(find src/app/api -name 'route.ts' 2>/dev/null | wc -l)
QUERY_COUNT=$(find src/lib/queries -name '*.ts' -not -name 'CLAUDE.md' 2>/dev/null | wc -l)
ADR_COUNT=$(find docs/decisions -name '*.md' -not -name '.template.md' 2>/dev/null | wc -l)
echo "Pages: $PAGE_COUNT | APIs: $API_COUNT | Queries: $QUERY_COUNT | ADRs: $ADR_COUNT"

# Unstaged changes warning
CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -gt 0 ]; then
  echo "Uncommitted changes: $CHANGES files"
fi
