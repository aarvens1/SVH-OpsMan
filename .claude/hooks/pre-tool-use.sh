#!/usr/bin/env bash
# Runs before every Bash tool call. Blocks destructive shell patterns.

INPUT=$(cat)

# Parse the command and strip quoted string contents so patterns in commit
# messages, heredocs, or other string arguments don't trigger false positives.
COMMAND=$(printf '%s' "$INPUT" | python3 -c "
import sys, json, re
try:
    d = json.load(sys.stdin)
    cmd = d.get('tool_input', {}).get('command', '')
    # Strip contents of double and single quoted strings
    cmd = re.sub(r'\"[^\"\\\\]*(?:\\\\.[^\"\\\\]*)*\"', '\"\"', cmd)
    cmd = re.sub(r\"'[^'\\\\]*(?:\\\\.[^'\\\\]*)*'\", \"''\", cmd)
    print(cmd)
except Exception:
    print('')
" 2>/dev/null)

block() {
  printf '{"decision":"block","reason":"%s"}\n' "$1"
  exit 2
}

# ── Always-on blocks (never bypassed) ─────────────────────────────────────────

# git push --force or -f
echo "$COMMAND" | grep -qE 'git push .*(--force\b| -f )' \
  && block "Force push blocked — confirm explicitly if needed."

# Shell reads of .env files
echo "$COMMAND" | grep -qE '(cat|head|tail|less|more|bat) .*\.env(\s|$)' \
  && block ".env file access blocked — credentials live in Bitwarden."

# Shell writes to .env files
echo "$COMMAND" | grep -qiE '(echo|printf|tee)\s.*>\s*[^>]*\.env\b' \
  && block "Shell writes to .env blocked — credentials live in Bitwarden."

# SQL destructive statements
echo "$COMMAND" | grep -qiE '\b(DROP\s+(TABLE|DATABASE|SCHEMA|INDEX)|TRUNCATE\s+TABLE)\b' \
  && block "Destructive SQL blocked — confirm explicitly if needed."

# Windows disk format
echo "$COMMAND" | grep -qiE '\bformat\s+[a-zA-Z]:\b|\bFormat-Volume\b' \
  && block "Disk format command blocked — confirm explicitly if needed."

# ── Dev mode bypass (set CLAUDE_DEV_MODE=1 to skip workflow blocks) ───────────
# Start a dev session: CLAUDE_DEV_MODE=1 claude  (or alias: opsman-dev)
[ "${CLAUDE_DEV_MODE:-}" = "1" ] && exit 0

# ── Workflow blocks (ops sessions only) ───────────────────────────────────────

# git reset --hard
echo "$COMMAND" | grep -qE 'git reset .*--hard' \
  && block "git reset --hard blocked — confirm explicitly if needed."

# git checkout -- <pathspec> (discard working-tree changes)
echo "$COMMAND" | grep -qE 'git checkout -- ' \
  && block "git checkout -- (discard changes) blocked — confirm explicitly if needed."

# git clean -f / -fd / -fx (remove untracked files)
echo "$COMMAND" | grep -qE 'git clean .*-[a-zA-Z]*f' \
  && block "git clean blocked — confirm explicitly if needed."

# git restore without --staged (discards working-tree changes)
echo "$COMMAND" | grep -qE 'git restore [^-]' \
  && block "git restore (discard changes) blocked — use --staged to unstage, or confirm explicitly."

# rm -rf — allow common dev artifact dirs, block everything else
if echo "$COMMAND" | grep -qE 'rm -[a-zA-Z]*r[a-zA-Z]*f|rm -[a-zA-Z]*f[a-zA-Z]*r'; then
  echo "$COMMAND" | grep -qE 'rm -r[a-zA-Z]* (dist|node_modules|build|coverage|\.next|\.turbo|tmp|cache|out|\.cache|\.tmp|test-output|__pycache__|\.pytest_cache)(/|$)' \
    || block "rm -rf blocked — confirm explicitly if needed."
fi

exit 0
