---
name: day-starter
description: Morning briefing. Covers the last 24 hours of alerts, tasks, calendar, and open threads — or last 72 hours if today is Monday (picks up the full weekend). Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__confluence_search_pages mcp__obsidian__* mcp__time__*"
---

# Day Starter

## Time window

Call `mcp__time__*` to get the current date and day of week. If today is Monday, look back 72 hours (covers the full weekend). All other days: 24 hours.

## Step 1 — Security & monitoring

Run these in parallel:

- `wazuh_search_alerts` — query last N hours, severity ≥ medium. Note rule IDs, agent names, and alert counts.
- `ninja_list_servers` first to enumerate all server device IDs across all organizations, then run `ninja_list_device_alerts` in parallel for every returned device ID. Do not use a hardcoded list — always discover dynamically. Also check inbox for NinjaOne alert emails to catch anything not covered by the device-level queries.
- `mde_list_alerts` — Defender alerts. Flag High/Critical severity.
- `entra_list_risky_users` — any users currently flagged as risky.
- `admin_list_service_incidents` — active M365 service incidents.
- `unifi_list_sites` — check all sites for offline devices, critical notifications, and WAN issues. Flag any site where `offlineDevice > 0`, `criticalNotification > 0`, or `wanDowntime: true`. Note the ISP name and client counts to help identify the location, since site names come back as "Default" — cross-reference by gateway MAC or IP if needed.

## Step 1b — Compliance gap (Mondays only)

On Mondays, include this note verbatim in the Obsidian briefing under **🔴 Needs attention now** (or **🟡 Worth watching** if no critical items were found in Step 1):

> **Run weekly compliance gap scan** — open a PowerShell terminal and run:
> ```powershell
> . ./connect.ps1
> Get-SVHComplianceGap | Format-Table Category, Finding, Detail -AutoSize
> ```
> Checks: MFA gaps, guest users, stale Intune devices (30+ days), disconnected Wazuh agents, licensed-but-disabled users.

Do NOT attempt to run this as an MCP tool — `Get-SVHComplianceGap` is a PowerShell module function, not an MCP-exposed endpoint. Just surface the reminder.

## Step 2 — Tasks & calendar

Run these in parallel:

- `calendar_list_events` — today's events. Note any meetings in the next 2 hours and any prep required.
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — all Planner tasks assigned to Aaron across every plan. This is the primary source for **Your tasks**.
- `planner_list_plans` (IT Team group: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) to catch any newly created plans, then `planner_list_tasks` for the known operational boards:
  - IT Sysadmin Tasks: `-aZEdilGAUqLC8B8GwOLfmQAAh9M`
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`

  Also pull `planner_list_tasks` for active project boards and surface them in the **Projects** section (not IT team boards):
  - Office Network Standardization: `E4PruQekE0K25KH40pWa9WQAAfAr`
  - BDR Testing: `lJQrriNYnUuLKm5u485GX2QAE_WS`
  - Information Security Program (ISP): `2es7HS5UakyP3K6ZkwRfd2QAF3I_`
  - CMMC Level 1: `qxQKzAEGd0m3Q6EUysaGVmQADbmg`
  - Copilot Audit for IT team: `wP9PL7YWCEqGbG6o4aYVT2QADaLq`

  This is the source for **IT team boards** and **Projects**.
- `todo_list_task_lists` then `todo_list_tasks` — personal To Do task lists, anything open or due today.
- `mail_search` — unread or high-importance messages from the last N hours. Focus on external senders, anything flagged, or subjects suggesting action. Skip routine system notifications.
- `teams_list_messages` — unread DMs and @mentions from the last N hours. Check the IT Team channels for anything requiring action. Focus on direct messages to Aaron and threads where he's mentioned; skip high-volume notification channels.
- `confluence_search_pages` — search for pages modified in the last N hours in active global spaces (INF, PROC, POL, SITE). Flag anything that looks like a new incident document, outage note, policy change, or major runbook update. Skip personal and archived spaces.

### Separating your tasks from team tasks

**Your tasks** — two sources, combined and de-duplicated:
1. All results from `planner_get_user_tasks` (tasks assigned to Aaron by user ID, across all plans including personal board)
2. Tasks from `planner_list_tasks` where the Planner label (`appliedCategories`) matches "Aaron" in that plan's category definitions — move these into Your Tasks, do not leave them in IT team boards

Include To Do items alongside Planner tasks. Show due-today and overdue first, then upcoming.

**IT team boards** — tasks from `planner_list_tasks` that are NOT in Your Tasks (not assigned to Aaron, not tagged with his name). Group by plan. Overdue items get a full row; everything else is a one-liner. This is context, not a to-do list.

**Projects** — whole Planner boards representing a project initiative rather than an operational queue (e.g. "Office Network Standardization"). Definition is TBD — for now, call these out by plan name when you encounter them but do not mix them into IT team boards. Aaron's current priority project is **Office Network Standardization**.

## Step 3 — Synthesise and write

Write `Briefings/Daily/YYYY-MM-DD.md` to the Obsidian vault at `/mnt/c/Users/astevens/vaults/OpsManVault/` with frontmatter:
```yaml
---
date: YYYY-MM-DD
skill: Day Starter
status: draft
tags: [briefing, daily]
---
```

Structure the note:

### 🔴 Needs attention now
Any Critical/High alerts, risky users, active M365 incidents, or overdue tasks. One bullet per item with source and recommended action.

### 📅 Today
Calendar events in time order. Flag any meeting that needs prep.

### 📨 Mail
Unread or high-importance messages from the last N hours needing action. External senders and flagged items first. Skip routine system notifications.

### 💬 Teams
Unread DMs and @mentions from the last N hours. Check the IT Team channels for anything requiring action. Focus on direct messages to Aaron and threads where he's mentioned. Skip high-volume notification channels. If nothing actionable: state "No unread DMs or @mentions."

### 📋 Your tasks
Tasks assigned to Aaron (by user ID or Planner label) across all plans and personal board, plus To Do items. Due today or overdue first, then upcoming.

### 🗂 Projects
Active project-type Planner boards (e.g. Office Network Standardization). Call out open tasks or milestones — keep separate from operational team boards. Definition TBD.

### 📋 IT team boards
Open tasks from IT plans that Aaron isn't assigned to or tagged on. Group by plan. Overdue items only get a full row; everything else is a one-liner. Context only.

### 🟡 Worth watching
Medium-severity findings, anything that could escalate. No action required yet.

### 💡 Suggested next moves
2–3 concrete recommendations (e.g., "Dismiss risky user X after reviewing sign-in logs", "Prep agenda for 2pm call").

### 🖥 Infrastructure status

**Always include this section — even when everything is clean.** A clean result is still useful signal. Do not skip or merge this into other sections.

**NinjaOne — All servers**
1. Call `ninja_list_servers` to get all server device IDs across all organizations.
2. Run `ninja_list_device_alerts` in parallel for every returned device ID.
3. Show a table grouped by organization (org name from `ninja_list_servers`). Columns: Device name, Device ID, Status. If no active alerts: ✅ Clean. If alerts exist: list them inline. Always show every server regardless of status — a clean result is still useful signal.

**UniFi — All sites**
Show a table with one row per site. Columns: **Site name**, ISP, Wifi clients, Wired clients, Total devices, Offline, Alert.

Site names: UniFi Cloud returns all sites as `name: "default"` and `desc: "Default"` — this is a Cloud limitation. Cross-reference by gateway MAC and ISP using the known site name table below. If a site MAC is not in the table, label it as "Unknown (MAC: xx:xx:xx:xx:xx:xx)" so it can be identified and added.

**Known site name table — cross-reference by `wans.WAN.externalIp`:**
| WAN IP | Gateway MAC | Site name |
|--------|-------------|-----------|
| 96.18.48.186 | ac:8b:a9:6c:2b:d5 | BOI-Main Office |
| 24.119.221.58 | d8:b3:70:4f:66:cf | BOI-Warehouse |
| 216.115.11.190 | d8:b3:70:59:f1:d0 | EUG-Main Office |
| 69.9.133.37 | 0c:ea:14:6e:9c:e9 | EUG-Warehouse |
| 50.109.229.58 | d8:b3:70:36:c6:31 | FGT-Main Office 2 |
| 50.155.66.230 | 8c:30:66:b2:36:09 | KP trailer |
| 73.67.183.144 | 70:a7:41:ac:65:cf | PDX-Kaiser Warehouse |
| 50.227.115.162 | e4:38:83:83:a0:89 | PDX-MAIN Office |
| 50.222.10.170 | e4:38:83:83:9f:c9 | SEA-Main Office |
| 173.160.252.90 | d0:21:f9:d9:7e:7f | SEA-WAREHOUSE |
| 50.145.204.110 | 0c:ea:14:d6:b1:b5 | SVH-Main Office |
| 50.188.182.109 | d8:b3:70:99:f5:df | SYL-Main Office |
| 67.169.216.157 | 6c:63:f8:a2:79:69 | Unknown — needs ID |

Notes:
- PDX Kaiser Suite 230 (10.1.10.179) and NVR appliances (PDX-MAINOFFICE-NVR, SEA-MAIN OFFICE-NVR, SEA-WAREHOUSE-NVR) have internal IPs and will not appear in `unifi_list_sites` results.
- Use `wans.WAN.externalIp` (not gateway MAC) as the primary lookup key — it's easier to match visually.

Flag any row where offlineDevice > 0, criticalNotification > 0, or wanDowntime: true on the primary WAN. Note: WAN2 showing `wanDowntime` with count=288 is a persistent pattern for offline secondary/failover links — do not flag it as an active incident; note it once at the bottom of the table.

**Confluence — Recent changes**
List any pages in INF, PROC, POL, SITE modified in the last N hours that look like incident docs, outage notes, policy changes, or runbook updates. If nothing matches: state "No pages modified in the last N hours in INF/PROC/POL/SITE."

### 📝 Draft Planner actions

Always include this section. Nothing is created or changed until Aaron explicitly confirms. Format each task as an editable named subsection — Aaron can change any field in place, then say "push these to Planner."

Default destination for new tasks:
- **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`) — operational/sysadmin follow-ups, security findings, infrastructure issues
- **Personal To Do** — smaller personal action items not appropriate for the team board

**CREATE format** (one subsection per task):

```
#### CREATE — [task title]
- **Plan:** [plan name]
- **Due:** YYYY-MM-DD
- **Assigned:** Aaron Stevens
- **Notes:** [1–2 sentences of context from the finding that triggered this]
- **Checklist:**
  - [ ] [concrete investigation or resolution step]
  - [ ] [step 2]
  - [ ] [step 3]
  - [ ] [step 4]
  - [ ] [step 5]
```

**UPDATE format** (one subsection per task):

```
#### UPDATE — "[existing task title]"
- **Plan:** [plan name]
- **Change:** [what to update: new due date / set percent complete / new assignee / etc.]
- **Notes:** [optional — reason for the update]
```

Every CREATE must include at least 3–5 checklist steps specific to the alert or finding — not generic placeholders. Err on the side of more suggestions rather than fewer.
