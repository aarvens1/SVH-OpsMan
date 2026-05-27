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
| **Incident Open** | `/incident-open` · "open an incident" | Formally declares an incident — creates the Obsidian record, drafts a Planner tracking card, and stages a Teams alert. Use after `/troubleshoot` confirms something is worth declaring. |
| **Troubleshoot** | `/troubleshoot` · "X is broken" | Begins a systematic investigation, forming and testing hypotheses based on a library of known failure patterns. |
| **Incident Open** | `/incident-open` · "Open an incident for X" | Formally declares an incident: captures severity, affected systems, timeline, and creates the Obsidian note, Planner card, and Teams alert draft. Use after `/troubleshoot` confirms significance. |
| **Event Log Triage**| `/event-log-triage` · "Check event logs on X"| Queries and correlates logs from Wazuh, NinjaOne, and live PowerShell sessions. |
| **Event Log Analyzer**| `/event-log-analyzer` · "Analyze this log export"| Parses and analyzes exported log files (`.xml`, `.csv`, `.log`). |
| **Network Troubleshooter**| `/network-troubleshooter` · "Network issue at [site]"| Traces network paths from UniFi to the endpoint, checking firewall rules, VLANs, and device status. |
| **Mailflow Investigation**| `/mailflow-investigation` · "Did this email deliver?"| Traces a message through Exchange, Defender, and Entra to determine its delivery status and path. |
| **Tenant Forensics**| `/tenant-forensics` · "Who touched it?" | Merges audit logs from Azure, Entra, and NinjaOne into a single timeline of actions. |
| **IR Triage** | `/ir-triage` · "Is this suspicious?" | **(Disabled by default)** Classifies a potential incident and can send alerts to Teams. |

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
| **License Audit**| `/license-audit` · "Are we wasting licenses?" | Analyzes M365 license assignments against user activity and device status to identify waste. |

### Planning & Content

| Skill | Invoke | Description |
| :---- | :----- | :---------- |
| **Patch Campaign**| `/patch-campaign` · "Plan this month's patching" | Gathers all pending patches, prioritizes them based on TVM data, and drafts a deployment plan. |
| **Change Record**| `/change-record` · "Document this change" | Creates a structured change record with scope, risk, test plan, and rollback procedures. |
| **Runbook Gen** | `/runbook-gen` · "Write a runbook for X" | Generates a structured, reusable runbook from a description or rough notes — prerequisites, numbered steps, expected outputs, verification, and rollback. |
| **Project Creator**| `/project-creator` · "Turn this into a project"| Breaks down a request into a full project plan with deliverables, dependencies, and effort estimates. |
| **Runbook Gen**| `/runbook-gen` · "write a runbook for" | Generates a structured, reusable runbook from a description or rough notes, with prerequisites, numbered steps, verification, and rollback. |
| **Meeting Prep**| `/meeting-prep` · "Prep me for my 2pm" | Gathers context from calendar, past meetings (Fathom), and related tasks to prepare a briefing. |
| **Diagram** | `/diagram` · "Diagram this" | Creates or updates an Excalidraw diagram in Obsidian from a description, sketch, or existing note. Works for architecture, workflows, timelines, org charts. |
| **Draft** | `/draft` · "Draft an email to..." | Takes bullet points and drafts a polished email or Teams message in your voice. |
| **TicketSmith** | `/ticketsmith` · "Write a ticket for this"| Converts a raw user complaint into a well-structured IT ticket. |
| **Scribe** | `/scribe` · "Document what I just did" | Turns rough notes into structured documentation in various styles (e.g., how-to, incident report). |
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

## Gemini Dev Assistant

Gemini runs alongside Claude in three dedicated accounts. Claude owns ops; Gemini owns dev. Neither crosses into the other's lane.

### The Three Accounts

| Account | Role | What to use it for |
| :------ | :--- | :----------------- |
| **A — Dev** | Active coding | Scaffolding, refactoring, testing, TypeScript types, git ops, npm audit |
| **B — Docs** | Long-context analysis | Bulk documentation passes, reading entire modules, large-file diffs |
| **C — Research** | Public web lookups | API docs, package versions, error messages, CVE public info |

### Handoff Workflow

Each Gemini handoff is tracked as an Obsidian note in `Handoffs/` with a status lifecycle:

`draft` → `ready` → `in-progress` → `done`

**Queueing a handoff:** Run `/gemini-handoff` — Claude creates a note in `Handoffs/`, adds a link to your daily Activity Log, and prompts you to review the spec. Multiple handoffs can queue as `draft` without blocking each other.

**Pushing to Gemini:** Change the note's `status` to `ready` in Obsidian, then run `/handoff-queue`. Claude writes the spec to `.gemini/handoff.md` and tells you which account and skill to use. If multiple are ready, they process one at a time — run `/handoff-queue` again after each receive.

**Receiving results:** After Gemini writes `.gemini/to-claude.md`, run `/handoff-receive`. Claude integrates the result and closes out the Handoff note.

The data boundary is enforced at creation time: `/gemini-handoff` strips all private data before writing the spec. Field names and types only — no real device names, IPs, UPNs, or credentials.

### Gemini Skills

| Skill | Account | Invoke |
| :---- | :------ | :----- |
| `create-collector-job` | A | "Scaffold a new collector job for..." |
| `test-writer` | A | "Write tests for `path/to/file.ts`" |
| `refactor-powershell` | A | "Refactor `SVH.Core.psm1`" |
| `code-reviewer` | A / B | "Review my changes since main" |
| `api-spec` | A | "Generate types from this JSON shape" |
| `ts-linter` | A | "Run the linter" |
| `npm-audit` | A | "Check for vulnerable dependencies" |
| `dependency-manager` | A | "Add zod to mcp-server" |
| `git-helper` | A | "Show me what changed in collector/" |
| `release-drafter` | A | "Draft release notes since the last tag" |
| `code-documenter` | A / B | "Add JSDoc to all exports in `utils/`" |
| `log-analyzer` | B | "Analyze this log file" |
| `web-research` | C | "Quick Google: what's the Graph API for sign-in logs?" |
| `claude-handoff` | A | "Pick up the Claude handoff" |
| `config-validator` | A | "Validate my tsconfig" |
| `db-query` | A | "Query metrics.db for..." |
| `shell-script-converter` | A | "Convert this script to PowerShell" |

### Data Boundary

Gemini accounts have no MCP tool access. Never paste raw NinjaOne responses, Wazuh alerts, M365 mail content, or Bitwarden credentials into a Gemini session. When Gemini needs to know the shape of a private API response, use `/gemini-handoff` in Claude — it strips real values and passes only field names and types.

<<<<<<< HEAD
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
=======
## PowerShell TUIs

For hands-on administrative tasks, the project includes five Textual User Interface (TUI) applications built with Python's Textual framework. They provide a searchable, form-based interface for the underlying PowerShell modules. An active Bitwarden session is required.

-   **Main TUI:** `tui`
    -   A general-purpose interface for browsing and executing over 200+ functions from the PowerShell module suite. Features risk color-coding and a command previewer.
-   **Active Directory TUI:** `tui-ad`
    -   Specialized for user and group management in Active Directory.
-   **Alerts TUI:** `tui-alerts`
    -   For viewing and managing alerts from Defender and Wazuh.
-   **Network TUI:** `tui-net`
    -   Focused on network diagnostics and UniFi device management.
-   **Patching TUI:** `tui-patches`
    -   For reviewing and approving pending system patches.

Launch them using their respective alias after unlocking Bitwarden (`bwu`). For example:

```bash
bwu
tui-ad
```
>>>>>>> c3f93a9 (docs: Synchronize documentation with recent features)

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
