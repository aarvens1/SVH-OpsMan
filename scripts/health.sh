#!/usr/bin/env bash
# SVH OpsMan — pre-flight health check
# Verifies the full stack: shell env, BW, CLI tools, MCP server, status daemon, and API connectivity.
# Usage: ops-health   (alias in dotfiles/bashrc.sh)
#        bash scripts/health.sh

OPSMANDIR="${OPSMANDIR:-$HOME/SVH-OpsMan}"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}   $*"; }
fail() { echo -e "  ${RED}✗${RESET}  $*"; ERRORS=$((ERRORS+1)); }
hdr()  { echo -e "\n${CYAN}${BOLD}$*${RESET}"; }

ERRORS=0
WARNINGS=0

bw_field() {
  bw get item "SVH OpsMan" 2>/dev/null \
    | jq -r --arg k "$1" '.fields[] | select(.name==$k) | .value' 2>/dev/null
}

# ── 1. Shell environment ──────────────────────────────────────────────────────
hdr "1. Shell environment"
[[ -n "${BW_SESSION:-}" ]] && ok "BW_SESSION set" \
  || { fail "BW_SESSION not set — run: bwu"; }
command -v claude &>/dev/null && ok "claude: $(which claude)" \
  || fail "claude not in PATH (check ~/.local/bin)"
command -v bw     &>/dev/null && ok "bw CLI: $(bw --version 2>/dev/null)" \
  || fail "bw CLI not found"
command -v node   &>/dev/null && ok "node: $(node --version 2>/dev/null)" \
  || fail "node not in PATH (nvm not loaded? source ~/.bashrc)"
command -v jq     &>/dev/null && ok "jq: $(jq --version 2>/dev/null)" \
  || fail "jq not found"
command -v hx     &>/dev/null && ok "helix: $(hx --version 2>/dev/null | head -1)" \
  || { warn "helix not installed — run wsl-shell-setup.sh"; WARNINGS=$((WARNINGS+1)); }

# ── 2. Bitwarden ──────────────────────────────────────────────────────────────
hdr "2. Bitwarden"
if command -v bw &>/dev/null; then
  BW_STATUS=$(bw status 2>/dev/null)
  if echo "$BW_STATUS" | grep -q '"status":"unlocked"'; then
    ok "Vault unlocked"
    GRAPH_TENANT=$(bw_field GRAPH_TENANT_ID)
    [[ -n "$GRAPH_TENANT" ]] \
      && ok "SVH OpsMan item readable (GRAPH_TENANT_ID present)" \
      || { warn "GRAPH_TENANT_ID not found in SVH OpsMan item"; WARNINGS=$((WARNINGS+1)); }
  else
    fail "Vault locked — run: bwu"
  fi
fi

# ── 3. MCP server ─────────────────────────────────────────────────────────────
hdr "3. MCP server (svh-opsman)"
[[ -f "$OPSMANDIR/mcp-server/dist/index.js" ]] \
  && ok "dist/index.js built" \
  || fail "Not built — cd mcp-server && npm run build"
[[ -d "$OPSMANDIR/mcp-server/node_modules" ]] \
  && ok "node_modules present" \
  || { warn "node_modules missing — cd mcp-server && npm install"; WARNINGS=$((WARNINGS+1)); }

# ── 4. Status daemon ──────────────────────────────────────────────────────────
hdr "4. Status refresh daemon"
DAEMON_PID=$(pgrep -f "dotfiles/status-refresh.sh" 2>/dev/null | head -1)
if [[ -n "$DAEMON_PID" ]]; then
  ok "Daemon running (PID $DAEMON_PID)"
else
  warn "Daemon not running — run: opsman (or bwu if BW was locked at startup)"
  WARNINGS=$((WARNINGS+1))
fi

if [[ -f /tmp/svh-opsman-status.json ]]; then
  UPDATED=$(jq -r '.updated // "unknown"' /tmp/svh-opsman-status.json 2>/dev/null)
  STALE=$(jq -r '.stale // "true"' /tmp/svh-opsman-status.json 2>/dev/null)
  if [[ "$STALE" == "true" ]]; then
    warn "Cache stale (last updated: $UPDATED) — BW may not have been unlocked when daemon started; run bwu"
    WARNINGS=$((WARNINGS+1))
  else
    ok "Cache fresh (last updated: $UPDATED)"
    jq -r '"     Wazuh:\(.wazuh)  MDE:\(.mde)  Risky:\(.risky)  Ninja:\(.ninja)  M365:\(.m365)  UniFi:\(.unifi)"' \
      /tmp/svh-opsman-status.json 2>/dev/null
  fi
else
  warn "Cache file /tmp/svh-opsman-status.json not yet created"; WARNINGS=$((WARNINGS+1))
fi

# ── 5. API connectivity ───────────────────────────────────────────────────────
hdr "5. API connectivity"

if ! echo "${BW_STATUS:-$(bw status 2>/dev/null)}" | grep -q '"status":"unlocked"'; then
  warn "Skipping API tests — BW locked"
  WARNINGS=$((WARNINGS+1))
else
  # Microsoft Graph
  GRAPH_TENANT=$(bw_field GRAPH_TENANT_ID)
  GRAPH_CLIENT=$(bw_field GRAPH_CLIENT_ID)
  GRAPH_SECRET=$(bw_field GRAPH_CLIENT_SECRET)
  if [[ -n "$GRAPH_TENANT" && -n "$GRAPH_CLIENT" && -n "$GRAPH_SECRET" ]]; then
    GRAPH_TOKEN=$(curl -s --max-time 10 -X POST \
      "https://login.microsoftonline.com/${GRAPH_TENANT}/oauth2/v2.0/token" \
      -d "grant_type=client_credentials&client_id=${GRAPH_CLIENT}&client_secret=${GRAPH_SECRET}&scope=https://graph.microsoft.com/.default" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
    [[ -n "$GRAPH_TOKEN" ]] && ok "Microsoft Graph ✓" \
      || fail "Graph token failed — check GRAPH_CLIENT_SECRET in BW"
  else
    warn "Graph credentials incomplete in BW (need GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET)"
    WARNINGS=$((WARNINGS+1))
  fi

  # Microsoft Defender (MDE)
  MDE_TENANT=$(bw_field MDE_TENANT_ID)
  MDE_CLIENT=$(bw_field MDE_CLIENT_ID)
  MDE_SECRET=$(bw_field MDE_CLIENT_SECRET)
  if [[ -n "$MDE_TENANT" && -n "$MDE_CLIENT" && -n "$MDE_SECRET" ]]; then
    MDE_TOKEN=$(curl -s --max-time 10 -X POST \
      "https://login.microsoftonline.com/${MDE_TENANT}/oauth2/token" \
      -d "grant_type=client_credentials&client_id=${MDE_CLIENT}&client_secret=${MDE_SECRET}&resource=https://api.securitycenter.microsoft.com" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
    [[ -n "$MDE_TOKEN" ]] && ok "Microsoft Defender (MDE) ✓" \
      || fail "MDE token failed — check MDE credentials in BW"
  else
    warn "MDE credentials incomplete in BW"; WARNINGS=$((WARNINGS+1))
  fi

  # NinjaOne
  NINJA_CLIENT=$(bw_field NINJA_CLIENT_ID)
  NINJA_SECRET=$(bw_field NINJA_CLIENT_SECRET)
  if [[ -n "$NINJA_CLIENT" && -n "$NINJA_SECRET" ]]; then
    NINJA_TOKEN=$(curl -s --max-time 10 -X POST \
      "https://app.ninjarmm.com/ws/oauth/token" \
      -d "grant_type=client_credentials&client_id=${NINJA_CLIENT}&client_secret=${NINJA_SECRET}&scope=monitoring" \
      2>/dev/null | jq -r '.access_token // ""' 2>/dev/null)
    [[ -n "$NINJA_TOKEN" ]] && ok "NinjaOne ✓" \
      || fail "NinjaOne token failed — check NINJA_CLIENT_ID/SECRET in BW"
  else
    warn "NinjaOne credentials not found in BW"; WARNINGS=$((WARNINGS+1))
  fi

  # Obsidian local REST API
  OBSIDIAN_KEY=$(bw_field OBSIDIAN_API_KEY)
  if [[ -n "$OBSIDIAN_KEY" ]]; then
    OBSIDIAN_RESP=$(curl -s --max-time 5 -H "Authorization: Bearer $OBSIDIAN_KEY" \
      "http://127.0.0.1:27123/" 2>/dev/null)
    if [[ -n "$OBSIDIAN_RESP" ]]; then
      ok "Obsidian local REST API ✓"
    else
      warn "Obsidian not responding — is the app open with REST API plugin enabled?"
      WARNINGS=$((WARNINGS+1))
    fi
  else
    warn "OBSIDIAN_API_KEY not found in BW"; WARNINGS=$((WARNINGS+1))
  fi

  # Wazuh (credentials documented as missing from BW — expected warn)
  WAZUH_URL=$(bw_field WAZUH_URL)
  if [[ -n "$WAZUH_URL" ]]; then
    WAZUH_USER=$(bw_field WAZUH_USERNAME)
    WAZUH_PASS=$(bw_field WAZUH_PASSWORD)
    WAZUH_TOKEN=$(curl -sk --max-time 10 \
      -u "${WAZUH_USER}:${WAZUH_PASS}" \
      "${WAZUH_URL}/security/user/authenticate?raw=true" 2>/dev/null)
    [[ -n "$WAZUH_TOKEN" ]] && ok "Wazuh ✓" \
      || { warn "Wazuh auth failed"; WARNINGS=$((WARNINGS+1)); }
  else
    warn "Wazuh creds not in BW (expected — see references/credentials.md)"
    WARNINGS=$((WARNINGS+1))
  fi

  # UniFi Cloud
  UNIFI_KEY=$(bw_field UNIFI_API_KEY)
  if [[ -n "$UNIFI_KEY" ]]; then
    UNIFI_COUNT=$(curl -s --max-time 10 \
      -H "X-API-KEY: $UNIFI_KEY" \
      "https://api.ui.com/ea/sites" 2>/dev/null | jq '.data | length' 2>/dev/null)
    [[ -n "$UNIFI_COUNT" && "$UNIFI_COUNT" -gt 0 ]] \
      && ok "UniFi Cloud API ✓ ($UNIFI_COUNT site(s))" \
      || { warn "UniFi API not responding or zero sites"; WARNINGS=$((WARNINGS+1)); }
  else
    warn "UNIFI_API_KEY not found in BW"; WARNINGS=$((WARNINGS+1))
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}All systems go.${RESET}"
elif [[ $ERRORS -eq 0 ]]; then
  echo -e "${YELLOW}${BOLD}${WARNINGS} warning(s) — review above, but stack is operational.${RESET}"
else
  echo -e "${RED}${BOLD}${ERRORS} error(s), ${WARNINGS} warning(s) — stack not fully operational.${RESET}"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
