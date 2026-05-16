#!/usr/bin/env bash
# SVH OpsMan — fresh WSL bootstrap
# Run once on a new WSL Ubuntu install. Safe to re-run (idempotent checks throughout).
# Usage: bash setup.sh

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
PKGS=(curl git unzip jq build-essential ca-certificates)
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
  pip install textual --quiet
  ok "textual installed"
else
  ok "textual already installed ($(python3 -c 'import textual; print(textual.__version__)'))"
fi
chmod +x "$REPO_DIR/run-tui.sh"
ok "run-tui.sh marked executable"

# ── 11. .env scaffold ─────────────────────────────────────────────────────────
step "mcp-server .env"
if [ ! -f "$REPO_DIR/mcp-server/.env" ]; then
  cp "$REPO_DIR/mcp-server/.env.example" "$REPO_DIR/mcp-server/.env"
  warn ".env created from .env.example — fill in credentials (or use Bitwarden)"
else
  ok ".env already exists"
fi

# ── 11. WezTerm config ────────────────────────────────────────────────────────
step "WezTerm config"
WEZ_CONFIG_DIR="/mnt/c/Users/astevens/.config/wezterm"

if [ -d "/mnt/c/Users/astevens" ]; then
  mkdir -p "$WEZ_CONFIG_DIR"
  WEZ_DEST="$WEZ_CONFIG_DIR/wezterm.lua"

  if [ ! -e "$WEZ_DEST" ]; then
    # Try a Windows symbolic link via mklink (works when Developer Mode is on)
    DISTRO=$(wsl.exe -l -q 2>/dev/null | head -1 | tr -d '\r\0' || echo "Ubuntu")
    DISTRO=${DISTRO:-Ubuntu}
    UNC_SRC="\\\\wsl\$\\${DISTRO}${REPO_DIR}\\dotfiles\\wezterm.lua"
    WIN_DEST="C:\\Users\\astevens\\.config\\wezterm\\wezterm.lua"
    if cmd.exe /c "mklink \"${WIN_DEST}\" \"${UNC_SRC}\"" &>/dev/null; then
      ok "wezterm.lua symlinked → dotfiles/wezterm.lua (live updates on save)"
    else
      cp "$REPO_DIR/dotfiles/wezterm.lua" "$WEZ_DEST"
      ok "wezterm.lua copied to $WEZ_DEST"
      warn "Symlink needs Developer Mode — copy is in place. Run 'wez-sync' after editing."
    fi
  else
    ok "WezTerm config already present at $WEZ_DEST"
  fi

  # Ensure status-refresh.sh is executable
  chmod +x "$REPO_DIR/dotfiles/status-refresh.sh"
  ok "status-refresh.sh marked executable"

  warn "Run dotfiles/install-windows.ps1 from Windows Terminal to install WezTerm + fonts"
else
  warn "Windows user directory not found — skipping WezTerm config (WSL2 only)"
fi

# ── done ──────────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}Setup complete.${RESET}"
echo -e "\nNext steps:"
echo -e "  1. ${BOLD}source ~/.bashrc${RESET}  (or open a new terminal)"
echo -e "  2. If a new SSH key was generated above, add it to ${BOLD}github.com/settings/keys${RESET}"
echo -e "  3. ${BOLD}export BW_SESSION=\$(bw unlock --raw)${RESET}  — unlock Bitwarden"
echo -e "     ${CYAN}or${RESET} fill in ${BOLD}mcp-server/.env${RESET} directly"
echo -e "  4. Register any skipped MCPs (github, obsidian, fathom, firecrawl)"
echo -e "     by setting the env var and re-running, or with: ${BOLD}claude mcp add ...${RESET}"
echo -e "  5. ${BOLD}cd mcp-server && npm start${RESET}  — verify the server starts cleanly"
echo -e "  6. On Windows: ${BOLD}dotfiles\\install-windows.ps1${RESET}  — install WezTerm + fonts"
echo -e "  7. Open the repo in Claude Code: ${BOLD}claude${RESET}  — or type: ${BOLD}opsman${RESET}"
echo -e "  8. PowerShell TUI: ${BOLD}./run-tui.sh${RESET}  — browse and run module functions in terminal"
