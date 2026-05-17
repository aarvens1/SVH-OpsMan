# SVH-OpsMan shell environment
# Sourced from ~/.bashrc.
# To install: echo '[ -f ~/SVH-OpsMan/dotfiles/bashrc.sh ] && . ~/SVH-OpsMan/dotfiles/bashrc.sh' >> ~/.bashrc

# ── Bitwarden ──────────────────────────────────────────────────────────────────
# bwu — unlock vault, export session, restart status daemon so it inherits the fresh session
bwu() {
    export BW_SESSION=$(bw unlock --raw)
    if [[ -z "$BW_SESSION" ]]; then
        echo "✗ Unlock failed — check your master password"
        return 1
    fi
    echo "✓ BW_SESSION set"
    # Restart status daemon so it picks up the new session
    pkill -f "dotfiles/status-refresh.sh" 2>/dev/null && sleep 0.3
    nohup bash "$OPSMANDIR/dotfiles/status-refresh.sh" >/dev/null 2>&1 &
    disown
    echo "✓ Status daemon (re)started — first refresh in ~5s"
}

# Warn on every new shell if the vault is locked (MCP server won't load creds without it)
if command -v bw &>/dev/null; then
    _bws=$(bw status 2>/dev/null)
    if ! echo "$_bws" | grep -q '"status":"unlocked"'; then
        echo "⚠  Bitwarden locked — run: bwu"
    fi
    unset _bws
fi

# ── History ────────────────────────────────────────────────────────────────────
HISTSIZE=10000
HISTFILESIZE=20000
# Bash: write history immediately so it survives across windows.
# Zsh: SHARE_HISTORY in .zshrc handles this; PROMPT_COMMAND is a no-op there.
if [[ -n "${BASH_VERSION:-}" ]]; then
    HISTTIMEFORMAT="%F %T  "
    PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}history -a"
fi

# ── Prompt (bash only — zsh uses starship from .zshrc) ────────────────────────
if [[ -n "${BASH_VERSION:-}" ]]; then
    _gbranch() { git -C . rev-parse --abbrev-ref HEAD 2>/dev/null; }
    PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[01;33m\]$(b=$(_gbranch); [[ -n $b ]] && printf " (%s)" "$b")\[\033[00m\]\$ '
fi

# ── WSL helpers ────────────────────────────────────────────────────────────────
alias wexp='explorer.exe "$(wslpath -w .)"'   # open current dir in Windows Explorer
alias clip='clip.exe'                          # pipe to Windows clipboard: echo hello | clip
alias wpath='wslpath -w'                       # convert a WSL path to Windows path: wpath ~/foo

# ── Git ────────────────────────────────────────────────────────────────────────
alias gs='git status -sb'
alias gl='git log --oneline --graph -20'
alias gd='git diff'
alias gdc='git diff --cached'

# ── PATH ──────────────────────────────────────────────────────────────────────
# claude binary lives here; guard prevents duplicates on re-source
[[ ":$PATH:" != *":$HOME/.local/bin:"* ]] && export PATH="$HOME/.local/bin:$PATH"

# ── SVH-OpsMan ────────────────────────────────────────────────────────────────
export OPSMANDIR="$HOME/SVH-OpsMan"
alias ops='cd "$OPSMANDIR"'
alias ops-health='bash "$OPSMANDIR/scripts/health.sh"'

# Start new shells in OpsMan when opened from the default home directory
[[ "$PWD" == "$HOME" ]] && cd "$OPSMANDIR"

# ── WezTerm ───────────────────────────────────────────────────────────────────

# opsman — launch the full ops workspace:
#   1. Verifies BW is unlocked
#   2. Starts status-refresh.sh in background (idempotent)
#   3. Opens WezTerm with a Claude Code pane in SVH-OpsMan
opsman() {
    if ! bw status 2>/dev/null | grep -q '"status":"unlocked"'; then
        echo "⚠  Bitwarden locked — run: bwu"
        return 1
    fi

    # Start status refresh daemon if not already running
    if ! pgrep -f "dotfiles/status-refresh.sh" >/dev/null 2>&1; then
        nohup bash "$OPSMANDIR/dotfiles/status-refresh.sh" >/dev/null 2>&1 &
        disown
        echo "✓ Status refresh daemon started (PID $!)"
    fi

    # Launch WezTerm → WSL login bash → cd OpsMan → start claude
    # Use the full quoted path — "wezterm.exe" via PATH lookup fails when
    # binfmt_misc interop is degraded (space in Program Files causes exec error).
    # If WSL interop is fully unavailable, run install-windows.ps1 and use
    # the PowerShell `opsman` alias instead.
    local wez="/mnt/c/Program Files/WezTerm/wezterm.exe"
    if [[ ! -f "$wez" ]]; then
        echo "✗ WezTerm not found at $wez — is it installed?"
        return 1
    fi
    "$wez" start --new-window -- wsl.exe --exec bash -l -c 'cd ~/SVH-OpsMan && exec claude' 2>/tmp/wezterm-launch.log &
    disown
    echo "✓ WezTerm launching with Claude Code"
    echo "  Leader key: CTRL+\\  |  Day Starter: LEADER+d  |  All skills: LEADER+?"
    echo "  Tip: 'opsman' also works from PowerShell after running install-windows.ps1"
}

# wez-sync — copy wezterm.lua to the Windows config path after editing
# (run this after editing dotfiles/wezterm.lua if the symlink setup wasn't used)
wez-sync() {
    local dest="/mnt/c/Users/astevens/.config/wezterm/wezterm.lua"
    mkdir -p "$(dirname "$dest")"
    cp "$OPSMANDIR/dotfiles/wezterm.lua" "$dest"
    echo "✓ wezterm.lua synced to $(wslpath -w "$dest")"
}

# wez-stop — stop the background status refresh daemon
wez-stop() {
    if pkill -f "dotfiles/status-refresh.sh" 2>/dev/null; then
        echo "✓ Status refresh daemon stopped"
    else
        echo "  Status refresh daemon was not running"
    fi
}
