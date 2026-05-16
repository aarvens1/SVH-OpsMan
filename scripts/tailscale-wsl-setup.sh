#!/usr/bin/env bash
# Tailscale setup for WSL2
# Run AFTER wsl-shell-setup.sh and a WSL restart (systemd must be active).
# After auth, configure subnet routing and DNS from the admin console.

set -euo pipefail

echo "==> Checking systemd..."
if ! systemctl is-system-running --quiet 2>/dev/null; then
  echo "ERROR: systemd is not running."
  echo "Run wsl-shell-setup.sh first, then: wsl --shutdown from Windows PowerShell."
  exit 1
fi

echo "==> Installing Tailscale..."
if ! command -v tailscale &>/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "    Already installed: $(tailscale version | head -1)"
fi

echo "==> Enabling and starting tailscaled..."
sudo systemctl enable --now tailscaled

echo "==> Authenticating..."
echo ""
echo "    A browser URL will appear below. Open it to authenticate this node."
echo "    Node name will be: $(hostname)-wsl"
echo ""
sudo tailscale up --hostname="$(hostname)-wsl" --accept-dns=true --accept-routes=true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  WSL Tailscale node is up."
echo ""
echo "  In the Tailscale admin console:"
echo "  → Disable key expiry on this node (it's a workstation, not a server)"
echo "  → Enable MagicDNS so you can reach nodes by name"
echo ""
echo "  Once UDM subnet routers are online, you'll reach every SVH device"
echo "  at every site by IP — no Tailscale install needed on managed devices."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
