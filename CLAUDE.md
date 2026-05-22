# SVH OpsMan — Claude Code project context

SVH OpsMan is a purpose-built IT operations command station. Two services work together: a **collector** that runs on a schedule and owns all bulk API reads, and an **MCP server** that gives Claude interactive access to SVH's IT systems. Communicates over stdio.

## Runtime

- **Interface plane:** WSL 2 (Ubuntu 24.04) on Windows — Claude Code CLI, PowerShell modules, Bitwarden session all live here
- **Service plane:** Ubuntu VM on Hyper-V — collector and MCP server run as systemd units here (or locally in WSL during development)
- **Client:** Claude Code CLI — `claude mcp add` registers the MCP server
- **Secrets (WSL/interactive):** Bitwarden CLI (`bw`) — `export BW_SESSION=$(bw unlock --raw)`. Required for MCP server in WSL mode.
- **Secrets (VM/collector):** `.env` file at `collector/.env` — copy from `collector/.env.example`, populate from Bitwarden

## Architecture

Three tracks feed a shared tail:

```
MONITORING              REACTIVE                PROACTIVE
─────────               ────────                ─────────
Watch                   Gather (collector)      Research
  │                       │                       │
Detect                  Synthesize              Plan
  └──────────┬────────────┘                       │
             ▼                                     │
           Decide ◄────────────────────────────────┘
             │
           Stage → Obsidian Inbox/
             │
           Execute (Aaron)
             │
           Summarize → Obsidian Record/
```

**Collector owns all bulk data collection.** Claude never calls NinjaOne or Graph for bulk reads during a session. The collector runs at 6:45am weekdays and on-demand, writes to `staging/{date}/`, produces `manifest.json`. Claude checks the manifest before synthesizing — silent failures are not acceptable.

**MCP server owns interactive and write operations.** Tool calls during a session hit the API directly only for targeted, interactive queries (mail search, task update, etc.).

## Repo layout

```
collector/
  src/
    index.ts          ← CLI: gather | watch | health [--job=<name>]
    config.ts         ← loads .env, exports typed config
    staging.ts        ← staging directory management
    manifest.ts       ← manifest read/write
    types.ts          ← shared types (JobResult, Manifest, metrics rows)
    auth/             ← token helpers (read from .env)
    jobs/             ← one file per data source
    watch/            ← writes time-series metrics from latest staging
    db/               ← SQLite: schema, runs log, metrics
  .env.example        ← copy to .env and populate from Bitwarden
mcp-server/
  src/
    index.ts          ← entrypoint; registers all tool groups
    secrets.ts        ← Bitwarden credential loader (WSL sessions)
    auth/             ← per-service token helpers
    tools/            ← one file per integrated system
    utils/http.ts     ← axios client factories + formatError
systemd/
  opsman-collector.service  ← oneshot service unit
  opsman-collector.timer    ← 6:45am weekday timer
  opsman-mcp.service        ← persistent MCP server unit (VM deployment)
  install.sh                ← install script for target VM
staging/              ← collector writes here (gitignored except .gitkeep)
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
db/                   ← SQLite databases (gitignored except .gitkeep)
  runs.db             ← run log (one row per collect/watch run)
  metrics.db          ← time-series: disk, alerts, compliance, patch lag
powershell/
  connect.ps1         ← dot-source to load credentials + all modules (requires BW_SESSION)
  modules/SVH.*.psm1  ← one module per integrated system; see powershell/README.md
references/           ← triage and troubleshooting reference docs (auto-synced to vault)
scripts/              ← WSL/VM bootstrap scripts
dotfiles/             ← shell aliases, Windows Terminal, status daemon
tui/                  ← Textual TUI (module browser, parameter forms)
```

## Obsidian vault

Two documentation layers:
- **Confluence** — authoritative official docs: server pages, runbooks, published change records
- **Obsidian** — operational intelligence and drafting table: daily log, active synthesis, drafts in progress

Vault structure:
```
Inbox/      ← staged items awaiting Execute — the only folder that empties
Daily/      ← one note per day, operational log and reactive hub
Record/     ← permanent time-stamped records (incidents, changes, meetings, research, sessions)
Archive/
```

Every note has `type:` frontmatter (`incident | change | meeting | research | plan | session | draft`). Dataview handles navigation — no manual MOCs, no entity notes. When Claude references a server or system, it names it consistently so backlink search works; entity documentation lives in Confluence.

## Key conventions

- **No autonomous actions.** Claude never sends Teams messages, emails, or Planner updates without an explicit user request in that session.
- **Obsidian first.** All output goes to Obsidian. External destinations (Teams, Confluence, Mail) are always staged for review.
- **No task deletion.** Mark Planner tasks complete at 100% instead.
- **Read-only defaults.** Most tools read only. Write-capable: Mail (send/draft), Teams (send message), Planner (create/update), To Do (create/update), OneDrive (create folder/link), Confluence (create/update pages and comments), Entra (dismiss risky user), Obsidian (read/write).
- **Check the manifest first.** Before any Reactive session synthesis, confirm staging is fresh and no jobs failed silently.
- **IR Triage only** sends non-draft Teams messages. Build it last.

## Work week

M–Thursday. Monday Day Starter covers the full weekend (last 72h, not 24h).

## Session types

Session types are lightweight orientations — no SKILL.md files. They're described in `.claude/skills/` for now but will be replaced with tool descriptions and session context as the rebuild matures.

| Session | Track | Input | Output |
|---|---|---|---|
| Day Starter | Reactive | Staging manifest + files | Daily/ note |
| Posture Watch | Monitoring | Metrics DB trends | Signal list → Decide |
| Troubleshoot | Reactive | Live queries + staging | Record/ investigation |
| Research | Proactive | Systems + web | Record/ reference |
| Plan Session | Proactive | Research + problem | Record/ documented position |
| Inbox Review | Shared | Inbox/ | Pushed to destinations |
| Day Ender | Shared | Day's events | Append to Daily/ note |
| Week Wrap | Both | Week's Record/ | Record/ session note |
| IR Triage | Reactive | Live data | Stage + Execute (Teams-capable) |

## Adding a new collector job

1. Create `collector/src/jobs/<service>.ts` — implement the `Job` interface
2. Import and add to `ALL_JOBS` in `collector/src/index.ts`
3. Add watch-phase extraction in `collector/src/watch/index.ts` if the job produces metrics data
4. Add credentials to `collector/.env.example` and the Bitwarden SVH OpsMan item
5. Add a stub for the staging file in the manifest section above

## Adding a new MCP tool

1. Create `mcp-server/src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Add to `mcp-server/src/index.ts` — import, add env-based `enabled` flag, call register
3. Add credentials to the **SVH OpsMan** Bitwarden item (custom fields)

## Operational references

### Config
Canonical values (UPNs, group IDs, Planner board IDs, vault path) live in `.claude/config.yaml`. The session-start hook injects them at the top of every session. **config.yaml takes precedence over any hardcoded values in session files.**

### Obsidian vault path
`/mnt/c/Users/astevens/vaults/OpsManVault/`

All OpsMan output lives under `SVH/` in the vault root: `SVH/Daily/`, `SVH/Inbox/`, `SVH/Record/`, `SVH/System/`, `SVH/Archive/`. Excalidraw diagrams go in `Diagrams/<category>/` at the vault root.

### People
| Person | UPN | Entra object ID | IT Sysadmin Tasks label |
|--------|-----|-----------------|-------------------------|
| Aaron Stevens | astevens@shoestringvalley.com | `5a637656-9bd4-4e0c-9a4e-ae52ee2fd15d` | category23 |
| Sam Maxon | — | `8f46a470-62ee-4fc9-b312-7f43ae167205` | category21 |

Always use `astevens@shoestringvalley.com` for M365 `user_id` params. Gmail address is the Claude login only — never pass it to M365 tools.

### Planner
Primary plan: **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`)
Buckets: To do · In progress · Waiting · Backlog

**Staging rule:** Never call `planner_create_task` or `planner_update_task` without explicit per-session confirmation. Draft in Obsidian first.

`category1` = Quinn (the tool description saying "category1 = Aaron" is wrong).

### Bitwarden credentials
All credentials are in the **SVH OpsMan** BW item. Check both custom fields AND notes.

Custom fields: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_USER_ID, MDE_*, AZURE_*, NINJA_CLIENT_ID, NINJA_CLIENT_SECRET, OBSIDIAN_API_KEY.

The MCP server also reads `STAGING_DIR` and `DB_DIR` from env to locate collector output. These default to `staging/` and `db/` inside the repo root if not set — no Bitwarden entry needed.

Not yet found in BW: WAZUH_*, CONFLUENCE_*, UNIFI_*, PRINTERLOGIC_*. Search BW notes.

### PowerShell modules

See `.claude/rules/powershell.md` for conventions. See `powershell/README.md` for full function reference.

**PSRemoting quick-reference — from WSL:**

| Task | Account | Auth |
|------|---------|------|
| Disk, services, event logs, processes | `ra_stevens` | Non-interactive — BW `DC_REMOTE_USER` / `DC_REMOTE_PASSWORD` |
| Hyper-V, failover cluster, S2D, MABS | `sa_stevens` | Interactive `Get-Credential` |
| Active Directory, DNS, DHCP | `da_stevens` | Interactive `Get-Credential` |

### NinjaOne alerting rules
- **Skip devices in maintenance mode.** Never surface offline/alert state for devices in maintenance mode.
- ACCOPDXARCHIVE is intentionally offline and in maintenance mode — never flag it.

### Known issues
- Claude Code account switching: work↔personal swap breaks OpsMan on token expiry. No solution yet.

## References

`references/` contains triage guides and SVH-specific failure patterns. Auto-synced to `OpsManVault/References/` on session start.

| File | Used by |
|------|---------|
| `triage-gate.md` | IR Triage — lane classification and escalation path |
| `common-failure-modes.md` | Troubleshoot — SVH-specific failure patterns |
| `hypothesis-patterns.md` | Troubleshoot — isolation moves by problem class |
| `common-event-clusters.md` | Event Log Triage — event signatures by scenario |
| `ps-remoting-snippets.md` | Event Log Triage — Get-WinEvent recipes |
| `setup-winrm.md` | One-time WinRM trust setup from WSL |
| `credentials.md` | Credential reference — BW vs. missing |
| `users.md` | Team directory — Entra IDs and UPNs |
| `tailscale-udm-setup.md` | UDM Pro/SE subnet router deployment |
