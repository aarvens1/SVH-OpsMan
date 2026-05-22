# SVH OpsMan — Roadmap & Design Notes

Architecture decisions, open issues, and the evolution plan. Review before making changes to the server or skills.

**Last audited:** 2026-05-22

---

## What's shipped

| Item | Notes |
|------|-------|
| **Collector service** | Standalone TypeScript ESM process. systemd timer at 6:45 am weekdays (Persistent=true). Jobs: Graph (mail, calendar, audit), NinjaOne (devices, alerts), Planner (IT Sysadmin Tasks), Wazuh (stub), UniFi (stub). Writes `staging/{date}/` + `manifest.json`. |
| **SQLite metrics DB** | `db/runs.db` (run log) + `db/metrics.db` (time-series: disk_usage, alert_counts, compliance, patch_lag, auth_failures). Populated by watch phase after each gather. |
| **Staging MCP tools** | 6 tools: `staging_status`, `staging_read`, `collector_run`, `metrics_disk_trend`, `metrics_alert_trend`, `metrics_disk_over_threshold`. Always enabled — no external auth. |
| **Credential sync script** | `scripts/sync-creds.sh` — reads from Bitwarden, writes `collector/.env` at mode 600. BW remains single source of truth; `.env` is a derived artifact. |
| **systemd units** | `opsman-collector.service` (oneshot), `opsman-collector.timer` (6:45 am weekdays), `opsman-mcp.service` (persistent). `systemd/install.sh` handles VM deployment. |
| **Day Starter rebuild** | Staging-first architecture. Steps: 1a staging check, 1b infra from staging, 1c real-time security (live APIs), 1d Monday compliance gap. Eliminated 10–15 bulk API calls per morning session. |
| **Obsidian vault restructure** | All OpsMan output under `SVH/` subfolder: `SVH/Daily/`, `SVH/Inbox/`, `SVH/Record/`, `SVH/System/`, `SVH/Archive/`. Flat note type via `type:` frontmatter; Dataview replaces folder-based navigation. `entities:` field for consistent naming. |
| **Confluence as authoritative docs** | Entity documentation lives in Confluence. Obsidian is the operational intelligence layer and drafting table. No entity notes in Obsidian. |
| **Windows Terminal environment** | Gruvbox Dark theme, colour-coded profiles (Claude/pwsh/bash), Ctrl+Alt skill shortcuts. |
| **PowerShell TUI** | Searchable terminal UI for all PS module functions — parameter forms, command preview, confirmation dialogs, Obsidian output. |
| **Desktop Commander guard + ra_stevens tier** | Read-only PSRemoting account for Desktop Commander; PreToolUse hook blocks SVH scripts and credential access from non-Claude sessions. |
| **SVH.AD and SVH.Network PS modules** | Active Directory via PSRemoting, AD DNS and Windows DHCP cross-platform validation. |
| **Tenant Forensics and License Audit skills** | Two investigation skills shipped. |
| **Reference auto-sync** | `session-start.sh` rsync to vault on every session — repo is source of truth. |
| **Centralized config** | `config.yaml` fully populated; session-start injects it at the top of every session. |
| **Response shaping** | All tool files shaped. Remaining: teams.ts write ops (send_message, create_channel, add_member) — low priority. |
| **Day-ender sentinel** | `<!-- DAY-STARTER-END -->` in template; day-ender appends without reading first. |
| **WSL shell environment** | `scripts/wsl-shell-setup.sh`: zsh, fzf, bat, eza, delta, lazygit, btop, mtr, nmap, zoxide, httpie, starship, PowerShell 7. Enables WSL systemd. |
| **Tailscale remote access** | `scripts/tailscale-wsl-setup.sh` for WSL node; `references/tailscale-udm-setup.md` for UDM Pro/SE subnet router deployment. |

---

## Open work — near term

### Collector jobs — Wazuh and UniFi

Both are stubs (`collector/src/jobs/wazuh.ts`, `collector/src/jobs/unifi.ts`). The day starter currently reads `wazuh-alerts` and `unifi-alerts` from staging, so stubs mean those sections fall back to live API calls.

**Wazuh job:** POST to `WAZUH_URL/security/user/authenticate`, then GET `/alerts?pretty=true&sort=-timestamp&limit=1000`. Filter `rule.level >= 5`. Write `wazuh-alerts.json`.

**UniFi job:** GET `https://api.ui.com/v1/sites` (Cloud API, `UNIFI_API_KEY`). For each site, GET devices and stats. Write `unifi-alerts.json` and `unifi-sites.json`.

### Watch-phase metrics — phase 2

Current watch phase extracts disk usage from NinjaOne volumes and alert counts by severity/source. Two more metrics worth adding once the stub jobs are filled in:

- **Auth failures** — from Wazuh alerts matching `authentication_failure` rule group. Track per-agent counts over time. Helps surface brute-force trends during day-starter without a live API call.
- **Patch lag** — from NinjaOne devices: `os.patchStatus`, `lastPatchInstall`. Track days since last successful patch per device. Flag devices going 30+ days without patches.

### Obsidian Bases — set up the views

The frontmatter fields that unlock Bases are already in the skill files. Create the Base views in Obsidian once there's enough content to make them useful:

| Base | Query | View | Key fields |
|------|-------|------|-----------|
| Incident Tracker | `type: incident` in `SVH/Record/` | Kanban by `status` | `severity`, `incident_id`, `date` |
| Change Calendar | `type: change` in `SVH/Record/` | Calendar by `change_date` | `risk`, `change_id`, `window` |
| Vulnerability Pipeline | `type: vuln` in `SVH/Record/` | Table sorted by `priority` | `cve`, `priority`, `date` |
| Briefing History | `type: daily` in `SVH/Daily/` | Calendar | `status`, `has_pending_tasks` |

---

## Future work — later

### Webhook receiver for alert-driven sessions

NinjaOne and Wazuh can both POST webhooks on alert conditions. A lightweight receiver (n8n, Make, or a small Node process) queues incoming events. Day-starter reads the queue instead of polling — the session opens with "here's what happened since you were last here" rather than Claude having to go find out.

### PowerShell → vault pipeline

Add an `Export-SVHToVault` pattern to the PS modules. Functions like `Get-SVHComplianceGap` write their output directly to `SVH/Record/` as JSON. The Monday compliance reminder becomes a live file read instead of a manual terminal step. Same pattern for MABS job state, cluster health, and other on-prem data that currently requires a manual PS run.

### Re-enable IR Triage

IR Triage (`SKILL.md.disabled`) is the only skill that can send non-draft Teams messages. It stays disabled until the data layer and action staging are solid enough to trust for incident response. The tiered confirmation model (below) is a prerequisite.

### Tiered confirmation model

Right now Claude stages everything for explicit confirmation. The right next step is distinguishing by risk level:

| Tier | Operations | Confirmation |
|------|-----------|-------------|
| Always confirm | Send Teams/mail, create Planner tasks, dismiss risky users, any write to external systems | Explicit per-session ("push it", "go ahead") |
| Lightweight confirm | Mark Planner task 100% complete, update Confluence page, file an Obsidian note | Single "yes" or approve in-line |
| Autonomous | Update briefing state file, sync references to vault, write Obsidian drafts | No confirmation needed |

---

## New integrations worth adding

| Integration | Why | Effort |
|-------------|-----|--------|
| **Have I Been Pwned** | Check if `shoestringvalley.com` or `andersen-cost.com` accounts appear in breach data. Free API, trivial to add. | Tiny |
| **Azure Monitor / Log Analytics** | Azure ARM access is in place but no Log Analytics query tool. Application and resource logs that aren't in Wazuh. | Small |
| **Ticketing system** (Freshservice, Zendesk, etc.) | TicketSmith currently ends at copy-paste. Close the loop if SVH uses an ITSM with an API. | Medium — depends on platform |
| **Cloudflare** | DNS, WAF events, cert expiry — if any SVH services sit behind Cloudflare. | Small |
| **n8n / Make** | Webhook orchestration layer — receives NinjaOne/Wazuh/Defender events and queues them for day-starter. | Medium |

---

## File transfer

For pulling files from managed systems into WSL for analysis.

**Tailscale** — install on WSL (via the Windows host), all Windows servers, and any Linux boxes. They get stable private IPs reachable from each other regardless of NAT. SSH, SCP, and RDP all work to the Tailscale IP without firewall rules.

**Croc** — one-off P2P file drops. `croc send logfile.evtx` on the remote, `croc <code>` on WSL. No accounts, works through NAT, end-to-end encrypted.

**Copy-Item over PSRemoting** — already available via `SVH.OnPrem`:
```powershell
$s = New-PSSession -ComputerName SVH-SQL01 -Credential (Get-SVHTierCredential -Tier server)
Copy-Item -Path "C:\path\to\file" -Destination ~/landing/ -FromSession $s
```

---

## Future terminal environment — WezTerm

Pulled back in favour of Windows Terminal for now. Worth revisiting when there's bandwidth.

**What it would add over Windows Terminal:**
- Live status bar — `BW ✓ · Wazuh 3 · MDE 1 · Risky 0 · Ninja 34/35 · M365 ✓` — fed by `status-refresh.sh`
- LEADER-key chord bindings (CTRL+\\) — cleaner than Ctrl+Alt combos
- Process-aware tab colours — tab turns blue when Claude is foreground
- `obsidian://` URI detection — skills print the note path as a clickable hyperlink

**Why it was deferred:** Lua config complexity and `binfmt_misc` interop fragility on WSL. Windows Terminal covers 80% of the workflow with zero config overhead.

---

## Open design issues

### 1. teams.ts write ops — response shaping

`send_message`, `create_channel`, and `add_member` still return raw API responses. Low priority — write ops return minimal data anyway. Shape when IR Triage is re-enabled and write ops get more use.

### 2. TTL cache on tool responses

Auth tokens are cached within a session. Tool responses aren't cached. Extend the pattern to:
- `ninja_list_servers` — called multiple times in a typical day-starter session
- `admin_get_service_health` — changes rarely within a session

Lower priority than finishing the collector stubs.

### 3. BRIEFING_EXISTS / OPEN_INCIDENTS in remote sessions

`LAST_BRIEFING` has a local fallback via `.claude/briefing-state`. `BRIEFING_EXISTS` and `OPEN_INCIDENTS` still require vault access and show "unknown" in remote execution sessions. Low priority — remote sessions are the exception.

---

## Architecture notes

### Two-plane model

**Interface plane (WSL):** Claude Code CLI, Bitwarden unlock, PowerShell modules. This is where you interact — `bwu && opsman`, skill invocations, PowerShell write operations. The MCP server runs here in stdio mode, reading BW credentials at startup.

**Service plane (Ubuntu VM on Hyper-V):** Collector and MCP server as systemd units. Collector reads `collector/.env` (no BW dependency at runtime — credentials were synced in by `sync-creds.sh`). MCP server has its own `.env` on the VM; no BW session required for the persistent service.

The two planes are optional — you can run everything in WSL during development, or split across the VM for production. `STAGING_DIR` and `DB_DIR` env vars control where the collector writes and where the MCP server reads; they default to `staging/` and `db/` inside the repo root.

### Data access model

**Collector:** bulk reads on a schedule, writes to staging. Never interactive.
**MCP server:** targeted interactive queries + all write operations. Reads staging via staging tools. Never does bulk reads during a session.

The gap between permission scope and query scope: `Mail.ReadWrite` is a tenant-wide application permission. The server locks all mail and calendar calls to `GRAPH_USER_ID`, and an Exchange `ApplicationAccessPolicy` enforces the same restriction at the Exchange layer.

### Desktop Commander / ra_stevens access model

`ra_stevens` is a read-only PSRemoting account — no admin rights, no write access. The Desktop Commander guard hook blocks SVH scripts and Bitwarden credential access from non-Claude sessions. Clean tier: Desktop Commander can run read-only diagnostic PSRemoting without exposing full credentials.

### status-refresh.sh cache model

`status-refresh.sh` runs in the background (started by `opsman`). Authenticates to each API via curl/jq, writes `/tmp/svh-opsman-status.json` every 120 seconds. Currently unused as a display source (WezTerm status bar was removed) — still written for future consumers.

### Token overhead

All tool schemas load on-demand via ToolSearch, not upfront. A full ops session costs ~994 schema tokens. Splitting into per-service MCP servers would save negligible tokens at high operational complexity — not worth it.

---

## Known runtime quirks

**Planner update fails with 412 Precondition Failed**
Re-fetch the task before updating — Planner requires the current ETag. Ask Claude to retry from a fresh `planner_get_task` call.

**UniFi controller session expires mid-session**
Sessions refresh automatically but last ~1 hour. Repeated auth errors usually mean `UNIFI_SVH_URL` or `UNIFI_SVH_KEY` is wrong, or the controller isn't reachable.

**Wazuh TLS errors**
The Wazuh client skips certificate verification (on-prem self-signed certs). "Connection refused" means check that `WAZUH_URL` uses `https://` and port 55000 is reachable.

**Collector jobs — stale staging on first run**
If the collector hasn't run yet today, `staging_status` reports stale. Claude will call `collector_run` to trigger a fresh gather. Expect 2–3 minutes for the full collection to complete.

---

## Dev tools

### MCP inspector

Browse all registered tools interactively without opening Claude:

```bash
cd mcp-server
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

### Manual collector run

```bash
export BW_SESSION=$(bw unlock --raw)
./scripts/sync-creds.sh     # ensure collector/.env is current

# Full gather
npx tsx collector/src/index.ts gather

# Single job
npx tsx collector/src/index.ts gather --job=ninjaone

# Watch phase only (update metrics DB from existing staging)
npx tsx collector/src/index.ts watch
```

---

## Sequencing

| Phase | Work | Status |
|-------|------|--------|
| **Shipped** | Collector service + staging tools | ✅ Done |
| **Shipped** | SQLite metrics (disk, alerts, compliance, auth) | ✅ Done |
| **Shipped** | Day Starter rebuild — staging-first | ✅ Done |
| **Shipped** | Obsidian vault restructure (SVH/ subfolder, flat types) | ✅ Done |
| **Now** | Wazuh collector job | Stub → implement |
| **Now** | UniFi collector job | Stub → implement |
| **Now** | Watch phase — auth failures + patch lag metrics | Extends existing watch |
| **Now** | Obsidian Bases — set up views | Needs content volume first |
| **Soon** | Have I Been Pwned integration | Quick win, real security value |
| **Soon** | Tailscale + Croc for file transfer | Closes investigate → pull logs → analyze loop |
| **Later** | TTL cache on ninja_list_servers, admin_get_service_health | Both tools fully shaped |
| **Later** | Shape teams.ts write ops | Low priority |
| **Later** | Webhook receiver (n8n or similar) | Shifts briefings from pull to push |
| **Later** | PowerShell → vault pipeline (Export-SVHToVault) | Eliminates remaining manual PS steps |
| **Later** | Tiered confirmation model | Reduces friction on low-risk actions |
| **Last** | Re-enable IR Triage | Requires tiered confirmation + stable data layer |
