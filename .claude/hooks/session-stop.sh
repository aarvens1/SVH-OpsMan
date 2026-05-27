#!/usr/bin/env bash
# Runs at the end of each Claude agent turn.
# Keeps .gemini/session-state.md current for Gemini context pickup.

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
STATE_FILE="$REPO_ROOT/.gemini/session-state.md"
TIMESTAMP=$(TZ='America/Los_Angeles' date '+%Y-%m-%d %H:%M %Z')
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
DIRTY=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "none")
CHANGED_FILES=$(git status --short 2>/dev/null | awk '{print $2}' | head -5 | tr '\n' ' ')

mkdir -p "$REPO_ROOT/.gemini"

cat > "$STATE_FILE" << EOF
# Session State
Last updated: $TIMESTAMP

## Git
- Branch: $BRANCH
- Uncommitted files: $DIRTY
- Commits ahead: $AHEAD
- Last commit: $LAST_COMMIT
- Changed: ${CHANGED_FILES:-none}
EOF
