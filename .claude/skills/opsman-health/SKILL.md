---
name: opsman-health
description: OpsMan integration connectivity check. Fires a lightweight probe against every configured service and reports pass/fail per integration. Use when you suspect a broken data point or after making changes to the MCP server. Trigger phrases: "test all data points", "connectivity check", "opsman health", "is opsman healthy", "test my integrations", "check all data points".
when_to_use: After MCP server changes, after a BW session expiry, or whenever a tool call fails unexpectedly and you want to know which integrations are up.
allowed-tools: "mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_alerts mcp__svh-opsman__ninja_get_device_health mcp__svh-opsman__ninja_list_fleet_volumes mcp__svh-opsman__ninja_get_logged_on_users mcp__svh-opsman__ninja_get_os_patches mcp__svh-opsman__azure_list_resource_groups mcp__svh-opsman__entra_list_directory_roles mcp__svh-opsman__exo_list_accepted_domains mcp__svh-opsman__intune_list_compliance_policies mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_list_spaces mcp__svh-opsman__teams_list_teams mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__onedrive_get_user_drive mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_list_folders mcp__svh-opsman__sp_search_sites"
---

# OpsMan Integration Health Check

Goal: verify every service can authenticate and return data. This is a connectivity probe, not a data audit — speed matters, depth does not.

## Step 1 — Fire all probes in parallel

Run every call simultaneously. Do not wait for one before starting another.

**Microsoft 365 / Graph stack (one auth context, multiple surfaces):**
- `admin_get_service_health` — M365 tenant health (also validates Graph token)
- `mail_list_folders` — Exchange Online / mailbox access
- `teams_list_teams` — Teams access
- `planner_list_tasks` with `plan_id: "config.planner.sysadmin", page_size: 1` — Planner access (list_user_plans is 403 with app-only auth)
- `todo_list_task_lists` with `user_id: "config.user.upn"` — To Do access
- `onedrive_get_user_drive` — OneDrive access
- `sp_search_sites` with query `"sites"` — SharePoint access
- `exo_list_accepted_domains` — Exchange admin (separate EXO token)
- `entra_list_directory_roles` — Entra ID access
- `intune_list_compliance_policies` — Intune access
- `mde_list_alerts` — Defender / MDE access

**NinjaOne:**
- `ninja_list_organizations` — auth + basic connectivity
- `ninja_list_alerts` — fleet alerts endpoint
- `ninja_list_fleet_volumes` with `org_id: 25, page_size: 1` — volumes query endpoint
- `ninja_get_device_health` with `org_id: 25, page_size: 1` — health query endpoint; verify `healthStatus` field is populated (not null) on at least one device
- `ninja_get_logged_on_users` with `org_id: 25, page_size: 1` — Tier 1 query endpoint
- `ninja_get_os_patches` with `org_id: 25, page_size: 1` — Tier 1 query endpoint

**Azure:**
- `azure_list_resource_groups` — Azure ARM token + basic access

**UniFi:**
- `unifi_list_sites` — UniFi Cloud connectivity

**Confluence:**
- `confluence_list_spaces` — Confluence access

**Wazuh:**
- `wazuh_list_agents` — Wazuh connectivity

## Step 2 — Score each integration

For each call, classify:

| Result | Symbol | Meaning |
|--------|--------|---------|
| Returns any data | ✅ | Connected |
| Returns empty list (no error) | ✅ | Connected — no data in scope |
| Error: auth / 401 / 403 | ❌ AUTH | Token or credential issue |
| Error: 404 / endpoint not found | ❌ PATH | Wrong API path — check tool implementation |
| Error: 500 / server error | ❌ SERVER | Upstream service error |
| Error: timeout / network | ❌ NET | Connectivity issue |
| Tool not enabled / missing env | ➖ | Not configured |

Group the M365 surfaces under a single "Microsoft 365 (Graph)" section — they share one auth context, so a single 401 likely means one bad token, not five broken integrations.

**NinjaOne — special checks:**
- `ninja_get_device_health`: flag ⚠️ if it returns results but `healthStatus` is null on all devices (field mapping regression)
- Tier 1 query endpoints (`logged_on_users`, `os_patches`): flag ⚠️ if endpoint returns 404 — means the API path is wrong

## Step 3 — Report

Print a compact table, one row per integration group:

```
Integration            Status   Notes
─────────────────────────────────────────────────────
Microsoft 365 (Graph)  ✅
  └ Mail               ✅
  └ Teams              ✅
  └ Planner            ✅
  └ To Do              ✅

  └ OneDrive           ✅
  └ SharePoint         ✅
Exchange Admin (EXO)   ✅
Entra ID               ✅
Intune                 ✅
Defender / MDE         ✅
NinjaOne               ✅
  └ Alerts             ✅
  └ Fleet Volumes      ✅
  └ Device Health      ✅   healthStatus populated
  └ Logged-on Users    ✅
  └ OS Patches         ✅
Azure                  ✅
UniFi                  ✅
Confluence             ✅
Wazuh                  ➖   WAZUH_URL not set
```

Follow with a **Needs attention** block (callout) only if anything is ❌ or ⚠️. Include the exact error text — that's what the user needs to diagnose.

Do not write to Obsidian unless the user asks. This is a quick diagnostic, not a filing operation.

## Notes

- A BW session expiry breaks everything at once — if all services fail simultaneously, that's the first thing to check. Tell the user to run `export BW_SESSION=$(bw unlock --raw)` and restart the MCP server.
- If NinjaOne auth fails, check `NINJA_CLIENT_ID` and `NINJA_CLIENT_SECRET` in the SVH OpsMan BW item.
- If only EXO fails while other Graph surfaces work, the EXO PowerShell token is separate — may need its own refresh.
- MCP server must be restarted after any change to `ninjaone.ts` or other tool files — changes to compiled JS in `dist/` are not picked up until restart.
