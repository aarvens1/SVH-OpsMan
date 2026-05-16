#!/usr/bin/env bash
# Runs after every Bash tool call. Logs git push events for session-start context.

INPUT=$(cat)
COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except Exception:
    print('')
" 2>/dev/null)

# Only act on git push calls
echo "$COMMAND" | grep -qE '^git\s+push\b' || exit 0

BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -n "$REPO_ROOT" ]; then
  printf '%s branch=%s\n' "$TIMESTAMP" "$BRANCH" >> "$REPO_ROOT/.claude/push-log"
fi
