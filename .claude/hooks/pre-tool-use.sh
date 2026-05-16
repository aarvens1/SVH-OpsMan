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

# git push --force or -f
echo "$COMMAND" | grep -qE 'git push .*(--force\b| -f )' \
  && block "Force push blocked — confirm explicitly if needed."

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

# rm -rf / rm -fr (any flag order)
echo "$COMMAND" | grep -qE 'rm -[a-zA-Z]*r[a-zA-Z]*f|rm -[a-zA-Z]*f[a-zA-Z]*r' \
  && block "rm -rf blocked — confirm explicitly if needed."

# Shell reads of .env files (Read tool deny rule covers the Read tool; this covers cat/shell)
echo "$COMMAND" | grep -qE '(cat|head|tail|less|more|bat) .*\.env(\s|$)' \
  && block ".env file access blocked — credentials live in Bitwarden."

exit 0
