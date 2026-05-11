#!/usr/bin/env bash
# Runs at the start of every Claude Code session in this repo.
# Injects git state and Bitwarden status so Claude has immediate context.

BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
DIRTY=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

if [ -z "${BW_SESSION:-}" ]; then
  BW_STATUS="BW_SESSION not set — credentials fall back to .env"
else
  BW_STATUS="BW_SESSION active"
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Branch: %s | Uncommitted files: %s | Commits ahead of remote: %s | Bitwarden: %s"}}\n' \
  "$BRANCH" "$DIRTY" "$AHEAD" "$BW_STATUS"
