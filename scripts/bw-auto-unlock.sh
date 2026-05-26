#!/usr/bin/env bash
# Reads BW master password from Windows Credential Manager, unlocks vault,
# writes the session token to ~/.config/svh-opsman/bw-session for EnvironmentFile use.
set -euo pipefail

CONFIG_DIR="$HOME/.config/svh-opsman"
SESSION_FILE="$CONFIG_DIR/bw-session"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

BW_PASSWORD=$(powershell.exe -Command \
  "(Get-StoredCredential -Target svh-opsman).GetNetworkCredential().Password" \
  2>/dev/null | tr -d '\r')

if [[ -z "$BW_PASSWORD" ]]; then
  echo "[bw-auto-unlock] Failed to read password from Windows Credential Manager" >&2
  exit 1
fi

TOKEN=$(echo "$BW_PASSWORD" | bw unlock --raw 2>/dev/null)

if [[ -z "$TOKEN" ]]; then
  echo "[bw-auto-unlock] bw unlock failed — wrong password or vault not configured" >&2
  exit 1
fi

printf 'BW_SESSION=%s\n' "$TOKEN" > "$SESSION_FILE"
chmod 600 "$SESSION_FILE"

export BW_SESSION="$TOKEN"
echo "[bw-auto-unlock] Vault unlocked, session written to $SESSION_FILE"
