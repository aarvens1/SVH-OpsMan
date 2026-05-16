# SVH Helm — Claude Code project context

SVH Helm is a purpose-built IT operations command station. This repo is its custom MCP server — a TypeScript ESM Node.js process that gives Claude access to SVH's IT systems: Microsoft 365, Azure, Defender, NinjaOne, Wazuh, UniFi, PrinterLogic, and Confluence. Communicates over stdio.

## Runtime

- **Platform:** WSL 2 (Ubuntu 22.04) on Windows, running in Windows Terminal
- **Client:** Claude Code CLI — `claude mcp add` registers MCPs, not Claude Desktop
- **Secrets:** Bitwarden CLI (`bw`) — unlock vault before starting: `export BW_SESSION=$(bw unlock --raw)`. Required — server will not start without an active session.

## Repo layout

```
.claude/
  config.yaml              ← centralized config: UPNs, group IDs, Planner board IDs, vault path
  settings.json            ← permissions + SessionStart hook
  hooks/session-start.sh   ← injects git state, BW status, ops context (day, briefing, incidents)
  rules/                   ← path-scoped conventions (TypeScript, Obsidian output)
  skills/                  ← one directory per skill; Claude loads on demand
mcp-server/
  src/
    index.ts               ← entrypoint; registers all tool groups
    secrets.ts             ← Bitwarden credential loader
    auth/                  ← per-service token helpers
    tools/                 ← one file per integrated system
    utils/http.ts          ← axios client factories + formatError
powershell/
  connect.ps1              ← dot-source to load credentials + all modules (requires BW_SESSION)
  modules/SVH.*.psm1       ← one module per integrated system; see powershell/README.md
  rolling-cluster-reboot.ps1  ← HCI node drain/reboot orchestration (runs on remote server)
  Connect-ClusterReboot.ps1   ← WSL/laptop launcher for rolling-cluster-reboot
  setup-*.ps1              ← one-time app registration and policy setup scripts
references/                ← triage and troubleshooting reference docs (auto-synced to vault on session start)
```

## Key conventions

- **No autonomous actions.** Claude never sends Teams messages, emails, or Planner updates without an explicit user request in that session.
- **Obsidian first.** All skill output goes to Obsidian. External destinations (Teams, Confluence, Mail) are always staged for review.
- **No task deletion.** Mark Planner tasks complete at 100% instead. `planner_delete_task` does not exist.
- **Read-only defaults.** Most tools read only. Write-capable: Mail (send/draft), Teams (send message), Planner (create/update), To Do (create/update), OneDrive (create folder/link), Confluence (create/update pages and comments), Entra (dismiss risky user), Obsidian (read/write), Excalidraw (create/update diagrams).
- **Diagrams before descriptions.** For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than prose. Save to `Diagrams/<category>/` and embed with `![[filename.excalidraw]]`.
- **IR Triage only** sends non-draft Teams messages. Build it last for that reason.

## Work week

M–Thursday. Monday Day Starter covers the full weekend (last 72h, not 24h).

## Skills

Skills live in `.claude/skills/<name>/SKILL.md` and load on demand. Each skill defines its own allowed tools in frontmatter.

Invoke by name (`/day-starter`) or trigger phrase (e.g., "morning briefing", "X is broken", "write a ticket for this"). Skills are listed with trigger phrases in README.md.

## Adding a new tool

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

Not yet found in BW: WAZUH_*, CONFLUENCE_*, UNIFI_*, PRINTERLOGIC_*. Search BW notes when looking for these.

### PowerShell modules

Module coverage, credential tiers, PSRemoting accounts, and authoring conventions are in `.claude/rules/powershell.md` (auto-loaded when working in `powershell/`). Full function reference and examples in `powershell/README.md`.

### NinjaOne alerting rules
- **Skip devices in maintenance mode.** Do not surface offline alerts, monitor alerts, or status warnings for any NinjaOne device that is in maintenance mode. Maintenance mode means the offline/alert state is intentional — treat these as non-events in briefings and investigations.
- ACCOPDXARCHIVE is intentionally offline and in maintenance mode — never flag it.

### Known issues
- Claude Code account switching: work↔personal swap breaks OpsMan on token expiry. No solution yet — tracked in personal To Do.

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
