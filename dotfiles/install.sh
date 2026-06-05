#!/usr/bin/env bash
# SVH-OpsMan dotfiles installer
# Adds source lines to ~/.zshrc, ~/.zprofile, and ~/.bashrc on a fresh WSL setup.
# Safe to re-run — idempotent.

OPSMANDIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_LINE="[ -f $OPSMANDIR/dotfiles/bashrc.sh ] && source $OPSMANDIR/dotfiles/bashrc.sh"

add_if_missing() {
    local file="$1"
    local line="$2"
    local label="$3"
    if ! grep -qF "dotfiles/bashrc.sh" "$file" 2>/dev/null; then
        printf '\n# %s\n%s\n' "$label" "$line" >> "$file"
        echo "✓ Added source line to $file"
    else
        echo "  $file already has source line — skipped"
    fi
}

add_if_missing "$HOME/.zshrc"    "$SOURCE_LINE" "OpsMan helpers (bwu, opsman, clip, wpath, wexp)"
add_if_missing "$HOME/.zprofile" "$SOURCE_LINE" "SVH-OpsMan: source for all zsh login shells (interactive and non-interactive)"
add_if_missing "$HOME/.bashrc"   "$SOURCE_LINE" "SVH-OpsMan"

echo ""
echo "Done. Open a new shell or run: source ~/.zshrc"
