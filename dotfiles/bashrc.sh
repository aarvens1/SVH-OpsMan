# SVH-OpsMan shell environment
# Sourced from ~/.zshrc (interactive) and ~/.zprofile (all login shells, including WT tabs).
# To install into zsh: add to both ~/.zshrc and ~/.zprofile:
#   [ -f ~/SVH-OpsMan/dotfiles/bashrc.sh ] && source ~/SVH-OpsMan/dotfiles/bashrc.sh

# ── Bitwarden ──────────────────────────────────────────────────────────────────
# Always read BW session from file — file is source of truth, overrides stale inherited env
if [[ -f "$HOME/.bw_session" ]]; then
    export BW_SESSION=$(< "$HOME/.bw_session")
fi

# bwu — unlock vault, export session, persist it, restart status daemon
bwu() {
    export BW_SESSION=$(bw unlock --raw)
    if [[ -z "$BW_SESSION" ]]; then
        echo "✗ Unlock failed — check your master password"
        return 1
    fi
    # Persist so new WSL shells / WT tabs inherit the session
    printf '%s' "$BW_SESSION" > "$HOME/.bw_session"
    chmod 600 "$HOME/.bw_session"
    echo "✓ BW_SESSION set"
    # Restart status daemon so it picks up the new session
    pkill -f "scripts/status-refresh.sh" 2>/dev/null && sleep 0.3
    nohup bash "$OPSMANDIR/scripts/status-refresh.sh" >/dev/null 2>&1 &
    disown
    echo "✓ Status daemon (re)started — first refresh in ~5s"
}

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

# ── Gemini CLI ────────────────────────────────────────────────────────────────
# Using @google/gemini-cli (binary: gemini). Google plans to rename the binary
# to 'antigravity' after June 18, 2026 — update this alias when that lands.
# The 'gs' alias can conflict with 'git status', so we unalias it first to be safe.
unalias gs 2>/dev/null || true

export GEMINI_MODEL=gemini-2.5-pro

alias gs='gemini'

# ── Git ────────────────────────────────────────────────────────────────────────
alias gst='git status -sb'
alias gl='git log --oneline --graph --decorate -20'
alias gd='git diff'
alias gdc='git diff --cached'

# ── PATH ──────────────────────────────────────────────────────────────────────
# claude binary lives here; guard prevents duplicates on re-source
[[ ":$PATH:" != *":$HOME/.local/bin:"* ]] && export PATH="$HOME/.local/bin:$PATH"

# ── SVH-OpsMan ────────────────────────────────────────────────────────────────
export OPSMANDIR="$HOME/SVH-OpsMan"
alias ops='cd "$OPSMANDIR"'
alias ops-health='bash "$OPSMANDIR/scripts/health.sh"'
# patch-bw — reapply after: sudo npm install -g @bitwarden/cli
alias patch-bw='bash "$OPSMANDIR/scripts/patch-bw-cli.sh"'

# Start new shells in OpsMan when opened from the default home directory
[[ "$PWD" == "$HOME" ]] && cd "$OPSMANDIR"

# ── Collector: data pulls ─────────────────────────────────────────────────────
# Run all jobs (full gather + watch phase)
alias gather='node "$OPSMANDIR/collector/dist/index.js" gather'
# Per-job pulls — use when you only want to refresh one source
alias gather-graph='node "$OPSMANDIR/collector/dist/index.js" gather --job=graph'
alias gather-ninja='node "$OPSMANDIR/collector/dist/index.js" gather --job=ninjaone'
alias gather-unifi='node "$OPSMANDIR/collector/dist/index.js" gather --job=unifi'
alias gather-wazuh='node "$OPSMANDIR/collector/dist/index.js" gather --job=wazuh'
alias gather-planner='node "$OPSMANDIR/collector/dist/index.js" gather --job=planner'
# Re-run the watch/metrics phase only (no API calls)
alias gather-watch='node "$OPSMANDIR/collector/dist/index.js" watch'

# ── Collector: browse staging output ──────────────────────────────────────────
_staging_dir() { ls "$OPSMANDIR/staging/" 2>/dev/null | grep -v '^\.' | sort | tail -1; }

# staging-ls — list files in the latest staging run with sizes
staging-ls() {
    local d=$(_staging_dir)
    [[ -z "$d" ]] && echo "No staging data yet — run: gather" && return 1
    echo "── $d ──"
    ls -lh "$OPSMANDIR/staging/$d/" | grep -v '^total'
}

# staging-cat FILE — pretty-print a staging file (omit .json extension)
staging-cat() {
    local d=$(_staging_dir)
    [[ -z "$d" ]] && echo "No staging data yet" && return 1
    local f="$OPSMANDIR/staging/$d/${1}.json"
    if [[ -f "$f" ]]; then
        jq . "$f"
    else
        echo "Not found: ${1}.json"
        echo "Available: $(ls "$OPSMANDIR/staging/$d/" | grep '\.json' | grep -v manifest | sed 's/\.json//' | tr '
' ' ')"
    fi
}

# staging-manifest — show the latest manifest (job status + record counts)
staging-manifest() {
    local d=$(_staging_dir)
    [[ -z "$d" ]] && echo "No staging data yet" && return 1
    jq . "$OPSMANDIR/staging/$d/manifest.json"
}

# ── Collector: metrics DB ─────────────────────────────────────────────────────
alias runs='sqlite3 -column -header "$OPSMANDIR/db/runs.db" "SELECT timestamp, type, sources_attempted, sources_failed, duration_ms FROM runs ORDER BY timestamp DESC LIMIT 15;"'
alias disk-trend='sqlite3 -column -header "$OPSMANDIR/db/metrics.db" "SELECT recorded_at, server, drive_letter, used_pct FROM disk_usage ORDER BY recorded_at DESC LIMIT 30;"'
alias alert-trend='sqlite3 -column -header "$OPSMANDIR/db/metrics.db" "SELECT recorded_at, source, count FROM alert_counts ORDER BY recorded_at DESC LIMIT 20;"'
# disk-hot — servers currently above 80% on any drive
alias disk-hot='sqlite3 -column -header "$OPSMANDIR/db/metrics.db" "SELECT server, drive_letter, used_pct, recorded_at FROM disk_usage WHERE used_pct > 80 ORDER BY used_pct DESC, recorded_at DESC LIMIT 20;"'

# ── TUI ───────────────────────────────────────────────────────────────────────
# tui with no args launches an fzf menu; with an arg launches that view directly
tui() {
    if [[ -n "$1" ]]; then
        run-tui "$1"
        return
    fi
    local views=(alerts ad net patches)
    local labels=(
        "🚨  alerts   — Defender + Wazuh alerts"
        "👤  ad       — Entra users / groups"
        "🌐  net      — UniFi topology + clients"
        "🔧  patches  — NinjaOne patch status"
    )
    local choice
    choice=$(printf '%s\n' "${labels[@]}" | fzf \
        --prompt="TUI > " \
        --height=8 \
        --layout=reverse \
        --border \
        --no-info)
    [[ -z "$choice" ]] && return
    local idx
    for i in "${!labels[@]}"; do
        [[ "${labels[$i]}" == "$choice" ]] && idx=$i && break
    done
    run-tui "${views[$idx]}"
}
alias tui-ad='run-tui ad'
alias tui-alerts='run-tui alerts'
alias tui-net='run-tui net'
alias tui-patches='run-tui patches'

# ── Tab title helpers (WT sets these via OSC escape sequences) ─────────────────
# Set WT tab title from within WSL
tab-title() { printf '\033]0;%s\007' "$1"; }
# Auto-set tab title on directory change for zsh (lean — just dir name)
chpwd() { tab-title "$(basename "$PWD")"; }

# ── OpsMan update ─────────────────────────────────────────────────────────────
# Pull latest, rebuild both packages, restart MCP + status daemon
alias opsman-update='bash "$OPSMANDIR/scripts/update.sh"'

# ── OpsMan workspace ──────────────────────────────────────────────────────────

# opsman — launch Claude Code in the current terminal:
#   1. Verifies BW is unlocked
#   2. Starts status-refresh.sh in background (idempotent)
#   3. Runs claude in the OpsMan directory
opsman() {
    # Test actual session validity — bw status only reflects local state, not token expiry
    if ! bw get item "SVH OpsMan" --session "${BW_SESSION:-}" --nointeraction >/dev/null 2>&1; then
        echo "⚠  Bitwarden session invalid or expired — unlocking..."
        bwu || return 1
    fi
    if ! pgrep -f "scripts/status-refresh.sh" >/dev/null 2>&1; then
        nohup bash "$OPSMANDIR/scripts/status-refresh.sh" >/dev/null 2>&1 &
        disown
        echo "✓ Status refresh daemon started"
    fi
    cd "$OPSMANDIR" && claude
}

# opsman-dev — same as opsman but with CLAUDE_DEV_MODE=1.
# Skips git workflow blocks (reset --hard, restore, clean) and rm -rf guard.
# Force push, .env, DROP TABLE, and disk format remain blocked.
opsman-dev() {
    if ! bw get item "SVH OpsMan" --session "${BW_SESSION:-}" --nointeraction >/dev/null 2>&1; then
        echo "⚠  Bitwarden session invalid or expired — unlocking..."
        bwu || return 1
    fi
    if ! pgrep -f "scripts/status-refresh.sh" >/dev/null 2>&1; then
        nohup bash "$OPSMANDIR/scripts/status-refresh.sh" >/dev/null 2>&1 &
        disown
        echo "✓ Status refresh daemon started"
    fi
    cd "$OPSMANDIR" && CLAUDE_DEV_MODE=1 claude
}

# claude-dev — second Claude account (astevens2694@gmail.com)
# Code work that's safe with the data boundary (sanitized inputs only).
# - Uses CLAUDE_CONFIG_DIR=$HOME/.claude-dev for isolated session state
# - Does NOT unlock Bitwarden (Dev account has no MCP access by design)
# - Sets CLAUDE_DEV_MODE=1 to relax git workflow blocks
claude-dev() {
    cd "$OPSMANDIR" && CLAUDE_CONFIG_DIR="$HOME/.claude-dev" CLAUDE_DEV_MODE=1 claude
}
