#!/usr/bin/env bash
# SVH OpsMan — WSL backup to OneDrive (comprehensive) and Google Drive (vault only)
# Requires rclone configured with remotes named "onedrive" and "gdrive".
# See docs/setup/backup.md for first-time setup.

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step() { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()   { echo -e "  ${GREEN}✓${RESET} $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "  ${RED}✗ $*${RESET}" >&2; exit 1; }

LOG_DIR="$HOME/.local/share/svh-opsman"
LOG_FILE="$LOG_DIR/backup-$(date +%Y-%m-%d).log"
mkdir -p "$LOG_DIR"

# Redirect stdout+stderr to log and terminal
exec > >(tee -a "$LOG_FILE") 2>&1
echo "=== Backup started: $(date --iso-8601=seconds) ==="

# ── preflight ─────────────────────────────────────────────────────────────────
step "Preflight checks"

command -v rclone &>/dev/null || die "rclone not found — run: sudo apt install rclone"

ONEDRIVE_OK=false
GDRIVE_OK=false

if rclone listremotes 2>/dev/null | grep -q "^onedrive:"; then
  ONEDRIVE_OK=true
  ok "onedrive remote configured"
else
  warn "onedrive remote not configured — skipping OneDrive backup"
  warn "Run: rclone config   (see docs/setup/backup.md)"
fi

if rclone listremotes 2>/dev/null | grep -q "^gdrive:"; then
  GDRIVE_OK=true
  ok "gdrive remote configured"
else
  warn "gdrive remote not configured — skipping Google Drive backup"
  warn "Run: rclone config   (see docs/setup/backup.md)"
fi

$ONEDRIVE_OK || $GDRIVE_OK || die "No remotes configured — nothing to back up"

VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
[ -d "$VAULT" ] || die "Vault not found at $VAULT"

# ── common rclone flags ───────────────────────────────────────────────────────
RCLONE_FLAGS=(
  --transfers 4
  --checkers 8
  --stats-one-line
  --stats 30s
)

# ── OneDrive — comprehensive backup ──────────────────────────────────────────
if $ONEDRIVE_OK; then
  step "OneDrive — vault"
  rclone sync "$VAULT/" onedrive:Backups/WSL/vaults/OpsManVault/ \
    --exclude ".obsidian/workspace.json" \
    --exclude ".obsidian/workspace-mobile.json" \
    "${RCLONE_FLAGS[@]}"
  ok "Vault synced"

  step "OneDrive — SSH keys"
  [ -d "$HOME/.ssh" ] && \
    rclone sync "$HOME/.ssh/" onedrive:Backups/WSL/ssh/ \
      --exclude "known_hosts" \
      "${RCLONE_FLAGS[@]}" && ok "~/.ssh synced" || warn "~/.ssh not found"

  step "OneDrive — app config"
  rclone sync "$HOME/.config/" onedrive:Backups/WSL/config/ \
    --exclude "*/Cache/**" \
    --exclude "*/cache/**" \
    --exclude "*/logs/**" \
    --exclude "*/Logs/**" \
    --exclude "*/GPUCache/**" \
    "${RCLONE_FLAGS[@]}"
  ok "~/.config synced"

  step "OneDrive — metrics database"
  DB_DIR="$HOME/SVH-OpsMan/db"
  [ -d "$DB_DIR" ] && \
    rclone sync "$DB_DIR/" onedrive:Backups/WSL/db/ "${RCLONE_FLAGS[@]}" && ok "db/ synced" || \
    warn "db/ not found — skipping"

  step "OneDrive — dotfiles"
  for f in .zshrc .bashrc .gitconfig .profile; do
    [ -f "$HOME/$f" ] && \
      rclone copyto "$HOME/$f" "onedrive:Backups/WSL/dotfiles/$f" "${RCLONE_FLAGS[@]}" && \
      ok "$f" || true
  done
fi

# ── Google Drive — vault only ─────────────────────────────────────────────────
if $GDRIVE_OK; then
  step "Google Drive — vault"
  rclone sync "$VAULT/" gdrive:Backups/OpsManVault/ \
    --exclude ".obsidian/workspace.json" \
    --exclude ".obsidian/workspace-mobile.json" \
    "${RCLONE_FLAGS[@]}"
  ok "Vault synced to Google Drive"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo -e "\n=== Backup complete: $(date --iso-8601=seconds) ==="
echo -e "${GREEN}${BOLD}All done.${RESET} Log: $LOG_FILE"
