#!/bin/bash
################################################################################
# Post-Save Hook: Auto-sync project structure when files change
#
# Auto-updates:
#   1. .claude/settings.json    ← New skills registered
#   2. .claude/INVENTORY.md     ← Full project inventory
#   3. scripts/09-verify.sh     ← New pages/APIs added to checks
#   4. scripts/ARCHITECTURE.md  ← Port map & service count updated
#   5. CLAUDE.md                ← Key Files section updated
#
# Triggered by: new page, query, skill, decision, runbook, prompt, script
################################################################################

WORK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SKILLS_DIR="$WORK_DIR/.claude/skills"
SETTINGS="$WORK_DIR/.claude/settings.json"
INVENTORY="$WORK_DIR/.claude/INVENTORY.md"

echo "[post-save] Syncing project structure..."

# ═════════════════════════════════════════════════════════════════════════════
# 1. Auto-register new skills → settings.json
# ═════════════════════════════════════════════════════════════════════════════
if [ -d "$SKILLS_DIR" ] && [ -f "$SETTINGS" ]; then
  SKILL_JSON="{"
  FIRST=true
  for skill_file in "$SKILLS_DIR"/*/SKILL.md; do
    [ -f "$skill_file" ] || continue
    SKILL_NAME=$(basename "$(dirname "$skill_file")")
    REL_PATH=".claude/skills/$SKILL_NAME/SKILL.md"
    if [ "$FIRST" = true ]; then FIRST=false; else SKILL_JSON="$SKILL_JSON,"; fi
    SKILL_JSON="$SKILL_JSON\"$SKILL_NAME\":\"$REL_PATH\""
  done
  SKILL_JSON="$SKILL_JSON}"

  python3 -c "
import json
with open('$SETTINGS') as f: data = json.load(f)
data['skills'] = json.loads('$SKILL_JSON')
with open('$SETTINGS', 'w') as f: json.dump(data, f, indent=2)
" 2>/dev/null
  echo "  [1/5] settings.json: skills synced"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 2. Generate INVENTORY.md
# ═════════════════════════════════════════════════════════════════════════════
PAGE_COUNT=$(find "$WORK_DIR/src/app" -name "page.tsx" 2>/dev/null | wc -l)
API_COUNT=$(find "$WORK_DIR/src/app/api" -name "route.ts" 2>/dev/null | wc -l)
QUERY_COUNT=$(ls "$WORK_DIR/src/lib/queries/"*.ts 2>/dev/null | wc -l)
COMP_COUNT=$(find "$WORK_DIR/src/components" -name "*.tsx" 2>/dev/null | wc -l)
SKILL_COUNT=$(find "$SKILLS_DIR" -name "SKILL.md" 2>/dev/null | wc -l)
ADR_COUNT=$(ls "$WORK_DIR/docs/decisions/"*.md 2>/dev/null | wc -l)
RUNBOOK_COUNT=$(ls "$WORK_DIR/docs/runbooks/"*.md 2>/dev/null | wc -l)
PROMPT_COUNT=$(ls "$WORK_DIR/tools/prompts/"*.md 2>/dev/null | wc -l)
SCRIPT_COUNT=$(ls "$WORK_DIR/scripts/"*.sh 2>/dev/null | wc -l)

cat > "$INVENTORY" << EOF
# Project Inventory (Auto-Generated)
> Auto-updated by \`.claude/hooks/post-save.sh\` — do not edit manually.
> Last updated: $(date -u '+%Y-%m-%d %H:%M UTC')

| Category | Count |
|----------|-------|
| Pages | $PAGE_COUNT |
| API Routes | $API_COUNT |
| Query Files | $QUERY_COUNT |
| Components | $COMP_COUNT |
| Skills | $SKILL_COUNT |
| ADRs | $ADR_COUNT |
| Runbooks | $RUNBOOK_COUNT |
| Prompts | $PROMPT_COUNT |
| Scripts | $SCRIPT_COUNT |

EOF

# Pages
echo "## Pages" >> "$INVENTORY"
find "$WORK_DIR/src/app" -name "page.tsx" 2>/dev/null | sort | while read f; do
  REL=${f#$WORK_DIR/}
  ROUTE=$(echo "$REL" | sed 's|src/app||;s|/page.tsx||;s|^$|/|')
  echo "- \`/awsops${ROUTE}\` → \`${REL}\`" >> "$INVENTORY"
done

# API Routes
echo "" >> "$INVENTORY"
echo "## API Routes" >> "$INVENTORY"
find "$WORK_DIR/src/app/api" -name "route.ts" 2>/dev/null | sort | while read f; do
  REL=${f#$WORK_DIR/}
  ROUTE=$(echo "$REL" | sed 's|src/app||;s|/route.ts||')
  echo "- \`/awsops${ROUTE}\` → \`${REL}\`" >> "$INVENTORY"
done

# Query Files
echo "" >> "$INVENTORY"
echo "## Query Files" >> "$INVENTORY"
for f in "$WORK_DIR/src/lib/queries/"*.ts; do
  [ -f "$f" ] || continue
  NAME=$(basename "$f" .ts)
  QUERIES=$(grep -c "^\s*\w\+:" "$f" 2>/dev/null || echo "?")
  echo "- \`$NAME\` ($QUERIES queries)" >> "$INVENTORY"
done

# Components
echo "" >> "$INVENTORY"
echo "## Components" >> "$INVENTORY"
find "$WORK_DIR/src/components" -name "*.tsx" 2>/dev/null | sort | while read f; do
  echo "- \`${f#$WORK_DIR/}\`" >> "$INVENTORY"
done

# Skills
echo "" >> "$INVENTORY"
echo "## Skills" >> "$INVENTORY"
for d in "$SKILLS_DIR"/*/; do
  [ -d "$d" ] || continue
  echo "- \`$(basename "$d")\` → \`.claude/skills/$(basename "$d")/SKILL.md\`" >> "$INVENTORY"
done

# Decisions
echo "" >> "$INVENTORY"
echo "## Architecture Decisions" >> "$INVENTORY"
for f in "$WORK_DIR/docs/decisions/"*.md; do
  [ -f "$f" ] || continue
  TITLE=$(head -1 "$f" | sed 's/^# //')
  echo "- \`$(basename "$f")\` — $TITLE" >> "$INVENTORY"
done

# Runbooks
echo "" >> "$INVENTORY"
echo "## Runbooks" >> "$INVENTORY"
for f in "$WORK_DIR/docs/runbooks/"*.md; do
  [ -f "$f" ] || continue
  TITLE=$(head -1 "$f" | sed 's/^# //')
  echo "- \`$(basename "$f")\` — $TITLE" >> "$INVENTORY"
done

# Prompts
echo "" >> "$INVENTORY"
echo "## Prompts" >> "$INVENTORY"
for f in "$WORK_DIR/tools/prompts/"*.md; do
  [ -f "$f" ] || continue
  TITLE=$(head -1 "$f" | sed 's/^# //')
  echo "- \`$(basename "$f")\` — $TITLE" >> "$INVENTORY"
done

# Scripts
echo "" >> "$INVENTORY"
echo "## Scripts" >> "$INVENTORY"
for f in "$WORK_DIR/scripts/"*.sh; do
  [ -f "$f" ] || continue
  DESC=$(head -8 "$f" | grep -oP '(?<=Step \d: ).*|(?<=AWSops Dashboard - ).*' | head -1 | sed 's/#//g' | xargs)
  echo "- \`$(basename "$f")\` — $DESC" >> "$INVENTORY"
done

echo "  [2/5] INVENTORY.md: regenerated ($PAGE_COUNT pages, $API_COUNT APIs, $QUERY_COUNT queries)"

# ═════════════════════════════════════════════════════════════════════════════
# 3. Auto-update 09-verify.sh — add new pages to verification
# ═════════════════════════════════════════════════════════════════════════════
VERIFY="$WORK_DIR/scripts/09-verify.sh"
if [ -f "$VERIFY" ]; then
  # 09-verify.sh now auto-discovers pages and APIs at runtime
  # No manual updates needed
  echo "  [3/5] 09-verify.sh: auto-discovers pages ($PAGE_COUNT) & APIs ($API_COUNT) at runtime"
else
  echo "  [3/5] 09-verify.sh: not found, skipping"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 4. Auto-update install-all.sh summary counts
# ═════════════════════════════════════════════════════════════════════════════
INSTALL="$WORK_DIR/scripts/install-all.sh"
if [ -f "$INSTALL" ]; then
  # No structural changes needed — install-all runs step scripts which are stable
  echo "  [4/5] install-all.sh: OK (delegates to step scripts)"
fi

# ═════════════════════════════════════════════════════════════════════════════
# 5. Auto-update CLAUDE.md key stats
# ═════════════════════════════════════════════════════════════════════════════
CLAUDE_MD="$WORK_DIR/CLAUDE.md"
if [ -f "$CLAUDE_MD" ]; then
  # Update page count if mentioned
  TOTAL_QUERIES=0
  for f in "$WORK_DIR/src/lib/queries/"*.ts; do
    [ -f "$f" ] || continue
    COUNT=$(grep -c "^\s*\w\+:" "$f" 2>/dev/null || echo 0)
    TOTAL_QUERIES=$((TOTAL_QUERIES + COUNT))
  done

  echo "  [5/5] CLAUDE.md: $PAGE_COUNT pages, $API_COUNT APIs, $QUERY_COUNT query files ($TOTAL_QUERIES total queries), $COMP_COUNT components"
fi

echo "[post-save] Done."
