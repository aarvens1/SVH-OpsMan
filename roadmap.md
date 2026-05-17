# SVH OpsMan — Roadmap & Design Notes

Architecture decisions, open issues, and the evolution plan. Review before making changes to the server or skills.

**Last audited:** 2026-05-17

---

## What's shipped

Everything here landed after the initial roadmap was written. Not in any prior planning doc.

| Item | Notes |
|------|-------|
| WezTerm ops workspace | Fully implemented — two-layer cache for status bar (status-refresh.sh + Lua reader), keybindings, Obsidian deep links |
| PowerShell TUI | Searchable terminal UI for all 237 PS module functions — parameter forms, command preview, confirmation dialogs, Obsidian output |
| Desktop Commander guard hook + ra_stevens tier | Read-only PSRemoting account for Desktop Commander access; PreToolUse hook blocks SVH scripts and credential access from non-Claude sessions |
| PreToolUse / PostToolUse / Stop hooks | Hook infrastructure beyond SessionStart — Bash pre-flight checks, post-flight logging, session cleanup |
| SVH.AD and SVH.Network PS modules | Active Directory via PSRemoting, AD DNS and Windows DHCP cross-platform validation |
| Tenant Forensics and License Audit skills | Two new investigation skills shipped |
| Reference auto-sync | session-start.sh rsync to vault on every session — repo is source of truth |
| Centralized config | config.yaml fully populated; session-start injects it at the top of every session |
| LAST_BRIEFING fallback | Hook writes briefing-state on WSL, reads it as fallback in remote sessions |
| USER_GUIDE.md | Full fresh Win11 + WSL setup guide |

| Response shaping — Wazuh, Defender, Planner, Teams (read), NinjaOne (partial), Confluence, Entra, Calendar | See open issues for what's left |
| Day-ender sentinel | `<!-- DAY-STARTER-END -->` in template; day-ender appends without reading first |
| WSL shell environment — zsh + modern CLI tooling | `scripts/wsl-shell-setup.sh`: zsh, fzf, bat, eza, delta, lazygit, btop, mtr, nmap, zoxide, httpie, starship, PowerShell 7 (pwsh via snap). Enables WSL systemd. Sources dotfiles/bashrc.sh for bwu/opsman/clip/wpath/wexp. |
| Tailscale remote access | `scripts/tailscale-wsl-setup.sh` for WSL node; `scripts/tailscale-udm-setup.md` for UDM Pro/SE subnet router deployment — exposes all site VLANs to the tailnet without per-device installs. |

---

## Track 1: From pull to push

Right now every skill is human-triggered. Claude fetches data when you ask. The next version shifts that: data is collected before you open Claude, and critical events surface without you having to ask.

### Pre-aggregation script for day-starter
A script (shell or Node) that runs before you open Claude — wired into the session-start hook on weekday mornings. Calls NinjaOne, Wazuh, Defender, Entra, M365 health, Planner, and Calendar APIs and writes a single staging JSON to the vault. Day-starter reads the file and skips all the fetching, jumping straight to synthesis.

**What to pre-fetch:** offline/alerting NinjaOne devices, Wazuh alerts ≥ medium (last 24h, 72h on Monday), Defender High/Critical alerts, Entra risky users, M365 service health, Planner tasks assigned to Aaron, today's calendar events.

**Estimated saving:** 10–15 tool calls and their associated latency eliminated per morning.

### Webhook receiver for alert-driven sessions
NinjaOne and Wazuh can both POST webhooks on alert conditions. A lightweight receiver (n8n, Make, or a small Node process) queues incoming events. Day-starter reads the queue instead of polling — the session opens with "here's what happened since you were last here" rather than Claude having to go find out.

### PowerShell → vault pipeline
Add an `Export-SVHToVault` pattern to the PS modules. Functions like `Get-SVHComplianceGap` write their output directly to `OpsManVault/References/` as JSON. The Monday compliance reminder becomes a live file read instead of a manual terminal step. Same pattern for MABS job state, cluster health, and any other on-prem data that currently requires a manual PS run.

---

## Track 2: Obsidian as a live ops database

Right now Obsidian is a write-only output sink. With Obsidian Bases + consistent frontmatter, it becomes a queryable ops control center that's automatically current because Claude maintains it.

### Bases to set up
| Base | Source folder | View | Key fields |
|------|--------------|------|-----------|
| Incident Tracker | `Incidents/**` | Kanban by `status` | `severity`, `incident_id`, `date` |
| Change Calendar | `Changes/**` | Calendar by `change_date` | `risk`, `change_id`, `window` |
| Vulnerability Pipeline | `Vulnerabilities/**` | Table sorted by `priority` | `cve`, `priority`, `date` |
| Asset Registry | `Assets/**` | Table | `asset_type`, `date` (last investigated) |
| Review Queue | `Reviews/**` | Table filtered to `status: draft` | `skill`, `date` |
| Briefing History | `Briefings/Daily/**` | Calendar | `status`, `has_pending_tasks` |

### Frontmatter additions — done
The fields that unlock the Bases above are now in the skill files and `obsidian-output.md`:
- `change_date: YYYY-MM-DD` — change-record (clean date for calendar view, separate from `window` text)
- `asset_type: server|workstation|user` — asset-investigation
- `has_pending_tasks: true|false` — day-starter (set to `true` at session end if draft Planner actions remain)
- `week: YYYY-WW` — week-starter
- `attendees: []` — meeting-prep

### Obsidian templates
Store skeleton note structures in `OpsManVault/Templates/`. Skills create notes from the template rather than generating full structure from scratch. Claude writes content into pre-built sections — less output per run, more consistent structure, and you can adjust layouts by editing the template without touching SKILL.md.

Highest-value templates: Day Starter, Incident, Change Record, Asset Investigation. Day Starter runs every workday and generates the most scaffolding.

---

## Track 3: Closing the action loop

Right now Claude stages everything for explicit confirmation. The right next step is distinguishing between operations by risk level rather than treating them all the same.

### Tiered confirmation model
| Tier | Operations | Confirmation |
|------|-----------|-------------|
| Always confirm | Send Teams/mail, create Planner tasks, dismiss risky users, any write to external systems | Explicit per-session ("push it", "go ahead") |
| Lightweight confirm | Mark Planner task 100% complete, update Confluence page, file an Obsidian note | Single "yes" or approve in-line |
| Autonomous | Update briefing state file, sync references to vault, write Obsidian drafts | No confirmation needed |

### Re-enable IR Triage
IR Triage (`SKILL.md.disabled`) is the only skill that can send non-draft Teams messages. It stays disabled until the data layer and action staging are solid enough to trust for incident response. That point is close — re-enable when the tiered confirmation model is in place.

---

## New integrations worth adding

| Integration | Why | Effort |
|-------------|-----|--------|
| **Ticketing system** (Freshservice, Zendesk, etc.) | TicketSmith currently ends at copy-paste. If SVH uses any ITSM with an API, close the loop. | Medium — depends on platform |
| **Have I Been Pwned** | Check if `shoestringvalley.com` or `andersen-cost.com` accounts appear in breach data. Free API, trivial to add. | Tiny |
| **Cloudflare** | DNS, WAF events, cert expiry, analytics — if any SVH services sit behind Cloudflare. | Small |
| **Azure Monitor / Log Analytics** | Azure ARM access is in place but no Log Analytics query tool. Application and resource logs that aren't in Wazuh. | Small |
| **n8n / Make** | Webhook orchestration layer — receives NinjaOne/Wazuh/Defender events and queues them for day-starter. | Medium |

---

## File transfer

For pulling files from managed systems into WSL for analysis.

**Tailscale** — install on WSL (via the Windows host), all Windows servers, and any Linux boxes. They get stable private IPs reachable from each other regardless of NAT. SSH, SCP, and RDP all work to the Tailscale IP without firewall rules. Replaces the need for reverse SSH tunnels for Linux targets. Free up to 100 devices.

**Croc** — one-off P2P file drops. `croc send logfile.evtx` on the remote, `croc <code>` on WSL. No accounts, works through NAT, end-to-end encrypted. `winget install schollz.croc` on Windows, `apt install croc` on Linux.

**Copy-Item over PSRemoting** — already available via `SVH.OnPrem`. Use for pulling Windows event logs and config files without additional tooling:
```powershell
$s = New-PSSession -ComputerName SVH-SQL01 -Credential (Get-SVHTierCredential -Tier server)
Copy-Item -Path "C:\path\to\file" -Destination ~/landing/ -FromSession $s
```

---

## Open design issues

### 1. Response shaping — remaining tool files

`azure.ts` is the fully-shaped reference. All files are done except `teams.ts` write ops.

| File | Status | Notes |
|------|--------|-------|
| `azure.ts` | ✓ Done | Reference implementation |
| `planner.ts` | ✓ Done | |
| `wazuh.ts` | ✓ Done | |
| `defender-mde.ts` | ✓ Done | |
| `confluence.ts` | ✓ Done | |
| `entra-admin.ts` | ✓ Done | |
| `outlook-calendar.ts` | ✓ Done | `calendar_list_rooms` shaped in 2026-05-16 session |
| `ninjaone.ts` | ✓ Done | Custom field tools pass flat key-value through as-is (already shaped) |
| `ms-admin.ts` | ✓ Done | |
| `exchange-admin.ts` | ✓ Done | |
| `intune.ts` | ✓ Done | |
| `ms-todo.ts` | ✓ Done | |
| `onedrive.ts` | ✓ Done | |
| `printerlogic.ts` | ✓ Done | |
| `sharepoint.ts` | ✓ Done | |
| `unifi-cloud.ts` | ✓ Done | |
| `unifi-network.ts` | ✓ Done | |
| `outlook-mail.ts` | ✓ Done | All tools shaped in 2026-05-16 session |
| `teams.ts` | Partial | 3 remaining raw returns are write ops (send_message, create_channel, add_member) — low priority |

### 2. TTL cache on tool responses

Auth tokens are cached within a session (done). Tool *responses* are cached on `wazuh_list_agents` and `mde_list_devices`. Extend the pattern to:
- `ninja_list_servers` — called multiple times in a typical day-starter session
- `admin_get_service_health` — called daily; changes rarely within a session

Lower priority than finishing response shaping — shape first, then cache the lean response.

### 3. BRIEFING_EXISTS / OPEN_INCIDENTS in remote sessions

`LAST_BRIEFING` now has a local fallback via `.claude/briefing-state`. `BRIEFING_EXISTS` and `OPEN_INCIDENTS` still require vault access and show "unknown" in remote execution sessions. Low priority — remote sessions are the exception.

### 4. Obsidian templates not yet created

The `OpsManVault/Templates/` skeleton notes (Day Starter, Incident, Change Record, Asset Investigation) haven't been created yet. When they exist, skills should create notes from template rather than generating full structure inline.

---

## Architecture notes

### Data access model

Every tool makes a targeted API call and returns only what was asked for. No tool fetches broadly and filters client-side.

The gap between permission scope and query scope: `Mail.ReadWrite` is a tenant-wide application permission. The server locks all mail and calendar calls to `GRAPH_USER_ID`, and an Exchange `ApplicationAccessPolicy` enforces the same restriction at the Exchange layer. For Teams, `ChannelMessage.Read.All` is tenant-wide but the server only queries IT Team channels and Aaron's own chats — enforced by code, not by the permission grant. RSC (`ChannelMessage.Read.Group`) is the right fix if that gap ever needs closing at the permission layer.

### Desktop Commander / ra_stevens access model

`ra_stevens` is a read-only PSRemoting account — no admin rights, no write access to managed systems. The Desktop Commander guard hook blocks SVH scripts and Bitwarden credential access from non-Claude sessions. This creates a clean tier: Desktop Commander can run read-only PSRemoting calls for situational awareness without exposing full credentials. Pattern to apply if any other tooling needs scoped read access to managed systems.

### WezTerm status bar cache model

WezTerm is a native Windows app running Lua — it can't call MCP tools directly. Two-layer cache:
- `status-refresh.sh` runs in background (`opsman` starts it). Authenticates to each API via curl/jq, writes `/tmp/svh-opsman-status.json` every 120 seconds. Requires `BW_SESSION`.
- `wezterm.lua` reads the cache file on the same 120s interval via `wezterm.run_child_process`. Shows `⚠ stale` if the cache file is absent or all security fields are `-1`.

### Token overhead

Deferred tool loading: all 142 tool schemas load on-demand via ToolSearch, not upfront. A full ops session costs ~994 schema tokens. Splitting into per-service MCP servers would save negligible tokens at high operational complexity — not worth it.

---

## Known runtime quirks

**Planner update fails with 412 Precondition Failed**
Re-fetch the task before updating — Planner requires the current ETag. Ask Claude to retry from a fresh `planner_get_task` call.

**UniFi controller session expires mid-session**
Sessions refresh automatically but last ~1 hour. Repeated auth errors usually mean `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, or `UNIFI_PASSWORD` is wrong, or the controller isn't reachable from WSL.

**Wazuh TLS errors**
The Wazuh client skips certificate verification (on-prem installations use self-signed certs). "Connection refused" means check that `WAZUH_URL` uses `https://` and port 55000 is reachable from WSL.

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

## Sequencing

| Phase | Work | Unlock |
|-------|------|--------|
| **Now** | Obsidian templates (Day Starter, Incident) | Reduces per-run output, consistent structure for Bases |
| **Now** | Have I Been Pwned integration | Quick win, real security value |
| **Soon** | Pre-aggregation script wired into session-start | Day-starter becomes near-instant |
| **Soon** | Tailscale + Croc for file transfer | Closes the investigate → pull logs → analyze loop |
| **Later** | TTL cache on ninja_list_servers, admin_get_service_health | Both tools fully shaped — easy to add now |
| **Later** | Shape teams.ts write ops (send_message, create_channel, add_member) | Low priority; write ops return minimal data anyway |
| **Later** | Webhook receiver (n8n or similar) | Shifts briefings from pull to push |
| **Later** | PowerShell → vault pipeline (Export-SVHToVault) | Eliminates remaining manual PS steps |
| **Later** | Tiered confirmation model | Reduces friction on low-risk actions |
| **Last** | Re-enable IR Triage | Requires tiered confirmation + stable data layer |
