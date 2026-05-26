# SVH OpsMan — Claude Code project context

SVH OpsMan is a purpose-built IT operations command station. Three services run in WSL: an **MCP server** that gives Claude interactive access to SVH's IT systems, a **collector** that runs on-demand and owns all bulk API reads, and a **morning briefing** triggered by a systemd timer. Communicates over stdio.

## Runtime

- **Platform:** WSL 2 (Ubuntu 24.04) on Windows, running in Windows Terminal
- **Client:** Claude Code CLI — `claude mcp add` registers MCPs, not Claude Desktop
- **Secrets:** Bitwarden CLI (`bw`) — unlock vault before starting: `export BW_SESSION=$(bw unlock --raw)`. Required — server will not start without an active session.
- **Auto-unlock:** `svh-opsman-bw-unlock.service` reads the master password from Windows Credential Manager at login, writes `~/.config/svh-opsman/bw-session`, which `svh-opsman-mcp.service` loads as an EnvironmentFile.

## Architecture

Three tracks, WSL only:

```
INTERACTIVE                ON-DEMAND               SCHEDULED
───────────                ─────────               ─────────
MCP server                 Collector               Briefing timer
(systemd user svc)         (run manually or        (07:00 Mon–Thu)
Claude calls tools         by a skill)             claude --print
directly for targeted      Writes staging/         /day-starter
queries + writes           and db/ output

BW_SESSION flow:
  Windows Task Scheduler
    → wsl --exec systemctl --user start svh-opsman-bw-unlock
    → bw-auto-unlock.sh reads Windows Credential Manager
    → writes ~/.config/svh-opsman/bw-session
    → svh-opsman-mcp.service loads EnvironmentFile
```

**MCP server owns interactive and write operations.** Targeted API calls (mail search, task update, etc.) happen during a session.

**Collector owns all bulk data collection.** Run manually (`node collector/dist/index.js gather`) or triggered by a skill when fresh data is needed. Writes to `staging/{date}/` + `manifest.json`. Claude checks the manifest before synthesizing — silent failures are not acceptable. No scheduled timer; runs on demand.

**Morning briefing** fires Mon–Thu at 07:00 via `svh-opsman-briefing.timer`. Runs `claude --print "/day-starter"` in the repo directory.

## Repo layout

```
.claude/
  config.yaml              ← centralized config: UPNs, group IDs, Planner board IDs, vault path
  settings.json            ← permissions + SessionStart hook
  hooks/session-start.sh   ← injects git state, BW status, ops context (day, briefing, incidents)
  rules/                   ← path-scoped conventions (TypeScript, Obsidian output)
  skills/                  ← one directory per skill; Claude loads on demand
collector/
  src/
    index.ts               ← CLI: gather | watch | health [--job=<name>]
    secrets.ts             ← Bitwarden credential loader (reads BW_SESSION)
    config.ts              ← lazy getConfig() — env vars read after BW secrets loaded
    staging.ts             ← staging directory management
    manifest.ts            ← manifest read/write
    types.ts               ← shared types (JobResult, Manifest, metrics rows)
    auth/                  ← token helpers
    jobs/                  ← one file per data source
    watch/                 ← writes time-series metrics from latest staging
    db/                    ← SQLite: schema, runs log, metrics
mcp-server/
  src/
    index.ts               ← entrypoint; registers all tool groups
    secrets.ts             ← Bitwarden credential loader
    auth/                  ← per-service token helpers
    tools/                 ← one file per integrated system
    utils/http.ts          ← axios client factories + formatError
systemd/
  user/
    svh-opsman-bw-unlock.service  ← reads Windows Credential Manager, writes bw-session
    svh-opsman-mcp.service        ← persistent MCP server (EnvironmentFile=bw-session)
    svh-opsman-briefing.service   ← oneshot: claude --print "/day-starter"
    svh-opsman-briefing.timer     ← Mon–Thu 07:00 trigger
powershell/
  Start-WSLServices.ps1    ← Windows login Task Scheduler: start WSL + trigger bw-unlock
  connect.ps1              ← dot-source to load credentials + all modules (requires BW_SESSION)
  modules/SVH.*.psm1       ← one module per integrated system; see powershell/README.md
  rolling-cluster-reboot.ps1  ← HCI node drain/reboot orchestration (runs on remote server)
  Connect-ClusterReboot.ps1   ← WSL/laptop launcher for rolling-cluster-reboot
  setup-*.ps1              ← one-time app registration and policy setup scripts
references/                ← triage and troubleshooting reference docs (auto-synced to vault on session start)
scripts/
  setup.sh                 ← WSL bootstrap (idempotent; run once on fresh install)
  bw-auto-unlock.sh        ← reads Windows Credential Manager, unlocks BW, writes bw-session
  wsl-shell-setup.sh       ← installs zsh, tools, pwsh, enables systemd
  tailscale-wsl-setup.sh   ← Tailscale install for WSL node
dotfiles/
  bashrc.sh                ← shell aliases/functions (bwu, opsman, clip, wpath, wexp, gs=gemini)
  windows-terminal-settings.json ← Windows Terminal profiles + keybindings (import via install-windows.ps1)
  install-windows.ps1      ← one-time Windows install: Cascadia Code NF font, PS profile stub, Windows Terminal settings
  status-refresh.sh        ← background status daemon (writes /tmp/svh-opsman-status.json)
staging/                   ← collector writes here (gitignored except .gitkeep)
  {date}/
    manifest.json
    graph-mail.json
    graph-calendar.json
    graph-audit.json
    ninja-devices.json
    ninja-alerts.json
    wazuh-alerts.json
    unifi-alerts.json
    planner-tasks.json
db/                        ← SQLite databases (gitignored except .gitkeep)
  runs.db                  ← run log (one row per collect/watch run)
  metrics.db               ← time-series: disk, alerts, compliance, patch lag
tui/
  run-tui.sh               ← TUI launcher
  *.py                     ← Textual app (module browser, parameter forms, Obsidian output)
```

## Key conventions

- **No autonomous actions.** Claude never sends Teams messages, emails, or Planner updates without an explicit user request in that session.
- **Obsidian first.** All skill output goes to Obsidian. External destinations (Teams, Confluence, Mail) are always staged for review.
- **No task deletion.** Mark Planner tasks complete at 100% instead. `planner_delete_task` does not exist.
- **Read-only defaults.** Most tools read only. Write-capable: Mail (send/draft), Teams (send message), Planner (create/update), To Do (create/update), OneDrive (create folder/link), Confluence (create/update pages and comments), Entra (dismiss risky user), NinjaOne (maintenance mode, run script, reset alert), UniFi Network (restart device, WLAN toggle, client block, port enable/disable), Google Drive (create folder, upload file), FreshService (create/update ticket, add note), Obsidian (read/write), Excalidraw (create/update diagrams).
- **Diagrams before descriptions.** For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than prose. Save to `Diagrams/<category>/` and embed with `![[filename.md]]`.
- **Check the manifest first.** Before any session synthesis using collector data, confirm staging is fresh and no jobs failed silently.
- **IR Triage only** sends non-draft Teams messages. Build it last for that reason.

## Work week

M–Thursday. Monday Day Starter covers the full weekend (last 72h, not 24h).

## Skills

Skills live in `.claude/skills/<name>/SKILL.md` and load on demand. Each skill defines its own allowed tools in frontmatter.

Invoke by name (`/day-starter`) or trigger phrase (e.g., "morning briefing", "X is broken", "write a ticket for this"). Skills are listed with trigger phrases in README.md.

## Adding a new collector job

1. Create `collector/src/jobs/<service>.ts` — implement the `Job` interface from `jobs/base.ts`
2. Import and add to `ALL_JOBS` in `collector/src/index.ts`
3. Add watch-phase extraction in `collector/src/watch/index.ts` if the job produces metrics data
4. Add credentials to the **SVH OpsMan** Bitwarden item (custom fields)
5. Document the staging file name above under the staging/ layout

## Adding a new MCP tool

1. Create `mcp-server/src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Add to `mcp-server/src/index.ts` — import, add env-based `enabled` flag, call register
3. Add credentials to the **SVH OpsMan** Bitwarden item (custom fields)
4. Document in README.md under "What Claude has access to" and "Credential reference"
5. Add the tool name(s) to the `allowed-tools` frontmatter of any skill that uses it

## Operational references

### Config
Canonical values (UPNs, group IDs, Planner board IDs, vault path) live in `.claude/config.yaml`. The session-start hook injects them at the top of every session. **If a skill file has a hardcoded value that conflicts with config.yaml, the config.yaml value takes precedence.** Update config.yaml when any of these values change — skill files do not need to be touched.

### Obsidian
Vault: `/mnt/c/Users/astevens/vaults/OpsManVault/`  
Second vault at `/mnt/c/Users/astevens/OneDrive - Andersen Construction/data/` — personal/documents, not skills output.

### People
| Person | UPN | Entra object ID | IT Sysadmin Tasks label |
|--------|-----|-----------------|-------------------------|
| Aaron Stevens | astevens@shoestringvalley.com | `5a637656-9bd4-4e0c-9a4e-ae52ee2fd15d` | category23 |
| Sam Maxon | — | `8f46a470-62ee-4fc9-b312-7f43ae167205` | category21 |

Always use `astevens@shoestringvalley.com` for M365 `user_id` params. Gmail address is the Claude login only — never pass it to M365 tools.

Category mapping is for plan `-aZEdilGAUqLC8B8GwOLfmQAAh9M` (IT Sysadmin Tasks). `category1` = Quinn — the tool description saying "category1 = Aaron" is wrong. Verify with `planner_get_plan_details` on other plans. `planner_update_task` doesn't expose an assignments field; use object IDs above for direct Graph assignment calls.

### Planner
Primary plan: **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`)  
Buckets: To do · In progress · Waiting · Backlog

**Staging rule:** Never call `planner_create_task` or `planner_update_task` without explicit per-session confirmation ("push it", "go ahead", "create it"). Draft CREATE blocks in the briefing's "Draft Planner actions" section first. "I want a task for X" = draft in Obsidian, not a live create.

**Day Starter default:** New tasks go to IT Sysadmin Tasks (operational) or personal To Do (personal items). Always include a "Draft Planner actions" section at the bottom of every day starter note.

### Bitwarden credentials
All credentials are in the **SVH OpsMan** BW item. Check both custom fields AND notes — some credentials are stored in notes rather than fields.

In SVH OpsMan (custom fields): GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_USER_ID, MDE_*, AZURE_*, NINJA_CLIENT_ID, NINJA_CLIENT_SECRET, OBSIDIAN_API_KEY.

Not yet added to BW (need to add to enable these tools): WAZUH_*, CONFLUENCE_*, UNIFI_*, PRINTERLOGIC_*, FRESHSERVICE_*, SYNOLOGY_*, GOOGLE_*, HIBP_API_KEY, CLOUDFLARE_API_TOKEN, N8N_URL, N8N_API_KEY. Search BW notes when looking for credentials — some are stored there rather than in custom fields. See `references/credentials.md` for full details.

### PowerShell modules

Module coverage, credential tiers, PSRemoting accounts, and authoring conventions are in `.claude/rules/powershell.md` (auto-loaded when working in `powershell/`). Full function reference and examples in `powershell/README.md`.

**PSRemoting quick-reference — from WSL:**

| Task | Account | Auth from WSL |
|------|---------|---------------|
| Disk, services, pending reboot, event logs, processes | `ra_stevens` | Non-interactive — BW fields `DC_REMOTE_USER` / `DC_REMOTE_PASSWORD` |
| Hyper-V, failover cluster, S2D, MABS, SQL config | `sa_stevens` | Interactive `Get-Credential` — no BW password stored |
| Active Directory, domain health, replication | `da_stevens` | Interactive `Get-Credential` — no BW password stored |
| DNS / DHCP servers | `da_stevens` | Interactive `Get-Credential` — no BW password stored |

`ra_stevens` non-interactive pattern (Desktop Commander / automated skills):
```powershell
$cred = New-Object PSCredential(
    (Get-SVHTierUsername -Tier ra),
    (ConvertTo-SecureString $env:DC_REMOTE_PASSWORD -AsPlainText -Force)
)
```

`sa_stevens` and `da_stevens` require `Get-Credential` in an active pwsh session. Adding `SA_REMOTE_PASSWORD` / `DA_REMOTE_PASSWORD` to BW would enable non-interactive use for those tiers too.

### NinjaOne alerting rules
- **Skip devices in maintenance mode.** Do not surface offline alerts, monitor alerts, or status warnings for any NinjaOne device that is in maintenance mode. Maintenance mode means the offline/alert state is intentional — treat these as non-events in briefings and investigations.
- ACCOPDXARCHIVE is intentionally offline and in maintenance mode — never flag it.

### Known issues
- Claude Code account switching: work↔personal swap breaks OpsMan on token expiry. No solution yet — tracked in personal To Do.

### Known runtime quirks

**Planner 412 Precondition Failed** — Planner requires the current ETag on updates. Re-fetch the task with `planner_get_task` before retrying — the fresh fetch returns the current ETag.

**UniFi session expiry** — Controller sessions last ~1 hour. Repeated auth errors mid-session usually mean the credentials are wrong or the controller isn't reachable from WSL, not a session race — the client re-authenticates automatically.

**Wazuh TLS errors** — The Wazuh client skips certificate verification (on-prem self-signed cert). "Connection refused" means `WAZUH_URL` is wrong or port 55000 isn't reachable from WSL — check `https://` prefix and firewall rules.

**Synology DSM error 119** — Session expired. The SID cache is cleared automatically on this error so the next call re-authenticates. If it loops, check that `SYNOLOGY_USER` still has an active DSM session (DSM can invalidate sessions on password change).

### Dev tools

Browse all registered MCP tools without opening Claude:
```bash
cd mcp-server && npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```
Useful for verifying a new tool registered and checking its input schema before end-to-end testing.

## References

`references/` contains triage guides and SVH-specific failure patterns. The session-start hook auto-syncs them to `OpsManVault/References/` on every session — no manual copy needed. The repo versions are the source of truth.

| File | Used by |
|------|---------|
| `triage-gate.md` | IR Triage — lane classification criteria and escalation path |
| `common-failure-modes.md` | Troubleshooting — SVH-specific failure patterns (Hyper-V, MABS, CMiC, UniFi, WSUS, PrinterLogic) |
| `hypothesis-patterns.md` | Troubleshooting — isolation moves by problem class |
| `common-event-clusters.md` | Event Log Triage — Wazuh/Windows event signatures grouped by scenario |
| `ps-remoting-snippets.md` | Event Log Triage — Get-WinEvent recipes for common investigation scenarios |
| `setup-winrm.md` | Event Log Triage — one-time WinRM trust setup from WSL to Windows targets |
| `credentials.md` | Credential reference — what's in Bitwarden vs. still missing |
| `users.md` | Team directory — Entra object IDs and UPNs for IT staff |
| `tailscale-udm-setup.md` | UDM Pro/SE subnet router deployment guide |
