#!/usr/bin/env bash
# Runs when Claude finishes responding. Warns if BW_SESSION is unset.

if [ -z "${BW_SESSION:-}" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"BW_SESSION not set — MCP server credential loading will fail. Run: export BW_SESSION=$(bw unlock --raw)"}}\n'
fi
