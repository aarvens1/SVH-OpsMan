# SVH OpsMan — Roadmap

Ideas and evolution tracks discussed as of 2026-05-16. Not a commitment list — a reference for what comes next and why.

---

## Track 1: From pull to push

Right now every skill is human-triggered. Claude fetches data when you ask. The next version shifts that: data is collected before you open Claude, and critical events surface without you having to ask.

### Pre-aggregation script for day-starter
A script (shell or Node) that runs before you open Claude — wired into the session-start hook on weekday mornings. Calls NinjaOne, Wazuh, Defender, Entra, M365 health, Planner, and Calendar APIs and writes a single staging JSON to the vault. Day-starter reads the file and skips all the fetching, jumping straight to synthesis.

**What to pre-fetch:** offline/alerting NinjaOne devices, Wazuh alerts ≥ medium (last 24h, 72h on Monday), Defender High/Critical alerts, Entra risky users, M365 service health, Planner tasks assigned to Aaron, today's calendar events.

**Estimated saving:** 10–15 tool calls and their associated latency eliminated per morning.

### Webhook receiver for alert-driven sessions
NinjaOne and Wazuh can both POST webhooks on alert conditions. A lightweight receiver (n8n, Make, or a small Node process) queues incoming events. Day-starter reads the queue instead of polling — the session opens with "here's what happened since you were last here" rather than Claude having to go find out.

### PowerShell → vault pipeline
Add an `Export-SVHToVault` pattern to the PS modules. Functions like `Get-SVHComplianceGap` write their output directly to `OpsManVault/References/` as JSON. The Monday compliance reminder becomes a live file read instead of a manual terminal step. Same pattern for MABS job state, cluster health, and any other on-prem data that currently requires a manual PS run.

---

## Track 2: Obsidian as a live ops database

Right now Obsidian is a write-only output sink. With Obsidian Bases + consistent frontmatter, it becomes a queryable ops control center that's automatically current because Claude maintains it.

### Bases to set up
| Base | Source folder | View | Key fields |
|------|--------------|------|-----------|
| Incident Tracker | `Incidents/**` | Kanban by `status` | `severity`, `incident_id`, `date` |
| Change Calendar | `Changes/**` | Calendar by `change_date` | `risk`, `change_id`, `window` |
| Vulnerability Pipeline | `Vulnerabilities/**` | Table sorted by `priority` | `cve`, `priority`, `date` |
| Asset Registry | `Assets/**` | Table | `asset_type`, `date` (last investigated) |
| Review Queue | `Reviews/**` | Table filtered to `status: draft` | `skill`, `date` |
| Briefing History | `Briefings/Daily/**` | Calendar | `status`, `has_pending_tasks` |

### Frontmatter additions needed
A few new fields unlock the Bases above. Skills need to write these:
- `change_date: YYYY-MM-DD` on change notes (clean date separate from the `window` text field)
- `asset_type: server|workstation|user` on asset notes
- `has_pending_tasks: true|false` on briefing notes where draft Planner actions weren't pushed

### Obsidian templates
Store skeleton note structures in `OpsManVault/Templates/`. Skills create notes from the template rather than generating full structure from scratch. Claude writes content into pre-built sections — less output per run, more consistent structure, and you can adjust layouts by editing the template without touching SKILL.md.

Highest-value templates: Day Starter, Incident, Change Record, Asset Investigation. Day Starter runs every workday and generates the most scaffolding.

---

## Track 3: Closing the action loop

Right now Claude stages everything for explicit confirmation. The right next step is distinguishing between operations by risk level rather than treating them all the same.

### Tiered confirmation model
| Tier | Operations | Confirmation |
|------|-----------|-------------|
| Always confirm | Send Teams/mail, create Planner tasks, dismiss risky users, any write to external systems | Explicit per-session ("push it", "go ahead") |
| Lightweight confirm | Mark Planner task 100% complete, update Confluence page, file an Obsidian note | Single "yes" or approve in-line |
| Autonomous | Update briefing state file, sync references to vault, write Obsidian drafts | No confirmation needed |

### Re-enable IR Triage
IR Triage (`SKILL.md.disabled`) is the only skill that can send non-draft Teams messages. It stays disabled until the data layer and action staging are solid enough to trust for incident response. That point is close — re-enable when the tiered confirmation model is in place.

---

## New integrations worth adding

| Integration | Why | Effort |
|-------------|-----|--------|
| **Ticketing system** (Freshservice, Zendesk, etc.) | TicketSmith currently ends at copy-paste. If SVH uses any ITSM with an API, close the loop. | Medium — depends on platform |
| **Have I Been Pwned** | Check if `shoestringvalley.com` or `andersen-cost.com` accounts appear in breach data. Free API, trivial to add. | Tiny |
| **Cloudflare** | DNS, WAF events, cert expiry, analytics — if any SVH services sit behind Cloudflare. | Small |
| **Azure Monitor / Log Analytics** | Azure ARM access is in place but no Log Analytics query tool. Application and resource logs that aren't in Wazuh. | Small |
| **n8n / Make** | Webhook orchestration layer — receives NinjaOne/Wazuh/Defender events and queues them for day-starter. | Medium |

---

## File transfer

For pulling files from managed systems into WSL for analysis.

**Tailscale** — install on WSL (via the Windows host), all Windows servers, and any Linux boxes. They get stable private IPs reachable from each other regardless of NAT. SSH, SCP, and RDP all work to the Tailscale IP without firewall rules. Replaces the need for reverse SSH tunnels for Linux targets. Free up to 100 devices.

**Croc** — one-off P2P file drops. `croc send logfile.evtx` on the remote, `croc <code>` on WSL. No accounts, works through NAT, end-to-end encrypted. `winget install schollz.croc` on Windows, `apt install croc` on Linux.

**Copy-Item over PSRemoting** — already available via `SVH.OnPrem`. Use for pulling Windows event logs and config files without additional tooling:
```powershell
$s = New-PSSession -ComputerName SVH-SQL01 -Credential (Get-SVHTierCredential -Tier server)
Copy-Item -Path "C:\path\to\file" -Destination ~/landing/ -FromSession $s
```

---

## Sequencing

| Phase | Work | Unlock |
|-------|------|--------|
| **Now** | Obsidian templates for Day Starter + Incident | Reduces per-run output, enforces Bases schema |
| **Now** | Add `change_date`, `asset_type`, `has_pending_tasks` frontmatter fields to skills | Unlocks all five Bases views |
| **Soon** | Pre-aggregation script wired into session-start | Day-starter becomes near-instant |
| **Soon** | Have I Been Pwned integration | Quick win, real security value |
| **Soon** | Tailscale + Croc for file transfer | Closes the investigate → pull logs → analyze loop |
| **Later** | Webhook receiver (n8n or similar) | Shifts briefings from pull to push |
| **Later** | PowerShell → vault pipeline (`Export-SVHToVault`) | Eliminates remaining manual PS steps |
| **Later** | Tiered confirmation model | Reduces friction on low-risk actions |
| **Last** | Re-enable IR Triage | Requires tiered confirmation + stable data layer |
