#!/usr/bin/env bash
# Launch the SVH PowerShell TUI.
# Requires: BW_SESSION set, pwsh installed, python3 + textual available.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check BW_SESSION
if [ -z "${BW_SESSION:-}" ]; then
  echo "❌  BW_SESSION is not set." >&2
  echo "    Unlock Bitwarden first:" >&2
  echo "" >&2
  echo "    export BW_SESSION=\$(bw unlock --raw)" >&2
  exit 1
fi

# Check pwsh
if ! command -v pwsh &>/dev/null; then
  echo "❌  PowerShell (pwsh) is not installed." >&2
  echo "    Install it from: https://aka.ms/install-powershell" >&2
  exit 1
fi

# Check Python + textual
if ! python3 -c "import textual" &>/dev/null; then
  echo "❌  Python package 'textual' is not installed." >&2
  echo "    Run: pip install textual" >&2
  exit 1
fi

cd "$REPO_DIR"
exec python3 -m tui
