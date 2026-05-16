#!/usr/bin/env bash
# Runs at the start of every Claude Code session in this repo.
# Injects git state, Bitwarden status, and ops context.

BRANCH=$(git branch --show-current 2>/dev/null || echo "detached")
DIRTY=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")

if [ -z "${BW_SESSION:-}" ]; then
  BW_STATUS="BW_SESSION not set — run: export BW_SESSION=\$(bw unlock --raw)"
else
  BW_STATUS="BW_SESSION active"
fi

# Ops context — vault may not be accessible in all environments
TODAY=$(date +%Y-%m-%d)
DOW=$(date +%A)
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"

BRIEFING_EXISTS="unknown"
OPEN_INCIDENTS="unknown"
LAST_BRIEFING="unknown"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
STATE_FILE="$REPO_ROOT/.claude/briefing-state"
PUSH_LOG="$REPO_ROOT/.claude/push-log"

if [ -d "$VAULT" ]; then
  [ -f "$VAULT/Briefings/Daily/$TODAY.md" ] && BRIEFING_EXISTS="yes" || BRIEFING_EXISTS="no"
  OPEN_INCIDENTS=$(ls "$VAULT/Incidents/Active/"*.md 2>/dev/null | wc -l | tr -d ' ')
  LAST_BRIEFING=$(ls "$VAULT/Briefings/Daily/"*.md 2>/dev/null | sort | tail -1 | xargs basename -s .md 2>/dev/null || echo "none")

  # Cache last-briefing date for non-WSL environments
  if [ -n "$LAST_BRIEFING" ] && [ "$LAST_BRIEFING" != "none" ]; then
    printf '%s\n' "$LAST_BRIEFING" > "$STATE_FILE" 2>/dev/null || true
  fi

  LAST_PUSH=$(tail -1 "$PUSH_LOG" 2>/dev/null || echo "none")

  # Sync reference docs so Obsidian MCP always has the latest versions
  rsync -a --delete ~/SVH-OpsMan/references/ "$VAULT/References/" 2>/dev/null || true
elif [ -f "$STATE_FILE" ]; then
  LAST_BRIEFING=$(cat "$STATE_FILE" 2>/dev/null || echo "unknown")
fi

LAST_PUSH=${LAST_PUSH:-$(tail -1 "$PUSH_LOG" 2>/dev/null || echo "none")}

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Branch: %s | Uncommitted: %s | Ahead: %s | Bitwarden: %s | Day: %s (%s) | Briefing today: %s | Open incidents: %s | Last briefing: %s | Last push: %s"}}\n' \
  "$BRANCH" "$DIRTY" "$AHEAD" "$BW_STATUS" \
  "$DOW" "$TODAY" "$BRIEFING_EXISTS" "$OPEN_INCIDENTS" "$LAST_BRIEFING" "$LAST_PUSH"
