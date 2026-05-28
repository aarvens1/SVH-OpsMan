#!/usr/bin/env bash
# SVH OpsMan — pull latest and rebuild
# Usage: bash scripts/update.sh [--skip-pull]
# Safe to re-run at any time.

set -euo pipefail

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
die()   { echo -e "  ${RED}✗ $*${RESET}" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_PULL=false
[[ "${1:-}" == "--skip-pull" ]] && SKIP_PULL=true

# ── Load nvm so node/npm are available ───────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck source=/dev/null
[ -f "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
command -v node &>/dev/null || die "node not found — run setup.sh first"

# ── 1. Git pull ───────────────────────────────────────────────────────────────
if [ "$SKIP_PULL" = false ]; then
    step "Git pull"
    cd "$REPO_DIR"
    BEFORE=$(git rev-parse HEAD)
    git pull --rebase
    AFTER=$(git rev-parse HEAD)
    if [ "$BEFORE" = "$AFTER" ]; then
        ok "Already up to date ($(git rev-parse --short HEAD))"
    else
        CHANGED=$(git diff --name-only "$BEFORE" "$AFTER" | wc -l | tr -d ' ')
        ok "Updated $(git rev-parse --short "$BEFORE")..$(git rev-parse --short HEAD) — $CHANGED files changed"
    fi
else
    BEFORE=""
    AFTER="local"
    warn "Skipping git pull (--skip-pull)"
fi

# Helper: rebuild a subpackage, running npm ci only if lock file changed
build_pkg() {
    local dir="$1" label="$2"
    step "$label"
    cd "$REPO_DIR/$dir"

    local lock_before="" lock_after=""
    lock_before=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}' || echo "none")

    # If pull brought in lock file changes, reinstall
    if [ -n "$BEFORE" ] && git diff --name-only "$BEFORE" "$AFTER" -- "." 2>/dev/null | grep -q "package-lock.json"; then
        echo "  package-lock.json changed — running npm ci"
        npm ci --prefer-offline --loglevel=error
        ok "npm ci done"
    else
        lock_after=$(md5sum package-lock.json 2>/dev/null | awk '{print $1}' || echo "none")
        if [ "$lock_before" != "$lock_after" ]; then
            echo "  package-lock.json modified locally — running npm ci"
            npm ci --prefer-offline --loglevel=error
            ok "npm ci done"
        else
            ok "node_modules up to date (lock unchanged)"
        fi
    fi

    npm run build --silent
    ok "Build complete"
}

build_pkg "mcp-server" "MCP server"
build_pkg "collector"  "Collector"

# ── 3. Restart MCP systemd service if running ────────────────────────────────
step "Services"
if systemctl --user is-active --quiet svh-opsman-mcp 2>/dev/null; then
    systemctl --user restart svh-opsman-mcp
    sleep 1
    if systemctl --user is-active --quiet svh-opsman-mcp; then
        ok "svh-opsman-mcp restarted"
    else
        warn "svh-opsman-mcp failed to restart — check: journalctl --user -u svh-opsman-mcp -n 30"
    fi
else
    warn "svh-opsman-mcp not running (start with: systemctl --user start svh-opsman-mcp)"
fi

# Restart status-refresh daemon if it was running
if pgrep -f "dotfiles/status-refresh.sh" >/dev/null 2>&1; then
    pkill -f "dotfiles/status-refresh.sh" 2>/dev/null || true
    sleep 0.3
    nohup bash "$REPO_DIR/dotfiles/status-refresh.sh" >/dev/null 2>&1 &
    ok "Status refresh daemon restarted"
fi

echo -e "\n${GREEN}${BOLD}Done.${RESET} OpsMan is up to date and running."
