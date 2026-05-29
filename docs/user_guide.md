# User Guide

This guide covers the daily workflow, how to interact with the AI assistants, and provides a reference for available skills.

## Daily Workflow

### Starting a Session

Two launch modes. Pick based on what you're doing:

```bash
opsman        # Normal ops session — full hooks enforced
opsman-dev    # Dev session — workflow hooks relaxed (see below)
```

Both check for an active Bitwarden session and start the status-refresh daemon. If BW is locked, unlock first:

```bash
bwu   # or: export BW_SESSION=$(bw unlock --raw)
```

**`opsman`** — use for all ops work: investigations, briefings, incidents, posture checks, anything that reads live system data. All hooks enforced.

**`opsman-dev`** — use when working on OpsMan itself: skills, hooks, MCP tools, settings, CLAUDE.md. Sets `CLAUDE_DEV_MODE=1`, which relaxes git workflow blocks (reset --hard, restore, clean) and rm -rf on build artifact directories. Force push, .env files, DROP TABLE, and disk format remain blocked. **Don't use for sessions where live alert or device data is in context** — ops data in a dev session is how real hostnames end up in commits.

### Keeping OpsMan Updated

```bash
opsman-update
```

Pulls the latest commits, rebuilds both packages (`mcp-server` and `collector`) only if `package-lock.json` changed, then restarts the `svh-opsman-mcp` systemd service and the status-refresh daemon. Safe to re-run at any time.

```bash
opsman-update --skip-pull   # rebuild + restart without fetching from remote
```

Run this after pulling changes that touch `mcp-server/`, `collector/`, or any skill file. The MCP service restart means the next Claude Code session picks up the new build automatically.

### The Session-Start Hook

Each time you start a session, a hook runs to inject contextual information into the AI's prompt, such as the current git branch, Bitwarden status, and a summary of recent operational activity. This gives the AI immediate awareness of the current state without you having to provide it.

### A Typical Day

-   **Morning:** Start your session and run `/day-starter` to get a full briefing on overnight activity and open tasks.
-   **During the day:** Interact with the AI using natural language to investigate issues, query systems, or draft documents.
-   **End of day:** Run `/day-ender` to summarize the day's accomplishments and note any carry-over items for the next day.

## Driving the AI

Effective interaction is key to getting the most out of the system.

### Cardinal Rules

1.  **Obsidian is the Staging Area:** All output (reports, drafts, notes) is written to your Obsidian vault first. Nothing is sent to a live system (like Teams or Planner) without a second, explicit confirmation from you.
2.  **Explicit Confirmation for Writes:** To action a draft (e.g., create a Planner task, send a Teams message), you must give a clear, affirmative command like "Push it," "Go ahead," or "Create the task."

### Giving Context

Claude only remembers the current conversation. When continuing work from a previous session, provide a brief summary to set the context. For persistent context on assets (servers, users), use the `/asset-investigation` skill, which writes to a permanent, accumulating note in your vault.

### Stating Intent

Be explicit about what you want.

-   If you want a draft: *"Draft a Teams message about the maintenance window. Don't send it."*
-   If you're ready to act: *"The draft looks good. Send the Teams message."*

### Corrections

If the AI misunderstands, simply correct it in plain language. It will backtrack and adjust its approach based on your feedback.

## Skills Reference

Skills are pre-defined workflows that the AI can execute. You can trigger them with a `/` command or by using a trigger phrase in natural language.

### Daily Rhythm

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **Day Starter** | `/day-starter` · "Morning briefing" | Generates a digest of the last 24h of activity from all monitoring sources and your task list. |
| **Day Ender** | `/day-ender` · "End of day" | Summarizes the last 12h of work and identifies open items for the next day. Appends to the daily note. |
| **Week Starter** | `/week-starter` · "What's the week look like" | Reviews the previous week's loose ends and outlines the upcoming week's calendar and tasks. |
| **Week Ender** | `/week-ender` · "Wrap up the week" | Summarizes the week's accomplishments and stages items for the following week. |
| **Handoff** | `/handoff` · "session handoff" | Preserves the current session's context, decisions, and open items to an Obsidian note for continuity across sessions. |
| **Task Review** | `/task-review` · "Let's bust out some tasks" | Full triage across MS To Do and all Planner boards: pulls fresh, organizes by urgency and owner, then executes bulk close/reschedule/dismiss actions. |
| **Staging Review** | `/staging-review` · "what's in staging" | Quick summary of the latest collector data — what was gathered, how fresh it is, and any failed jobs. |
| **Memory Cleanup** | `/memory-cleanup` · "clean up memory" | Audits and prunes the auto-memory store; moves actionable items to TODO.md. Called automatically by week-ender. |

### Incident Response & Troubleshooting

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **Troubleshoot** | `/troubleshoot` · "X is broken" | Begins a systematic investigation, forming and testing hypotheses based on a library of known failure patterns. Writes to `Investigations/`. |
| **Incident Open** | `/incident-open` · "Open an incident for X" | Formally declares an incident: captures severity, affected systems, timeline, and creates the Obsidian note, Planner card, and Teams alert draft. Use after `/troubleshoot` confirms significance. |
| **Event Log Triage**| `/event-log-triage` · "Check event logs on X"| Queries and correlates logs from Wazuh, NinjaOne, and live PowerShell sessions. |
| **Event Log Analyzer**| `/event-log-analyzer` · "Analyze this log export"| Parses and analyzes exported log files (`.xml`, `.csv`, `.log`). |
| **Network Troubleshooter**| `/network-troubleshooter` · "Network issue at [site]"| Traces network paths from UniFi to the endpoint, checking firewall rules, VLANs, and device status. |
| **Mailflow Investigation**| `/mailflow-investigation` · "Did this email deliver?"| Traces a message through Exchange, Defender, and Entra to determine its delivery status and path. |
| **Tenant Forensics**| `/tenant-forensics` · "Who touched it?" | Merges audit logs from Azure, Entra, and NinjaOne into a single timeline of actions. |
| **IR Triage** | `/ir-triage` · "Is this suspicious?" | Classifies a potential incident into a response lane (Burning Building / Active Investigation / Background Enrichment) and enriches with Defender, Entra, and NinjaOne data. The only skill authorized to send a Teams message without a second confirmation — currently routes sends to your own DM for testing. |

### Posture & Review

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **Posture Check**| `/posture-check` · "State of the land" | Generates a Green/Yellow/Red scorecard for Identity, Endpoints, Patching, and other key areas. |
| **On-Prem Health**| `/onprem-health` · "How are the servers?" | Sweeps NinjaOne, backups, patch status, and runs live PowerShell checks against on-premise infrastructure. |
| **OpsMan Health**| `/opsman-health` · "test my integrations" | Fires a lightweight probe against every configured service and reports pass/fail. Use after MCP server changes or when a tool call fails unexpectedly. |
| **Vuln Triage**| `/vuln-triage` · CVE ID | Takes a CVE, identifies exposed devices, and recommends a remediation priority. |
| **Asset Investigation**| `/asset-investigation` · "Tell me about [server/user]"| Compiles a comprehensive report on a specific asset or user from all connected systems. |
| **User Report** | `/user-report` · "What has [user] been doing?" | Quick recent-activity snapshot for a user: sign-ins, Entra audit events, Defender alerts, Planner tasks, Teams activity. Lighter than `/asset-investigation` — no diagram, recent activity only. |
| **Access Review**| `/access-review` · "Audit permissions for X" | Audits roles, group memberships, and sign-in activity for a user, group, or application. |
| **License Audit**| `/license-audit` · "Are we wasting licenses?" | Analyzes M365 license assignments against user activity and device status to identify waste. Full cross-join across all SKUs — use when you want the detailed cost/compliance view. |
| **License Count**| `/license-count` · "How many E1/E3 licenses?" · "Are we low on licenses?" | Quick E1/E3 seat headroom check. Shows total/consumed/available in ~10 seconds. Alerts at zero seats and drafts a To Do task to notify procurement. Also runs automatically in the day-starter. |

### Planning & Content

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **Patch Campaign**| `/patch-campaign` · "Plan this month's patching" | Gathers all pending patches, prioritizes them based on TVM data, and drafts a deployment plan. |
| **Change Record**| `/change-record` · "Document this change" | Creates a structured change record with scope, risk, test plan, and rollback procedures. |
| **Runbook Gen** | `/runbook-gen` · "Write a runbook for X" | Generates a structured, reusable runbook from a description or rough notes — prerequisites, numbered steps, expected outputs, verification, and rollback. |
| **Project Creator**| `/project-creator` · "Turn this into a project"| Breaks down a request into a full project plan with deliverables, dependencies, and effort estimates. Drafts a Planner plan + buckets + tasks (staged) and an Excalidraw WBS diagram. |
| **Project Close**| `/project-close` · "Close the [name] project"| Closes a finished project: four-question retrospective, archives dated work artifacts to `Projects/Archive/`, sets `status: closed`, prompts to close any open Planner tasks. |
| **Meeting Prep**| `/meeting-prep` · "Prep me for my 2pm" | Gathers context from calendar, past meetings (Fathom), and related tasks to prepare a briefing. |
| **Diagram** | `/diagram` · "Diagram this" | Creates or updates an Excalidraw diagram in Obsidian from a description, sketch, or existing note. Works for architecture, workflows, timelines, org charts. |
| **Draft** | `/draft` · "Draft an email to..." | Takes bullet points and drafts a polished email or Teams message in your voice. |
| **TicketSmith** | `/ticketsmith` · "Write a ticket for this"| Converts a raw user complaint into a well-structured IT ticket. |
| **Scribe** | `/scribe` · "Document what I just did" | Turns rough notes into structured documentation in various styles (e.g., how-to, incident report). |
| **Brain Dump** | `/brain-dump` · "brain dump" · "log this" | Zero-friction capture. Appends a timestamped bullet to `Inbox.md` in the vault. No structure, no frontmatter — just a line with a timestamp. |
| **Handoff** | `/handoff` · "Create a handoff" | Writes a session handoff note to Obsidian and adds a summary line to today's daily note. Use before context compaction or when switching projects. |
| **Gemini Handoff** | `/gemini-handoff` · "Hand this to Gemini" | Writes a sanitized code task spec to `.gemini/handoff.md` for Gemini to pick up. No private data crosses the boundary. |

### Utilities & Maintenance

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **OpsMan Health** | `/opsman-health` · "Test my integrations" | Fires a lightweight probe against every configured integration and reports pass/fail per service. Run after MCP server changes or when a tool call fails unexpectedly. |
| **Staging Review** | `/staging-review` · "What's in staging?" | Quick summary of the latest collector staging data — what was gathered, how fresh it is, and any gaps. Faster than running a full day starter. |
| **Memory Cleanup** | `/memory-cleanup` · "Clean up memory" | Audits and prunes the Claude auto-memory store. Deletes stale entries, moves actionable items to TODO.md, and rebuilds the memory index. |
| **PowerShell Navigator** | `/powershell-navigator` · "How do I X in PowerShell?" | Conversational interface for finding, understanding, and executing commands from the SVH PowerShell modules. |
| **PDX Weekend Digest** | `/pdx-weekend-digest` | Curated digest of upcoming weekend events in the Portland, OR area. |

## Project Lifecycle

Projects in OpsMan are fat working documents — they accumulate standards, tables, per-site progress, and decisions over the life of the work. The vault is not an index of work happening in Planner; **the vault note is the work**, with Planner as the operational task surface alongside it.

### Lifecycle

```
/project-creator
      │
      ▼
   active ──── on-hold (paused, may resume)
      │              │
      └──── /project-close ────▶ closed
                                  │
                  Dated artifacts ▼
                            Projects/Archive/
```

Status values for project notes: `active | on-hold | closed`. This is NOT the briefing draft→filed lifecycle.

### What lives where

| Surface | Role |
|---|---|
| `Projects/<name>.md` | The project itself. Persistent, fat working document. Stays in `Projects/` even after closure. |
| `Projects/Archive/<slug>-YYYY-MM-DD.md` | Dated work artifacts (snapshots, completed deliverables, eval matrices). Filed by `/project-close`. |
| Planner plan (registered by ID in `.claude/config.yaml`) | Operational tasks. Day Starter surfaces these in the Projects section. |
| `Diagrams/Projects/<name>.md` | WBS diagrams, topology diagrams, point-in-time state diagrams. |
| `project/<slug>` tag on related notes | The cross-reference — meeting-prep, change-record, and incident-open optionally tag their output with the project slug. Dataview query `FROM #project/<slug>` returns every note that touched the project. |

### Day-to-day signals

- **Day Starter Projects section** — lists registered project Planner plans alongside their vault notes. Flags projects as stale based on priority: P1 ≥ 7 days, P2 ≥ 14 days, P3 silent.
- **Inbox section** — captures brain-dump entries since the last day-starter. Triage suggestions for each.
- **Project tag** — anything carrying `#project/<slug>` rolls up into the project's Dataview view.

### Closing a project

Use `/project-close`. It runs a four-question retrospective, walks artifacts through the archive-vs-delete decision table, sets `status: closed`, stages Planner task closures, and surfaces backlinks for manual review. The project note stays in `Projects/` — only dated artifacts move to Archive.

## Obsidian Output Reference

All skill output goes to the Obsidian vault first. This table shows where each skill writes and whether it automatically adds a link to the day's Activity Log.

### What writes where

| Skill | Vault path | Updates Activity Log? |
| :---- | :--------- | :-------------------- |
| **day-starter** | `Briefings/Daily/YYYY-MM-DD.md` | Is the daily note |
| **day-ender** | `Briefings/Daily/YYYY-MM-DD.md` | Is the daily note |
| **week-starter** | `Briefings/Weekly/YYYY-WW.md` | No |
| **week-ender** | `Briefings/Weekly/YYYY-WW.md` | No |
| **meeting-prep** | `Meetings/YYYY-MM-DD-name.md` | Yes — adds link + one sentence |
| **task-review** | Appends to today's Activity Log | Only if you ask |
| **brain-dump** | `Inbox.md` (append) | No |
| **troubleshoot** | `Investigations/YYYY-MM-DD-[topic].md` | Yes — adds wikilink |
| **onprem-health** | `Investigations/YYYY-MM-DD-onprem-health.md` | Yes — adds wikilink |
| **posture-check** | `Reviews/Posture/YYYY-MM-DD.md` | Yes — adds wikilink |
| **incident-open** | `Incidents/Active/YYYY-MM-DD-name.md` | Yes — adds wikilink |
| **ir-triage** | `Incidents/Active/YYYY-MM-DD-[name].md` | No |
| **change-record** | `Changes/CHG-YYYY-NNN.md` + `Diagrams/Changes/` | No |
| **vuln-triage** | `Vulnerabilities/` + Confluence draft | No |
| **tenant-forensics** | `Investigations/` | No |
| **user-report** | `Investigations/user-report-YYYY-MM-DD-[name].md` | No |
| **mailflow-investigation** | `Investigations/` | No |
| **network-troubleshooter** | `Investigations/` + `Diagrams/` | No |
| **event-log-analyzer** | `Investigations/` | No |
| **access-review** | `Reviews/Access/YYYY-MM-DD-[name].md` | No |
| **license-audit** | `Reviews/Access/license-audit-YYYY-MM-DD.md` | No |
| **license-count** | Inline only (`System/skill-log.md` append) | No |
| **patch-campaign** | `Reviews/Patches/YYYY-MM-DD-patch-campaign.md` | No |
| **ticketsmith** | `Investigations/tickets/YYYY-MM-DD-[title].md` | No |
| **runbook-gen** | `Investigations/runbooks/[topic].md` | No |
| **scribe** | Various (investigations, runbooks, etc.) | No |
| **asset-investigation** | `Assets/[name].md` + `Diagrams/Assets/` | No |
| **opsman-health** | Inline only | No |
| **project-creator** | `Projects/<name>.md` (+ optional `Diagrams/Projects/`) | No |
| **project-close** | Updates `Projects/<name>.md`; moves dated artifacts to `Projects/Archive/` | **Yes** |

### Skill usage log

Every skill that writes a note appends one line to `System/skill-log.md` in the vault:

```
YYYY-MM-DD HH:MM | skill-name | path/to/note.md | one-line summary
```

This gives you a running record of which skills ran and what they produced. Query it to see which skills are used most or to find a note you can't remember the path for.

### Finding notes by skill

Every skill-produced note carries `skill: <name>` in its frontmatter. Use a Dataview query in any Obsidian note to list all output from a given skill:

```dataview
TABLE date, file.path FROM ""
WHERE skill = "troubleshoot"
SORT date DESC
```

## Dev Assistant Lanes

Work is routed across three lanes by quota pool, data exposure, and tool strengths.

### The Three Lanes

| Lane | Account | Launch | Live data? | Owns |
| :--- | :------ | :----- | :--------- | :--- |
| **Claude Ops** | `aa_stevens@shoestringvalley.com` | `opsman` · `opsman-dev` | Yes — full MCP, BW_SESSION | Incidents, briefings, posture, investigations, all vault writes on real data, messages to Teams/Planner/Confluence |
| **Claude Dev** | `astevens2694@gmail.com` | `claude-dev` | No (by design) | Most OpsMan code work: skills, hooks, MCP server, collector, PowerShell, TUI, tests, type generation, refactors |
| **Gemini** | Existing Gemini login | Gemini CLI / web | No | Public web research only — quick Google lookups, API docs, package versions, CVE public info |

### Claude Dev launch

`claude-dev` uses an isolated `CLAUDE_CONFIG_DIR=$HOME/.claude-dev` so session state and login don't collide with the Ops account. No Bitwarden unlock happens — the OpsMan MCP server won't start in a Dev session, which is the design.

### Data boundary

The Dev account and Gemini both sit outside the data boundary. **Real device names, hostnames, IPs, UPNs, alert content, and credentials must not cross from an Ops session into either of them.** When ops context is live and the next step is code work, sanitize the spec first — extract field names and types only.

Historically there was a `/gemini-handoff` skill that wrote a sanitized spec to `.gemini/handoff.md` for an async cycle. That async cycle is retired; sanitization itself still matters and is currently done manually. See `TODO.md` for the rewrite plan.

### Retired roles

| Was | Now |
| :-- | :-- |
| Gemini Account A (active coding) | Claude Dev |
| Gemini Account B (long-context docs reads, bulk refactors) | Claude Dev |
| Gemini Account C (web research) | Single remaining Gemini account |

Most of the previously listed Gemini skills (`test-writer`, `refactor-powershell`, `code-reviewer`, `api-spec`, `ts-linter`, `npm-audit`, `dependency-manager`, `git-helper`, `release-drafter`, `code-documenter`, `log-analyzer`, `config-validator`, `db-query`, `shell-script-converter`) are superseded by Claude Dev. The only Gemini skill that still has a clear role is `web-research`.

## TUI Apps

The project includes a suite of Textual terminal UIs. All are launched via `tui/run-tui.sh` (requires an active `BW_SESSION`).

| App | Alias | Description |
| :-- | :---- | :---------- |
| `main` | `tui` | PowerShell Navigator — searchable form-based browser for all 237 module functions |
| `ad` | `tui-ad` | Active Directory user management |
| `alerts` | `tui-alerts` | Alert triage across Wazuh and NinjaOne |
| `net` | `tui-net` | Network ops via SVH.Network functions |
| `patches` | `tui-patches` | Patch campaign management |

**Start:** `tui/run-tui.sh [app]` — defaults to `main` if no app is specified.

**PowerShell Navigator features:**
-   Browse and search all 237 functions by module.
-   Fill parameters in a simple form.
-   Preview the command before execution.
-   Risk color-coding for commands (Read, Write, Destructive).
-   Confirmation step for all destructive actions.
-   Optionally save command output directly to Obsidian.

## Windows Terminal Environment

The `dotfiles/install-windows.ps1` script configures your Windows Terminal with custom profiles, a color scheme, and keybindings for a seamless experience.

| Keys | Action |
| :--- | :----- |
| `Ctrl+Alt+D` | `/day-starter` |
| `Ctrl+Alt+E` | `/day-ender` |
| `Ctrl+Alt+P` | `/posture-check` |
| `Ctrl+Alt+T` | `/troubleshoot` |
| `Ctrl+Shift+Alt+C` | New Claude Code tab |
| `Ctrl+Shift+Alt+P` | New PowerShell (OpsMan) tab |

Refer to the `dotfiles/windows-terminal-settings.json` for a complete list of keybindings.
