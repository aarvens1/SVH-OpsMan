#!/usr/bin/env bash
# SVH OpsMan — fresh WSL bootstrap
# Run once on a new WSL Ubuntu install. Safe to re-run (idempotent checks throughout).
# Usage: bash scripts/setup.sh

set -euo pipefail

# ── colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

step()  { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "  ${GREEN}✓${RESET} $*"; }
warn()  { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
die()   { echo -e "  ${RED}✗ $*${RESET}" >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 1. system packages ────────────────────────────────────────────────────────
step "System packages"
PKGS=(curl git unzip jq build-essential ca-certificates python3-pip)
MISSING=()
for pkg in "${PKGS[@]}"; do
  dpkg -s "$pkg" &>/dev/null || MISSING+=("$pkg")
done
if [ ${#MISSING[@]} -gt 0 ]; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq "${MISSING[@]}"
  ok "Installed: ${MISSING[*]}"
else
  ok "All system packages present"
fi

# ── 2. Node.js 20 LTS via nvm ─────────────────────────────────────────────────
step "Node.js 20 LTS (nvm)"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -f "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  ok "nvm installed"
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

CURRENT_NODE=$(node --version 2>/dev/null || echo "none")
if [[ "$CURRENT_NODE" != v20* ]]; then
  nvm install 20
  nvm use 20
  nvm alias default 20
  ok "Node $(node --version) set as default"
else
  ok "Node $CURRENT_NODE already active"
fi

# ── 3. Bitwarden CLI ──────────────────────────────────────────────────────────
step "Bitwarden CLI"
if ! command -v bw &>/dev/null; then
  BW_VERSION=$(curl -fsSL https://api.github.com/repos/bitwarden/clients/releases \
    | jq -r '[.[] | select(.tag_name | startswith("cli-v"))] | first | .tag_name | ltrimstr("cli-v")')
  BW_URL="https://github.com/bitwarden/clients/releases/download/cli-v${BW_VERSION}/bw-linux-${BW_VERSION}.zip"
  curl -fsSL "$BW_URL" -o /tmp/bw.zip
  unzip -qo /tmp/bw.zip -d /tmp/bw
  chmod +x /tmp/bw/bw
  sudo mv /tmp/bw/bw /usr/local/bin/bw
  rm -rf /tmp/bw /tmp/bw.zip
  ok "Bitwarden CLI $(bw --version) installed"
else
  ok "Bitwarden CLI $(bw --version) already installed"
fi

# ── 4. GitHub SSH key ────────────────────────────────────────────────────────
step "GitHub SSH key"
SSH_KEY="$HOME/.ssh/id_ed25519"
if [ ! -f "$SSH_KEY" ]; then
  ssh-keygen -t ed25519 -C "astevens@shoestringvalley.com" -f "$SSH_KEY" -N ""
  ok "SSH key generated: $SSH_KEY"
  echo -e "\n  ${YELLOW}Action required:${RESET} add this public key to github.com/settings/keys"
  echo -e "  ${BOLD}$(cat "${SSH_KEY}.pub")${RESET}\n"
else
  ok "SSH key already exists: $SSH_KEY"
fi

# Ensure github.com is a known host (avoids interactive prompt on first push)
if ! ssh-keygen -F github.com &>/dev/null; then
  ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts 2>/dev/null
  ok "github.com added to known_hosts"
fi

# Switch remote to SSH if it's currently HTTPS
CURRENT_REMOTE=$(git -C "$REPO_DIR" remote get-url origin 2>/dev/null || echo "")
if [[ "$CURRENT_REMOTE" == https://github.com/* ]]; then
  SSH_REMOTE="${CURRENT_REMOTE/https:\/\/github.com\//git@github.com:}"
  git -C "$REPO_DIR" remote set-url origin "$SSH_REMOTE"
  ok "Remote switched from HTTPS to SSH: $SSH_REMOTE"
else
  ok "Remote already using SSH"
fi

# ── 5. Claude Code (native binary) ──────────────────────────────────────────
step "Claude Code CLI"
mkdir -p "$HOME/.local/bin"

# Ensure ~/.local/bin is on PATH in this shell and in ~/.bashrc
if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
  export PATH="$HOME/.local/bin:$PATH"
fi
BASHRC_LINE='export PATH="$HOME/.local/bin:$PATH"'
grep -qxF "$BASHRC_LINE" ~/.bashrc 2>/dev/null || echo "$BASHRC_LINE" >> ~/.bashrc

if ! command -v claude &>/dev/null; then
  # Bootstrap: need the npm global version briefly to run 'claude install stable'
  npm install -g @anthropic-ai/claude-code --silent
  claude install stable
  # Remove the npm global now that the native binary is in place
  npm uninstall -g @anthropic-ai/claude-code --silent 2>/dev/null || true
  ok "Claude Code (native) installed to ~/.local/bin"
elif [[ "$(which claude)" != "$HOME/.local/bin/claude" ]]; then
  warn "Claude found at $(which claude) — expected ~/.local/bin/claude"
  warn "Run: claude install stable   then re-source ~/.bashrc"
else
  ok "Claude Code $(claude --version 2>/dev/null | head -1) already installed"
fi

# ── 6. Build mcp-server ───────────────────────────────────────────────────────
step "mcp-server build"
cd "$REPO_DIR/mcp-server"
npm install --silent
npm run build --silent
ok "mcp-server built → dist/"
cd "$REPO_DIR"

# ── 6b. Build collector ───────────────────────────────────────────────────────
step "collector build"
if [ -d "$REPO_DIR/collector" ]; then
  cd "$REPO_DIR/collector"
  npm install --silent
  npm run build --silent
  ok "collector built → dist/"
  cd "$REPO_DIR"
else
  warn "collector/ not found — skipping"
fi

# ── 6c. Runtime directories ───────────────────────────────────────────────────
step "Runtime directories"
mkdir -p "$HOME/.config/svh-opsman" "$HOME/.local/share/svh-opsman"
chmod 700 "$HOME/.config/svh-opsman"
ok "~/.config/svh-opsman and ~/.local/share/svh-opsman ready"

# ── 6d. systemd (WSL) ────────────────────────────────────────────────────────
step "systemd WSL user services"

# Check/set systemd=true in /etc/wsl.conf
if ! grep -q "^systemd=true" /etc/wsl.conf 2>/dev/null; then
  if ! grep -q "\[boot\]" /etc/wsl.conf 2>/dev/null; then
    echo -e "\n[boot]\nsystemd=true" | sudo tee -a /etc/wsl.conf >/dev/null
  else
    sudo sed -i '/\[boot\]/a systemd=true' /etc/wsl.conf
  fi
  warn "systemd=true added to /etc/wsl.conf — restart WSL to apply: wsl --shutdown"
else
  ok "systemd=true already set in /etc/wsl.conf"
fi

# Install user service units
USER_SYSTEMD="$HOME/.config/systemd/user"
mkdir -p "$USER_SYSTEMD"
for unit in bw-unlock mcp briefing.timer briefing; do
  src="$REPO_DIR/systemd/user/svh-opsman-${unit}.service"
  timer_src="$REPO_DIR/systemd/user/svh-opsman-${unit}"
  # Handle .timer files specially
  if [[ "$unit" == "briefing.timer" ]]; then
    cp "$REPO_DIR/systemd/user/svh-opsman-briefing.timer" "$USER_SYSTEMD/"
    ok "svh-opsman-briefing.timer installed"
    continue
  fi
  [ -f "$src" ] && cp "$src" "$USER_SYSTEMD/" && ok "svh-opsman-${unit}.service installed"
done

# Reload and enable
if systemctl --user is-system-running &>/dev/null 2>&1 || systemctl --user status &>/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user enable svh-opsman-bw-unlock.service svh-opsman-mcp.service svh-opsman-briefing.timer 2>/dev/null
  ok "systemd user units enabled"
else
  warn "systemd not running yet — enable units manually after WSL restart:"
  warn "  systemctl --user daemon-reload"
  warn "  systemctl --user enable svh-opsman-bw-unlock svh-opsman-mcp svh-opsman-briefing.timer"
fi

# ── 6e. Bitwarden Windows Credential Manager entry ───────────────────────────
step "Windows Credential Manager (manual)"
warn "To enable auto-unlock, store your BW master password on the Windows host."
warn "Run these commands once from a ${BOLD}Windows PowerShell${RESET} terminal:"
warn "  ${CYAN}\$cred = Get-Credential -UserName 'svh-opsman' -Message 'Enter Bitwarden master password'${RESET}"
warn "  ${CYAN}New-StoredCredential -Target 'svh-opsman' -UserName 'svh-opsman' \`
    -Password \$cred.GetNetworkCredential().Password -Persist LocalMachine${RESET}"
warn "(This requires the CredentialManager module: Install-Module CredentialManager)"

# ── 6f. Backup timer ─────────────────────────────────────────────────────────
step "Backup timer (rclone)"
if ! command -v rclone &>/dev/null; then
  sudo apt-get install -y -qq rclone
  ok "rclone installed"
else
  ok "rclone $(rclone --version 2>/dev/null | head -1 | awk '{print $2}') already installed"
fi

chmod +x "$REPO_DIR/scripts/backup.sh"

if systemctl --user is-system-running &>/dev/null 2>&1 || systemctl --user status &>/dev/null 2>&1; then
  cp "$REPO_DIR/systemd/user/svh-opsman-backup.service" "$USER_SYSTEMD/"
  cp "$REPO_DIR/systemd/user/svh-opsman-backup.timer"   "$USER_SYSTEMD/"
  systemctl --user daemon-reload
  systemctl --user enable svh-opsman-backup.timer 2>/dev/null
  ok "svh-opsman-backup.timer installed and enabled"
else
  warn "systemd not running — install backup units manually after WSL restart:"
  warn "  cp systemd/user/svh-opsman-backup.{service,timer} ~/.config/systemd/user/"
  warn "  systemctl --user enable --now svh-opsman-backup.timer"
fi
warn "Action required: configure rclone remotes before the timer fires:"
warn "  rclone config   (add 'onedrive' and 'gdrive' — see docs/setup/backup.md)"

# ── 7. Hook permissions ───────────────────────────────────────────────────────
step "Hook permissions"
chmod +x "$REPO_DIR/.claude/hooks/"*.sh 2>/dev/null && ok "Hooks marked executable" || true

# ── 8. Register svh-opsman MCP ───────────────────────────────────────────────
step "MCP registration — svh-opsman"
if claude mcp list 2>/dev/null | grep -q "svh-opsman"; then
  ok "svh-opsman already registered"
else
  claude mcp add svh-opsman -- node "$REPO_DIR/mcp-server/dist/index.js"
  ok "svh-opsman registered"
fi

# ── 9. Register external MCPs ─────────────────────────────────────────────────
step "MCP registration — external MCPs"

register_mcp_simple() {
  local name="$1"; shift
  if claude mcp list 2>/dev/null | grep -q "^$name"; then
    ok "$name already registered"
  else
    claude mcp add "$@"
    ok "$name registered"
  fi
}

# desktop-commander and time need no API keys
register_mcp_simple "desktop-commander" desktop-commander -- npx -y @wonderwhy-er/desktop-commander
register_mcp_simple "time"              time              -- npx -y @modelcontextprotocol/server-time
register_mcp_simple "bitwarden"         bitwarden         -- npx -y @bitwarden/mcp
register_mcp_simple "excalidraw"        excalidraw        -- npx -y mcp-excalidraw

# MCPs that need API keys — skip and remind if key not set
register_mcp_with_key() {
  local name="$1" env_var="$2"; shift 2
  if claude mcp list 2>/dev/null | grep -q "^$name"; then
    ok "$name already registered"
    return
  fi
  local key_val="${!env_var:-}"
  if [ -n "$key_val" ]; then
    claude mcp add "$@"
    ok "$name registered"
  else
    warn "$name SKIPPED — set \$$env_var and re-run, or register manually:"
    warn "  claude mcp add $*"
  fi
}

# These can be pre-set in the environment before running this script,
# or registered manually once you have the keys.
register_mcp_with_key "github"    GITHUB_PERSONAL_ACCESS_TOKEN \
  github -e GITHUB_PERSONAL_ACCESS_TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-placeholder}" \
  -- npx -y @modelcontextprotocol/server-github

register_mcp_with_key "obsidian"  OBSIDIAN_API_KEY \
  obsidian -e OBSIDIAN_API_KEY="${OBSIDIAN_API_KEY:-placeholder}" \
  -- npx -y mcp-obsidian http://127.0.0.1:27123

register_mcp_with_key "fathom"    FATHOM_API_KEY \
  fathom -e FATHOM_API_KEY="${FATHOM_API_KEY:-placeholder}" \
  -- npx -y fathom-mcp

register_mcp_with_key "firecrawl" FIRECRAWL_API_KEY \
  firecrawl -e FIRECRAWL_API_KEY="${FIRECRAWL_API_KEY:-placeholder}" \
  -- npx -y @mendableai/firecrawl-mcp-server

# ── 10. Python TUI dependencies ───────────────────────────────────────────────
step "PowerShell TUI — Python dependencies"
if ! python3 -c "import textual" &>/dev/null; then
  pip3 install textual --quiet
  ok "textual installed"
else
  ok "textual already installed ($(python3 -c 'import textual; print(textual.__version__)'))"
fi
chmod +x "$REPO_DIR/tui/run-tui.sh"
ok "tui/run-tui.sh marked executable"

# ── 11. Shell scripts — ensure executable ─────────────────────────────────────
step "Shell script permissions"
chmod +x "$REPO_DIR/dotfiles/status-refresh.sh"
ok "status-refresh.sh marked executable"
warn "Run dotfiles/install-windows.ps1 from Windows Terminal to install the font and Windows Terminal settings"

# ── done ──────────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}Setup complete.${RESET}"
echo -e "\nNext steps:"
echo -e "  1. ${BOLD}source ~/.bashrc${RESET}  (or open a new terminal)"
echo -e "  2. If a new SSH key was generated above, add it to ${BOLD}github.com/settings/keys${RESET}"
echo -e "  3. ${BOLD}export BW_SESSION=\$(bw unlock --raw)${RESET}  — unlock Bitwarden"
echo -e "  4. Register any skipped MCPs (github, obsidian, fathom, firecrawl)"
echo -e "     by setting the env var and re-running, or with: ${BOLD}claude mcp add ...${RESET}"
echo -e "  5. ${BOLD}cd mcp-server && npm start${RESET}  — verify the server starts cleanly"
echo -e "  6. On Windows: ${BOLD}dotfiles\\install-windows.ps1${RESET}  — install font + Windows Terminal settings"
echo -e "  7. Open the repo in Claude Code: ${BOLD}claude${RESET}  — or type: ${BOLD}opsman${RESET}"
echo -e "  8. PowerShell TUI: ${BOLD}tui/run-tui.sh${RESET}  — browse and run module functions in terminal"
echo -e "  9. Configure rclone remotes for backup: ${BOLD}rclone config${RESET}  (see docs/setup/backup.md)"
echo -e " 10. On Windows: register the Task Scheduler job for WSL auto-start:"
echo -e "     ${BOLD}powershell.exe -File powershell\\Start-WSLServices.ps1${RESET} (see file for schtasks command)"
echo -e " 11. Create the Bitwarden Windows Credential Manager entry (see step 6e output above)"
