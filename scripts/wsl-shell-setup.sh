#!/usr/bin/env bash
# WSL shell environment setup — zsh + modern CLI tools
# Run once as your normal user. Requires sudo.
# After it completes: wsl --shutdown from Windows, reopen terminal.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Enabling systemd in WSL..."
if ! grep -q "systemd=true" /etc/wsl.conf 2>/dev/null; then
  sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true

[interop]
appendWindowsPath=true
EOF
  echo "    /etc/wsl.conf written — WSL restart required after this script."
else
  echo "    Already enabled, skipping."
fi

echo "==> Installing apt packages..."
sudo apt-get update -q
sudo apt-get install -y \
  zsh \
  zsh-autosuggestions \
  zsh-syntax-highlighting \
  fzf \
  bat \
  btop \
  mtr \
  nmap \
  httpie \
  zoxide
# bat is installed as batcat on Ubuntu — alias handled in .zshrc below
echo "    Apt packages installed."

echo "==> Installing starship prompt..."
if ! command -v starship &>/dev/null; then
  curl -sS https://starship.rs/install.sh | sh -s -- --yes
else
  echo "    Already installed."
fi

echo "==> Installing Helix editor..."
if ! command -v hx &>/dev/null; then
  # PPA is the most reliable method on Ubuntu; snap has issues in WSL2
  sudo add-apt-repository -y ppa:maveonair/helix-editor 2>/dev/null
  sudo apt-get update -q
  sudo apt-get install -y helix
  echo "    $(hx --version) installed."
else
  echo "    Already installed: $(hx --version)."
fi

echo "==> Installing PowerShell 7 (Microsoft apt repo — more reliable than snap in WSL2)..."
if ! command -v pwsh &>/dev/null; then
  curl -fsSL "https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb" \
    -o /tmp/packages-microsoft-prod.deb
  sudo dpkg -i /tmp/packages-microsoft-prod.deb
  rm -f /tmp/packages-microsoft-prod.deb
  sudo apt-get update -q
  sudo apt-get install -y powershell
  echo "    $(pwsh --version) installed."
else
  echo "    Already installed: $(pwsh --version)."
fi

echo "==> Writing ~/.zshrc..."
cat > ~/.zshrc <<'ZSHRC'
# ── History ───────────────────────────────────────────────────────────────────
HISTFILE=~/.zsh_history
HISTSIZE=50000
SAVEHIST=50000
setopt SHARE_HISTORY HIST_IGNORE_DUPS HIST_REDUCE_BLANKS EXTENDED_HISTORY

# ── Options ───────────────────────────────────────────────────────────────────
setopt AUTO_CD              # type a dir name to cd into it
setopt CORRECT              # suggest corrections for mistyped commands
setopt NO_CASE_GLOB         # case-insensitive globbing

# ── Completion ────────────────────────────────────────────────────────────────
autoload -Uz compinit && compinit
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'  # case-insensitive tab complete

# ── Plugins ───────────────────────────────────────────────────────────────────
source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# ── fzf ───────────────────────────────────────────────────────────────────────
source /usr/share/doc/fzf/examples/key-bindings.zsh
source /usr/share/doc/fzf/examples/completion.zsh
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'
# Ctrl+R: fuzzy history search
# Ctrl+T: fuzzy file picker
# Alt+C:  fuzzy cd

# ── zoxide (smart cd) ─────────────────────────────────────────────────────────
eval "$(zoxide init zsh)"
# z <partial>  — jump to most-frecent match
# zi           — interactive picker

# ── Aliases ───────────────────────────────────────────────────────────────────
alias ls='ls --color=auto --group-directories-first'
alias ll='ls -lah --color=auto --group-directories-first'
alias cat='batcat --paging=never'
alias bat='batcat'
alias grep='grep --color=auto'

# OpsMan shortcuts
alias ops='cd ~/SVH-OpsMan'
alias vault='cd /mnt/c/Users/astevens/vaults/OpsManVault'

# Git
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline --graph --decorate -20'

# ── PATH ──────────────────────────────────────────────────────────────────────
# claude binary and pip-installed tools live here
[[ ":$PATH:" != *":$HOME/.local/bin:"* ]] && export PATH="$HOME/.local/bin:$PATH"

# ── OpsMan helpers (bwu, opsman, clip, wpath, wexp) ──────────────────────────
[ -f ~/SVH-OpsMan/dotfiles/bashrc.sh ] && source ~/SVH-OpsMan/dotfiles/bashrc.sh

# ── Starship prompt ───────────────────────────────────────────────────────────
eval "$(starship init zsh)"
ZSHRC

echo "    ~/.zshrc written."

echo "==> Writing ~/.config/starship.toml..."
mkdir -p ~/.config
cat > ~/.config/starship.toml <<'TOML'
# Lean prompt — API/git status is handled by status-refresh.sh, not the prompt itself
format = '$directory$git_branch$git_status$character'

[directory]
truncation_length = 3
truncate_to_repo = true
style = "bold cyan"

[git_branch]
symbol = " "
style = "bold purple"

[git_status]
format = '([$all_status$ahead_behind]($style) )'
style = "bold yellow"
conflicted = "⚡"
modified = "!"
staged = "+"
untracked = "?"
ahead = "⇡${count}"
behind = "⇣${count}"

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"

[nodejs]
disabled = true

[python]
disabled = true
TOML

echo "    starship.toml written."

echo "==> Setting zsh as default shell..."
if [ "$SHELL" != "$(which zsh)" ]; then
  sudo chsh -s "$(which zsh)" "$USER"
  echo "    Default shell changed to zsh."
else
  echo "    Already using zsh."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Done. Required next steps:"
echo ""
echo "  1. From Windows PowerShell (admin): wsl --shutdown"
echo "  2. Reopen Windows Terminal — systemd will be active"
echo "  3. Run: tailscale-wsl-setup.sh  (Tailscale install, separate script)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
