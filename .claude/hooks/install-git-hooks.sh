#!/bin/bash
# Install git hooks for the AWSops project.
# Run once after cloning: bash .claude/hooks/install-git-hooks.sh

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK_DIR="$REPO_ROOT/.git/hooks"

mkdir -p "$HOOK_DIR"

# commit-msg: Remove Co-Authored-By lines (Claude contributor)
cat > "$HOOK_DIR/commit-msg" << 'EOF'
#!/bin/bash
sed -i '/^Co-Authored-By:.*/d' "$1"
EOF
chmod +x "$HOOK_DIR/commit-msg"

echo "Git hooks installed:"
echo "  commit-msg: Remove Co-Authored-By lines"
