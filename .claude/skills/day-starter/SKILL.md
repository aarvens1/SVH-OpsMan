---
name: day-starter
description: Morning briefing. Covers the last 24 hours of alerts, tasks, calendar, and open threads — or last 72 hours if today is Monday (picks up the full weekend). Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__obsidian__* mcp__time__*"
---

# Day Starter

## Time window

Call `mcp__time__*` to get the current date and day of week. If today is Monday, look back 72 hours (covers the full weekend). All other days: 24 hours.

## Step 1 — Security & monitoring

Run these in parallel:

- `wazuh_search_alerts` — query last N hours, severity ≥ medium. Note rule IDs, agent names, and alert counts.
- `ninja_list_device_alerts` — open alerts on all devices. Flag anything Critical or Warning.
- `mde_list_alerts` — Defender alerts. Flag High/Critical severity.
- `entra_list_risky_users` — any users currently flagged as risky.
- `admin_list_service_incidents` — active M365 service incidents.

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

Planner update suggestions and reply drafts go at the bottom, clearly labelled as drafts. Nothing changes or sends without explicit user confirmation.
