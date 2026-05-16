# SVH-OpsMan shell environment
# Sourced from ~/.bashrc.
# To install: echo '[ -f ~/SVH-OpsMan/dotfiles/bashrc.sh ] && . ~/SVH-OpsMan/dotfiles/bashrc.sh' >> ~/.bashrc

# ── Bitwarden ──────────────────────────────────────────────────────────────────
# bwu — unlock vault and export the session token
bwu() {
    export BW_SESSION=$(bw unlock --raw)
    [[ -n "$BW_SESSION" ]] && echo "✓ BW_SESSION set" || echo "✗ Unlock failed — check your master password"
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
HISTTIMEFORMAT="%F %T  "
# Write history immediately so it survives across terminal windows
PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}history -a"

# ── Prompt (add git branch) ────────────────────────────────────────────────────
_gbranch() { git -C . rev-parse --abbrev-ref HEAD 2>/dev/null; }
PS1='${debian_chroot:+($debian_chroot)}\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[01;33m\]$(b=$(_gbranch); [[ -n $b ]] && printf " (%s)" "$b")\[\033[00m\]\$ '

# ── WSL helpers ────────────────────────────────────────────────────────────────
alias wexp='explorer.exe "$(wslpath -w .)"'   # open current dir in Windows Explorer
alias clip='clip.exe'                          # pipe to Windows clipboard: echo hello | clip
alias wpath='wslpath -w'                       # convert a WSL path to Windows path: wpath ~/foo

# ── Git ────────────────────────────────────────────────────────────────────────
alias gs='git status -sb'
alias gl='git log --oneline --graph -20'
alias gd='git diff'
alias gdc='git diff --cached'

# ── SVH-OpsMan ────────────────────────────────────────────────────────────────
export OPSMANDIR="$HOME/SVH-OpsMan"
alias ops='cd "$OPSMANDIR"'

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

    # Launch WezTerm → WSL bash → cd OpsMan → start claude
    # wezterm.exe is the native Windows binary; callable from WSL2 via interop
    wezterm.exe start -- wsl.exe --exec bash -c 'cd ~/SVH-OpsMan && exec claude' 2>/dev/null &
    disown
    echo "✓ WezTerm launching with Claude Code"
    echo "  Leader key: CTRL+\\  |  Day Starter: LEADER+d  |  All skills: LEADER+?"
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
