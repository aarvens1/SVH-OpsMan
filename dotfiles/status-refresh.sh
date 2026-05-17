#!/usr/bin/env bash
# SVH OpsMan — status refresh daemon
# Polls security APIs every 2 minutes and writes /tmp/svh-opsman-status.json.
# Any consumer (shell prompt, status bar, pre-aggregation scripts) can read this
# file. Shows '?' for any field while this script is not running or BW is locked.
#
# Start: launched automatically by the 'opsman' shell function in bashrc.sh.
# Stop:  kill $(pgrep -f status-refresh.sh)
#
# Requires: BW_SESSION env var (active Bitwarden session), jq, curl

set -uo pipefail

CACHE_FILE="/tmp/svh-opsman-status.json"
INTERVAL=120

# ── Bitwarden credential lookup ───────────────────────────────────────────────
bw_field() {
  bw get item "SVH OpsMan" 2>/dev/null \
    | jq -r --arg k "$1" '.fields[] | select(.name == $k) | .value' 2>/dev/null
}

# ── Single refresh pass ───────────────────────────────────────────────────────
fetch_status() {
  # Load credentials from Bitwarden
  local WAZUH_URL WAZUH_USERNAME WAZUH_PASSWORD
  local GRAPH_TENANT_ID GRAPH_CLIENT_ID GRAPH_CLIENT_SECRET
  local MDE_TENANT_ID MDE_CLIENT_ID MDE_CLIENT_SECRET
  local NINJA_CLIENT_ID NINJA_CLIENT_SECRET
  local UNIFI_API_KEY

  WAZUH_URL=$(bw_field WAZUH_URL)
  WAZUH_USERNAME=$(bw_field WAZUH_USERNAME)
  WAZUH_PASSWORD=$(bw_field WAZUH_PASSWORD)
  GRAPH_TENANT_ID=$(bw_field GRAPH_TENANT_ID)
  GRAPH_CLIENT_ID=$(bw_field GRAPH_CLIENT_ID)
  GRAPH_CLIENT_SECRET=$(bw_field GRAPH_CLIENT_SECRET)
  MDE_TENANT_ID=$(bw_field MDE_TENANT_ID)
  MDE_CLIENT_ID=$(bw_field MDE_CLIENT_ID)
  MDE_CLIENT_SECRET=$(bw_field MDE_CLIENT_SECRET)
  NINJA_CLIENT_ID=$(bw_field NINJA_CLIENT_ID)
  NINJA_CLIENT_SECRET=$(bw_field NINJA_CLIENT_SECRET)
  UNIFI_API_KEY=$(bw_field UNIFI_API_KEY)

  local wazuh_count=-1
  local mde_count=-1
  local risky_count=-1
  local ninja_status="?/?"
  local m365_status="?"
  local unifi_status="?"

  # ── Wazuh — active alert count ────────────────────────────────────────────
  if [[ -n "$WAZUH_URL" && -n "$WAZUH_USERNAME" && -n "$WAZUH_PASSWORD" ]]; then
    local wazuh_token
    wazuh_token=$(curl -sk --max-time 10 \
      -u "${WAZUH_USERNAME}:${WAZUH_PASSWORD}" \
      "${WAZUH_URL}/security/user/authenticate?raw=true" 2>/dev/null)
    if [[ -n "$wazuh_token" ]]; then
      wazuh_count=$(curl -sk --max-time 10 \
        -H "Authorization: Bearer $wazuh_token" \
        "${WAZUH_URL}/alerts?limit=1" 2>/dev/null \
        | jq -r '.data.total_affected_items // -1' 2>/dev/null)
      wazuh_count=${wazuh_count:-"-1"}
    fi
  fi

  # ── Defender MDE — open alert count ──────────────────────────────────────
  if [[ -n "$MDE_TENANT_ID" && -n "$MDE_CLIENT_ID" && -n "$MDE_CLIENT_SECRET" ]]; then
    local mde_token
    mde_token=$(curl -s --max-time 10 -X POST \
      "https://login.microsoftonline.com/${MDE_TENANT_ID}/oauth2/token" \
      -d "grant_type=client_credentials&client_id=${MDE_CLIENT_ID}&client_secret=${MDE_CLIENT_SECRET}&resource=https://api.securitycenter.microsoft.com" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
    if [[ -n "$mde_token" ]]; then
      mde_count=$(curl -s --max-time 10 \
        -H "Authorization: Bearer $mde_token" \
        "https://api.securitycenter.microsoft.com/api/alerts?\$filter=status+ne+'Resolved'&\$select=id&\$top=500" \
        2>/dev/null | jq '.value | length // -1' 2>/dev/null)
      mde_count=${mde_count:-"-1"}
    fi
  fi

  # ── Graph token (shared for Entra risky users + M365 health) ─────────────
  local graph_token=''
  if [[ -n "$GRAPH_TENANT_ID" && -n "$GRAPH_CLIENT_ID" && -n "$GRAPH_CLIENT_SECRET" ]]; then
    graph_token=$(curl -s --max-time 10 -X POST \
      "https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token" \
      -d "grant_type=client_credentials&client_id=${GRAPH_CLIENT_ID}&client_secret=${GRAPH_CLIENT_SECRET}&scope=https://graph.microsoft.com/.default" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
  fi

  # ── Entra — risky users at risk ───────────────────────────────────────────
  if [[ -n "$graph_token" ]]; then
    risky_count=$(curl -s --max-time 10 \
      -H "Authorization: Bearer $graph_token" \
      -H "ConsistencyLevel: eventual" \
      "https://graph.microsoft.com/v1.0/identityProtection/riskyUsers?\$filter=riskState+eq+'atRisk'&\$select=id&\$top=500" \
      2>/dev/null | jq '.value | length // -1' 2>/dev/null)
    risky_count=${risky_count:-"-1"}
  fi

  # ── M365 service health — any active (unresolved) incidents ───────────────
  if [[ -n "$graph_token" ]]; then
    local inc_count
    inc_count=$(curl -s --max-time 10 \
      -H "Authorization: Bearer $graph_token" \
      "https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?\$filter=isResolved+eq+false&\$select=id&\$top=50" \
      2>/dev/null | jq '.value | length // -1' 2>/dev/null)
    if [[ -n "$inc_count" && "$inc_count" -ge 0 ]]; then
      m365_status=$([ "$inc_count" -eq 0 ] && echo '✓' || echo "${inc_count} inc")
    fi
  fi

  # ── NinjaOne — online/total device ratio ─────────────────────────────────
  if [[ -n "$NINJA_CLIENT_ID" && -n "$NINJA_CLIENT_SECRET" ]]; then
    local ninja_token
    ninja_token=$(curl -s --max-time 10 -X POST \
      "https://app.ninjarmm.com/ws/oauth/token" \
      -d "grant_type=client_credentials&client_id=${NINJA_CLIENT_ID}&client_secret=${NINJA_CLIENT_SECRET}&scope=monitoring" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
    if [[ -n "$ninja_token" ]]; then
      local devices
      devices=$(curl -s --max-time 15 \
        -H "Authorization: Bearer $ninja_token" \
        "https://app.ninjarmm.com/v2/devices-detailed?pageSize=1000" \
        2>/dev/null)
      if [[ -n "$devices" ]]; then
        local total online
        # Exclude maintenance-mode devices from offline count
        total=$(echo "$devices" | jq '[.[] | select(.nodeClass == "WINDOWS_SERVER" or .nodeClass == "WINDOWS_WORKSTATION")] | length' 2>/dev/null)
        online=$(echo "$devices" | jq '[.[] | select(
          (.nodeClass == "WINDOWS_SERVER" or .nodeClass == "WINDOWS_WORKSTATION") and
          (.offline == false or .offline == null) and
          (.maintenance == false or .maintenance == null)
        )] | length' 2>/dev/null)
        if [[ -n "$total" && -n "$online" ]]; then
          ninja_status="${online}/${total}"
        fi
      fi
    fi
  fi

  # ── UniFi Cloud — site connectivity ──────────────────────────────────────
  if [[ -n "$UNIFI_API_KEY" ]]; then
    local site_statuses
    site_statuses=$(curl -s --max-time 10 \
      -H "X-API-KEY: ${UNIFI_API_KEY}" \
      "https://api.ui.com/ea/sites" \
      2>/dev/null | jq -r '.data[].statistics.connectivity.status // "unknown"' 2>/dev/null)
    if [[ -n "$site_statuses" ]]; then
      if echo "$site_statuses" | grep -qiE 'offline|degraded|error|unknown'; then
        local bad
        bad=$(echo "$site_statuses" | grep -ciE 'offline|degraded|error|unknown' 2>/dev/null || echo 1)
        unifi_status="${bad} !"
      else
        unifi_status="✓"
      fi
    fi
  fi

  # Mark stale when all security counts are still unknown
  local stale=false
  if [[ "$wazuh_count" == "-1" && "$mde_count" == "-1" && "$risky_count" == "-1" ]]; then
    stale=true
  fi

  # Atomic write via temp file to avoid partial reads
  local tmp
  tmp=$(mktemp "${CACHE_FILE}.XXXXXX")
  cat > "$tmp" <<EOF
{
  "wazuh":   ${wazuh_count},
  "mde":     ${mde_count},
  "risky":   ${risky_count},
  "ninja":   "${ninja_status}",
  "m365":    "${m365_status}",
  "unifi":   "${unifi_status}",
  "stale":   ${stale},
  "updated": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
  mv "$tmp" "$CACHE_FILE"
}

# ── Main loop ─────────────────────────────────────────────────────────────────
echo "[status-refresh] started (PID $$, interval ${INTERVAL}s)"
while true; do
  fetch_status 2>/dev/null || true
  sleep "$INTERVAL"
done
