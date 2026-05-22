#!/usr/bin/env bash
# Sync credentials from Bitwarden → collector/.env
# Run after: export BW_SESSION=$(bw unlock --raw)
# Re-run whenever credentials change in Bitwarden.
set -euo pipefail

VAULT_ITEM="SVH OpsMan"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$REPO_ROOT/collector/.env"

if [[ -z "${BW_SESSION:-}" ]]; then
  echo "Error: BW_SESSION is not set. Run: export BW_SESSION=\$(bw unlock --raw)" >&2
  exit 1
fi

echo "Syncing credentials from Bitwarden vault item: $VAULT_ITEM"
bw sync --session "$BW_SESSION" >/dev/null 2>&1 || echo "  (bw sync failed — using cached vault)"

RAW=$(bw get item "$VAULT_ITEM" --session "$BW_SESSION")

extract() {
  echo "$RAW" | python3 -c "
import sys, json
data = json.load(sys.stdin)
fields = {f['name']: f['value'] for f in (data.get('fields') or [])}
print(fields.get('$1', ''))
"
}

cat > "$OUT" <<EOF
# Auto-generated from Bitwarden — do not edit by hand.
# Regenerate with: bash scripts/sync-creds.sh

# Microsoft Graph
GRAPH_TENANT_ID=$(extract GRAPH_TENANT_ID)
GRAPH_CLIENT_ID=$(extract GRAPH_CLIENT_ID)
GRAPH_CLIENT_SECRET=$(extract GRAPH_CLIENT_SECRET)
GRAPH_USER_ID=$(extract GRAPH_USER_ID)

# NinjaOne
NINJA_CLIENT_ID=$(extract NINJA_CLIENT_ID)
NINJA_CLIENT_SECRET=$(extract NINJA_CLIENT_SECRET)

# Wazuh (add to BW when available)
WAZUH_URL=$(extract WAZUH_URL)
WAZUH_USERNAME=$(extract WAZUH_USERNAME)
WAZUH_PASSWORD=$(extract WAZUH_PASSWORD)

# UniFi
UNIFI_API_KEY=$(extract UNIFI_API_KEY)

# Planner
PLANNER_PLAN_ID=-aZEdilGAUqLC8B8GwOLfmQAAh9M

# Data paths
STAGING_DIR=$REPO_ROOT/staging
DB_DIR=$REPO_ROOT/db
EOF

chmod 600 "$OUT"
echo "Written to $OUT (mode 600)"
echo "Verify with: head -5 $OUT"
