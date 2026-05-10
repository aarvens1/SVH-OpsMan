# SVH OpsMan

IT operations AI stack for Claude, running natively in WSL. Ask in plain English — Claude queries and acts on your systems directly.

```
"Day starter."
"Investigate this alert: suspicious sign-in from 185.220.x.x for jsmith."
"Is CVE-2024-12345 in CISA KEV and do we have any exposed systems?"
"Troubleshoot why users at Site B can't get to the file server."
"Tell me everything about SVH-SQL01."
"Help me offboard Alex — last day is Friday."
"Let's plan this month's patching."
"Prep me for my 2pm with the network vendor."
```

---

## How it works

Claude connects to a set of MCP servers, each of which talks to one or more of your systems. When you ask a question, Claude picks the right tools, queries the relevant systems, and synthesizes the answer.

```
You ──► Claude
              ├── Custom MCP server (this repo) ──► Microsoft 365, Azure, NinjaOne,
              │                                      UniFi, Wazuh, PrinterLogic,
              │                                      Threat Intel, Confluence, Todoist
              └── External MCPs ──► GitHub, Obsidian, Fathom, Firecrawl,
                                    Desktop Commander, Playwright, Bitwarden,
                                    Time, Sequential Thinking, Excalidraw
```

**Obsidian is the staging layer.** Every output — briefings, incident reports, change records, meeting notes, decisions — goes to Obsidian first. You review, then choose what to push to Teams, Confluence, Planner, or Mail. Nothing gets sent without your sign-off.

**Human-initiated.** Nothing runs on a schedule or fires autonomously. Claude runs when you ask it to. The skills below are prompt patterns, not automation.

---

## MCP inventory

> **🔒** = read-only. That integration will never create, modify, or delete anything.

| System | What Claude can do | Source |
|--------|-------------------|--------|
| **Microsoft Planner** | Create and update plans, tasks, checklists, assignments, and due dates | Custom |
| **Microsoft To Do** | Manage task lists and tasks, checklist sub-items | Custom |
| **Entra ID (Azure AD)** | Audit MFA methods, Conditional Access, app registrations, expiring secrets, role members, risky users, sign-in logs, audit logs; dismiss risky users | Custom |
| **OneDrive / SharePoint files** | Browse drives and libraries, search, create folders, generate sharing links | Custom |
| **SharePoint Sites** 🔒 | View sites, lists, list items, pages, site permissions, content types | Custom |
| **Microsoft Teams** | List teams and channels, read messages, send messages, create channels, add members | Custom |
| **Outlook Mail** | Search and read messages, send, draft, manage folders | Custom |
| **Outlook Calendar** | View events, check availability, find meeting times, create/update/delete events, book rooms | Custom |
| **Exchange Admin** 🔒 | View mailbox configs, accepted domains, distribution groups, auto-reply; run message trace | Custom |
| **MS Intune** 🔒 | List managed devices, compliance policies, configuration profiles, deployed apps | Custom |
| **MS Admin** 🔒 | M365 service health, active incidents, Message Center, tenant info, domains, license subscriptions | Custom |
| **Defender for Endpoint** 🔒 | List devices, software inventory, CVEs per device, incidents, alerts, IOC indicators; TVM recommendations | Custom |
| **Azure** 🔒 | View resource groups, VMs, storage accounts, app services, VNets, NSGs, activity logs, cost data, Advisor recommendations | Custom |
| **NinjaOne RMM** 🔒 | View servers and workstations — services, processes, patches, event logs, scripts, alerts, backups; read organizations | Custom |
| **UniFi Cloud** 🔒 | View sites and devices across all locations | Custom |
| **UniFi Network Controller** 🔒 | View VLANs, WLANs, firewall rules, switch port profiles and states, devices, connected clients | Custom |
| **Wazuh** 🔒 | Search SIEM alerts, query agent inventory, FIM findings, rootcheck, vulnerability detections; look up rules and decoders | Custom |
| **PrinterLogic** 🔒 | Browse printers, drivers, deployment profiles; view deployment status, audit logs, print quotas, usage reports | Custom |
| **Threat Intel** 🔒 | CVE/EPSS/CISA KEV lookups; IOC enrichment via VirusTotal, Shodan, AbuseIPDB, urlscan, GreyNoise; MITRE ATT&CK mapping | Custom |
| **Confluence** | Search and browse spaces and pages, read and edit content, manage comments | Custom |
| **Todoist** | List projects and tasks; create, update, close, and delete tasks | Custom |
| **Obsidian** | Search vault, read and edit notes, manage tags and frontmatter, append to daily notes — **primary staging area** | External |
| **GitHub** | Browse repos, search code, manage issues and PRs, read and trigger Actions workflows | External |
| **Fathom** | Fetch meeting transcripts and summaries from recorded calls | External |
| **Firecrawl** | Web search, fetch URLs as clean Markdown, crawl sites, structured content extraction | External |
| **Desktop Commander** | Shell access on the MCP host — run commands, edit files, manage processes | External |
| **Playwright** | Browser automation — navigate, click, fill forms, screenshot, extract content | External |
| **Bitwarden** 🔒 | Retrieve vault items and TOTP codes; also used to supply MCP server credentials at startup | External |
| **Excalidraw** | Generate and edit diagrams, flowcharts, and architecture drawings | External |
| **Time** | Current time, timezone conversions, date arithmetic | External |
| **Sequential Thinking** | Structured multi-step reasoning for complex troubleshooting | External |

> **One app registration covers most of Microsoft.** Planner, To Do, Entra ID, OneDrive, SharePoint, Teams, Outlook, Exchange Admin, Intune, and MS Admin all share a single set of Graph credentials. Defender for Endpoint and Azure each need their own.

---

## Skills

Prompt patterns Claude follows when you trigger them. All output lands in Obsidian first. Nothing gets posted anywhere without your explicit approval.

### Situational awareness

---

#### 1. Day Starter
**Trigger:** "day starter," "morning briefing," "what's on my plate"

Covers the **last 24 hours.** Pulls from every monitoring system and your task/calendar stack, then produces a single digest:

- **Needs Attention Now** — active alerts, risky users, failed backups, service incidents
- **Today's Agenda** — calendar conflicts, meetings, deadlines
- **On the Plate** — Planner cards, To Do items, Todoist tasks assigned or due today
- **Watch List** — anything elevated but not yet actionable

Includes **suggested** Planner updates, reply drafts, and calendar notes — you approve before anything changes.

**Output:** Obsidian daily note (`Daily/YYYY-MM-DD.md`)

**Sources:** MS Admin, Defender, NinjaOne, Wazuh, UniFi Cloud, Entra, Outlook Calendar, Todoist, MS To Do, Planner.

---

#### 2. Day Ender
**Trigger:** "day ender," "wrap up today," "end of day"

Covers the **last 12 hours.** Focused on cleanup — what's unresolved, what needs a handoff, what should move in Planner before tomorrow.

- **Closed Today** — tasks completed, alerts resolved
- **Still Open** — anything that didn't get done
- **Before Tomorrow** — things that need action or a note tonight
- **Log** — anything worth capturing in the decision log

Drafts Teams or Mail follow-ups for your review.

**Output:** Updates the day's Obsidian daily note.

---

#### 3. Week Starter
**Trigger:** "week starter," Monday morning, "what does the week look like"

Covers **last week's close + this week's load.** Sections: Last Week's Closeouts / Open Threads / This Week's Load / Stale & Unblocking / First Move.

**Output:** Obsidian weekly note (`Weekly/YYYY-WW.md`) with goals and priorities. Planner changes are suggested, not applied automatically.

**Sources:** Planner, NinjaOne, Confluence, Outlook Calendar, Defender, Wazuh.

---

#### 4. Week Ender
**Trigger:** "week ender," Friday, "wrap up the week"

Sections: Closed This Week / Slipped or Deferred / Seeds for Next Week / Weekly Notes Draft / Optional Manager Summary.

**Output:** Obsidian retrospective + Confluence weekly notes draft staged for review.

---

#### 5. Security Posture Snapshot
**Trigger:** "posture check," "state of the land," "health check," ad-hoc anytime

A cross-system security snapshot scored Green / Yellow / Red per category:

| Category | Sources |
|----------|---------|
| Identity | Entra risky users, expiring app secrets, recent audit log anomalies |
| Endpoints | Defender open incidents + High/Critical alerts, NinjaOne critical alerts, Intune non-compliant devices |
| Patching | NinjaOne — count of overdue patches by severity, Defender TVM exposure score |
| Infrastructure | NinjaOne failed backups, offline hosts; UniFi Cloud alert states |
| SIEM | Wazuh high-severity alerts in last 24h, new agent disconnections |
| Cloud | Azure Advisor security recommendations |

**Output:** Obsidian snapshot note. No notifications unless you ask.

---

### Investigation & response

---

#### 6. Incident Response Triage
**Trigger:** alert investigation, IOC enrichment, "is this user/IP/hash suspicious," suspected compromise

Runs a **triage gate** first (`references/triage-gate.md`) to classify the situation:

| Lane | Criteria | Action |
|------|----------|--------|
| 🔥 **Burning Building** | Active credential theft, mass impact in motion, confirmed compromise | Send Teams alert immediately (not draft) + urgent Planner card, then enrich in parallel |
| 🔎 **Active Investigation** | Confirmed bad but contained | Standard enrichment, draft Teams + Planner for your review |
| 🔍 **Background Enrichment** | Suspicious, likely benign | Enrich only, no notifications |

Enrichment path: IOC type → Threat Intel → Defender → Entra sign-in/audit logs → NinjaOne endpoint state → scope + severity → incident brief.

**Output:** Obsidian incident note (`Incidents/YYYY-MM-DD-name.md`) + drafts per gate lane.

**Tools:** Threat Intel, Defender, Entra ID, NinjaOne, Teams, Planner.

> Built last — only skill with non-draft Teams writes.

---

#### 7. Troubleshooting Methodology
**Trigger:** "X is broken," "troubleshoot Y," "why isn't Z working"

Named *Wolf in Siberia* — systematic isolation, not vibes.

1. Restate the problem: expected / actual / when it started
2. Bound the scope: one user or many, one site or all
3. Build the "what's working" inventory
4. Generate 3–5 testable hypotheses ranked by likelihood × ease-of-test
5. Test cheapest first, document each result before moving on

References: `references/common-failure-modes.md` (SVH-specific: Hyper-V, MABS, CMiC, UniFi, WSUS), `references/hypothesis-patterns.md`.

Can invoke **Event Log Triage** or **UniFi Troubleshooter** as sub-steps.

**Tools:** NinjaOne, UniFi (both), Wazuh, Defender, Entra ID, Desktop Commander, Confluence.

---

#### 8. Event Log Triage
**Trigger:** "check event logs on X," "what happened on Z around [time]," follow-up from Troubleshooting or IR Triage

Tool order is deliberate — start broad, then narrow:

1. **Wazuh** — query the host + time window + severity, cross-host correlation
2. **NinjaOne** — endpoint alert state and any events Wazuh didn't ship
3. **Desktop Commander → PS Remoting** — `Get-WinEvent` precision deep-dive after Wazuh narrows the suspect window

Pattern: scope (host, window, channels, severity floor) → Wazuh query → group by Provider+EventID → match against `references/common-event-clusters.md` → cross-reference Defender and NinjaOne → triage brief.

References: `references/ps-remoting-snippets.md`, `references/setup-winrm.md`.

**Tools:** Wazuh, NinjaOne, Desktop Commander, Defender, Confluence.

---

#### 9. Vulnerability Triage
**Trigger:** CVE assessment, Defender TVM finding, "should we patch X"

CVE → NVD metadata + CVSS → EPSS probability → CISA KEV check → Threat Intel (PoC/exploit/ransomware presence) → Defender software inventory (who's exposed) → NinjaOne patch state → composite priority (severity × exposure × exploitability) → triage brief with patch timeline (Emergency / This Week / Next Cycle / Accept).

**Output:** Obsidian vuln note + Confluence writeup draft + Planner tickets per asset group.

**Tools:** Threat Intel, Defender, NinjaOne, Confluence, Planner.

---

#### 10. UniFi Network Troubleshooter
**Trigger:** network problem with site/scope/symptom/start-time, or invoked as a sub-step by Troubleshooting Methodology

UniFi Cloud (site alerts) → UniFi Network Controller (VLANs, firewall, switch ports, WLANs, client state) → Wazuh (UniFi syslog: IDS/IPS hits, dropped packets, port flaps, gateway events) → NinjaOne (endpoint state for affected hosts) → Desktop Commander (ping / traceroute / dig / port checks from MCP host) → hypothesis-ranked diagnostic brief.

Prerequisite: UniFi syslog forwarding to Wazuh with decoders configured.

**Tools:** UniFi Cloud, UniFi Network Controller, Wazuh, NinjaOne, Desktop Commander.

---

#### 11. Mailflow Investigation
**Trigger:** "did this email deliver," "why didn't X get my message," delivery delay or bounce

Exchange Admin message trace → Defender attachment/URL detonation results if flagged → Entra sign-in for recipient (was mailbox accessible) → Exchange transport rule scan for matches → diagnostic brief with delivery timeline and root cause.

**Tools:** Exchange Admin, Defender, Entra ID, Outlook Mail.

---

#### 12. Asset Investigation
**Trigger:** "tell me everything about [server/user/device]," "asset report for X"

Detects the asset type and routes accordingly:

**Server/workstation:** NinjaOne (hardware, OS, services, patches, backups, alerts), Wazuh (recent alerts, FIM events, vulnerabilities), Defender (device profile, open alerts, CVEs), Azure (if cloud VM: resource group, size, NSG rules).

**User:** Entra (MFA status, recent sign-in logs, risky user state, license assignments, group memberships, CA policies that apply), Defender (related alerts), Planner (assigned tasks), NinjaOne (devices associated with the user).

**Output:** Obsidian asset note (`Assets/[name].md`) — persistent, updated each time you investigate the same asset.

**Tools:** NinjaOne, Wazuh, Defender, Entra ID, Azure, Planner.

---

### Planning & execution

---

#### 13. Patch Campaign
**Trigger:** "patch campaign," "let's plan this month's patching," "what needs patching"

1. Pull all pending patches from NinjaOne across every managed server and workstation
2. For each CVE in the patch list: EPSS score + CISA KEV check + Defender TVM priority
3. Group into urgency tiers: Emergency (KEV or EPSS > 0.7) / This Week (Critical, high EPSS) / Next Cycle (High, not actively exploited) / Accept (Low/Informational, no exposure)
4. Produce a Planner board for tracking: one card per server group, checklist per patch tier
5. Obsidian campaign note with the full breakdown

**Tools:** NinjaOne, Threat Intel, Defender, Planner, Obsidian.

---

#### 14. Change Record
**Trigger:** "about to make a change," "document this rollout," "change record for X"

Captures: scope, risk classification, test plan, rollback procedure, comms plan, schedule.

**Output:**
- Obsidian change note (`Changes/YYYY-MM-DD-name.md`)
- Confluence change page draft
- Planner deployment card
- Teams pre-change and post-change notification drafts (staged for review)

**Tools:** Confluence, Planner, Teams, Obsidian.

---

#### 15. Project Creator
**Trigger:** large task description needing decomposition, "turn this into a project"

Decomposes input into: scope statement, deliverables, WBS, dependencies, owners (if inferable), effort estimate. Pulls context from Confluence (similar past projects) and Obsidian (relevant notes). Pulls technical state as needed (e.g., "migrate VM" → Hyper-V inventory from NinjaOne).

Output shape depends on WBS size:
- **≤ 8 work items** → single Planner card with a detailed checklist
- **> 8 work items** → full Planner plan with buckets, cards, labels, and dates + Confluence project page

**Tools:** Planner, Confluence, Obsidian, plus any technical-state MCPs the description implicates.

---

#### 16. Meeting Prep
**Trigger:** "prep me for [meeting/time]," "what do I need for my 2pm," before a calendar event

1. Pull the event from Outlook Calendar (attendees, agenda, location)
2. Search Fathom for past meeting notes with the same attendees or topic
3. Search Confluence and Obsidian for relevant context
4. Check Planner for open tasks involving the attendees or meeting topics

**Output:** Obsidian meeting note (`Meetings/YYYY-MM-DD-name.md`) with context brief + empty agenda template ready to fill in during the call.

**Tools:** Outlook Calendar, Fathom, Confluence, Obsidian, Planner.

---

### Access & compliance

---

#### 17. Offboarding Checklist
**Trigger:** "offboard [name]," "user is leaving," "help me offboard"

Systematically checks every system the user may have a presence in:

| System | What to check |
|--------|--------------|
| Entra ID | Account status, licenses to reclaim, owned app registrations, MFA methods |
| Teams | Owned teams and channels — identify handoff owners |
| OneDrive | Confirm data transfer initiated, sharing links to revoke |
| Exchange | Forwarding rules, shared mailbox access, distribution group ownership |
| Planner | Assigned and owned tasks — suggest reassignment |
| NinjaOne | Devices associated with the user — flag for collection |
| GitHub | Organization membership, owned repos |
| Todoist / MS To Do | Active tasks to hand off |

**Output:** Obsidian offboarding checklist + suggested Planner card for tracking progress.

**Tools:** Entra ID, Teams, Outlook Mail, OneDrive, Planner, NinjaOne, GitHub, Todoist, MS To Do.

---

#### 18. Access Review
**Trigger:** "access review for [user/group/role]," "audit permissions for X," "quarterly review"

For a **user:** Entra role assignments, group memberships, owned app registrations, CA policies that apply, recent sign-in activity, MFA status, license assignments.

For a **group or role:** All members (Entra), recent sign-in activity for members, associated CA policies, assigned Planner tasks.

Flags: inactive users with privileged roles, users without MFA in sensitive roles, stale group memberships, app registrations owned by the subject with broad permissions.

**Output:** Obsidian access report + optional Confluence audit page draft.

**Tools:** Entra ID, Planner, Defender.

---

## Obsidian vault structure

Suggested layout — Claude writes to these paths when skills run. The structure keeps everything findable and gives you a natural audit trail.

```
SVH OpsMan/
├── 00 Inbox/                  ← Claude drops everything here first
│   └── 2026-05-09 1430 day-starter.md
├── 01 Briefings/
│   ├── Daily/
│   │   └── 2026-05-09.md     ← Day Starter output; Day Ender appends
│   └── Weekly/
│       └── 2026-W19.md       ← Week Starter goals; Week Ender retrospective
├── 02 Incidents/
│   ├── Active/
│   │   └── 2026-05-09-jsmith-anomalous-signin.md
│   └── Archive/              ← You move here when closed
├── 03 Investigations/         ← Phishing triage, IOC enrichment, ad-hoc deep dives
├── 04 Changes/
│   └── 2026-05-10-cmic-maintenance-window.md
├── 05 Meetings/
│   └── 2026-05-09-network-vendor-review.md
├── 06 Assets/
│   ├── SVH-SQL01.md          ← Updated each time Asset Investigation runs
│   └── jsmith.md
├── 07 Projects/
│   └── vm-migration-q3.md
├── 08 Reviews/
│   ├── Access/               ← Quarterly access reviews, stale user reports
│   └── Patches/              ← Patch campaign notes
├── 09 Vulnerabilities/
│   └── CVE-2024-12345.md
├── 10 Reports/               ← Management-facing summaries
└── 98 References/            ← The reference docs from this repo (symlink or copy)
    ├── triage-gate.md
    └── ...
```

**Obsidian is the inbox.** Every Claude output lands in `00 Inbox/` first. You promote it to the right folder (or delete it) — Claude never writes directly into deeper folders unless you tell it the destination.

---

### Frontmatter conventions

Every note Claude produces should open with YAML frontmatter. This lets you filter, search, and track status across the vault.

```yaml
---
date: 2026-05-09
skill: Day Starter
status: draft
tags: [briefing, daily]
---
```

**Standard fields:**

| Field | Values | Meaning |
|-------|--------|---------|
| `date` | ISO date | When the note was created |
| `skill` | skill name | Which skill produced it |
| `status` | `draft` / `reviewed` / `filed` / `promoted` | Where it is in your review workflow |
| `tags` | array | Freeform — system names, categories, people |

**Status lifecycle:**

```
draft  →  reviewed  →  filed      (reviewed, no further action)
                    →  promoted   (content pushed to Confluence, Teams, or Mail)
```

Claude writes `status: draft`. You flip it to `reviewed` when you've read it, then `filed` or `promoted` when you're done with it. Nothing leaves Obsidian until it's `reviewed`.

**Extra fields for specific note types:**

```yaml
# Incidents
incident_id: INC-2026-042
severity: high          # critical / high / medium / low
status: open            # open / contained / closed
affected: [SVH-SQL01, jsmith]

# Changes
change_id: CHG-2026-018
risk: medium            # low / medium / high
window: 2026-05-10 22:00 – 23:30

# Vulnerabilities
cve: CVE-2024-12345
epss: 0.71
kev: true
priority: emergency     # emergency / this-week / next-cycle / accept
```

**Decision log:** Any significant finding, recommendation, or action should be appended to a `06 Assets/decisions.md` note (or the relevant asset/incident note) so you have a trail when something goes wrong. Trigger it explicitly: *"Log that decision to Obsidian."*

---

## Setup

### 1. Custom MCP server

Prerequisites: **Node.js 18+** and **Bitwarden CLI** (`bw`) in WSL.

```bash
cd mcp-server
npm install
npm run build
```

#### Credentials — Bitwarden (recommended)

Store all credentials as **custom fields** on a single vault item named **"SVH OpsMan"**. Field names must match the env var keys exactly (e.g., a field named `GRAPH_CLIENT_SECRET` with the secret as its value).

Before starting the server, unlock your Bitwarden vault:

```bash
export BW_SESSION=$(bw unlock --raw)
```

The server will automatically pull all credentials from the vault item at startup. You can add `BW_SESSION` to your shell profile or set it per-session.

#### Credentials — .env file (fallback / development)

```bash
cp .env.example .env
# Fill in only the services you're setting up
```

The server checks for `BW_SESSION` first. If it isn't set, it falls back to env vars and the `.env` file.

#### Verify startup

```bash
npm start
# [svh-opsman] Loaded 22 credential(s) from Bitwarden vault
# [svh-opsman] Starting — 9/12 service groups configured
# [svh-opsman] Ready — listening on stdio
```

---

### 2. External MCPs

| MCP | Install |
|-----|---------|
| GitHub | `npx -y @modelcontextprotocol/server-github` |
| Obsidian | `npx -y mcp-obsidian` — requires [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) plugin |
| Fathom | See [Fathom MCP docs](https://help.fathom.video) for current package |
| Firecrawl | `npx -y @mendableai/firecrawl-mcp-server` |
| Desktop Commander | `npx -y @wonderwhy-er/desktop-commander` |
| Playwright | `npx -y @playwright/mcp` |
| Bitwarden | `npx -y @bitwarden/mcp` — run `bw unlock` first |
| Excalidraw | `npx -y excalidraw-mcp` |
| Time | `npx -y @modelcontextprotocol/server-time` |
| Sequential Thinking | `npx -y @modelcontextprotocol/server-sequential-thinking` |

---

### 3. Claude config

**Claude Code:**

```bash
# Custom server
claude mcp add svh-opsman -- node /path/to/SVH-OpsMan/mcp-server/dist/index.js

# External MCPs (set env vars as needed)
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github
claude mcp add obsidian -e OBSIDIAN_API_KEY=xxx -- npx -y mcp-obsidian http://127.0.0.1:27123
claude mcp add firecrawl -e FIRECRAWL_API_KEY=xxx -- npx -y @mendableai/firecrawl-mcp-server
claude mcp add desktop-commander -- npx -y @wonderwhy-er/desktop-commander
claude mcp add playwright -- npx -y @playwright/mcp
claude mcp add bitwarden -- npx -y @bitwarden/mcp
claude mcp add time -- npx -y @modelcontextprotocol/server-time
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking
claude mcp add excalidraw -- npx -y excalidraw-mcp
```

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json` on Windows / `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "@mendableai/firecrawl-mcp-server"],
      "env": { "FIRECRAWL_API_KEY": "your-key" }
    },
    "desktop-commander": { "command": "npx", "args": ["-y", "@wonderwhy-er/desktop-commander"] },
    "playwright":         { "command": "npx", "args": ["-y", "@playwright/mcp"] },
    "bitwarden":          { "command": "npx", "args": ["-y", "@bitwarden/mcp"] },
    "time":               { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-time"] },
    "sequential-thinking":{ "command": "npx", "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"] },
    "excalidraw":         { "command": "npx", "args": ["-y", "excalidraw-mcp"] }
  }
}
```

---

## Credential reference

### Microsoft Graph (one app registration for most of Microsoft)

Covers: Planner, To Do, Entra ID, OneDrive, SharePoint, Teams, Outlook Mail, Outlook Calendar, Exchange Admin, Intune, MS Admin.

In **Entra ID → App registrations → New registration**, then add these **Application permissions** under Microsoft Graph and grant admin consent:

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

**Bitwarden fields:** `GRAPH_TENANT_ID` · `GRAPH_CLIENT_ID` · `GRAPH_CLIENT_SECRET`

---

### Microsoft Defender for Endpoint (separate app registration)

**API permissions → APIs my organization uses → WindowsDefenderATP → Application:**
`Machine.Read.All`, `Alert.Read.All`, `Ti.Read`, `Vulnerability.Read.All`, `Software.Read.All`, `AdvancedQuery.Read.All`

**Bitwarden fields:** `MDE_TENANT_ID` · `MDE_CLIENT_ID` · `MDE_CLIENT_SECRET`

---

### Azure Resource Manager (service principal)

Create with Reader + Cost Management Reader at subscription scope:

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
| **UniFi Cloud** | [account.ui.com](https://account.ui.com) → API Keys | `UNIFI_API_KEY` |
| **UniFi Network Controller** | Local admin account on UDM Pro / CloudKey | `UNIFI_CONTROLLER_URL` · `UNIFI_USERNAME` · `UNIFI_PASSWORD` |
| **NinjaOne** | Administration → Apps → API → Client Credentials | `NINJA_CLIENT_ID` · `NINJA_CLIENT_SECRET` |
| **Confluence** | [id.atlassian.com](https://id.atlassian.com) → Security → API tokens | `CONFLUENCE_DOMAIN` · `CONFLUENCE_EMAIL` · `CONFLUENCE_API_TOKEN` |
| **Todoist** | Settings → Integrations → Developer | `TODOIST_API_TOKEN` |
| **Wazuh** | Wazuh manager API user | `WAZUH_URL` · `WAZUH_USERNAME` · `WAZUH_PASSWORD` |
| **PrinterLogic** | PrinterLogic admin console → API token | `PRINTERLOGIC_URL` · `PRINTERLOGIC_API_TOKEN` |
| **VirusTotal** | [virustotal.com](https://www.virustotal.com) (free: 500 req/day) | `VIRUSTOTAL_API_KEY` |
| **Shodan** | [shodan.io](https://account.shodan.io) (free tier) | `SHODAN_API_KEY` |
| **AbuseIPDB** | [abuseipdb.com](https://www.abuseipdb.com/api) (free: 1000 req/day) | `ABUSEIPDB_API_KEY` |
| **urlscan.io** | [urlscan.io](https://urlscan.io/user/profile/) (free tier) | `URLSCAN_API_KEY` |
| **GreyNoise** | [greynoise.io](https://www.greynoise.io) (community tier) | `GREYNOISE_API_KEY` |

NVD, EPSS, CISA KEV, and MITRE ATT&CK are free with no API key required.

---

## Reference documents

Supporting content in `references/` — Claude reads these automatically during the relevant skills.

| File | Used by |
|------|---------|
| `triage-gate.md` | IR Triage — lane classification criteria, escalation path |
| `common-failure-modes.md` | Troubleshooting — SVH-specific failure patterns (Hyper-V cluster, MABS/SQL, CMiC/Kemp, UniFi, WSUS) |
| `hypothesis-patterns.md` | Troubleshooting — generic isolation moves by problem class |
| `common-event-clusters.md` | Event Log Triage — Wazuh/Windows event signatures for SVH infrastructure |
| `ps-remoting-snippets.md` | Event Log Triage — Get-WinEvent recipes by scenario |
| `setup-winrm.md` | Event Log Triage — one-time WinRM trust setup between WSL MCP host and Windows targets |

---

## Build order

Validate each layer before adding skills that depend on it. Start with the skills that have no write-side risk.

| Phase | Skills (#) | Notes |
|-------|-----------|-------|
| 1 | Day Starter (1), Day Ender (2) | Validates all monitoring sources and Obsidian writes |
| 2 | Week Starter (3), Week Ender (4) | Validates the weekly cadence |
| 3 | Security Posture Snapshot (5) | Validates the cross-system security read path |
| 4 | Troubleshooting Methodology (7) | Validates NinjaOne + Desktop Commander + Wazuh together |
| 5 | Event Log Triage (8) | Add after Wazuh syslog confirmed shipping |
| 6 | UniFi Troubleshooter (10) | Add after UniFi syslog → Wazuh wired up |
| 7 | Asset Investigation (12), Vuln Triage (9), Patch Campaign (13) | Read-only, safe to add anytime after phase 4 |
| 8 | Meeting Prep (16), Project Creator (15) | Light dependencies, add when ready |
| 9 | Change Record (14), Offboarding (17), Access Review (18) | Draft-only by default, validate each carefully |
| 10 | IR Triage (6) | **Last** — only skill that sends non-draft Teams messages |
| 11 | Mailflow Investigation (11) | Any time after Exchange Admin credentials confirmed |
