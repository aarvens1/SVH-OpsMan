# SVH OpsMan — Design Notes

Architecture decisions, token-cost analysis, and workflow friction points. Review before making changes to the server or skills.

**Last audited:** 2026-05-16

---

## What's resolved

| Item | Resolution |
|------|-----------|
| All 140 tool schemas sent every session | Deferred tool loading — schemas cost tokens only when loaded via ToolSearch. A full ops session uses ~994 schema tokens. |
| Pretty-printed JSON responses | `ok()` in `utils/response.ts` uses `JSON.stringify(data)` (no indent). Already done. |
| Auth token caching | All four auth modules (`graph.ts`, `azure.ts`, `mde.ts`, `ninja.ts`, `wazuh.ts`) have in-memory TTL caches. No re-auth within a session. |
| Bitwarden unlock alias | `bwu` alias and shell warning are live in `dotfiles/bashrc.sh`. |
| Single monolithic MCP server | Deprioritized. With deferred tool loading, splitting into per-service servers saves negligible tokens. Not worth the added operational complexity. |
| `aaron-voice.md` in `.claude/rules/` | Deleted. The skill copy in `.claude/skills/draft/` loads only when `/draft` or a drafting trigger phrase is used. Saves ~2.8k tokens on every non-drafting session. |
| Centralized config | `.claude/config.yaml` exists and is fully populated: user UPN/ID, IT group ID, vault path, all 9 Planner board IDs. Session-start hook injects it at the top of every session. |
| Session-start hook `.env` fallback message | Fixed. Hook now outputs `"run: export BW_SESSION=$(bw unlock --raw)"` instead of the stale `.env` reference. |
| Response shaping — `wazuh.ts` | All 7 tools shaped. `wazuh_search_alerts` data field trimmed to diagnostic top-level fields only (srcip, dstip, srcuser, eventID, up to 5 Windows eventdata fields). Deep XML structures dropped. |
| Response shaping — `defender-mde.ts` | All 6 tools shaped. `mde_list_devices` and agents have 60-second TTL response cache. |
| Response shaping — `planner.ts` | All tools shaped. `planner_create_task` raw spread fixed — now returns same keyed shape as `planner_get_task`. |
| PowerShell module suite | 14 modules covering all integrated systems. New: `SVH.AD` (Active Directory via PSRemoting), `SVH.Network` (AD DNS, Windows DHCP, cross-platform .NET validation). |
| PowerShell `.env` references | Removed from `connect.ps1`, `SVH.Core.psm1` error messages, and session-start hook. BW_SESSION is required; no fallback. |
| Reference file auto-sync | `session-start.sh` runs `rsync -a --delete ~/SVH-OpsMan/references/ "$VAULT/References/"` on every session start. |
| Response shaping — `teams.ts` read tools | `teams_list_teams`, `teams_list_channels`, `teams_list_messages` shaped. `teams_list_messages` HTML-stripped + truncated to 400 chars. 3 write ops (`send_message`, `create_channel`, `add_member`) remain raw — lower priority. |
| Day-ender sentinel | `<!-- DAY-STARTER-END -->` added to day-starter template. `obsidian-output.md` updated: do NOT read daily note before appending; empty read means tool failure, not empty file. |
| Session-start hook LAST_BRIEFING fallback | Hook writes `LAST_BRIEFING` to `.claude/briefing-state` when vault is accessible. Reads it as fallback in non-WSL environments. `BRIEFING_EXISTS` and `OPEN_INCIDENTS` still vault-dependent. |

---

## Open issues

### 1. Response shaping — remaining files

`azure.ts` is the fully-shaped reference. The table below reflects current state after completing planner, wazuh, and defender-mde.

| File | Raw `ok(res.data)` | Shaped `.map()` | Notes |
|------|--------------------|-----------------|-------|
| `azure.ts` | 0 | 14 ✓ | Reference implementation |
| `planner.ts` | 0 | 16 ✓ | Done |
| `wazuh.ts` | 0 | 7 ✓ | Done |
| `defender-mde.ts` | 0 | 6 ✓ | Done |
| `outlook-mail.ts` | 4 | 5 | |
| `teams.ts` | 3 | 6 ✓ | 3 remaining are write ops (send/create/add) |
| `ninjaone.ts` | 12 | 6 | |
| `entra-admin.ts` | 8 | 2 | |
| `outlook-calendar.ts` | 6 | 2 | |
| `confluence.ts` | 8 | 0 | |
| `exchange-admin.ts` | 6 | 0 | |
| `intune.ts` | 6 | 0 | |
| `ms-admin.ts` | 7 | 0 | |
| `ms-todo.ts` | 5 | 0 | |
| `onedrive.ts` | 6 | 0 | |
| `printerlogic.ts` | 7 | 0 | |
| `sharepoint.ts` | 7 | 0 | |
| `unifi-cloud.ts` | 4 | 0 | |
| `unifi-network.ts` | 7 | 0 | |

**Priority order for remaining shaping:** Tools called by daily-rhythm skills first.
1. `ninjaone.ts` — partially shaped; finish the remaining 12 raw returns
2. `ms-admin.ts` — service health called daily
3. `teams.ts` — called by day-starter and day-ender
4. `outlook-mail.ts` — partially shaped; finish remaining 4
5. Everything else — shape opportunistically when touching those files

---

### 2. Session-start hook ops context

The hook outputs: branch, dirty-file count, ahead count, BW status, day of week, today's date, briefing-exists flag, open incident count, and last briefing date.

**Last briefing date** — fixed. Hook now writes `LAST_BRIEFING` to `.claude/briefing-state` when the vault is accessible, and reads it as a fallback when the vault is not (non-WSL / remote execution). `BRIEFING_EXISTS` and `OPEN_INCIDENTS` still require vault access — they'll show "unknown" in remote sessions. Lower priority to fix.

**Day of week** — present in the hook output. The 72h Monday lookback is handled in the day-starter skill instructions, not the hook. No change needed here.

---

### 3. Tool response TTL cache

Auth tokens are cached within a session (resolved). Tool *responses* are cached on `wazuh_list_agents` and `mde_list_devices`. The pattern should extend to:

- `ninja_list_servers` — called multiple times in a typical day-starter session
- `admin_get_service_health` — called daily; changes rarely within a session

This is lower priority than finishing response shaping — cache a small response, not a raw one.

---

### 4. Day-ender append fragility — RESOLVED

Chosen fix: structural sentinel. The day-starter template now ends with `<!-- DAY-STARTER-END -->`. Day-ender appends without reading first. `obsidian-output.md` updated with firm guidance: never read a daily note before appending; an empty read result means the tool returned metadata-only (a known MCP bug), not that the file is empty.

---

## Priority table

| Priority | Item | Effort | Notes |
|----------|------|--------|-------|
| **Now** | Finish response shaping — remaining 16 files | Medium | Do opportunistically when touching a file. Write ops in teams.ts are lowest priority. |
| **Later** | TTL cache on tool responses — ninja_list_servers, admin_get_service_health | Small | Shape first; these tools are already shaped |
| **Later** | Session-start hook — BRIEFING_EXISTS / OPEN_INCIDENTS fallback | Small | Still vault-dependent in remote sessions; lower priority than shaping |

---

## Dev tools

### MCP inspector

Browse all registered tools interactively without opening Claude:

```bash
cd mcp-server
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

Useful for verifying a new tool registered correctly and checking its input schema before testing end-to-end.

---

## Known runtime quirks

**Planner update fails with 412 Precondition Failed**
Re-fetch the task before updating — Planner requires the current ETag. Ask Claude to retry from a fresh `planner_get_task` call.

**UniFi controller session expires mid-session**
Sessions refresh automatically but last ~1 hour. Repeated auth errors usually mean `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, or `UNIFI_PASSWORD` is wrong, or the controller isn't reachable from WSL.

**Wazuh TLS errors**
The Wazuh client skips certificate verification (on-prem installations use self-signed certs). "Connection refused" means check that `WAZUH_URL` uses `https://` and port 55000 is reachable from WSL.

---

## Data access model

A note on what "Claude has access to X" means in practice.

Every tool makes a targeted API call and returns only what was asked for. No tool fetches broadly and filters client-side:

- `teams_list_my_chats` → `GET /users/{graphUserId}/chats` — only Aaron's chats
- `teams_list_messages` → `GET /teams/{teamId}/channels/{channelId}/messages` — only the specific channel
- `mail_search` → `GET /users/{graphUserId}/messages` — scoped to one mailbox

The app registration permission determines what the credential *could* access. The query determines what *actually comes back*. Those are separate things.

**The gap between permission scope and query scope:** `Mail.ReadWrite` is a tenant-wide application permission. The server locks all mail and calendar calls to `GRAPH_USER_ID`, and an Exchange `ApplicationAccessPolicy` enforces the same restriction at the Exchange layer. For Teams, `ChannelMessage.Read.All` is tenant-wide but the server only queries IT Team channels and Aaron's own chats — enforced by code, not by the permission grant. RSC (`ChannelMessage.Read.Group`) is the right fix if that gap ever needs closing at the permission layer.
