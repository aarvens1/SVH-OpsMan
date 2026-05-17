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

Claude is the intelligence layer — it reads your prompts, picks the right tools, and synthesizes answers. The command station is the product: 23 pre-wired investigation workflows, a live status dashboard, a PowerShell module suite, and Obsidian as the staging area. You're at the helm.

It is not:
- A chatbot you visit in a browser tab
- A scheduled job or monitoring daemon
- Something that acts without you asking

Everything is human-initiated. Nothing runs autonomously. Nothing leaves Obsidian without you explicitly saying so.

---

## 2. How it works — the technology stack

Understanding these five layers makes the setup steps and the failure modes obvious.

### Layer 1: Claude (the AI)

Claude is the reasoning engine made by Anthropic. You interact with it through **Claude Code**, a CLI that runs in your terminal. Claude reads your prompts, decides which tools to call, and synthesizes a response. It does not have internet access by default — all its knowledge of your environment comes from the tools it's given.

### Layer 2: MCP — the plugin system

**MCP (Model Context Protocol)** is an open protocol that gives Claude access to external tools. Each MCP server is a separate process that Claude Code talks to over stdio (standard input/output). Claude sees the tools a server exposes the same way a developer sees an API — it calls them by name with parameters.

This repo *is* a custom MCP server. When Claude Code starts, it launches `mcp-server/dist/index.js` as a child process and discovers the tools it exposes (Graph queries, NinjaOne lookups, Wazuh searches, etc.). Claude then has those tools available as if they were built in.

External MCP servers (Obsidian, GitHub, Bitwarden, Desktop Commander, etc.) work the same way — separate processes, registered separately.

### Layer 3: WSL 2 (where everything runs)

Claude Code and the MCP server run inside **WSL 2 (Ubuntu 24.04)** on your Windows 11 machine. WSL gives you a real Linux environment — zsh, npm, Node.js, PowerShell 7, the `bw` CLI — without a VM. The WSL filesystem lives at `\\wsl$\Ubuntu\` and your Windows drives are mounted at `/mnt/c/`.

systemd is enabled in WSL (configured by `scripts/wsl-shell-setup.sh`), which lets Tailscale run as a proper service and makes the shell environment behave more like a real Linux system.

Obsidian runs natively on Windows, so the MCP server reaches it over `localhost` via the Obsidian Local REST API plugin.

### Layer 4: Bitwarden (credential store)

All API credentials — Microsoft Graph secrets, NinjaOne client IDs, UniFi passwords — live in a single Bitwarden vault item named **SVH OpsMan**. The MCP server reads them at startup using the `bw` CLI. This means:

- No credentials are stored in files that could be committed to git
- Rotating a credential means updating Bitwarden, not editing a `.env` file
- The server refuses to start if `BW_SESSION` isn't set (vault is locked)

### Layer 5: Obsidian (the output layer)

Obsidian is a local markdown editor with a plugin ecosystem. OpsMan uses it as a staging area — every skill writes its output there as a markdown note. You read it, edit it, decide whether to promote it (push to Confluence, create a Planner task, send a Teams message). The **Obsidian Local REST API** plugin exposes the vault over `localhost:27123` so the MCP server can read and write notes.

### How a request flows

```
You type "day starter"
  → Claude Code reads the prompt
  → Matches /day-starter skill from .claude/skills/day-starter/SKILL.md
  → Calls MCP tools: NinjaOne alerts, Wazuh alerts, Defender incidents,
    Planner tasks, Entra risky users, MS Admin health, ...
  → Synthesizes results
  → Writes Briefings/Daily/YYYY-MM-DD.md to Obsidian via Obsidian MCP
  → Prints obsidian://open?vault=OpsManVault&file=... URI in terminal
  → You click the link → note opens in Obsidian
```

---

## 3. Design decisions

These are the "why" answers for the choices that might otherwise seem arbitrary.

### Why Claude Code CLI, not Claude Desktop?

Claude Desktop wraps Claude in a GUI and registers MCPs globally. Claude Code is a terminal CLI — it registers MCPs per-project, supports hooks (scripts that run at session start), and has a proper permission model. For ops work, you want the per-project isolation and the hooks. The session-start hook is what injects Bitwarden status, git state, and today's ops context into every session without you having to say anything.

### Why a custom MCP server instead of using Claude Desktop plugins?

The custom server lets you control exactly what Claude can and cannot do. All tool logic lives in `mcp-server/src/tools/` — you can audit it, version-control it, add logging, gate write operations behind confirmation. It also lets you pull credentials from Bitwarden rather than hardcoding them in config files.

### Why Bitwarden instead of a .env file?

`.env` files get accidentally committed. They sit on disk in plaintext. Bitwarden gives you a vault with unlock state — the server gets credentials at runtime from an unlocked session, and the credentials never touch the filesystem. The `mcp-server/.env` file that exists is a last-resort fallback (populated once on 2026-05-11) and is gitignored.

### Why Obsidian as the output layer?

Three reasons:
1. **Staging.** Nothing goes to Teams or Planner until you review it. Obsidian is the buffer between Claude's output and your production systems.
2. **Persistence.** Asset notes, incident records, change records accumulate over time and are updated in place. Obsidian's wikilink graph connects them.
3. **Local.** The vault is on your machine. It works offline. You own the data.

### Why WSL 2 instead of native Windows?

The Claude Code CLI is a Node.js binary that runs cleanest on Linux. WSL 2 gives it a full Linux environment while keeping Obsidian and Windows Terminal native. PowerShell runs in Windows Terminal and reaches on-prem systems via PSRemoting — WSL doesn't need to do that part.

### Why PowerShell modules alongside the MCP server?

The MCP server is Claude's read-only window into your environment. PowerShell is for write operations that need human eyes on the command before it runs — disabling an account, isolating a device, rebooting a cluster node. The modules load from `connect.ps1`, which handles credential injection, so you never have to type a password into a terminal.

### Why one Graph app registration for all Microsoft services?

Graph permissions are scoped at the app level, not the user level. A single app registration with all required permissions is simpler to maintain than five separate registrations for Mail, Planner, Entra, Exchange, and Intune. The one exception is Defender for Endpoint and Azure ARM — those use different APIs that require their own service principals.

### Why is Obsidian the single source of truth for output, not Confluence?

Confluence is for documentation that's finished and meant to be shared. Obsidian is for work in progress. Skills write to Obsidian, you review and edit, then optionally promote to Confluence. This prevents half-formed notes from appearing in shared spaces.

### Why WezTerm instead of Windows Terminal?

WezTerm has a Lua-scriptable status bar, chord keybindings, and built-in hyperlink detection. The status bar shows live Wazuh/MDE/Entra alert counts and Bitwarden unlock state — things you'd otherwise have to query manually. The `obsidian://` URI detection means you can click a note link directly from terminal output. Windows Terminal can't do these things without external tooling.

---

## 4. Fresh install — end to end setup

Start here if you're building this on a new Windows 11 machine. Steps are in order — don't skip ahead.

### Prerequisites (Windows)

- Windows 11 with WSL 2 enabled
- Obsidian installed (from obsidian.md)
- WezTerm installed — or skip Section 8 and use Windows Terminal
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

What the script installs and configures:

| What | Details |
|------|---------|
| **zsh** | Default shell — autosuggestions, syntax highlighting, case-insensitive completion |
| **fzf** | Fuzzy history search (`Ctrl+R`), file picker (`Ctrl+T`), smart `cd` picker (`Alt+C`) |
| **bat** | `cat` replacement with syntax highlighting (`cat` and `bat` aliases both work) |
| **eza** | `ls` replacement with git status and icons (`ls`, `ll`, `lt` aliases) |
| **delta** | Side-by-side syntax-highlighted git diffs |
| **lazygit** | Terminal git UI — stage hunks, resolve conflicts, interactive rebase (`lg` alias) |
| **btop** | System resource monitor |
| **mtr** | Live ping + traceroute combined — useful in network troubleshooting |
| **nmap** | Network scanner for authorized recon |
| **zoxide** | Smart `cd` — learns your most-visited dirs (`z ops`, `z vault`) |
| **httpie** | Readable HTTP client for testing APIs |
| **starship** | Minimal prompt showing git branch and exit code |
| **PowerShell 7** | `pwsh` installed via snap — run SVH modules directly in WSL without PSRemoting |

Aliases carried forward from the old bashrc:
- `bwu` — unlock Bitwarden, export `BW_SESSION`
- `ops` / `opsman` — daily launch (BW check + WezTerm)
- `clip`, `wpath`, `wexp` — Windows interop helpers
- `gs`, `gd`, `gl`, `gco` — git shorthands

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

### 4.9 Populate Bitwarden credentials

In the Bitwarden web vault, find or create the **SVH OpsMan** item. Add custom fields with these exact names (the server reads them by name):

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

Services not yet wired: `WAZUH_URL/USERNAME/PASSWORD`, `CONFLUENCE_DOMAIN/EMAIL/API_TOKEN`, `UNIFI_*`, `PRINTERLOGIC_URL/API_TOKEN` — add these when you have the credentials.

### 4.10 Update config.yaml for your environment

```yaml
# .claude/config.yaml
user:
  upn: yourname@yourdomain.com
  entra_id: <your-entra-object-id>  # Get from: az ad user show --id you@domain.com --query id

groups:
  it_team: <entra-group-object-id>

obsidian:
  vault: /mnt/c/Users/<yourname>/vaults/OpsManVault

planner:
  sysadmin: "<your-planner-plan-id>"
  # Add other plan IDs as needed
```

Get your Entra object ID:
```bash
# After registering the Graph app, use the Graph Explorer or:
curl -H "Authorization: Bearer <token>" https://graph.microsoft.com/v1.0/me | jq .id
```

### 4.11 Register app registrations in Azure

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

### 4.12 Register MCPs with Claude Code

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

### 4.13 Verify the server starts

```bash
export BW_SESSION=$(bw unlock --raw)
cd ~/SVH-OpsMan
claude   # opens Claude Code in this project
```

In Claude's startup output, confirm:
```
[svh-opsman] Loaded 20 credential(s) from Bitwarden vault
[svh-opsman] Starting — 9/9 service groups configured
[svh-opsman] Ready — listening on stdio
```

If you see fewer than the expected credential count, check which fields are missing from the Bitwarden item.

### 4.14 Install Tailscale

Tailscale is the remote access layer — your WSL box and SVH servers all join a private mesh network. Requires the WSL restart from step 4.6 (systemd must be active).

```bash
~/SVH-OpsMan/scripts/tailscale-wsl-setup.sh
```

Authenticate via the browser URL. In the Tailscale admin console:
- Disable key expiry on this node (it's a workstation, not an ephemeral server)
- Enable MagicDNS so you can reach other nodes by hostname

**UDM subnet routing** — to reach every device at every SVH site without installing Tailscale on individual machines, deploy a Tailscale subnet router on each UDM Pro/SE. Follow `references/tailscale-udm-setup.md`. Once configured, your WSL box can SSH, ping, or PSRemote to any device at any site through the UDM's Tailscale node.

---

### 4.15 Windows Terminal setup

```powershell
# From Windows Terminal — installs Cascadia Code NF font, PS profile stub, imports WT settings
.\dotfiles\install-windows.ps1
```

After this, `opsman` is available from both WSL and PowerShell:
```bash
opsman   # checks BW, starts status-refresh daemon, launches claude
```

From PowerShell, `opsman` opens a new Claude Code tab (blue) in Windows Terminal.

### 4.16 Restrict mail access (important)

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
ops   # or opsman — full launch with WezTerm
```

**You must unlock Bitwarden before starting Claude Code.** The MCP server reads credentials at startup. If `BW_SESSION` isn't set, the server starts but every tool call fails with a Bitwarden error. The session-start hook tells you immediately if BW is locked.

### The session-start hook

Every time you open Claude Code in this project, `.claude/hooks/session-start.sh` runs automatically and injects context into Claude's system prompt:

```
Branch: main | Uncommitted: 0 | Ahead: 0 | Bitwarden: BW_SESSION active |
Day: Monday (2026-05-16) | Briefing today: no | Open incidents: 2 | Last briefing: 2026-05-15
```

Claude sees this before your first message. You don't have to tell it what day it is or whether a briefing exists.

The hook also syncs `references/` to `OpsManVault/References/` so Obsidian always has the latest triage guides.

### A typical day

| Time | What to do |
|------|-----------|
| Morning | `bwu && ops` → Claude opens → say "day starter" or hit `CTRL+\ d` |
| During day | Talk to Claude as issues come up — no slash commands needed for most things |
| When something breaks | "X is broken" or `/troubleshoot` → systematic isolation |
| Writing something up | "Write this up" or `/scribe` after you've resolved something |
| End of day | "Day ender" or hit `CTRL+\ e` |

---

## 6. Skills reference

Skills are prompt patterns — markdown templates in `.claude/skills/<name>/SKILL.md` that Claude loads on demand. They define the investigation sequence, which tools to call, and what format the output should take. They have zero context cost until triggered.

### How to trigger a skill

Two ways work equally well:
- **Slash command:** `/day-starter` — exact match
- **Trigger phrase:** "morning briefing", "what's on my plate" — Claude recognizes these and loads the skill

---

### Daily rhythm

**Day Starter** — `CTRL+\ d` · `/day-starter` · "morning briefing" · "day starter" · "what's on my plate"

Covers the last 24 hours (72 hours on Mondays, since work week is M–Thursday). Queries all monitoring sources, synthesizes a prioritized digest, and includes a "Draft Planner actions" section at the bottom with suggested tasks staged for review — nothing is created until you say "push it."

Output: `Briefings/Daily/YYYY-MM-DD.md`

---

**Day Ender** — `CTRL+\ e` · `/day-ender` · "day ender" · "end of day"

Covers the last 12 hours. What got done, what's still open, carry-forward notes for tomorrow. Appends to today's daily note — does not overwrite it.

---

**Week Starter** — `/week-starter` · "week starter" · "what does the week look like"

Run on Monday. Covers the full weekend plus this week's calendar, open tasks, and a suggested first move. Output: `Briefings/Weekly/YYYY-WW.md`

---

**Week Ender** — `/week-ender` · "week ender" · "wrap up the week" · "Thursday EOD"

Run on Thursday. What shipped, what slipped, seeds for next week. Optionally drafts a team summary for your manager — staged in Obsidian first.

---

### When things go wrong

**Troubleshoot** — `CTRL+\ t` · `/troubleshoot` · "X is broken" · "troubleshoot Y" · "why is Z not working"

Systematic isolation: expected vs. actual behavior, one user or many, ranked hypotheses from cheapest-to-disprove to most expensive. References SVH-specific failure patterns in `references/common-failure-modes.md` — Hyper-V cluster issues, MABS/SQL memory pressure, CMiC/Kemp load balancer, UniFi connectivity, WSUS approval backlogs, PrinterLogic problems.

---

**Event Log Triage** — `/event-log-triage` · "check event logs on X" · "what happened on Z around [time]"

For live log queries. Sequence: Wazuh first (for correlation across hosts), NinjaOne second (for gaps), Desktop Commander for PowerShell deep-dives when needed. Output: `Investigations/` note with timeline.

---

**Event Log Analyzer** — `/event-log-analyzer` · "analyze this log" · "look at this log export"

For exported log files you paste in or reference — `.xml`, `.csv`, `.txt`, `.log`. Parses patterns from the export rather than querying live systems.

---

**Network Troubleshooter** — `CTRL+\ n` · `/network-troubleshooter` · "network issue at [site]" · "why can't [users] reach [resource]"

Follows the path: UniFi Cloud (site status) → UniFi Network (VLANs, firewall rules, switch port profiles) → Wazuh (IDS events) → NinjaOne (endpoint state) → Desktop Commander (ping, traceroute). Always produces an Excalidraw topology diagram of the affected path.

---

**Mailflow Investigation** — `/mailflow-investigation` · "did this email deliver" · "why didn't X get my message"

Exchange message trace → Defender (attachment/URL sandboxing flags) → Entra (sender sign-in state) → diagnostic timeline with root cause. Useful for "did this phishing email reach users" as well as delivery failures.

---

**Tenant Forensics** — `/tenant-forensics` · "who touched it" · "what changed before X broke" · "forensic audit"

Merges Azure Activity Logs + Entra Audit Logs + NinjaOne event logs into a single actor-grouped timeline. Flags RBAC changes, MFA resets, app consent grants, NSG edits, policy changes. Use this when something broke and you need to know what changed and who did it.

Output: `Investigations/YYYY-MM-DD-tenant-forensics-HHmm.md`

---

**IR Triage** — currently disabled (`.claude/skills/ir-triage/SKILL.md.disabled`)

The only skill that can send non-draft Teams messages. Runs a triage gate to classify alerts: 🔥 Burning Building (active compromise, immediate notification) · 🔎 Active Investigation (confirmed suspicious, draft notification) · 🔍 Background Enrichment (no action). Enable when you need it by renaming the file to `SKILL.md`.

---

### Posture & review

**Security Posture** — `CTRL+\ p` · `/posture-check` · "posture check" · "state of the land"

Green/Yellow/Red scorecard across six categories: Identity, Endpoints, Patching, Infrastructure, SIEM, and Cloud. Point-in-time snapshot from all monitoring sources.

---

**Vuln Triage** — `CTRL+\ v` · `/vuln-triage` · CVE ID · Defender TVM finding

Takes a CVE or a Defender TVM recommendation. Maps it to exposed devices, checks patch state, assigns a priority tier (Emergency / This Week / Next Cycle / Accept). Output: Obsidian note + optional Confluence draft + Planner tickets.

---

**Asset Investigation** — `CTRL+\ a` · `/asset-investigation` · "tell me everything about [server/user]"

For servers and workstations: NinjaOne (services, disk, patches, backups, alerts) + Wazuh (recent alerts, FIM events) + Defender (software vulnerabilities) + Azure (if cloud VM). For users: Entra sign-in history, MFA registration, assigned roles, group memberships, CA policy coverage.

Output: `Assets/[name].md` — persistent note, updated in place each run so history accumulates.

---

**Access Review** — `/access-review` · "access review for [user/group/role]" · "audit permissions for X"

Roles, groups, app registrations, sign-ins, MFA, CA policy coverage. Flags: inactive privileged accounts, missing MFA in sensitive roles, stale memberships (no sign-in in 90+ days). Use for quarterly access reviews or when investigating over-permissioned accounts.

---

**License Audit** — `/license-audit` · "license audit" · "license waste"

M365 licenses × Intune enrollment × MFA registration → three categories: Exposed (licensed but no device enrolled and no MFA), Ghost (licensed but inactive 30+ days), Gaps (enrolled but incomplete licensing). Includes a monthly waste estimate in dollars.

Output: `Reviews/Access/license-audit-YYYY-MM-DD.md`

---

### Planning & coordination

**Patch Campaign** — `CTRL+\ x` · `/patch-campaign` · "what needs patching" · "plan patching"

NinjaOne pending patches → cross-referenced against Defender TVM priority → grouped into tiers → creates a Planner board for tracking. The Planner cards are staged for your review before creation.

---

**Change Record** — `CTRL+\ c` · `/change-record` · "change record for X" · "document this rollout"

Captures: scope, risk classification, test plan, rollback procedure, comms plan, schedule. Produces an Excalidraw impact-scope diagram. Everything staged in Obsidian; Confluence draft and Planner card created only when you say so.

---

**Project Creator** — `/project-creator` · "turn this into a project" · "help me plan X"

Breaks a large task into scope, deliverables, WBS, dependencies, and effort estimate. Small projects (≤8 items): single Planner card. Larger: full Planner plan with buckets + Confluence project page + Excalidraw WBS diagram.

---

**Meeting Prep** — `/meeting-prep` · "prep me for [meeting/time]" · "pull notes from my [call]"

Before a meeting: pulls the calendar event, Fathom history with the same attendees, Confluence and Obsidian context, open Planner tasks → brief + agenda template.

After a recorded call: exports Fathom AI notes verbatim into a structured Obsidian meeting note and appends a summary line to today's daily note.

---

### Content & documentation

**Draft** — `/draft` · "draft an email" · "write a message to"

Takes rough notes or bullet points, drafts an email or Teams message in your voice. Nothing is sent — lands in `Drafts/` in Obsidian for your review and editing.

---

**TicketSmith** — `/ticketsmith` · "write a ticket for this" · "clean up this complaint" · "turn this into a ticket"

Takes a rambling user complaint, an email forward, or rough notes → professional IT ticket with title, problem statement, impact, steps to reproduce, suggested priority. Accepts pasted text, `.txt`, or `.pdf`. Output to Obsidian — nothing submitted anywhere automatically.

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
Planner tasks, Teams messages, emails, Confluence pages — Claude will always show you the draft and wait. Never say "go ahead and do it all" unless you're comfortable with every staged action.

### Trigger phrases vs. slash commands

Slash commands are exact: `/day-starter` loads exactly that skill. Trigger phrases are fuzzy — Claude recognizes "what happened on ACOPSHV01 around 3am" and loads Event Log Triage without you needing to know the command name. Both work; use whichever is faster.

### Giving context

Claude remembers the current conversation but not previous sessions. If you're continuing work from yesterday, give it a sentence of context:

```
"We had a disk alert on SVH-SQL01 yesterday that we didn't finish investigating.
Can you pull what we know and continue?"
```

Asset notes in Obsidian help with this — they persist across sessions and are updated each time you run `/asset-investigation`. Claude can read them via the Obsidian MCP.

### Asking about a specific system

You can address any system directly without invoking a skill:

```
"Check if any NinjaOne devices are offline right now."
"Pull the last 10 Wazuh alerts for level 10 or higher."
"What's the patch compliance percentage in NinjaOne?"
"Show me open Defender incidents."
```

Claude picks the right tool and returns the data.

### Stating intent explicitly

Don't make Claude guess. If you want a draft before anything happens:

```
"Draft a Teams message to the techs channel about the maintenance window tonight.
Don't send it — just show me the draft."
```

If you're ready to act:
```
"The draft looks good. Create the Planner task and send that Teams message."
```

### Corrections during a conversation

If Claude misunderstands or goes in the wrong direction, just correct it:

```
"No — I meant the Site B UniFi controller, not the UniFi Cloud account."
"Stop. That's the wrong server. I meant SVH-APP02, not SVH-APP01."
```

Claude backtracks and tries again with the corrected context.

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

Skill shortcuts use **Ctrl+Alt+[key]** — type the chord while Claude's prompt is active and it submits the skill command.

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

The PowerShell module suite handles write operations and on-prem systems. Claude's MCP tools are read-only by design. When you need to act — disable an account, isolate a device, reboot a cluster node — you load the modules in Windows Terminal and run the commands yourself.

### Loading

From Windows Terminal (requires `BW_SESSION` from Windows side, or separate `bw unlock`):

```powershell
cd C:\path\to\SVH-OpsMan\powershell
. ./connect.ps1
```

This dot-sources `connect.ps1`, which loads `SVH.Core` first (credential store and auth cache), then all other modules.

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

Each module uses one of these credential tiers — the tier determines which account gets used:

| Tier | Account | Auth method | Used for |
|------|---------|------------|---------|
| `standard` | `astevens@shoestringvalley.com` | Passkey (BW) — interactive browser | General M365 |
| `server` | `sa_stevens@andersen-cost.com` | Password — unattended | PSRemoting to servers |
| `m365` | `ma_stevens@shoestringvalley.com` | Passkey (BW) — interactive browser | M365 admin operations |
| `app` | `aa_stevens@shoestringvalley.com` | Passkey (BW) — interactive browser | App registrations |
| `domain` | `ACCO\da_stevens` | Password — unattended | Active Directory |
| `ra` | `ra_stevens@andersen-cost.com` | Password (BW: `DC_REMOTE_PASSWORD`) | Desktop Commander read-only PSRemoting |

```powershell
Get-SVHTierUsername -Tier server   # returns the correct username for that tier
Get-SVHTierUsername -Tier ra       # → ra_stevens@andersen-cost.com
```

### PSRemoting setup (one-time)

The on-prem modules reach Windows servers via PSRemoting from WSL. This requires a one-time trust setup — see `references/setup-winrm.md` for the exact steps.

### Desktop Commander PSRemoting account (ra_stevens)

Desktop Commander uses a separate minimal-privilege account (`ra_stevens`) for diagnostic PSRemoting — read event logs, query processes/services/network state, and read DHCP leases. It cannot modify anything. The account exists in AD and optionally as a local user on non-domain servers.

Create it with:

```powershell
.\setup-dc-remote-account.ps1 -DomainController ACCODC01 -DhcpServer ACCODHCP01
```

Store the generated password in the **SVH OpsMan** BW item (`DC_REMOTE_USER` / `DC_REMOTE_PASSWORD`), then export it in your WSL session:

```bash
export DC_REMOTE_PASSWORD=$(bw get password "DC Remote Account")
```

See `powershell/README.md` for full parameter reference and non-domain server setup.

### Cluster reboot orchestration

For rolling cluster reboots (draining nodes, rebooting one at a time, waiting for VMs to migrate back):

```powershell
# From Windows Terminal — connects to the cluster and runs the orchestration remotely
. ./Connect-ClusterReboot.ps1
```

The actual script (`rolling-cluster-reboot.ps1`) runs on the cluster server, not your workstation.

### 9.1 PowerShell TUI

The TUI is a terminal interface that wraps all 237 SVH module functions. It runs inside WSL on WezTerm. Instead of remembering function names and parameter syntax, you browse by module, fill a form, and the command is built for you. Destructive commands (Remove, Restart, Revoke, Reset, Block, Stop) require an explicit confirmation step before they execute.

#### Starting the TUI

```bash
# BW_SESSION must be set (same requirement as the MCP server)
export BW_SESSION=$(bw unlock --raw)

# From the repo root in WSL
tui/run-tui.sh
```

The TUI starts pwsh, dot-sources `connect.ps1`, and loads all SVH modules in the background. While that runs you can already browse functions. The status in the title bar shows when the session is ready.

#### Layout

```
┌──────────────────────┬──────────────────────────────────────────────────────┐
│  / Search functions… │  Get-SVHUser  [Read]  SVH.Entra                      │
│──────────────────────│  Get Entra ID user account details                   │
│  ▶ SVH.AD            │──────────────────────────────────────────────────────│
│  ▼ SVH.Entra         │  Identity *  [string]    ________________________     │
│      Get-SVHUser  ●  │──────────────────────────────────────────────────────│
│      Get-GuestUsers  │  Get-SVHUser -Identity "jdoe@shoestringvalley.com"   │
│      Get-UserMFA     │  [● Console] [○ Obsidian]          [▶ Run]           │
│  ▶ SVH.Exchange      │──────────────────────────────────────────────────────│
│  ▶ SVH.Azure         │  ❯ Get-SVHUser -Identity "jdoe@shoestringvalley.com" │
│  ▶ SVH.NinjaOne      │  displayName       : John Doe                        │
│  ▶ SVH.OnPrem        │  accountEnabled    : True                             │
│  ▶ SVH.UniFi         │  ...                                                 │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

- **Sidebar** — all 14 modules, collapsible. Search filters live as you type.
- **Detail panel** — synopsis, parameter form, editable command preview.
- **Output panel** — full command output. `Ctrl+L` clears it.

#### Risk colour coding

| Colour | Verb examples | Behaviour |
|--------|--------------|-----------|
| Green `[Read]` | Get, Test, Find | Runs immediately |
| Yellow `[Write]` | New, Set, Start, Enable | Runs immediately |
| Red `[⚠ Destructive]` | Remove, Restart, Reset, Revoke, Block, Stop | Requires confirmation dialog |

#### Output destinations

- **Console** — output stays in the TUI output panel.
- **Obsidian** — output is saved to `OpsManVault/Investigations/YYYY-MM-DD-FunctionName-HHMMSS.md` with proper frontmatter. The file name appears in the output panel when the save completes.

#### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+F` | Focus the search box |
| `Ctrl+R` | Run the current command |
| `Ctrl+L` | Clear the output panel |
| `Escape` | Blur the focused input |
| `Ctrl+Q` | Quit |

#### Command preview (editable)

The command preview input auto-builds from the parameter form. You can edit it directly before running — the form and preview are independent once you start typing in the preview box. This lets you add flags the form doesn't cover or paste a command from Claude's output.

#### Requirements

- `BW_SESSION` set (same as for the MCP server)
- `pwsh` — installed by `scripts/wsl-shell-setup.sh` (`sudo snap install powershell --classic`)
- Python 3 + `textual` package (`pip install textual`) — `scripts/setup.sh` handles this automatically

---

## 10. Customization guide

### Changing your identity / org

Edit `.claude/config.yaml`. This is the single source of truth for UPNs, group IDs, Planner plan IDs, and the Obsidian vault path. Skill files do not need to be touched when you change these values — they read from config at runtime.

```yaml
user:
  upn: you@yourdomain.com
  entra_id: <your-object-id>
  display_name: Your Name

planner:
  sysadmin: "<plan-id>"   # IT Sysadmin Tasks
```

### Adding a new MCP tool

1. Create `mcp-server/src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Import it in `mcp-server/src/index.ts` — add an env-based `enabled` flag, call register
3. Add credentials to the **SVH OpsMan** Bitwarden item
4. Run `npm run build` in `mcp-server/`
5. Add the tool name(s) to the `allowed-tools` frontmatter of any skill that should use it
6. Document in README.md

### Adding a new skill

Skills are markdown files. Create `.claude/skills/<name>/SKILL.md`. The frontmatter structure:

```yaml
---
name: my-skill
description: What this skill does in one sentence
allowed-tools:
  - mcp__svh-opsman__ninjaone_get_devices
  - mcp__obsidian__write_note
triggers:
  - "do the thing"
  - "run my skill"
---
# My Skill

[Skill instructions here — how Claude should approach the task, what tools to call, what format the output should take]
```

Claude loads skills on demand when a trigger phrase is matched. They cost no context until triggered.

### Disabling a skill

Rename `SKILL.md` to `SKILL.md.disabled`. Claude won't load it. IR Triage ships disabled this way.

### Personal overrides

`.claude/settings.local.json` is gitignored. Use it to add personal permissions or override project settings without affecting the shared config:

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
5. Document the module and its functions in `powershell/README.md`

### Adding a reference document

Reference docs in `references/` are auto-synced to `OpsManVault/References/` on every session start. Skills can read them via the Obsidian MCP. To add a new one:

1. Create the file in `references/`
2. Add it to the table in both `CLAUDE.md` and `README.md`
3. Add it to the `allowed-tools` or prompt of any skill that uses it

---

## 11. FAQ

**Q: The server isn't finding my credentials.**

`bw unlock` exports `BW_SESSION` in that shell only. If you opened a new terminal after unlocking, the new shell doesn't have it. Run `bwu` (the alias) or `export BW_SESSION=$(bw unlock --raw)` again. The session-start hook tells you if BW is locked.

---

**Q: Claude is calling tools but getting no data back.**

Check which service is failing. Common causes:
- Token expired — the MCP server caches OAuth tokens, but they expire. Restart the Claude Code session (which restarts the MCP server and triggers a fresh token fetch).
- Credentials not in Bitwarden — check `references/credentials.md` for which fields are still missing.
- Service is actually down — check M365 Admin → Service Health, or NinjaOne's status.

---

**Q: "BW_SESSION not set" in the status bar but I unlocked Bitwarden.**

The `BW_SESSION` variable must be exported in the shell that launched Claude Code. If you unlocked in a different terminal or set it without `export`, it won't be visible to child processes. Restart from a shell where you ran `export BW_SESSION=$(bw unlock --raw)`.

---

**Q: A Planner task got created when I just wanted a draft.**

This happens if Claude misread the request. The system is configured to require explicit confirmation ("push it", "go ahead", "create it") before writing to Planner. If this happened, it's likely you used phrasing that sounded like confirmation. For safety: always use "draft" explicitly when you want staging only.

---

**Q: The Obsidian MCP isn't finding my vault.**

Check two things:
1. The Local REST API plugin is enabled in Obsidian and the vault is open.
2. The API key in the `claude mcp add obsidian` command matches the key in the plugin settings. API keys regenerate each time you re-enable the plugin.

Verify:
```bash
curl -H "Authorization: ApiKey <your-key>" http://127.0.0.1:27123/
```

---

**Q: Can Claude access other people's mailboxes?**

No, by design. The server locks all mail and calendar calls to `GRAPH_USER_ID`. The ApplicationAccessPolicy on the app registration enforces this at Exchange level as well. Claude cannot read or send mail as another user.

---

**Q: Can I use this on a Mac or Linux workstation?**

Most of it works — Claude Code and the MCP server are Node.js. The PowerShell modules require PowerShell 7 (available on Linux/Mac). The WezTerm environment works on any platform. The main difference is the WSL layer doesn't exist — your paths and some WSL-specific aliases won't apply. Adjust `config.yaml` paths and the session-start hook for your environment.

---

**Q: The session-start hook is failing.**

Check `.claude/hooks/session-start.sh` is executable:
```bash
chmod +x .claude/hooks/session-start.sh
```

If the Obsidian vault path in the hook doesn't exist (e.g., you're not on the usual machine), the hook falls back to the cached state in `.claude/briefing-state`. This is expected — the hook is non-fatal.

---

**Q: How do I update the skills?**

Pull the repo and rebuild if the server changed:
```bash
git pull origin main
cd mcp-server && npm run build
```

Skills in `.claude/skills/` are just markdown files — changes are picked up immediately on the next session. No rebuild needed for skill-only changes.

---

**Q: Can I add my own trigger phrases?**

Yes — edit the skill's `SKILL.md` frontmatter to add phrases to the `triggers` list. Claude matches these fuzzy, so you don't need exact wording.

---

**Q: IR Triage is disabled — how do I enable it?**

```bash
mv .claude/skills/ir-triage/SKILL.md.disabled .claude/skills/ir-triage/SKILL.md
```

Enable it only when you're actively working an incident. It's the only skill that can send non-draft Teams messages — keep it off during normal operations to prevent accidental noise in the techs channel.

---

**Q: How do I reach a device at a remote SVH site from WSL?**

If Tailscale is running on your WSL box and the site has a UDM subnet router set up (see `references/tailscale-udm-setup.md`), you can reach any device at that site by IP — SSH, PSRemoting, ping — without any extra VPN client or firewall rule. The UDM advertises its local subnets into your tailnet.

If the UDM router isn't set up yet for that site, you need to either be on the local network or use an existing VPN.

---

**Q: The status bar shows "⚠ stale".**

The `status-refresh.sh` daemon isn't running. Start it:
```bash
wez-sync   # alias from bashrc.sh — starts the daemon
```

Or use `LEADER+u` to force a one-time refresh.

---

**Q: Can I run this without WezTerm?**

Yes. Everything works in Windows Terminal. You lose the status bar and the chord keybindings, but Claude Code, the MCP server, and all skills work identically. The `opsman` alias falls back gracefully.

---

**Q: Where do I find Planner plan IDs?**

```bash
# Ask Claude:
"What's the plan ID for IT Sysadmin Tasks?"
# Claude calls planner_list_plans and returns the IDs

# Or from the Planner URL:
# tasks.office.com/... — the plan ID is in the URL
```

Add new plan IDs to `.claude/config.yaml` under `planner:`.

---

**Q: Can Claude delete Planner tasks?**

No. `planner_delete_task` does not exist in the tool set. Mark tasks complete at 100% instead. This is intentional — deletion is irreversible and too easy to trigger accidentally.

---

## 12. Examples — real prompts and what happens

### Morning briefing

```
You: day starter

Claude: [calls NinjaOne for offline/alert summary, Wazuh for overnight alerts,
        Defender for open incidents, Planner for open tasks, Entra for risky users,
        MS Admin for service health]

        Writes Briefings/Daily/2026-05-16.md to Obsidian
        Prints: obsidian://open?vault=OpsManVault&file=Briefings%2FDaily%2F2026-05-16.md

You: [click the link → note opens in Obsidian]
```

---

### Server trouble

```
You: SVH-SQL01 is throwing disk errors, NinjaOne has alerts

Claude: [/troubleshoot loads automatically]
        Expected behavior: no disk errors
        Current behavior: NinjaOne disk alerts on SVH-SQL01

        Ranked hypotheses:
        1. Volume approaching capacity (cheapest to check — NinjaOne disk usage)
        2. S.M.A.R.T. failure on a physical drive (NinjaOne health status)
        3. CSV corruption if this is a Hyper-V host (Event Log 157, MPIO driver)

        [Calls NinjaOne, returns disk usage: C:\ 94% full]

        Root cause: C:\ is 94% full. Likely candidate: MABS temp files or SQL log growth.
        Next step: check what's consuming the space...

You: check what's using the space, specifically look for SQL logs and MABS

Claude: [Desktop Commander → PowerShell on SVH-SQL01 via PSRemoting]
        SQL log files: 48GB in D:\SQLLogs\ (TempDB log not auto-shrinking)
        MABS temp: 12GB in C:\Windows\Temp\

You: ok let's shrink that SQL log. what's the right command?

Claude: [drafts the DBCC SHRINKFILE command with the correct parameters]
        Here's the command — run it from SSMS or Desktop Commander:
        DBCC SHRINKFILE ('TempDB_log', 1024)
        ...
```

---

### Network issue

```
You: nobody at Site B can reach the file server

Claude: [/network-troubleshooter loads]
        [checks UniFi Cloud → Site B status: online]
        [checks UniFi Network → VLANs, inter-VLAN routing rules]
        [checks firewall rules for traffic from Site B VLAN to file server VLAN]
        
        Found: firewall rule "Block Site B to Server VLAN" is enabled — was
        it intentional? Last modified 2 hours ago by admin account.

You: definitely not intentional, who changed that?

Claude: [/tenant-forensics → Azure Activity Logs → Entra Audit]
        Rule modified at 14:32 by ma_stevens (from IP 192.168.10.45 — internal).
        No other suspicious activity around that time.

You: ok disable that rule and I'll deal with the account audit separately

Claude: I can't modify UniFi firewall rules directly — the UniFi tools are read-only.
        Here's the rule ID you need: rule_id=1047, name="Block Site B to Server VLAN"
        Disable it from the UniFi Network console at Settings → Firewall → LAN Rules.
```

---

### Investigating an alert

```
You: Wazuh just fired a level 12 alert on ACOPDXAPP01, authentication_failures

Claude: [pulls Wazuh alert details]
        Alert: 847 failed authentication attempts in 5 minutes on ACOPDXAPP01
        Source IPs: 203.0.113.47 (external) — all targeting Administrator account
        
        This looks like an RDP brute force. The Administrator account should be
        disabled — let me check...
        
        [checks NinjaOne → service state → RDP enabled, Administrator account active]
        
        Concern: Administrator is enabled on this host. Even if the password is strong,
        this is a higher-risk posture.

You: can you check if any of those attempts succeeded?

Claude: [Wazuh: checks for authentication_success events from same IPs in same window]
        No successful authentications from 203.0.113.47 in the last 30 minutes.
        The attempts stopped 3 minutes ago.

You: ok, let me disable the Administrator account and add a firewall rule. draft me
     a change record for this

Claude: [/change-record loads]
        [drafts CHG-2026-042 in Changes/ with scope, risk (low), test plan,
         rollback procedure, and timeline]
        obsidian://open?vault=OpsManVault&file=Changes%2FCHG-2026-042.md
```

---

### Prepping for a meeting

```
You: prep me for my 2pm with the network vendor

Claude: [/meeting-prep loads]
        [pulls calendar event: "Network vendor Q2 review — 2:00 PM, 1 hour, Brian Bates + vendor contacts"]
        [checks Fathom for previous calls with these attendees]
        [checks Confluence for open network documentation]
        [checks Planner for open tasks tagged to network/vendor]
        
        Brief:
        - Last call: 2026-03-14 — discussed ISP failover and VLAN segmentation at Site C
        - Open from that call: Fathom noted "vendor to send BGP config by end of March" — not found in email
        - Planner: 2 open tasks in Office Network Standardization board related to Site C
        - Suggested agenda: ISP failover status, BGP config follow-up, Site C VLAN rollout timeline
        
        [writes Meetings/2026-05-16-network-vendor-q2.md]
```

---

### Cleaning up a user complaint

```
You: /ticketsmith
[paste]
so basically sarah has been trying to print since tuesday and nothing works she said
she reinstalled the printer but still doesnt work and her manager is getting annoyed
she's in the portland office and uses the big HP on the second floor

Claude: 
Title: User unable to print to HP printer — Portland office, 2nd floor

Problem: User Sarah [last name needed] in the Portland office has been unable to print
since Tuesday, May 12. The issue persists after reinstalling the printer driver.

Printer: HP [model needed] — 2nd floor, Portland office

Impact: Individual user; manager escalating. Business impact: moderate.

Steps to reproduce:
1. Attempt to print any document from Sarah's workstation
2. Printer does not respond; no print job appears in queue

Suggested priority: Medium (3 business days elapsed, manager escalation)

Notes: Confirm printer model and Sarah's last name before filing.
```

---

*End of user guide.*
