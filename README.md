# SVH OpsMan

Your IT operations assistant, powered by Claude. Ask questions and give instructions in plain English — Claude queries your systems and takes action directly.

```
"Day starter."
"Is there anything unusual in Wazuh from last night?"
"Tell me everything about SVH-SQL01."
"Why can't users at Site B reach the file server?"
"Help me plan this month's patching."
"Prep me for my 2pm with the network vendor."
"Pull the notes from my call with Contoso this morning."
"Check if any Azure NSGs have internet-exposed ports."
```

---

## How it works

Claude connects to a custom MCP server (this repo) and a set of external MCPs. When you ask something, Claude picks the right tools, queries the relevant systems, and synthesizes a response.

```
You ──► Claude
              ├── Custom MCP (this repo) ──► Microsoft 365, Azure, NinjaOne,
              │                              UniFi, Wazuh, PrinterLogic, Confluence
              └── External MCPs ──────────► Obsidian, Excalidraw, GitHub,
                                            Fathom, Firecrawl,
                                            Desktop Commander, Bitwarden, Time
```

**Obsidian is home base.** Briefings, incident notes, change records, meeting notes — anything Claude produces lives in Obsidian. Claude never sends to Teams, Mail, or Planner without you explicitly asking it to.

**Human-initiated only.** Nothing runs on a schedule. Skills are prompt patterns you trigger — Claude doesn't act autonomously.

**PowerShell module suite** lives in `powershell/`. Load with `. ./connect.ps1` from Windows Terminal. The modules expose write operations and on-prem checks that Claude doesn't perform autonomously — things like disabling an account, isolating a device, rebooting a server, or pulling Hyper-V and MABS job state via PSRemoting. See [PowerShell modules](#powershell-modules) below.

---

## What Claude has access to

> 🔒 = read-only — Claude cannot create, modify, or delete anything in these systems.

| System | What Claude can do |
|--------|--------------------|
| **Outlook Mail** | Search and read your messages, send, draft, organize folders — scoped to your mailbox only |
| **Outlook Calendar** | View and manage your events, check availability, find meeting times, book rooms — scoped to your calendar only |
| **Teams** | Read messages, send messages, manage channels and members |
| **Microsoft Planner** | Manage plans, tasks, assignments, and due dates — no task deletion (complete at 100% instead) |
| **Microsoft To Do** | Manage task lists and checklist items |
| **OneDrive** | Browse files, search, create folders, generate sharing links |
| **SharePoint Sites** 🔒 | Browse sites, lists, pages, and permissions |
| **Exchange Admin** 🔒 | View mailbox settings, accepted domains, distribution groups; run message trace |
| **Entra ID** | Audit users, MFA, app registrations, roles, CA policies, sign-in and audit logs; dismiss risky users |
| **Intune** 🔒 | Device compliance, configuration profiles, deployed apps |
| **MS Admin** 🔒 | M365 service health, active incidents, Message Center, license subscriptions |
| **Defender for Endpoint** 🔒 | Devices, alerts, incidents, software inventory, CVEs, TVM recommendations |
| **Azure** 🔒 | Resource groups, VMs, storage, app services, VNets, NSGs, activity logs, costs, Advisor |
| **NinjaOne RMM** 🔒 | Servers and workstations — services, patches, event logs, backups, alerts |
| **Wazuh** 🔒 | SIEM alerts, agent inventory, FIM events, vulnerability detections, rootcheck |
| **UniFi Cloud** 🔒 | Sites and devices across all locations |
| **UniFi Network** 🔒 | VLANs, WLANs, firewall rules, switch ports, connected clients |
| **PrinterLogic** 🔒 | Printers, drivers, deployment profiles, audit logs, print quotas |
| **Confluence** | Search and read content, edit pages, manage comments |
| **Obsidian** | Read and write notes — **home base for everything Claude produces** |
| **Excalidraw** | Create and edit diagrams — network maps, attack paths, asset relationships, WBS charts, change impact scope |
| **Fathom** | Fetch meeting transcripts and summaries from recorded calls |
| **GitHub** | Repos, issues, PRs, Actions workflows |
| **Firecrawl** | Web search, fetch URLs as Markdown, structured extraction |
| **Desktop Commander** | Run shell commands on the MCP host |
| **Bitwarden** 🔒 | Retrieve credentials; also loads MCP server credentials at startup |
| **Time** | Current time, timezone conversions, date arithmetic |

> One app registration covers all Microsoft services except Defender and Azure — those each need their own. Mail and calendar tools are locked to `GRAPH_USER_ID` — they cannot access any other mailbox.

---

## Skills

Trigger by slash command or by saying any of the listed phrases. Skills load on demand — their instructions and tool lists live in `.claude/skills/`. Output goes to Obsidian. Nothing gets sent anywhere without you explicitly asking.

### Daily rhythm

#### Day Starter
**Invoke:** `/day-starter` · "Day starter" · "Morning briefing" · "What's on my plate"

Covers the last 24 hours — or since end of Thursday if it's Monday (picks up the full weekend). Pulls from every monitoring system and your task and calendar stack, then produces a single prioritized digest: what needs attention now, today's agenda, open tasks, and anything worth watching. Suggested Planner updates and reply drafts are included for your review — nothing changes without your say-so.

**Output:** `Briefings/Daily/YYYY-MM-DD.md`

---

#### Day Ender
**Invoke:** `/day-ender` · "Day ender" · "Wrap up today" · "End of day"

Covers the last 12 hours. What got done, what's still open, anything that needs a handoff note or a follow-up message before tomorrow.

**Output:** Appends to the day's Obsidian note.

---

#### Week Starter
**Invoke:** `/week-starter` · "Week starter" · "What does the week look like"

Last week's loose ends plus this week's load: what closed, open threads, upcoming calendar and tasks, anything stale that needs a nudge, and a suggested first move.

**Output:** `Briefings/Weekly/YYYY-WW.md`

---

#### Week Ender
**Invoke:** `/week-ender` · "Week ender" · "Wrap up the week" · Thursday end of day

What shipped, what slipped, seeds for next week, and an optional summary draft for your manager or team — staged in Confluence for review.

**Output:** Obsidian retrospective + Confluence draft.

---

### When things go wrong

#### Troubleshooting
**Invoke:** `/troubleshoot` · "X is broken" · "Troubleshoot Y" · "Why isn't Z working"

Systematic isolation — not vibes. Claude restates the problem (expected vs. actual), scopes it (one user or many, one site or all), inventories what's working, generates ranked hypotheses, and works through them cheapest-first. Each result is documented before moving on. References SVH-specific failure patterns for Hyper-V, MABS, CMiC, UniFi, and WSUS.

---

#### Event Log Triage
**Invoke:** `/event-log-triage` · "Check event logs on X" · "What happened on Z around [time]"

Wazuh first for broad correlation, NinjaOne for anything Wazuh missed, then targeted PowerShell via Desktop Commander for precision deep-dives. Matches findings against known SVH event signatures.

---

#### Network Troubleshooter
**Invoke:** `/network-troubleshooter` · "Network issue at [site]" · "Why can't [users] reach [resource]"

UniFi Cloud → UniFi Network Controller (VLANs, firewall, switch ports) → Wazuh (IDS/IPS, dropped packets, gateway events) → NinjaOne (affected endpoints) → Desktop Commander (ping, traceroute, port checks). Produces a ranked diagnostic brief and an Excalidraw topology diagram scoped to the affected path — VLANs, segments, and key devices — embedded in the note.

**Diagram:** `Diagrams/Network/[site]-YYYY-MM-DD.excalidraw`

---

#### Mailflow Investigation
**Invoke:** `/mailflow-investigation` · "Did this email deliver" · "Why didn't X get my message" · delivery bounce or delay

Exchange Admin message trace → Defender (attachment/URL flagging) → Entra (was the mailbox accessible) → diagnostic timeline with root cause.

---

#### IR Triage

> **Currently disabled.** `SKILL.md` renamed to `SKILL.md.disabled` — re-enable by renaming it back. Disabled because it is the only skill that can send non-draft Teams messages; keeping it off until explicitly needed.

**Invoke:** `/ir-triage` · alert investigation, IOC enrichment, "is this suspicious," suspected compromise

Runs a triage gate first to classify the situation:

| Lane | Criteria | Action |
|------|----------|--------|
| 🔥 Burning Building | Active credential theft, mass impact, confirmed compromise | Immediate Teams alert (not a draft) + Planner card, enrich in parallel |
| 🔎 Active Investigation | Confirmed bad but contained | Enrich first, then draft Teams + Planner for your review |
| 🔍 Background | Suspicious, likely benign | Enrich only, no notifications |

Enrichment: IOC → Defender → Entra sign-in/audit logs → NinjaOne endpoint state → incident brief. For Burning Building and Active Investigation lanes, also produces an Excalidraw attack-path diagram (initial access → lateral movement → impact) embedded in the incident note.

**Output:** `Incidents/Active/YYYY-MM-DD-name.md` + lane-appropriate drafts + `Diagrams/Incidents/INC-YYYY-NNN.excalidraw` (Active and Burning Building lanes).

---

### Posture & review

#### Security Posture Snapshot
**Invoke:** `/posture-check` · "Posture check" · "State of the land" · "Health check"

Cross-system snapshot scored Green / Yellow / Red:

| Category | Sources |
|----------|---------|
| Identity | Entra risky users, expiring app secrets, audit log anomalies |
| Endpoints | Defender open incidents + High/Critical alerts, Intune non-compliant devices |
| Patching | NinjaOne overdue patches by severity, Defender TVM exposure score |
| Infrastructure | NinjaOne failed backups, offline hosts; UniFi Cloud alert states |
| SIEM | Wazuh high-severity alerts in last 24h, agent disconnections |
| Cloud | Azure Advisor security recommendations |

**Output:** Obsidian snapshot note. No alerts sent unless you ask.

---

#### Vulnerability Triage
**Invoke:** `/vuln-triage` · CVE name or ID · Defender TVM finding · "Should we patch X"

CVE → Defender software inventory (who's exposed) → NinjaOne patch state → composite priority score → recommended timeline: Emergency / This Week / Next Cycle / Accept.

**Output:** Obsidian vuln note + Confluence writeup draft + Planner tickets per asset group.

---

#### Asset Investigation
**Invoke:** `/asset-investigation` · "Tell me everything about [server/user/device]" · "Asset report for X"

Routes by asset type:
- **Server or workstation:** NinjaOne (hardware, services, patches, backups), Wazuh (alerts, FIM), Defender (device profile, CVEs), Azure (if cloud VM) — produces an Excalidraw diagram of the asset's network position: VLAN, adjacent devices, and active firewall rules
- **User:** Entra sign-in history, MFA status, role and group memberships, CA policies, related Defender alerts

**Output:** `Assets/[name].md` — persistent note, updated each time you investigate the same asset. Network diagram saved to `Diagrams/Assets/[name].excalidraw` and embedded.

---

#### Access Review
**Invoke:** `/access-review` · "Access review for [user/group/role]" · "Audit permissions for X"

For a user: roles, groups, owned app registrations, recent sign-ins, MFA status, applicable CA policies. For a group or role: all members, activity, associated policies. Flags inactive privileged accounts, missing MFA in sensitive roles, stale memberships.

**Output:** Obsidian access report + optional Confluence audit page draft.

---

### Planning & coordination

#### Patch Campaign
**Invoke:** `/patch-campaign` · "Patch campaign" · "What needs patching" · "Let's plan patching"

Pulls pending patches from NinjaOne across all managed devices. Checks each CVE against Defender TVM priority. Groups into tiers: Emergency / This Week / Next Cycle / Accept. Produces a Planner board for tracking.

**Output:** Obsidian campaign note + Planner board.

---

#### Change Record
**Invoke:** `/change-record` · "About to make a change" · "Document this rollout" · "Change record for X"

Captures scope, risk classification, test plan, rollback procedure, comms plan, and schedule. Produces an Excalidraw impact-scope diagram: what's changing, what depends on it, and what's out of scope.

**Output:** Obsidian change note + impact diagram (`Diagrams/Changes/CHG-YYYY-NNN.excalidraw`) + Confluence draft + Planner card + Teams notification drafts — all staged for your review.

---

#### Project Creator
**Invoke:** `/project-creator` · large task that needs decomposing · "Turn this into a project"

Breaks input into a scope statement, deliverables, WBS, dependencies, and effort estimate. Pulls context from Confluence and Obsidian. Small projects (≤8 items) → single Planner card with checklist. Larger → full Planner plan with buckets and dates + Confluence project page + Excalidraw WBS diagram (`Diagrams/Projects/[name].excalidraw`) embedded in the project note.

---

#### Meeting Prep & Notes
**Invoke:** `/meeting-prep` · "Prep me for [meeting/time]" · "Pull notes from my [meeting name] call"

**Before a meeting:** Pulls the calendar event, searches Fathom for past notes with the same attendees, checks Confluence and Obsidian for context, reviews open Planner tasks tied to those people. Produces a brief and a blank agenda template ready to fill in during the call.

**After a recorded call:** Fetches the Fathom transcript and summary, extracts decisions, action items, and key points, and structures them into an Obsidian note. Action items get suggested as Planner or To Do tasks for your review.

**Output:** `Meetings/YYYY-MM-DD-name.md`

---

### Content & documentation

#### Draft
**Invoke:** `/draft` · "Draft an email" · "Write a message to" · "Draft this for me" · "Help me write this"

Give Claude rough notes, bullet points, or a plain description of what you need to say — it drafts an email, Teams message, or meeting invite body in Aaron's voice. Picks the right template shape automatically based on audience and situation. Nothing is sent; output lands in Obsidian as a clearly-labelled draft.

**Output:** `Drafts/YYYY-MM-DD-[recipient or topic].md`

---

#### TicketSmith
**Invoke:** `/ticketsmith` · "Write a ticket for this" · "Clean up this complaint" · "Turn this into a ticket"

Paste a raw user complaint, rant, or rough description and Claude rewrites it as a calm, professional IT ticket: one-line title, clear problem description, impact statement, steps to reproduce, and a suggested priority. Accepts pasted text, `.txt`, or `.pdf`. Nothing is submitted anywhere — output lands in Obsidian for your review first.

**Output:** Draft ticket body in Obsidian, ready to paste into your ticketing system.

---

#### Scribe
**Invoke:** `/scribe` · "Write this up" · "Document what I did" · "Make this a how-to" · "Write the closure notes"

Paste rough technician notes — shorthand, out-of-order, half-finished — and Claude structures them into clean documentation. Five output styles you can specify:

| Style | When to use |
|-------|------------|
| **standard** | Default — structured doc with context, steps, and outcome |
| **concise** | Quick summary for tickets or handoff notes |
| **detailed** | Step-by-step with rationale, suitable for runbooks |
| **incident-report** | Timeline, root cause, resolution, follow-up items |
| **how-to** | Numbered steps, reusable guide format |

Accepts paste, `.txt`, `.md`, `.pdf`, or screenshots. Output staged in Obsidian; optionally promoted to Confluence if you ask.

**Output:** `Investigations/` or wherever the content fits, then optionally `Confluence` draft.

---

#### Event Log Analyzer
**Invoke:** `/event-log-analyzer` · "Analyze this event log" · "Triage these Windows events" · "Look at the event log export from X"

For when you have an exported log file rather than live query access. Paste or attach an export (`.xml` preferred for richness, `.csv`, `.txt`, `.log` also work) and Claude produces a triage report: findings, patterns, probable cause, and recommended next steps. References SVH-specific event signatures from `references/common-event-clusters.md`.

Complements Event Log Triage (which queries Wazuh and NinjaOne live) — use this when you've already pulled the log file or when the source system isn't in Wazuh.

**Output:** Analysis written to Obsidian.

---

## Obsidian vault structure

Claude writes directly to the relevant folder. Nothing gets sent outside Obsidian unless you say so.

```
SVH OpsMan/
├── Briefings/
│   ├── Daily/             ← Day Starter / Day Ender / Posture Check snapshots
│   └── Weekly/            ← Week Starter / Week Ender
├── Incidents/
│   ├── Active/
│   └── Archive/
├── Investigations/
├── Changes/
├── Meetings/
├── Assets/                ← persistent, updated on each investigation
├── Projects/
├── Reviews/
│   ├── Access/
│   └── Patches/
├── Vulnerabilities/
├── Diagrams/              ← Excalidraw drawings (.excalidraw); embed with ![[file.excalidraw]]
│   ├── Assets/            ← network position diagrams per asset
│   ├── Changes/           ← impact-scope diagrams per change record
│   ├── Incidents/         ← attack-path diagrams per incident
│   ├── Network/           ← topology diagrams from Network Troubleshooter
│   └── Projects/          ← WBS diagrams per project
└── References/            ← reference docs from this repo
```

### Frontmatter

Every note Claude writes opens with:

```yaml
---
date: 2026-05-10
skill: Day Starter
status: draft
tags: [briefing, daily]
---
```

**Status lifecycle:** `draft` → `reviewed` → `filed` or `promoted`

- **draft** — Claude wrote it, you haven't touched it yet
- **reviewed** — you've read and edited it
- **filed** — done, no further action needed
- **promoted** — content pushed to Confluence, Teams, or Mail; original stays in Obsidian

**Extra fields for specific note types:**

```yaml
# Incidents
incident_id: INC-2026-042
severity: high            # critical / high / medium / low
status: open              # open / contained / closed

# Changes
change_id: CHG-2026-018
risk: medium              # low / medium / high
window: 2026-05-10 22:00 – 23:30

# Vulnerabilities
cve: CVE-2024-12345
priority: this-week       # emergency / this-week / next-cycle / accept
```

---

## Setup

### System requirements

The server currently runs in **WSL** on your workstation. When the time comes to move it to a dedicated Linux VM, the requirements are the same — the server is a lightweight Node.js process that just proxies API calls.

| Resource | WSL (current) | Dedicated VM (future) |
|----------|--------------|----------------------|
| CPU | Shared with host | 1–2 vCPU |
| RAM | ~512 MB for the process | 1 GB total |
| Disk | ~500 MB for app + deps | 10 GB for OS + app |
| OS | WSL 2 (Ubuntu 22.04) | Ubuntu 22.04 LTS |
| Node.js | 18+ | 20 LTS |

The MCP server communicates with Claude over **stdio** — it must run on the same machine as Claude (or the machine you're SSH'd into when using Claude Code remotely). No inbound ports are needed.

**Outbound HTTPS access required to:**
- `graph.microsoft.com`, `login.microsoftonline.com`
- `management.azure.com`
- `api.securitycenter.microsoft.com`
- `app.ninjarmm.com`
- Your UniFi controller URL
- Your Wazuh manager URL
- `vault.bitwarden.com` (Bitwarden CLI credential sync)

**Software dependencies:** Node.js 18+, `bw` (Bitwarden CLI)

---

### 1. Install Claude Code (native build)

Install Claude Code as a native binary rather than the npm global package. The npm-installed version lives under `/usr/bin` (root-owned) and requires `sudo` for auto-updates — the native build goes to `~/.local/bin` and updates cleanly without elevated permissions.

```bash
claude install stable
```

Then make sure `~/.local/bin` is on your PATH (add once, then restart your shell or `source ~/.bashrc`):

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
```

Verify the right binary is active:

```bash
which claude   # should be ~/.local/bin/claude
claude --version
```

If you previously installed Claude via `npm install -g`, the system copy at `/usr/bin/claude` remains but `~/.local/bin` takes precedence as long as it appears first in `PATH`.

---

### 2. WSL shell environment

`dotfiles/bashrc.sh` sets up the SVH-OpsMan shell environment. Source it from `~/.bashrc` (one-time):

```bash
echo '[ -f ~/SVH-OpsMan/dotfiles/bashrc.sh ] && . ~/SVH-OpsMan/dotfiles/bashrc.sh' >> ~/.bashrc
source ~/.bashrc
```

What this adds:

| Feature | Detail |
|---------|--------|
| Bitwarden check | Warns `⚠ Bitwarden locked — run: bwu` on every new shell |
| `bwu` function | Unlocks vault and exports `BW_SESSION` |
| Start in OpsMan | New shells open in `~/SVH-OpsMan` when launched from home dir |
| `ops` alias | Jump back to OpsMan from anywhere |
| Git branch in prompt | Branch name shown next to working directory |
| Expanded history | 10k lines with timestamps, shared across windows |
| `wexp` | Open current dir in Windows Explorer |
| `clip` | `echo foo \| clip` pipes to Windows clipboard |
| `wpath` | Convert WSL path to Windows path |
| Git aliases | `gs`, `gl`, `gd`, `gdc` |

---

### 3. Claude Code project config

The `.claude/` directory is checked into this repo. It configures permissions, hooks, and skills automatically when you open the project in Claude Code — no extra setup needed.

- **Permissions** — common git and npm operations are pre-approved so Claude doesn't prompt for them.
- **SessionStart hook** — injects branch name, uncommitted file count, and Bitwarden status at the start of every session.
- **Skills** — 20 active skills in `.claude/skills/` load on demand when invoked by name or trigger phrase. No context cost until you use them. IR Triage is present but disabled (`SKILL.md.disabled`).
- **Rules** — `.claude/rules/typescript.md` (TypeScript conventions, path-scoped to `mcp-server/src/**`) and `.claude/rules/obsidian-output.md` (Obsidian writing conventions, always loaded). Voice/communication rules live in the `draft` skill and only load when drafting.

`.claude/settings.local.json` is gitignored — use it for personal overrides.

---

### 3. Build the server

```bash
cd mcp-server
npm install
npm run build
```

### 4. Credentials

Credentials live as **custom fields on a single Bitwarden vault item** named **"SVH OpsMan"**. Field names must match the env var key exactly (e.g., a field named `GRAPH_CLIENT_SECRET` with the client secret as its value).

Unlock your vault before starting the server:

```bash
export BW_SESSION=$(bw unlock --raw)
```

The server reads all credentials from the vault item at startup. If `BW_SESSION` isn't set, it falls back to a `.env` file:

```bash
cp mcp-server/.env.example mcp-server/.env
# fill in only the services you're setting up
```

**Verify startup:**

```bash
npm start
# [svh-opsman] Loaded 20 credential(s) from Bitwarden vault
# [svh-opsman] Starting — 9/10 service groups configured
# [svh-opsman] Ready — listening on stdio
```

---

### 5. Register MCPs with Claude

**Claude Code:**

```bash
# Custom server
claude mcp add svh-opsman -- node /path/to/SVH-OpsMan/mcp-server/dist/index.js

# External MCPs
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx \
  -- npx -y @modelcontextprotocol/server-github

# Requires the "Local REST API" community plugin enabled in Obsidian.
# Copy the API key from: Settings → Community Plugins → Local REST API → API Key
claude mcp add obsidian -e OBSIDIAN_API_KEY=xxx \
  -- npx -y mcp-obsidian http://127.0.0.1:27123
# Vault path (for reference): /mnt/c/users/astevens/vaults/OpsManVault

claude mcp add fathom -e FATHOM_API_KEY=xxx \
  -- npx -y fathom-mcp    # check Fathom docs for current package name

claude mcp add firecrawl -e FIRECRAWL_API_KEY=xxx \
  -- npx -y @mendableai/firecrawl-mcp-server

claude mcp add desktop-commander \
  -- npx -y @wonderwhy-er/desktop-commander

claude mcp add bitwarden \
  -- npx -y @bitwarden/mcp

claude mcp add time \
  -- npx -y @modelcontextprotocol/server-time

claude mcp add excalidraw \
  -- npx -y mcp-excalidraw    # verify current package name at npmjs.com/package/mcp-excalidraw
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "svh-opsman": {
      "command": "node",
      "args": ["/path/to/SVH-OpsMan/mcp-server/dist/index.js"],
      "env": { "BW_SESSION": "your-bw-session-key" }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
    },
    "obsidian": {
      "command": "npx",
      "args": ["-y", "mcp-obsidian", "http://127.0.0.1:27123"],
      "env": { "OBSIDIAN_API_KEY": "your-key" }
    },
    "fathom": {
      "command": "npx",
      "args": ["-y", "fathom-mcp"],
      "env": { "FATHOM_API_KEY": "your-key" }
    },
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "@mendableai/firecrawl-mcp-server"],
      "env": { "FIRECRAWL_API_KEY": "your-key" }
    },
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander"]
    },
    "bitwarden": {
      "command": "npx",
      "args": ["-y", "@bitwarden/mcp"]
    },
    "time": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-time"]
    },
    "excalidraw": {
      "command": "npx",
      "args": ["-y", "mcp-excalidraw"]
    }
  }
}
```

---

## Credential reference

### Microsoft Graph — one app registration for most of Microsoft

Covers: Planner, To Do, Entra ID, OneDrive, SharePoint, Teams, Outlook Mail, Outlook Calendar, Exchange Admin, Intune, MS Admin.

In **Entra ID → App registrations → New registration**, add these **Application permissions** under Microsoft Graph and grant admin consent:

| Permission | Used by |
|-----------|---------|
| `Tasks.ReadWrite` | Planner |
| `Tasks.ReadWrite.All` | To Do |
| `Group.Read.All` | Planner, Teams |
| `ChannelMessage.Send` | Teams |
| `TeamMember.ReadWrite.All` | Teams |
| `Files.ReadWrite.All` | OneDrive |
| `Sites.Read.All` | SharePoint |
| `Mail.ReadWrite` · `Mail.Send` | Outlook Mail |
| `Calendars.ReadWrite` | Outlook Calendar |
| `MailboxSettings.ReadWrite` | Calendar, Exchange Admin |
| `Place.Read.All` | Calendar rooms |
| `Policy.Read.All` | Entra ID |
| `Application.Read.All` | Entra ID |
| `RoleManagement.Read.Directory` | Entra ID |
| `IdentityRiskyUser.ReadWrite.All` | Entra ID (P2 required) |
| `UserAuthenticationMethod.Read.All` | Entra ID |
| `AuditLog.Read.All` | Entra ID sign-in/audit logs |
| `DeviceManagementManagedDevices.Read.All` | Intune |
| `DeviceManagementConfiguration.Read.All` | Intune |
| `DeviceManagementApps.Read.All` | Intune |
| `ServiceHealth.Read.All` | MS Admin |
| `Organization.Read.All` | MS Admin |
| `Directory.Read.All` | General |
| `Reports.Read.All` | Exchange Admin message trace |

**Bitwarden fields:** `GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET` · `GRAPH_USER_ID`

#### Restricting mail access to your mailbox only (required)

`Mail.ReadWrite` and `Mail.Send` are Application permissions — by default they grant access to **every mailbox in the tenant**. The code locks all mail and calendar tool calls to `GRAPH_USER_ID`, but you should also enforce this at the Exchange layer so the restriction holds even if someone uses the client secret directly.

In Exchange Online PowerShell (run from Windows Terminal as your `ma_` admin account):

```powershell
# 1. Create a mail-enabled security group containing only your account
New-DistributionGroup -Name "Claude OpsMan Mailbox Access" `
  -Alias "claude-opsman-mailbox" -Type Security

Add-DistributionGroupMember -Identity "claude-opsman-mailbox" `
  -Member "astevens@shoestringvalley.com"

# 2. Create the policy — use the client ID (GUID) from your app registration
New-ApplicationAccessPolicy `
  -AppId "<GRAPH_CLIENT_ID>" `
  -PolicyScopeGroupId "claude-opsman-mailbox" `
  -AccessRight RestrictAccess `
  -Description "Limit Claude OpsMan mail access to astevens only"

# 3. Verify — should return Granted only for your account, Denied for others
Test-ApplicationAccessPolicy -AppId "<GRAPH_CLIENT_ID>" `
  -Identity "astevens@shoestringvalley.com"

Test-ApplicationAccessPolicy -AppId "<GRAPH_CLIENT_ID>" `
  -Identity "bbates@shoestringvalley.com"
```

> `Calendars.ReadWrite` cannot be restricted by `ApplicationAccessPolicy` — that policy only covers mail protocols (EWS/REST). The code-level lock on `GRAPH_USER_ID` is the only available control for calendar. Keep the app registration client secret in Bitwarden and not in any shared location.

---

### Defender for Endpoint — separate app registration

In Entra ID → **APIs my organization uses → WindowsDefenderATP → Application:**

`Machine.Read.All`, `Alert.Read.All`, `Ti.Read`, `Vulnerability.Read.All`, `Software.Read.All`, `AdvancedQuery.Read.All`

**Bitwarden fields:** `MDE_TENANT_ID` · `MDE_CLIENT_ID` · `MDE_CLIENT_SECRET`

---

### Azure Resource Manager — service principal

```bash
az ad sp create-for-rbac --name "Claude OpsMan ARM" --role Reader \
  --scopes /subscriptions/<id>

az role assignment create --assignee <client-id> \
  --role "Cost Management Reader" --scope /subscriptions/<id>
```

**Bitwarden fields:** `AZURE_TENANT_ID` · `AZURE_CLIENT_ID` · `AZURE_CLIENT_SECRET` · `AZURE_SUBSCRIPTION_ID`

---

### Other services

| Service | Where to get credentials | Bitwarden fields |
|---------|--------------------------|-----------------|
| **UniFi Cloud** | account.ui.com → API Keys | `UNIFI_API_KEY` |
| **UniFi Network** | Local admin on UDM Pro / CloudKey | `UNIFI_CONTROLLER_URL` · `UNIFI_USERNAME` · `UNIFI_PASSWORD` |
| **NinjaOne** | Administration → Apps → API → Client Credentials | `NINJA_CLIENT_ID` · `NINJA_CLIENT_SECRET` |
| **Confluence** | id.atlassian.com → Security → API tokens | `CONFLUENCE_DOMAIN` · `CONFLUENCE_EMAIL` · `CONFLUENCE_API_TOKEN` |
| **Wazuh** | Wazuh manager API user | `WAZUH_URL` · `WAZUH_USERNAME` · `WAZUH_PASSWORD` |
| **PrinterLogic** | PrinterLogic admin console → API token | `PRINTERLOGIC_URL` · `PRINTERLOGIC_API_TOKEN` |

---

## Reference documents

`references/` — supporting content Claude uses when running the relevant skills. These work best when copied into your Obsidian vault under `References/` so the Obsidian MCP can serve them during any Claude session. The repo versions are the source of truth; evolve the Obsidian copies as you learn more about your environment.

| File | Used by |
|------|---------|
| `triage-gate.md` | IR Triage — lane classification criteria and escalation path |
| `common-failure-modes.md` | Troubleshooting — SVH-specific failure patterns for Hyper-V, MABS, CMiC, UniFi, WSUS |
| `hypothesis-patterns.md` | Troubleshooting — isolation moves by problem class (one user vs. many, intermittent, etc.) |
| `common-event-clusters.md` | Event Log Triage — Wazuh/Windows event signatures grouped by scenario |
| `ps-remoting-snippets.md` | Event Log Triage — Get-WinEvent recipes for common investigation scenarios |
| `setup-winrm.md` | Event Log Triage — one-time WinRM trust setup from WSL to Windows targets |

---

## PowerShell modules

Load with `. ./connect.ps1` from Windows Terminal (WSL). Credentials come from Bitwarden (`bw unlock`) or `powershell/.env`.

| Module | What it covers |
|--------|---------------|
| `SVH.Core` | Foundation — token cache, REST wrapper, credential accessor, domain constants, tier usernames |
| `SVH.Entra` | Entra ID + Intune — user/group/device lifecycle, MFA gap, license waste, stale devices, risky users, TAPs |
| `SVH.M365` | Teams, Mail, Calendar, Planner, To Do, OneDrive, SharePoint |
| `SVH.Exchange` | Exchange Online admin — mailbox settings, forwarding, litigation hold, message trace, service health |
| `SVH.Azure` | Azure ARM + Defender MDE + Recovery Services — VMs, storage, NSGs, backup jobs (including MABS), MDE isolation/scan |
| `SVH.NinjaOne` | RMM — device discovery, services, disk, patches, backups, event logs, fleet-wide alert and offline summaries |
| `SVH.Wazuh` | SIEM — alerts, agents, FIM, vulnerabilities, auth failure detection |
| `SVH.UniFi` | Network — sites, devices, clients, WLANs, firewall rules, AP health, rogue client detection |
| `SVH.Confluence` | Confluence pages, search, and comments |
| `SVH.PrinterLogic` | Printers, drivers, deployment, quotas, audit log |
| `SVH.OnPrem` | PSRemoting — disk, services, pending reboot, Hyper-V VMs, cluster state, MABS job log, SQL memory config |
| `SVH.Cross` | Cross-system composites — user/asset summaries, patch surface, backup health, compliance gap, IR lockdown |

### Credential tiers

| Tier | Account | Auth | PSCredential |
|------|---------|------|-------------|
| `standard` | `astevens@shoestringvalley.com` | Passkey (BW) | ✗ — interactive browser only |
| `server` | `sa_stevens@andersen-cost.com` | Password | ✓ — PSRemoting, Kerberos from domain terminal |
| `m365` | `ma_stevens@shoestringvalley.com` | Passkey (BW) | ✗ — interactive browser only |
| `app` | `aa_stevens@shoestringvalley.com` | Passkey (BW) | ✗ — interactive browser only |
| `domain` | `ACCO\da_stevens` | Password | ✓ — AD domain operations |

Use `Get-SVHTierUsername -Tier server` to get the correct account name for PSRemoting credentials.

### Credential reference

Bitwarden item: **SVH OpsMan** (custom fields match `.env` key names exactly)

| Key | Used by |
|-----|---------|
| `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` | Entra, M365, Exchange |
| `GRAPH_USER_ID` | Your UPN — mail and calendar tools are locked to this mailbox |
| `MDE_TENANT_ID` / `MDE_CLIENT_ID` / `MDE_CLIENT_SECRET` | Azure (MDE) |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_SUBSCRIPTION_ID` | Azure (ARM) |
| `NINJA_CLIENT_ID` / `NINJA_CLIENT_SECRET` | NinjaOne |
| `SVH_NINJA_DEFAULT_ORG` | NinjaOne — default org ID for server fleet queries |
| `WAZUH_URL` / `WAZUH_USERNAME` / `WAZUH_PASSWORD` | Wazuh |
| `UNIFI_API_KEY` | UniFi Cloud |
| `UNIFI_CONTROLLER_URL` / `UNIFI_USERNAME` / `UNIFI_PASSWORD` | UniFi Controller |
| `SVH_UNIFI_DEFAULT_SITE` | UniFi — default site ID for most-used site |
| `CONFLUENCE_DOMAIN` / `CONFLUENCE_EMAIL` / `CONFLUENCE_API_TOKEN` | Confluence |
| `PRINTERLOGIC_URL` / `PRINTERLOGIC_API_TOKEN` | PrinterLogic |

---

## Build order

Start read-only, validate each integration, then add write-side skills one at a time.

| Phase | Skills | Notes |
|-------|--------|-------|
| 1 | Day Starter, Day Ender | Validates all monitoring sources + Obsidian writes |
| 2 | Week Starter, Week Ender | Validates the weekly cadence |
| 3 | Troubleshooting, Event Log Triage | Validates NinjaOne + Wazuh + Desktop Commander |
| 4 | Network Troubleshooter | Needs UniFi syslog → Wazuh forwarding configured first |
| 5 | Security Posture, Asset Investigation, Vuln Triage | Read-only, safe any time after phase 3 |
| 6 | Patch Campaign, Change Record, Project Creator | Low write risk |
| 7 | Meeting Prep & Notes | Needs Fathom MCP connected |
| 8 | Access Review | Needs Entra read permissions confirmed |
| 9 | Mailflow Investigation | Needs Exchange Admin credentials |
| 10 | IR Triage | **Last** — only skill that sends non-draft Teams messages. Currently disabled (`SKILL.md.disabled`). |
