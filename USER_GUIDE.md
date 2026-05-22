# SVH OpsMan — User Guide

> Target reader: IT sysadmin starting from a fresh Windows 11 workstation. No prior Claude Code experience assumed.

---

## Table of contents

1. [What this is](#1-what-this-is)
2. [How it works — the technology stack](#2-how-it-works--the-technology-stack)
3. [Design decisions](#3-design-decisions)
4. [Fresh install — end to end setup](#4-fresh-install--end-to-end-setup)
5. [Daily workflow](#5-daily-workflow)
6. [Skills reference](#6-skills-reference)
7. [Driving Claude — how to talk to it](#7-driving-claude--how-to-talk-to-it)
8. [Windows Terminal environment](#8-windows-terminal-environment)
9. [PowerShell modules](#9-powershell-modules)
   - [9.1 PowerShell TUI](#91-powershell-tui)
10. [Customization guide](#10-customization-guide)
11. [FAQ](#11-faq)
12. [Examples — real prompts and what happens](#12-examples--real-prompts-and-what-happens)

---

## 1. What this is

SVH OpsMan is a purpose-built IT operations command station. You talk to it in plain English inside a terminal. It queries your real systems — Microsoft 365, Entra ID, Defender for Endpoint, Azure, NinjaOne, Wazuh, UniFi, PrinterLogic, Confluence — synthesizes the results, and stages any write operations in Obsidian for your review before anything goes anywhere.

```
"Day starter."
"Is there anything unusual in Wazuh from last night?"
"Tell me everything about SVH-SQL01."
"Why can't users at Site B reach the file server?"
"Help me plan this month's patching."
"Did this email from finance@vendor.com actually deliver to Sarah?"
```

Claude is the intelligence layer — it reads your prompts, picks the right tools, and synthesizes answers. The command station is the product: pre-wired investigation workflows, a live status dashboard, a PowerShell module suite, and Obsidian as the staging area. You're at the helm.

It is not:
- A chatbot you visit in a browser tab
- An autonomous monitoring daemon
- Something that acts without you asking

Everything is human-initiated. Nothing leaves Obsidian without you explicitly saying so.

---

## 2. How it works — the technology stack

Understanding these layers makes the setup steps and the failure modes obvious.

### Layer 1: Claude (the AI)

Claude is the reasoning engine made by Anthropic. You interact with it through **Claude Code**, a CLI that runs in your terminal. Claude reads your prompts, decides which tools to call, and synthesizes a response. All its knowledge of your environment comes from the tools it's given.

### Layer 2: MCP — the plugin system

**MCP (Model Context Protocol)** is an open protocol that gives Claude access to external tools. Each MCP server is a separate process that Claude Code talks to over stdio. Claude sees the tools a server exposes the same way a developer sees an API — it calls them by name with parameters.

This repo contains a custom MCP server. When Claude Code starts, it launches `mcp-server/dist/index.js` as a child process and discovers the tools it exposes (Graph queries, NinjaOne lookups, Wazuh searches, staging reads, etc.). Claude then has those tools available as if they were built in.

External MCP servers (Obsidian, GitHub, Bitwarden, Desktop Commander, etc.) work the same way — separate processes, registered separately.

### Layer 3: Collector (the data pre-fetcher)

The **collector** is a standalone service that runs separately from the MCP server. It wakes at 6:45 am on weekdays (systemd timer), calls NinjaOne, Graph, Planner, Wazuh, and UniFi APIs in bulk, and writes results to `staging/{date}/` as JSON files. It also maintains SQLite databases in `db/` for time-series metrics (disk trends, alert counts, patch lag).

When you say "day starter," Claude doesn't call NinjaOne directly — it reads the staging file the collector already wrote. This makes the morning briefing fast (no bulk API calls during the session) and gives Claude accurate time-series data it couldn't get by polling.

The MCP server exposes staging tools (`staging_status`, `staging_read`, `collector_run`, `metrics_disk_over_threshold`, etc.) so Claude can check freshness, read files, and trigger a fresh collection if needed.

### Layer 4: WSL 2 (where everything runs)

Claude Code and the MCP server run inside **WSL 2 (Ubuntu 24.04)** on your Windows 11 machine. WSL gives you a real Linux environment without a VM. The WSL filesystem lives at `\\wsl$\Ubuntu\` and your Windows drives are mounted at `/mnt/c/`.

In production, the collector and MCP server can also run on a dedicated Ubuntu VM on Hyper-V — the interface plane (Claude Code, PowerShell) stays in WSL while the service plane runs on the VM.

Obsidian runs natively on Windows, so the MCP server reaches it over `localhost` via the Obsidian Local REST API plugin.

### Layer 5: Bitwarden (credential store)

All API credentials live in a single Bitwarden vault item named **SVH OpsMan**. The MCP server reads them at startup using the `bw` CLI — credentials never touch the filesystem in interactive sessions. The collector uses a `collector/.env` file populated by `scripts/sync-creds.sh`, which reads from Bitwarden and writes the file at mode 600. Bitwarden remains the single source of truth; `collector/.env` is a derived artifact regenerated when credentials change.

### Layer 6: Obsidian (the output layer)

Obsidian is a local markdown editor. OpsMan uses it as a staging area — every skill writes its output to `SVH/` in the vault as a markdown note. You read it, edit it, decide whether to promote it (push to Confluence, create a Planner task, send a Teams message). The **Obsidian Local REST API** plugin exposes the vault over `localhost:27123` so the MCP server can read and write notes.

### How a request flows

```
You type "day starter"
  → Claude Code reads the prompt
  → Matches /day-starter skill from .claude/skills/day-starter/SKILL.md
  → Calls staging_status — confirms collector ran this morning
  → Calls staging_read for ninja-devices, ninja-alerts, wazuh-alerts, etc.
  → Calls live APIs for real-time data (Entra risky users, Defender alerts, M365 health)
  → Calls planner_get_user_tasks, mail_search, teams channels
  → Synthesizes results
  → Writes SVH/Daily/YYYY-MM-DD.md to Obsidian via Obsidian MCP
  → Note opens in Obsidian
```

---

## 3. Design decisions

### Why Claude Code CLI, not Claude Desktop?

Claude Desktop wraps Claude in a GUI and registers MCPs globally. Claude Code is a terminal CLI — it registers MCPs per-project, supports hooks (scripts that run at session start), and has a per-project permission model. The session-start hook is what injects Bitwarden status, git state, and today's ops context into every session without you having to say anything.

### Why a collector service in addition to the MCP server?

Before the collector, Claude called NinjaOne and Graph APIs directly every morning — 10–15 tool calls adding latency and consuming session context. The collector moves bulk reads off the session thread: data is ready before you open Claude, and time-series metrics (disk trends, alert history) are only possible because the collector runs repeatedly and writes to SQLite.

The MCP server remains for interactive, targeted queries — mail search, task updates, live security data — where freshness matters more than pre-aggregation.

### Why Bitwarden instead of .env files everywhere?

`.env` files get accidentally committed. Bitwarden gives you a vault with unlock state — the MCP server gets credentials at runtime from an unlocked session, and the credentials never touch the filesystem in interactive use. The collector's `collector/.env` is a derived artifact written by `scripts/sync-creds.sh` — still sourced from Bitwarden, still regenerated when credentials change, never committed.

### Why Obsidian as the output layer?

Three reasons:
1. **Staging.** Nothing goes to Teams or Planner until you review it. Obsidian is the buffer between Claude's output and your production systems.
2. **Persistence.** Incident records, change records, meeting notes accumulate over time. Dataview queries on `type:` and `entities:` frontmatter replace manual folder navigation.
3. **Local.** The vault is on your machine. It works offline. You own the data.

### Why Confluence as the documentation layer, not Obsidian?

Confluence holds authoritative, shareable official documentation — server pages, runbooks, published change records. Obsidian is the operational intelligence layer — where Claude drafts and where you do your thinking. When a note is ready to publish, you promote it to Confluence via Execute. Obsidian never autonomously pushes to Confluence.

### Why WSL 2 instead of native Windows?

The Claude Code CLI is a Node.js binary that runs cleanest on Linux. WSL 2 gives it a full Linux environment while keeping Obsidian and Windows Terminal native. PowerShell runs in Windows Terminal and reaches on-prem systems via PSRemoting — WSL doesn't need to do that part.

### Why PowerShell modules alongside the MCP server?

The MCP server is Claude's read-mostly window into your environment. PowerShell is for write operations that need human eyes on the command before it runs — disabling an account, isolating a device, rebooting a cluster node. The modules load from `connect.ps1`, which handles credential injection, so you never have to type a password into a terminal.

---

## 4. Fresh install — end to end setup

Start here if you're building this on a new Windows 11 machine. Steps are in order — don't skip ahead.

### Prerequisites (Windows)

- Windows 11 with WSL 2 enabled
- Obsidian installed (from obsidian.md)
- Windows Terminal installed (from the Microsoft Store)
- A Bitwarden account with the **SVH OpsMan** vault item populated (see credential reference in README.md)

### 4.1 Enable WSL 2 and install Ubuntu

```powershell
# From an elevated PowerShell
wsl --install -d Ubuntu-24.04
# Restart when prompted, then complete Ubuntu first-run setup
```

### 4.2 Clone the repo into WSL

```bash
cd ~
git clone https://github.com/aarvens1/svh-opsman SVH-OpsMan
cd SVH-OpsMan
```

### 4.3 Install Node.js 18+

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # should print v20.x.x or higher
```

### 4.4 Install the Bitwarden CLI

```bash
sudo npm install -g @bitwarden/cli
bw --version   # verify install
bw login       # first-time login; follow prompts
```

### 4.5 Install Claude Code

```bash
npm install -g @anthropic-ai/claude-code
# Or use the binary install:
claude install stable
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
which claude   # → ~/.local/bin/claude
```

Log in:
```bash
claude login   # opens browser, authenticate with your Anthropic account
```

### 4.6 Set up the WSL shell environment

```bash
chmod +x ~/SVH-OpsMan/scripts/wsl-shell-setup.sh
~/SVH-OpsMan/scripts/wsl-shell-setup.sh
```

Then from Windows PowerShell (admin):
```powershell
wsl --shutdown
```

Reopen your terminal. WSL now runs with systemd, and zsh is your default shell.

| What | Details |
|------|---------|
| **zsh** | Default shell — autosuggestions, syntax highlighting, case-insensitive completion |
| **fzf** | Fuzzy history search (`Ctrl+R`), file picker (`Ctrl+T`) |
| **bat** | `cat` replacement with syntax highlighting |
| **eza** | `ls` replacement with git status and icons |
| **delta** | Side-by-side syntax-highlighted git diffs |
| **lazygit** | Terminal git UI (`lg` alias) |
| **btop** | System resource monitor |
| **mtr** | Live ping + traceroute combined |
| **nmap** | Network scanner |
| **zoxide** | Smart `cd` — learns your most-visited dirs |
| **httpie** | Readable HTTP client for testing APIs |
| **starship** | Minimal prompt showing git branch and exit code |
| **PowerShell 7** | `pwsh` installed via snap |

Aliases: `bwu` (unlock BW) · `ops`/`opsman` (daily launch) · `clip`/`wpath`/`wexp` (Windows interop) · `gs`/`gd`/`gl`/`gco` (git shorthands)

### 4.7 Set up Obsidian

1. Open Obsidian → Open folder as vault → pick or create `C:\Users\<you>\vaults\OpsManVault`
2. Install the **Local REST API** community plugin:
   - Settings → Community plugins → Browse → search "Local REST API" → Install → Enable
   - Note the API key shown in plugin settings
3. Confirm the API is running: open a browser and go to `http://127.0.0.1:27123` — you should see a JSON response

### 4.8 Build the MCP server

```bash
cd ~/SVH-OpsMan/mcp-server
npm install
npm run build
# Output: dist/index.js
```

### 4.9 Build the collector

```bash
cd ~/SVH-OpsMan/collector
npm install
# No compile step — runs via tsx
```

### 4.10 Sync credentials to collector/.env

```bash
export BW_SESSION=$(bw unlock --raw)
chmod +x ~/SVH-OpsMan/scripts/sync-creds.sh
~/SVH-OpsMan/scripts/sync-creds.sh
# Writes collector/.env at mode 600 — never committed to git
```

Run this again whenever you rotate a credential in Bitwarden.

### 4.11 Populate Bitwarden credentials

In the Bitwarden web vault, find or create the **SVH OpsMan** item. Add custom fields with these exact names (the server reads them by name at startup; `sync-creds.sh` reads them for the collector):

| Field | Service |
|-------|---------|
| `GRAPH_TENANT_ID` | Microsoft Graph |
| `GRAPH_CLIENT_ID` | Microsoft Graph |
| `GRAPH_CLIENT_SECRET` | Microsoft Graph |
| `GRAPH_USER_ID` | Microsoft Graph (your Entra object ID) |
| `MDE_TENANT_ID` | Defender for Endpoint |
| `MDE_CLIENT_ID` | Defender for Endpoint |
| `MDE_CLIENT_SECRET` | Defender for Endpoint |
| `AZURE_TENANT_ID` | Azure |
| `AZURE_CLIENT_ID` | Azure |
| `AZURE_CLIENT_SECRET` | Azure |
| `AZURE_SUBSCRIPTION_ID` | Azure |
| `NINJA_CLIENT_ID` | NinjaOne |
| `NINJA_CLIENT_SECRET` | NinjaOne |
| `OBSIDIAN_API_KEY` | Obsidian Local REST API |
| `UNIFI_API_KEY` | UniFi Cloud |
| `UNIFI_SVH_URL` | UniFi Network controller URL |
| `UNIFI_SVH_KEY` | UniFi Network API key |

Services not yet wired: `WAZUH_URL/USERNAME/PASSWORD`, `CONFLUENCE_DOMAIN/EMAIL/API_TOKEN`, `PRINTERLOGIC_URL/API_TOKEN` — add these when you have the credentials.

### 4.12 Update config.yaml for your environment

```yaml
# .claude/config.yaml
user:
  upn: yourname@yourdomain.com
  entra_id: <your-entra-object-id>  # Get from: az ad user show --id you@domain.com --query id

obsidian:
  vault: /mnt/c/Users/<yourname>/vaults/OpsManVault

planner:
  sysadmin: "<your-planner-plan-id>"
  # Add other plan IDs as needed
```

### 4.13 Register app registrations in Azure

**Microsoft Graph (one registration for all M365 services):**

1. Azure portal → Entra ID → App registrations → New registration
2. Name: "Claude OpsMan Graph" → Register
3. API permissions → Add a permission → Microsoft Graph → Application permissions
4. Add all permissions listed in the credential reference section of README.md
5. Grant admin consent
6. Certificates & secrets → New client secret → copy the value immediately (shown once)

**Defender for Endpoint:**

1. New app registration: "Claude OpsMan MDE"
2. API permissions → APIs my organization uses → WindowsDefenderATP
3. Application: `Machine.Read.All`, `Alert.Read.All`, `Ti.Read`, `Vulnerability.Read.All`, `Software.Read.All`, `AdvancedQuery.Read.All`
4. Grant admin consent → New client secret

**Azure ARM (service principal via CLI):**

```bash
az login
az ad sp create-for-rbac --name "Claude OpsMan ARM" --role Reader --scopes /subscriptions/<id>
az role assignment create --assignee <client-id> --role "Cost Management Reader" --scope /subscriptions/<id>
```

### 4.14 Register MCPs with Claude Code

Unlock Bitwarden first, then:

```bash
export BW_SESSION=$(bw unlock --raw)

# The custom OpsMan server
claude mcp add svh-opsman -- node ~/SVH-OpsMan/mcp-server/dist/index.js

# Obsidian — get the API key from the Local REST API plugin settings
claude mcp add obsidian -e OBSIDIAN_API_KEY=<key-from-obsidian> \
  -- npx -y mcp-obsidian http://127.0.0.1:27123

# GitHub — get a PAT from github.com/settings/tokens
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxx \
  -- npx -y @modelcontextprotocol/server-github

# Fathom — from your Fathom account settings
claude mcp add fathom -e FATHOM_API_KEY=xxx \
  -- npx -y fathom-mcp

# Firecrawl — from firecrawl.dev
claude mcp add firecrawl -e FIRECRAWL_API_KEY=xxx \
  -- npx -y @mendableai/firecrawl-mcp-server

# Desktop Commander — run shell commands from Claude
claude mcp add desktop-commander \
  -- npx -y @wonderwhy-er/desktop-commander

# Bitwarden — lets Claude read vault items on demand
claude mcp add bitwarden \
  -- npx -y @bitwarden/mcp

# Time — date/time math and timezone conversions
claude mcp add time \
  -- npx -y @modelcontextprotocol/server-time
```

Verify:
```bash
claude mcp list
```

### 4.15 Verify the server starts

```bash
export BW_SESSION=$(bw unlock --raw)
cd ~/SVH-OpsMan
claude   # opens Claude Code in this project
```

In Claude's startup output, confirm:
```
[svh-opsman] Starting — N/N service groups configured
[svh-opsman] Ready — listening on stdio
```

If you see fewer service groups than expected, check which fields are missing from the Bitwarden item.

### 4.16 Run the collector for the first time

```bash
export BW_SESSION=$(bw unlock --raw)
# Collector reads from collector/.env (populated in step 4.10)
cd ~/SVH-OpsMan
npx tsx collector/src/index.ts gather
```

On success, `staging/{today}/manifest.json` appears with per-job status. Check it:
```bash
cat staging/$(date +%Y-%m-%d)/manifest.json | python3 -m json.tool
```

In subsequent days, the systemd timer handles this automatically.

### 4.17 Install Tailscale

Tailscale is the remote access layer. Requires the WSL restart from step 4.6 (systemd must be active).

```bash
~/SVH-OpsMan/scripts/tailscale-wsl-setup.sh
```

Authenticate via the browser URL. In the Tailscale admin console:
- Disable key expiry on this node (it's a workstation, not an ephemeral server)
- Enable MagicDNS so you can reach other nodes by hostname

**UDM subnet routing** — to reach every device at every SVH site without installing Tailscale on individual machines, deploy a Tailscale subnet router on each UDM Pro/SE. Follow `references/tailscale-udm-setup.md`.

### 4.18 Windows Terminal setup

```powershell
# From Windows Terminal — installs Cascadia Code NF font, PS profile stub, imports WT settings
.\dotfiles\install-windows.ps1
```

After this, `opsman` is available from both WSL and PowerShell:
```bash
opsman   # checks BW, starts status-refresh daemon, launches claude
```

### 4.19 Restrict mail access (important)

The Graph app has `Mail.ReadWrite` which is tenant-wide by default. Lock it to your mailbox:

```powershell
# From Windows Terminal as ma_ admin account with Exchange module loaded
New-DistributionGroup -Name "Claude OpsMan Mailbox Access" -Alias "claude-opsman-mailbox" -Type Security
Add-DistributionGroupMember -Identity "claude-opsman-mailbox" -Member "you@yourdomain.com"
New-ApplicationAccessPolicy -AppId "<GRAPH_CLIENT_ID>" `
  -PolicyScopeGroupId "claude-opsman-mailbox" -AccessRight RestrictAccess `
  -Description "Limit Claude OpsMan mail access to sysadmin only"
```

---

## 5. Daily workflow

### Starting a session

```bash
# Option 1: bare minimum
export BW_SESSION=$(bw unlock --raw)
cd ~/SVH-OpsMan && claude

# Option 2: using the alias (after bashrc setup)
bwu   # unlock vault, export BW_SESSION
opsman   # BW check + start claude
```

**You must unlock Bitwarden before starting Claude Code.** The MCP server reads credentials at startup. If `BW_SESSION` isn't set, the server starts but every tool call fails. The session-start hook tells you immediately if BW is locked.

### The session-start hook

Every time you open Claude Code in this project, `.claude/hooks/session-start.sh` runs automatically and injects context:

```
Branch: main | Uncommitted: 0 | Ahead: 0 | Bitwarden: BW_SESSION active |
Day: Monday (2026-05-19) | Briefing today: no | Open incidents: 2 | Last briefing: 2026-05-15
```

Claude sees this before your first message.

The hook also syncs `references/` to `OpsManVault/References/` so Obsidian always has the latest triage guides.

### A typical day

| Time | What to do |
|------|-----------|
| Morning | The collector already ran at 6:45 am. `bwu && ops` → say "day starter" |
| During day | Talk to Claude as issues come up — no slash commands needed for most things |
| When something breaks | "X is broken" or `/troubleshoot` → systematic isolation |
| Writing something up | "Write this up" or `/scribe` after you've resolved something |
| End of day | "Day ender" or hit `Ctrl+Alt+E` |

---

## 6. Skills reference

Skills are prompt patterns — markdown templates in `.claude/skills/<name>/SKILL.md` that Claude loads on demand. They define the investigation sequence, which tools to call, and what format the output should take.

### How to trigger a skill

Two ways work equally well:
- **Slash command:** `/day-starter` — exact match
- **Trigger phrase:** "morning briefing", "what's on my plate" — Claude recognizes these and loads the skill

---

### Daily rhythm

**Day Starter** — `Ctrl+Alt+D` · `/day-starter` · "morning briefing" · "day starter" · "what's on my plate"

Checks that the collector ran and staging is fresh. Reads staging files for infra summary (NinjaOne, Wazuh, UniFi, tenant audit). Runs live queries for real-time security data (Entra risky users, Defender alerts, M365 health). Synthesizes a prioritized digest with a "Draft Planner actions" section — nothing created until you say "push it."

Output: `SVH/Daily/YYYY-MM-DD.md`

---

**Day Ender** — `Ctrl+Alt+E` · `/day-ender` · "day ender" · "end of day"

What got done, what's still open, carry-forward notes for tomorrow. Appends to today's daily note — does not overwrite it.

---

**Week Starter** — `/week-starter` · "week starter" · "what does the week look like"

Run on Monday. Covers the full weekend plus this week's calendar, open tasks, and a suggested first move.

Output: `SVH/Record/YYYY-WW-week-starter.md`

---

**Week Ender** — `/week-ender` · "week ender" · "wrap up the week"

Run on Thursday. What shipped, what slipped, seeds for next week. Optionally drafts a team summary — staged in Obsidian first.

Output: `SVH/Record/YYYY-WW-week-wrap.md`

---

### When things go wrong

**Troubleshoot** — `Ctrl+Alt+T` · `/troubleshoot` · "X is broken" · "troubleshoot Y" · "why is Z not working"

Systematic isolation: expected vs. actual behavior, one user or many, ranked hypotheses from cheapest-to-disprove to most expensive. References SVH-specific failure patterns in `references/common-failure-modes.md`.

---

**Event Log Triage** — `/event-log-triage` · "check event logs on X" · "what happened on Z around [time]"

For live log queries. Wazuh first (for correlation across hosts), NinjaOne second, Desktop Commander for PowerShell deep-dives when needed.

---

**Event Log Analyzer** — `/event-log-analyzer` · "analyze this log" · "look at this log export"

For exported log files you paste in or reference — `.xml`, `.csv`, `.txt`, `.log`.

---

**Network Troubleshooter** — `Ctrl+Alt+N` · `/network-troubleshooter` · "network issue at [site]" · "why can't [users] reach [resource]"

Follows the path: UniFi Cloud (site status) → UniFi Network (VLANs, firewall rules, switch port profiles) → Wazuh (IDS events) → NinjaOne (endpoint state) → Desktop Commander. Produces an Excalidraw topology diagram of the affected path.

---

**Mailflow Investigation** — `/mailflow-investigation` · "did this email deliver" · "why didn't X get my message"

Exchange message trace → Defender (attachment/URL sandboxing flags) → Entra (sender sign-in state) → diagnostic timeline with root cause.

---

**Tenant Forensics** — `/tenant-forensics` · "who touched it" · "what changed before X broke" · "forensic audit"

Merges Azure Activity Logs + Entra Audit Logs + NinjaOne event logs into a single actor-grouped timeline. Flags RBAC changes, MFA resets, app consent grants, NSG edits, policy changes.

Output: `SVH/Record/YYYY-MM-DD-tenant-forensics.md`

---

**IR Triage** — currently disabled (`.claude/skills/ir-triage/SKILL.md.disabled`)

The only skill that can send non-draft Teams messages. Runs a triage gate: Burning Building / Active Investigation / Background Enrichment. Enable when actively working an incident.

---

### Posture & review

**Security Posture** — `Ctrl+Alt+P` · `/posture-check` · "posture check" · "state of the land"

Green/Yellow/Red scorecard across six categories: Identity, Endpoints, Patching, Infrastructure, SIEM, Cloud.

---

**Vuln Triage** — `Ctrl+Alt+V` · `/vuln-triage` · CVE ID · Defender TVM finding

Takes a CVE or Defender TVM recommendation. Maps to exposed devices, checks patch state, assigns priority tier.

Output: `SVH/Record/CVE-YYYY-NNNNN.md`

---

**Asset Investigation** — `Ctrl+Alt+A` · `/asset-investigation` · "tell me everything about [server/user]"

Servers/workstations: NinjaOne + Wazuh + Defender + Azure. Users: Entra sign-in history, MFA registration, assigned roles, group memberships, CA policy coverage.

Output: `SVH/Record/YYYY-MM-DD-asset-name.md`

---

**Access Review** — `/access-review` · "access review for [user/group/role]"

Roles, groups, app registrations, sign-ins, MFA, CA policy coverage. Flags inactive privileged accounts, missing MFA in sensitive roles, stale memberships.

---

**License Audit** — `/license-audit` · "license audit" · "license waste"

M365 licenses × Intune enrollment × MFA registration → Exposed, Ghost, Gaps categories. Monthly waste estimate.

---

### Planning & coordination

**Patch Campaign** — `Ctrl+Alt+X` · `/patch-campaign` · "what needs patching" · "plan patching"

NinjaOne pending patches → cross-referenced against Defender TVM priority → grouped into tiers → staged Planner cards for review.

---

**Change Record** — `Ctrl+Alt+C` · `/change-record` · "change record for X" · "document this rollout"

Captures: scope, risk classification, test plan, rollback procedure, comms plan, schedule. Produces an Excalidraw impact-scope diagram. Everything staged in Obsidian.

Output: `SVH/Record/CHG-YYYY-NNN.md`

---

**Project Creator** — `/project-creator` · "turn this into a project" · "help me plan X"

Breaks a large task into scope, deliverables, WBS, dependencies, and effort estimate. Small projects (≤8 items): single Planner card. Larger: full Planner plan + Confluence project page + Excalidraw WBS diagram.

---

**Meeting Prep** — `/meeting-prep` · "prep me for [meeting/time]" · "pull notes from my [call]"

Before a meeting: pulls the calendar event, Fathom history with same attendees, Confluence and Obsidian context, open Planner tasks → brief + agenda template.

After a recorded call: exports Fathom AI notes into a structured Obsidian meeting note.

Output: `SVH/Record/YYYY-MM-DD-meeting-name.md`

---

### Content & documentation

**Draft** — `/draft` · "draft an email" · "write a message to"

Takes rough notes or bullet points, drafts an email or Teams message in your voice. Nothing is sent — staged in `SVH/Inbox/` for your review.

---

**TicketSmith** — `/ticketsmith` · "write a ticket for this" · "clean up this complaint"

Raw user complaint → professional IT ticket with title, problem statement, impact, steps to reproduce, suggested priority. Output to Obsidian — nothing submitted anywhere automatically.

---

**Scribe** — `/scribe` · "write this up" · "document what I did"

Rough technician notes → structured documentation. Styles: standard, concise, detailed, incident-report, how-to. Optionally promotes to Confluence when you ask.

---

## 7. Driving Claude — how to talk to it

### The cardinal rules

**1. Nothing happens without you asking.**
Claude does not send messages, create tasks, or push changes unless you explicitly request it in the current session. "I want a task for X" → Claude drafts it in Obsidian. "Push it" → Claude creates it in Planner.

**2. Obsidian is the staging area.**
All output goes there first. You review it. Then you decide what to promote.

**3. Explicit confirmation for write operations.**
Planner tasks, Teams messages, emails, Confluence pages — Claude will always show you the draft and wait.

### Trigger phrases vs. slash commands

Slash commands are exact: `/day-starter` loads exactly that skill. Trigger phrases are fuzzy — Claude recognizes "what happened on ACOPSHV01 around 3am" and loads Event Log Triage without you needing to know the command name.

### Giving context

Claude remembers the current conversation but not previous sessions. If you're continuing work from yesterday, give it a sentence of context:

```
"We had a disk alert on SVH-SQL01 yesterday that we didn't finish investigating.
Can you pull what we know and continue?"
```

Record/ notes in Obsidian persist across sessions. Claude can read them via the Obsidian MCP.

### Asking about a specific system

You can address any system directly without invoking a skill:

```
"Check if any NinjaOne devices are offline right now."
"Pull the last 10 Wazuh alerts for level 10 or higher."
"What's the patch compliance percentage in NinjaOne?"
"Show me open Defender incidents."
```

### Stating intent explicitly

Don't make Claude guess. If you want a draft:

```
"Draft a Teams message to the techs channel about the maintenance window tonight.
Don't send it — just show me the draft."
```

If you're ready to act:
```
"The draft looks good. Create the Planner task and send that Teams message."
```

---

## 8. Windows Terminal environment

Windows Terminal is the ops workspace. `dotfiles/install-windows.ps1` sets it up with Gruvbox Dark, colour-coded profiles, and skill shortcuts.

### Profiles

| Profile | Tab colour | What it opens |
|---------|-----------|--------------|
| Claude Code | Blue | WSL bash → `cd ~/SVH-OpsMan && exec claude` |
| PowerShell (OpsMan) | Yellow | pwsh with the OpsMan profile |
| WSL Bash | Green | WSL zsh in the OpsMan directory |

### Keybindings

| Keys | Action |
|------|--------|
| `Ctrl+Alt+D` | `/day-starter` |
| `Ctrl+Alt+E` | `/day-ender` |
| `Ctrl+Alt+W` | `/week-starter` |
| `Ctrl+Alt+P` | `/posture-check` |
| `Ctrl+Alt+T` | `/troubleshoot` |
| `Ctrl+Alt+N` | `/network-troubleshooter` |
| `Ctrl+Alt+C` | `/change-record` |
| `Ctrl+Alt+V` | `/vuln-triage` |
| `Ctrl+Alt+A` | `/asset-investigation` |
| `Ctrl+Alt+X` | `/patch-campaign` |
| `Ctrl+Shift+Alt+C` | New Claude Code tab |
| `Ctrl+Shift+Alt+P` | New PowerShell (OpsMan) tab |
| `Ctrl+Shift+Alt+B` | New WSL Bash tab |
| `Ctrl+Alt+2` | Split pane horizontal |
| `Ctrl+Alt+H/J/K/L` | Navigate between split panes |
| `Ctrl+Alt+R` | Rename current tab |

---

## 9. PowerShell modules

The PowerShell module suite handles write operations and on-prem systems. Claude's MCP tools are read-mostly by design. When you need to act — disable an account, isolate a device, reboot a cluster node — you load the modules in Windows Terminal.

### Loading

```powershell
cd C:\path\to\SVH-OpsMan\powershell
. ./connect.ps1
```

Dot-sources `connect.ps1`, which loads `SVH.Core` first (credential store and auth cache), then all other modules.

### Module reference

| Module | What it covers |
|--------|---------------|
| `SVH.Core` | Token cache, REST wrapper, credential accessor, domain constants |
| `SVH.Entra` | User/group lifecycle, MFA gaps, license waste, stale devices, TAPs, risky users |
| `SVH.Exchange` | Mailbox settings, forwarding rules, litigation hold, message trace, service health |
| `SVH.M365` | Teams, Mail, Calendar, Planner, To Do, OneDrive, SharePoint |
| `SVH.Azure` | ARM + Defender MDE: VMs, NSGs, storage, backup jobs, device isolation/scan |
| `SVH.NinjaOne` | Device discovery, services, disks, patches, backups, event logs, fleet alerts |
| `SVH.Wazuh` | Alerts, agents, FIM events, vulnerability detections, auth failure detection |
| `SVH.UniFi` | Sites, devices, clients, WLANs, firewall rules, AP health, rogue client detection |
| `SVH.Confluence` | Pages, search, comments |
| `SVH.PrinterLogic` | Printers, drivers, deployment profiles, quotas, audit log |
| `SVH.OnPrem` | PSRemoting: disk, services, pending reboot, Hyper-V VMs, cluster state, MABS jobs, SQL memory |
| `SVH.AD` | Active Directory: users, groups, computers, domain health, replication |
| `SVH.Network` | AD DNS, Windows DHCP, cross-platform network validation |
| `SVH.Cross` | Cross-system composites: asset summaries, patch surface, backup health, IR lockdown |

### Credential tiers

| Tier | Account | Auth method | Used for |
|------|---------|------------|---------|
| `standard` | `astevens@shoestringvalley.com` | Passkey (BW) — interactive browser | General M365 |
| `server` | `sa_stevens@andersen-cost.com` | Password — unattended | PSRemoting to servers |
| `m365` | `ma_stevens@shoestringvalley.com` | Passkey (BW) — interactive browser | M365 admin operations |
| `app` | `aa_stevens@shoestringvalley.com` | Passkey (BW) — interactive browser | App registrations |
| `domain` | `ACCO\da_stevens` | Password — unattended | Active Directory |
| `ra` | `ra_stevens@andersen-cost.com` | Password (BW: `DC_REMOTE_PASSWORD`) | Desktop Commander read-only PSRemoting |

### PSRemoting setup (one-time)

The on-prem modules reach Windows servers via PSRemoting from WSL. This requires a one-time trust setup — see `references/setup-winrm.md`.

### Desktop Commander PSRemoting account (ra_stevens)

Desktop Commander uses a minimal-privilege account (`ra_stevens`) for diagnostic PSRemoting — read event logs, query processes/services/network state, read DHCP leases. Cannot modify anything.

Create it with:
```powershell
.\setup-dc-remote-account.ps1 -DomainController ACCODC01 -DhcpServer ACCODHCP01
```

Store the generated password in the **SVH OpsMan** BW item (`DC_REMOTE_USER` / `DC_REMOTE_PASSWORD`).

### 9.1 PowerShell TUI

The TUI is a terminal interface that wraps all SVH module functions. Instead of remembering function names and parameter syntax, you browse by module, fill a form, and the command is built for you.

#### Starting the TUI

```bash
export BW_SESSION=$(bw unlock --raw)
tui/run-tui.sh
```

#### Layout

```
┌──────────────────────┬──────────────────────────────────────────────────────┐
│  / Search functions… │  Get-SVHUser  [Read]  SVH.Entra                      │
│──────────────────────│  Get Entra ID user account details                   │
│  ▶ SVH.AD            │──────────────────────────────────────────────────────│
│  ▼ SVH.Entra         │  Identity *  [string]    ________________________     │
│      Get-SVHUser  ●  │──────────────────────────────────────────────────────│
│      Get-GuestUsers  │  Get-SVHUser -Identity "jdoe@shoestringvalley.com"   │
│  ▶ SVH.Exchange      │  [● Console] [○ Obsidian]          [▶ Run]           │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

#### Risk colour coding

| Colour | Verb examples | Behaviour |
|--------|--------------|-----------|
| Green `[Read]` | Get, Test, Find | Runs immediately |
| Yellow `[Write]` | New, Set, Start, Enable | Runs immediately |
| Red `[⚠ Destructive]` | Remove, Restart, Reset, Revoke, Block, Stop | Requires confirmation dialog |

#### Output destinations

- **Console** — output stays in the TUI output panel.
- **Obsidian** — output is saved to `SVH/Record/YYYY-MM-DD-FunctionName-HHMMSS.md` with frontmatter.

#### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+F` | Focus the search box |
| `Ctrl+R` | Run the current command |
| `Ctrl+L` | Clear the output panel |
| `Escape` | Blur the focused input |
| `Ctrl+Q` | Quit |

---

## 10. Customization guide

### Changing your identity / org

Edit `.claude/config.yaml`. This is the single source of truth for UPNs, group IDs, Planner plan IDs, and the Obsidian vault path.

### Adding a new collector job

1. Create `collector/src/jobs/<service>.ts` — implement the `Job` interface
2. Import and add to `ALL_JOBS` in `collector/src/index.ts`
3. Add watch-phase metrics extraction in `collector/src/watch/index.ts` if the job produces metrics data
4. Add credentials to `collector/.env.example` and the Bitwarden SVH OpsMan item
5. Re-run `sync-creds.sh` to pick up new credential fields

### Adding a new MCP tool

1. Create `mcp-server/src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Import it in `mcp-server/src/index.ts` — add an env-based `enabled` flag, call register
3. Add credentials to the **SVH OpsMan** Bitwarden item
4. Run `npm run build` in `mcp-server/`
5. Add the tool name(s) to the `allowed-tools` frontmatter of any skill that should use it

### Adding a new skill

Create `.claude/skills/<name>/SKILL.md`:

```yaml
---
name: my-skill
description: What this skill does. Trigger phrases: "do the thing", "run my skill".
when_to_use: When to invoke this vs. alternatives.
allowed-tools: "mcp__svh-opsman__staging_read mcp__obsidian__* mcp__time__*"
---
# My Skill

[Skill instructions — how Claude should approach the task, which tools to call, what format the output should take]
```

### Disabling a skill

Rename `SKILL.md` to `SKILL.md.disabled`. Claude won't load it. IR Triage ships disabled this way.

### Personal overrides

`.claude/settings.local.json` is gitignored:

```json
{
  "permissions": {
    "allow": ["Bash(my-personal-command)"]
  }
}
```

### Adding a PowerShell module

1. Create `powershell/modules/SVH.<Service>.psm1`
2. Export public functions with `Export-ModuleMember -Function *`
3. Add a `Connect-SVH<Service>` call to `connect.ps1`
4. Add credentials to the **SVH OpsMan** Bitwarden item
5. Document in `powershell/README.md`

---

## 11. FAQ

**Q: The server isn't finding my credentials.**

`bw unlock` exports `BW_SESSION` in that shell only. If you opened a new terminal after unlocking, the new shell doesn't have it. Run `export BW_SESSION=$(bw unlock --raw)` again. The session-start hook tells you if BW is locked.

---

**Q: The day starter says staging is stale.**

The collector didn't run this morning. Either run it manually (`npx tsx collector/src/index.ts gather` from the repo root) or say "run the collector" — Claude will call `collector_run` for you. Check `staging/{today}/manifest.json` for per-job status after it completes.

---

**Q: Claude is calling tools but getting no data back.**

Check which service is failing. Common causes:
- Token expired — restart the Claude Code session to trigger a fresh token fetch.
- Credentials not in Bitwarden — check `references/credentials.md`.
- Service is actually down — check M365 Admin → Service Health.

---

**Q: "BW_SESSION not set" in the status bar but I unlocked Bitwarden.**

The `BW_SESSION` variable must be exported in the shell that launched Claude Code. Restart from a shell where you ran `export BW_SESSION=$(bw unlock --raw)`.

---

**Q: A Planner task got created when I just wanted a draft.**

The system requires explicit confirmation ("push it", "go ahead", "create it") before writing to Planner. Use "draft" explicitly when you want staging only.

---

**Q: The Obsidian MCP isn't finding my vault.**

1. The Local REST API plugin is enabled in Obsidian and the vault is open.
2. The API key matches the key in the plugin settings (regenerates when you re-enable the plugin).

Verify: `curl -H "Authorization: ApiKey <your-key>" http://127.0.0.1:27123/`

---

**Q: Can Claude access other people's mailboxes?**

No. The server locks all mail and calendar calls to `GRAPH_USER_ID`. The ApplicationAccessPolicy on the app registration enforces this at Exchange level as well.

---

**Q: How do I update the skills?**

Pull the repo and rebuild if the server changed:
```bash
git pull origin main
cd mcp-server && npm run build
cd ../collector && npm install
```

Skills in `.claude/skills/` are markdown files — changes are picked up immediately on the next session.

---

**Q: Can I run this on a Mac or Linux workstation?**

Most of it works — Claude Code and the MCP server are Node.js. The PowerShell modules require PowerShell 7 (available on Linux/Mac). The Windows Terminal profiles and `install-windows.ps1` are Windows-only. Adjust `config.yaml` paths and the session-start hook for your environment.

---

**Q: IR Triage is disabled — how do I enable it?**

```bash
mv .claude/skills/ir-triage/SKILL.md.disabled .claude/skills/ir-triage/SKILL.md
```

Enable only when actively working an incident. It's the only skill that can send non-draft Teams messages.

---

**Q: Can Claude delete Planner tasks?**

No. `planner_delete_task` does not exist in the tool set. Mark tasks complete at 100% instead.

---

## 12. Examples — real prompts and what happens

### Morning briefing

```
You: day starter

Claude: [calls staging_status — confirms staging is fresh from 6:45 am]
        [calls staging_read for ninja-devices, ninja-alerts, wazuh-alerts,
         unifi-alerts, graph-audit, graph-calendar, planner-tasks]
        [calls entra_list_risky_users, mde_list_alerts, admin_list_service_incidents]
        [calls mail_search, teams channels]

        Writes SVH/Daily/2026-05-22.md to Obsidian
        Note opens in Obsidian
```

---

### Server trouble

```
You: SVH-SQL01 is throwing disk errors, NinjaOne has alerts

Claude: [/troubleshoot loads automatically]
        [calls metrics_disk_over_threshold — SVH-SQL01: C:\ at 94%]

        Root cause: C:\ is 94% full. Likely candidate: MABS temp files or SQL log growth.

You: check what's using the space

Claude: [Desktop Commander → PowerShell on SVH-SQL01 via PSRemoting]
        SQL log files: 48GB in D:\SQLLogs\ (TempDB log not auto-shrinking)
        MABS temp: 12GB in C:\Windows\Temp\

You: draft me a change record for shrinking the SQL log

Claude: [/change-record loads]
        [drafts SVH/Record/CHG-2026-042.md with scope, risk (low), test plan,
         rollback procedure, and timeline]
```

---

### Network issue

```
You: nobody at Site B can reach the file server

Claude: [/network-troubleshooter loads]
        [checks UniFi Cloud → Site B status: online]
        [checks UniFi Network → firewall rules]

        Found: firewall rule "Block Site B to Server VLAN" is enabled — last
        modified 2 hours ago by admin account.

You: definitely not intentional, who changed that?

Claude: [staging_read graph-audit]
        Rule modified at 14:32 by ma_stevens (internal IP). No other suspicious activity.

You: ok disable that rule

Claude: I can't modify UniFi firewall rules — the UniFi tools are read-only.
        Rule ID: rule_id=1047, name="Block Site B to Server VLAN"
        Disable it from the UniFi Network console at Settings → Firewall → LAN Rules.
```

---

### Prepping for a meeting

```
You: prep me for my 2pm with the network vendor

Claude: [/meeting-prep loads]
        [pulls calendar event, Fathom history, Confluence docs, open Planner tasks]

        Brief:
        - Last call 2026-03-14 — discussed ISP failover and VLAN segmentation at Site C
        - Open: "vendor to send BGP config by end of March" — not found in email
        - 2 open tasks in Office Network Standardization related to Site C
        - Suggested agenda: ISP failover status, BGP config follow-up, Site C timeline

        Writes SVH/Record/2026-05-22-network-vendor-q2.md
```

---

*End of user guide.*
