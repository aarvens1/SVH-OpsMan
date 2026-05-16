#!/usr/bin/env bash
# Runs before every Desktop Commander MCP tool call.
# Targeted blocks only: SVH scripts (must go through TUI for confirmation),
# credential access patterns, and .env reads.
# Everything else — WSL, Windows filesystem, file writes, diagnostics — is allowed.

set -uo pipefail

INPUT=$(cat)

# ── Parse tool name and primary value ─────────────────────────────────────────

read -r TOOL_NAME VALUE <<< "$(printf '%s' "$INPUT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    name = d.get('tool_name', '')
    inp  = d.get('tool_input', {})
    val  = ''
    for key in ('command', 'path', 'source_path', 'destination_path', 'directory', 'content'):
        if key in inp:
            val = str(inp[key])
            break
    # Newlines in value would break read -r; collapse to spaces
    val = val.replace('\n', ' ')
    print(name, val)
except Exception:
    print('', '')
" 2>/dev/null)"

block() {
    printf '{"decision":"block","reason":"%s"}\n' "$1"
    exit 2
}

# ── execute_command ────────────────────────────────────────────────────────────

if echo "$TOOL_NAME" | grep -qi "execute_command"; then

    # Block running SVH scripts directly — these must go through the TUI
    # so that destructive commands get the confirmation step
    echo "$VALUE" | grep -qiE \
        'connect\.ps1|rolling-cluster-reboot|Connect-ClusterReboot|run-tui\.sh|python3.*-m\s+tui' \
        && block "Desktop Commander cannot run SVH scripts directly. Use the TUI (./run-tui.sh) which enforces confirmation for destructive commands."

    # Block inline module loading
    echo "$VALUE" | grep -qiE \
        'Import-Module\s+SVH|SVH\.[A-Za-z]+\.psm1|\.\s+\./connect\.ps1|dot-source.*connect' \
        && block "Desktop Commander cannot load SVH modules directly. Use the TUI (./run-tui.sh)."

    # Block setup scripts (one-time provisioning — never autonomous)
    echo "$VALUE" | grep -qiE 'setup-graph-apps|setup-exchange-policy|setup-azure-arm' \
        && block "Setup scripts must be run manually — never via Desktop Commander."

    # Block credential access from shell
    echo "$VALUE" | grep -qiE 'bw\s+(unlock|get|list)\b|BW_SESSION\s*=' \
        && block "Desktop Commander cannot access Bitwarden credentials. BW_SESSION is set in the shell environment."

    # Block shell reads of .env files
    echo "$VALUE" | grep -qiE '(cat|Get-Content|type)\s+[^\n]*\.env\b' \
        && block ".env access blocked — credentials live in Bitwarden, not .env."

fi

# ── read_file ──────────────────────────────────────────────────────────────────

if echo "$TOOL_NAME" | grep -qi "read_file"; then

    # No .env reads
    echo "$VALUE" | grep -qiE '(^|/)\.env$|(^|[/\\])\.env\b' \
        && block ".env file reads blocked — credentials live in Bitwarden."

    # No MCP server build output or compiled secrets
    echo "$VALUE" | grep -qiE 'mcp-server/\.env|mcp-server/dist/' \
        && block "MCP server internals are not accessible via Desktop Commander."

fi

exit 0
