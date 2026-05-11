---
name: day-starter
description: Morning briefing. Covers the last 24 hours of alerts, tasks, calendar, and open threads — or last 72 hours if today is Monday (picks up the full weekend). Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__obsidian__* mcp__time__*"
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
- `planner_list_plans` (IT Team group: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) then `planner_list_tasks` for the active operational plans: IT Sysadmin Tasks, IT Support Tasks, IT Recurring Tasks, IT Endpoint Tasks, IT Management Tasks, and any plans created within the last 30 days.
- `todo_list_task_lists` then `todo_list_tasks` — personal task lists, anything flagged important or due today.

### Separating your tasks from team tasks

When processing Planner results, split tasks into two buckets:

**Your tasks** — tasks where the `assignments` object contains Aaron's Entra object ID. To identify Aaron's ID at runtime: look at the `createdBy.user.id` field on tasks in IT Sysadmin Tasks or IT Recurring Tasks (plans Aaron owns). That creator ID is Aaron's object ID. Any task with that ID as an assignment key belongs in "your tasks."

**Team tasks** — all other open tasks from IT boards (unassigned, or assigned to someone else). Show these as a compact reference section — titles and owners only, no detailed breakdown unless overdue.

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

### 📋 Your tasks
Tasks assigned directly to Aaron — Planner and To Do items. Due today or overdue first, then upcoming. Suggested priority order.

### 📋 IT team boards
Compact view of open tasks across IT plans that are assigned to others or unassigned. Group by plan. Overdue items only get a full row; everything else is a one-liner. This is context, not a to-do list.

### 🟡 Worth watching
Medium-severity findings, anything that could escalate. No action required yet.

### 💡 Suggested next moves
2–3 concrete recommendations (e.g., "Dismiss risky user X after reviewing sign-in logs", "Prep agenda for 2pm call").

Planner update suggestions and reply drafts go at the bottom, clearly labelled as drafts. Nothing changes or sends without explicit user confirmation.
