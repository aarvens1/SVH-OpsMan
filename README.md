# SVH OpsMan

IT operations AI stack for Claude. Runs natively in WSL — no containers, no cloud middlemen.

Ask Claude in plain English and it queries or acts on your IT systems directly.

```
"Morning briefing — what needs my attention?"
"Investigate this alert: suspicious sign-in from 185.220.x.x for jsmith."
"Find all app registrations with secrets expiring in the next 30 days."
"Check disk space and patch state across all NinjaOne servers."
"Is CVE-2024-12345 in CISA KEV and do we have any exposed systems?"
"Draft the change record for tonight's CMiC maintenance window."
```

---

## Contents

- [MCP inventory](#mcp-inventory)
- [Skills](#skills)
- [Setup](#setup)
  - [Custom MCP server](#custom-mcp-server)
  - [External MCPs](#external-mcps)
  - [Claude config](#claude-config)
- [Credential reference](#credential-reference)
- [Reference documents](#reference-documents)
- [Build order](#build-order)

---

## MCP inventory

> **🔒** = read-only. That MCP will never create, modify, or delete anything.

| System | What Claude can do | Source |
|--------|-------------------|--------|
| **Microsoft Planner** | Create and update plans, tasks, checklists, assignments, and due dates | Custom |
| **Microsoft To Do** | Manage personal task lists and tasks, checklist sub-items, recurring tasks | Custom |
| **Entra ID (Azure AD)** | Audit MFA methods, Conditional Access, app registrations, expiring secrets, role members, risky users, sign-in and audit logs; dismiss risky users | Custom |
| **OneDrive / SharePoint files** | Browse files in personal OneDrive and SharePoint document libraries, search, create folders, generate sharing links | Custom |
| **SharePoint Sites** 🔒 | View sites, lists, pages, site permissions, and content types | Custom |
| **Microsoft Teams** | List teams/channels, search and read messages, send messages, create channels, add members | Custom |
| **Outlook Mail** | Search, read, send, draft messages; manage folders | Custom |
| **Outlook Calendar** | View events, check availability, find meeting times, create/update/delete events, book rooms | Custom |
| **Exchange Admin** 🔒 | View mailbox configs, accepted domains, distribution groups; run message trace (via MS Graph) | Custom |
| **MS Intune** 🔒 | List managed devices, compliance and configuration policies, deployed apps | Custom |
| **MS Admin** 🔒 | M365 service health, active incidents, message center notifications, tenant info, domains, license subscriptions | Custom |
| **Microsoft Defender for Endpoint** 🔒 | List devices, software inventory, vulnerabilities, incidents, alerts, IOC indicators; TVM recommendations | Custom |
| **Azure** 🔒 | View subscriptions, resource groups, VMs, storage accounts, app services, network resources, activity logs, cost data, Advisor recommendations | Custom |
| **GitHub** | Browse repos, search code, manage issues and PRs, read and trigger Actions workflows | External |
| **Todoist** | List projects and tasks; create, update, close, and delete tasks | Custom |
| **Confluence** | Search and browse pages and spaces, read and edit content, manage comments and attachments | Custom |
| **Obsidian** | Search vault, read and edit notes, traverse link graph, manage tags and frontmatter, append to daily notes. **Primary staging area** — all Claude drafts, summaries, and decision logs land here first before being pushed anywhere else. | External |
| **Fathom** | Fetch meeting transcripts and summaries from recorded calls | External |
| **Excalidraw** | Generate and edit diagrams, flowcharts, and architecture drawings | External |
| **Firecrawl** | Web search, fetch URLs as clean Markdown, crawl whole sites, structured content extraction | External |
| **UniFi Cloud** 🔒 | View sites and devices across all locations | Custom |
| **UniFi Network Controller** 🔒 | View VLANs, WLANs, firewall rules, switch port profiles and states, devices, and connected clients | Custom |
| **NinjaOne RMM** 🔒 | View servers and workstations — services, processes, patches, event logs, scripts, alerts, antivirus state, backups; read organizations | Custom |
| **Wazuh** 🔒 | Search SIEM events, query alerts, view agent inventory, FIM and rootkit findings, vulnerability detections; rule and decoder lookups | Custom |
| **PrinterLogic** 🔒 | Browse printers, deployments, profiles, drivers; view deployment status and audit logs; read print quotas and usage reports | Custom |
| **Desktop Commander** | Shell access on the MCP host — run commands, edit files, search across paths, manage processes | External |
| **Playwright** | Browser automation — navigate, click, fill forms, screenshot, extract content, capture auth flows | External |
| **Bitwarden** 🔒 | Retrieve vault items and TOTP codes via local Bitwarden CLI | External |
| **Threat Intel** 🔒 | CVE/EPSS/CISA KEV lookups; IOC enrichment via VirusTotal, Shodan, AbuseIPDB, urlscan, GreyNoise; MITRE ATT&CK mapping | Custom |
| **Time** | Current time, timezone conversions, date arithmetic | External |
| **Sequential Thinking** | Structured multi-step reasoning for complex troubleshooting | External |

**Custom** = tools built into this repo's MCP server (`mcp-server/`).
**External** = standalone third-party MCP servers configured separately in Claude.

> **Note on Graph-backed integrations:** Planner, To Do, Entra ID, OneDrive, SharePoint, Teams, Outlook, Exchange Admin, Intune, and MS Admin all share a single Entra app registration. One set of credentials, one token, one permission grant.

---

## Operating philosophy

All skills are **human-initiated**. Nothing runs on a schedule or fires autonomously. Claude runs when you ask it to, keeps you in the loop, and stages everything in Obsidian before pushing anywhere.

**Obsidian is the staging area.** Briefing outputs, incident briefs, change records, project drafts, decision logs — everything goes to Obsidian first. You review, then choose what to promote to Teams, Confluence, Mail, or Planner.

**Review before posting.** Claude will draft notifications and updates, but will not send to Teams, post to Confluence, or send email without your explicit approval in the same session.

**Decision log.** Any significant finding, recommendation, or action Claude takes gets appended to a dated note in Obsidian. When something goes wrong, you have a trail.

---

## Skills

Prompt patterns Claude follows when a trigger phrase is detected. Described here for reference — they live in Claude's context, not in files.

### 1. Incident Response Triage
**Trigger:** alert investigation, IOC enrichment, "is this user/IP/hash suspicious," suspected compromise.

Runs a triage gate first (`references/triage-gate.md`) to classify: **Burning Building** (immediate Teams alert + Planner card), **Active Investigation** (standard enrichment, draft notifications), or **Background Enrichment** (enrich only, no noise).

Enrichment path: IOC type → Threat Intel → Defender → Entra sign-in/audit logs → NinjaOne endpoint state → scope + severity → incident brief.

**Tools:** Threat Intel, Defender, Entra ID, NinjaOne, Teams, Planner.

---

### 2. Troubleshooting Methodology (Wolf in Siberia)
**Trigger:** "X is broken," "troubleshoot Y," "why isn't Z working."

Restates the problem (expected / actual / start-time), bounds the scope (one user vs. many, one site vs. all), builds a working-inventory, generates 3–5 ranked hypotheses, tests cheapest first. Reference: `references/common-failure-modes.md`, `references/hypothesis-patterns.md`.

**Tools:** NinjaOne, UniFi (both), Wazuh, Defender, Entra ID, Desktop Commander, Confluence, Planner.

---

### 3. Vulnerability Triage
**Trigger:** CVE assessment, Defender TVM finding, "should we patch X."

CVE → NVD metadata → EPSS → CISA KEV → Threat Intel (PoCs/exploits/ransomware) → Defender software inventory → NinjaOne patch state → composite priority (severity × exposure × exploitability) → triage brief with patch timeline → Confluence writeup → Planner tickets per asset group.

**Tools:** Threat Intel, Defender, NinjaOne, Confluence, Planner.

---

### 4. Day Starter
**Trigger:** "morning briefing," "day starter," "what's on my plate," start-of-day prompt.

Covers the **last 24 hours**. Single markdown digest: **Needs Attention Now / Today's Agenda / On the Plate / Watch List.**

Sources: MS Admin (incidents/MC), Defender (open incidents + new High/Critical), NinjaOne (critical alerts, failed backups, offline hosts), Wazuh (overnight high-severity), UniFi Cloud (alert states), Entra (new risky users), Outlook Calendar (today + conflicts), Todoist (top tasks), MS To Do (My Day), Planner (assigned, due today/overdue).

Output goes to Obsidian daily note first. Includes **suggestions** for Planner updates, calendar prep, and anything worth a Teams message — you approve before anything is sent.

---

### 5. Day Ender
**Trigger:** "day ender," "wrap up today," "end of day," end-of-day prompt.

Covers the **last 12 hours**. Focus is cleanup: what's unresolved, what needs a handoff note, what should move in Planner, what needs a reply.

Sections: Closed Today / Still Open / Needs Action Before Tomorrow / Notes to Log.

Output goes to Obsidian. Drafts any Teams or Mail follow-ups for review before sending.

---

### 6. Week Starter (Mondays)
**Trigger:** Monday morning, "week starter," "what's the week look like."

Covers the **past week + week ahead**. Sections: Last Week's Closeouts / Open Threads / This Week's Load / Stale & Unblocking / First Move.

Sources: Planner, NinjaOne, Confluence, Outlook Calendar, Defender, Wazuh (week alert volume trend).

Output goes to Obsidian as a weekly goals note. Any Planner or calendar changes are suggested, not applied automatically.

---

### 7. Week Ender (Fridays)
**Trigger:** Friday, "week ender," "wrap up the week."

Sections: Closed This Week / Slipped or Deferred / Seeds for Next Week / Weekly Notes Draft / Optional Manager Summary.

Output: Obsidian retrospective note + Confluence weekly notes draft staged for your review.

---

### 8. Event Log Triage
**Trigger:** "check event logs on X," "what happened on Z around [time]," follow-up from Troubleshooting or IR Triage.

Tool order: Wazuh first (query + cross-host correlation) → NinjaOne (endpoint alert state) → Desktop Commander PS Remoting (precision deep-dive after Wazuh narrows the window). Reference: `references/common-event-clusters.md`, `references/ps-remoting-snippets.md`, `references/setup-winrm.md`.

**Tools:** Wazuh, NinjaOne, Desktop Commander, Defender, Confluence.

---

### 9. Project Creator
**Trigger:** large task description requiring decomposition into Planner tasks.

Decomposes input into scope statement, deliverables, WBS, dependencies, owners, effort estimate. Pulls context from Confluence (similar past projects) and Obsidian (personal notes). Chooses output shape by WBS size: single Planner card with checklist (≤8 items) or full plan with buckets/cards/labels/dates + Confluence project page.

**Tools:** Planner, Confluence, Obsidian, plus any technical-state MCPs the description implicates.

---

### 10. UniFi Network Troubleshooter
**Trigger:** network problem (site/scope/symptom/start-time), or invoked as a sub-step by Troubleshooting Methodology.

UniFi Cloud (site alerts) → UniFi Network Controller (VLANs, firewall, switch ports, WLANs, client state) → Wazuh (UniFi syslog: IDS/IPS, dropped packets, port flaps, gateway events) → NinjaOne (endpoint state for affected hosts) → Desktop Commander (ping/traceroute/dig/port checks from MCP host) → hypothesis-ranked diagnostic brief.

**Tools:** UniFi Cloud, UniFi Network Controller, Wazuh, NinjaOne, Desktop Commander.

---

### 11. Change Record
**Trigger:** "about to make a change," "let me document this rollout."

Captures scope, risk classification, test plan, rollback procedure, comms plan, schedule. Output: Confluence change page draft, Planner deployment card, Teams pre-change notification draft, Teams post-change confirmation draft.

**Tools:** Confluence, Planner, Teams.

---

### 12. Mailflow Investigation
**Trigger:** "did this email deliver," "why didn't X get my message," delivery delay.

Exchange Admin message trace → Defender attachment/URL detonation results if flagged → Entra sign-in for recipient (mailbox accessibility) → Exchange transport rule review → diagnostic brief with delivery timeline and root cause.

**Tools:** Exchange Admin, Defender, Entra ID, Outlook Mail.

---

## Setup

### Custom MCP server

The custom server covers all **Custom** rows in the MCP inventory. It runs as a plain Node.js process in WSL.

**Prerequisites:** Node.js 18+ in WSL.

```bash
cd mcp-server
npm install
cp .env.example .env
# Edit .env and fill in credentials for the services you use
npm run build
```

For permanent credentials, export them in `~/.bashrc` instead of using `.env`:

```bash
export GRAPH_TENANT_ID="..."
export GRAPH_CLIENT_ID="..."
# etc.
```

To verify the server starts correctly:

```bash
npm start
# Should print: [svh-opsman] Starting — N/M service groups configured
# Then: [svh-opsman] Ready — listening on stdio
```

See `mcp-server/README.md` for the full tool reference and development commands.

---

### External MCPs

Add these to your Claude config alongside the custom server. All use `npx` — no separate installs needed.

| MCP | Package |
|-----|---------|
| GitHub | `@modelcontextprotocol/server-github` |
| Obsidian | `mcp-obsidian` (requires Local REST API plugin in Obsidian) |
| Fathom | `@fathomhq/mcp` or the Fathom MCP config from their docs |
| Excalidraw | `excalidraw-mcp` |
| Firecrawl | `@mendableai/firecrawl-mcp-server` |
| Desktop Commander | `@wonderwhy-er/desktop-commander` |
| Playwright | `@playwright/mcp` |
| Bitwarden | `@bitwarden/mcp` (requires local Bitwarden CLI unlocked: `bw unlock`) |
| Time | `@modelcontextprotocol/server-time` |
| Sequential Thinking | `@modelcontextprotocol/server-sequential-thinking` |

---

### Claude config

**Claude Code** — add each server with `claude mcp add`:

```bash
# Custom server (built in this repo)
claude mcp add svh-opsman -- node /path/to/SVH-OpsMan/mcp-server/dist/index.js

# Or run from source during development
claude mcp add svh-opsman -- npx tsx /path/to/SVH-OpsMan/mcp-server/src/index.ts

# External MCPs
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx -- npx -y @modelcontextprotocol/server-github
claude mcp add desktop-commander -- npx -y @wonderwhy-er/desktop-commander
claude mcp add obsidian -e OBSIDIAN_API_KEY=xxx -- npx -y mcp-obsidian http://127.0.0.1:27123
claude mcp add firecrawl -e FIRECRAWL_API_KEY=xxx -- npx -y @mendableai/firecrawl-mcp-server
claude mcp add playwright -- npx -y @playwright/mcp
claude mcp add bitwarden -- npx -y @bitwarden/mcp
claude mcp add time -- npx -y @modelcontextprotocol/server-time
claude mcp add sequential-thinking -- npx -y @modelcontextprotocol/server-sequential-thinking
claude mcp add excalidraw -- npx -y excalidraw-mcp
```

**Claude Desktop** — `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "svh-opsman": {
      "command": "node",
      "args": ["/path/to/SVH-OpsMan/mcp-server/dist/index.js"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxx" }
    },
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander"]
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
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp"]
    },
    "bitwarden": {
      "command": "npx",
      "args": ["-y", "@bitwarden/mcp"]
    },
    "time": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-time"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "excalidraw": {
      "command": "npx",
      "args": ["-y", "excalidraw-mcp"]
    }
  }
}
```

---

## Credential reference

### Microsoft Graph app registration

Covers: Planner, To Do, Entra ID, OneDrive, SharePoint, Teams, Outlook, Exchange Admin, Intune, MS Admin.

1. Entra ID → **App registrations** → **New registration** (name: `Claude OpsMan`)
2. **API permissions** → **Microsoft Graph** → **Application permissions** → add:

| Permission | Used by |
|-----------|---------|
| `Tasks.ReadWrite` | Planner |
| `Tasks.ReadWrite.All` | To Do |
| `Group.Read.All` | Planner, Teams |
| `ChannelMessage.Send` | Teams |
| `TeamMember.ReadWrite.All` | Teams |
| `Files.ReadWrite.All` | OneDrive |
| `Sites.Read.All` | SharePoint |
| `Mail.ReadWrite` | Outlook Mail |
| `Mail.Send` | Outlook Mail |
| `Calendars.ReadWrite` | Outlook Calendar |
| `MailboxSettings.ReadWrite` | Outlook Calendar, Exchange Admin |
| `Place.Read.All` | Outlook Calendar (rooms) |
| `Policy.Read.All` | Entra ID |
| `Application.Read.All` | Entra ID |
| `RoleManagement.Read.Directory` | Entra ID |
| `IdentityRiskyUser.ReadWrite.All` | Entra ID (requires P2) |
| `UserAuthenticationMethod.Read.All` | Entra ID |
| `AuditLog.Read.All` | Entra ID sign-in/audit logs |
| `DeviceManagementManagedDevices.Read.All` | Intune |
| `DeviceManagementConfiguration.Read.All` | Intune |
| `DeviceManagementApps.Read.All` | Intune |
| `ServiceHealth.Read.All` | MS Admin |
| `Organization.Read.All` | MS Admin |
| `Directory.Read.All` | MS Admin, general |
| `Reports.Read.All` | Exchange Admin message trace |

3. **Grant admin consent**
4. **Certificates & secrets** → **New client secret** → copy immediately

```
GRAPH_TENANT_ID   = your tenant ID
GRAPH_CLIENT_ID   = app registration client ID
GRAPH_CLIENT_SECRET = client secret value
```

---

### Microsoft Defender for Endpoint

Separate app registration required (WindowsDefenderATP permissions live on a different API).

1. New app registration (name: `Claude MDE`)
2. **API permissions** → **APIs my organization uses** → **WindowsDefenderATP** → Application:
   `Machine.Read.All`, `Alert.Read.All`, `Ti.Read`, `Vulnerability.Read.All`, `Software.Read.All`, `AdvancedQuery.Read.All`
3. Grant admin consent

```
MDE_TENANT_ID     = your tenant ID
MDE_CLIENT_ID     = MDE app registration client ID
MDE_CLIENT_SECRET = MDE app registration client secret
```

---

### Azure Resource Manager

Service principal with **Reader** + **Cost Management Reader** at subscription scope.

```bash
az ad sp create-for-rbac \
  --name "Claude OpsMan ARM" \
  --role Reader \
  --scopes /subscriptions/<subscription-id>

# Then add Cost Management Reader:
az role assignment create \
  --assignee <client-id> \
  --role "Cost Management Reader" \
  --scope /subscriptions/<subscription-id>
```

```
AZURE_TENANT_ID       = your tenant ID
AZURE_CLIENT_ID       = service principal client ID
AZURE_CLIENT_SECRET   = service principal secret
AZURE_SUBSCRIPTION_ID = target subscription ID
```

---

### UniFi Cloud

[account.ui.com](https://account.ui.com) → **API Keys** → create key.

```
UNIFI_API_KEY = your API key
```

---

### UniFi Network Controller

Local admin account on the UDM Pro / CloudKey / self-hosted controller.

```
UNIFI_CONTROLLER_URL = https://192.168.1.1
UNIFI_USERNAME       = admin username
UNIFI_PASSWORD       = admin password
```

---

### NinjaOne

**Administration → Apps → API** → create application with **Client Credentials** grant type.

```
NINJA_CLIENT_ID     = NinjaOne API client ID
NINJA_CLIENT_SECRET = NinjaOne API client secret
```

---

### Confluence

[id.atlassian.com](https://id.atlassian.com) → **Security** → **API tokens** → create token.

```
CONFLUENCE_DOMAIN    = your-org  (the subdomain before .atlassian.net)
CONFLUENCE_EMAIL     = your Atlassian account email
CONFLUENCE_API_TOKEN = API token
```

---

### Todoist

**Settings → Integrations → Developer** → copy personal API token.

```
TODOIST_API_TOKEN = your token
```

---

### Wazuh

Local manager API credentials. The integration disables TLS certificate verification by default (self-signed certs are standard for on-prem Wazuh).

```
WAZUH_URL      = https://wazuh-manager:55000
WAZUH_USERNAME = api username
WAZUH_PASSWORD = api password
```

---

### PrinterLogic / Vasion

Generate an API token in your PrinterLogic admin console.

```
PRINTERLOGIC_URL        = https://your-instance.printercloud.com
PRINTERLOGIC_API_TOKEN  = API token
```

---

### Threat Intel

Free sources (NVD, EPSS, CISA KEV, MITRE ATT&CK) need no keys. The rest:

| Key | Where to get it |
|-----|-----------------|
| `VIRUSTOTAL_API_KEY` | [virustotal.com](https://www.virustotal.com) → API Key (free tier: 500 req/day) |
| `SHODAN_API_KEY` | [shodan.io](https://account.shodan.io) → Account (free tier available) |
| `ABUSEIPDB_API_KEY` | [abuseipdb.com](https://www.abuseipdb.com/api) → Create key (free tier: 1000 req/day) |
| `URLSCAN_API_KEY` | [urlscan.io](https://urlscan.io/user/profile/) → API Keys (free tier available) |
| `GREYNOISE_API_KEY` | [greynoise.io](https://www.greynoise.io) → API key (community tier available) |

---

## Reference documents

Supporting content for the skills, in `references/`:

| File | Used by |
|------|---------|
| `triage-gate.md` | IR Triage — lane classification criteria and escalation path |
| `common-failure-modes.md` | Troubleshooting Methodology — SVH-specific failure patterns (Hyper-V, MABS, CMiC, UniFi, WSUS) |
| `hypothesis-patterns.md` | Troubleshooting Methodology — generic isolation moves by problem class |
| `common-event-clusters.md` | Event Log Triage — Wazuh/Windows event signatures for SVH infrastructure |
| `ps-remoting-snippets.md` | Event Log Triage — `Get-WinEvent` recipes for Desktop Commander → PS Remoting |
| `setup-winrm.md` | Event Log Triage — one-time WinRM trust setup between WSL MCP host and Windows targets |

---

## Build order

Skills are built in this order to validate each layer before adding dependencies:

**4 (Day Starter)** → **5 (Day Ender)** → **8 (Event Log Triage, v1 NinjaOne-only)** → **6 (Week Starter)** → **7 (Week Ender)** → **3 (Vuln Triage)** → **10 (UniFi Troubleshooter, after Wazuh + syslog wired)** → **1 (IR Triage)** → **9 (Project Creator)** → **11 (Change Record)** → **12 (Mailflow)**

Skill 1 (IR Triage) is built late because it's the only skill with non-draft Teams writes. Validate the others first to avoid alarm fatigue.
