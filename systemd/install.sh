#!/usr/bin/env bash
# Install systemd units for SVH OpsMan.
# Run as root on the target VM: sudo bash systemd/install.sh
set -euo pipefail

INSTALL_DIR=/opt/svh-opsman
SYSTEMD_DIR=/etc/systemd/system
SERVICE_USER=opsman

# Create service user if it doesn't exist
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  echo "Created user: $SERVICE_USER"
fi

# Create install dir and set ownership
mkdir -p "$INSTALL_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

# Copy unit files
cp "$(dirname "$0")/opsman-collector.service" "$SYSTEMD_DIR/"
cp "$(dirname "$0")/opsman-collector.timer"   "$SYSTEMD_DIR/"
cp "$(dirname "$0")/opsman-mcp.service"       "$SYSTEMD_DIR/"

systemctl daemon-reload

# Enable and start the timer
systemctl enable --now opsman-collector.timer

echo ""
echo "Installed. Next steps:"
echo "  1. Copy repo to $INSTALL_DIR"
echo "  2. Create $INSTALL_DIR/collector/.env from collector/.env.example"
echo "  3. npm ci --prefix $INSTALL_DIR/collector && npm run build --prefix $INSTALL_DIR/collector"
echo "  4. systemctl status opsman-collector.timer"
echo "  5. Run a manual test: systemctl start opsman-collector.service"
