---
name: week-starter
description: Monday morning weekly briefing. Last week's loose ends plus this week's load — what closed, open threads, upcoming calendar and tasks, anything stale that needs a nudge, and a suggested first move. Trigger phrases: "week starter", "what does the week look like", "weekly briefing".
when_to_use: Use at the start of the work week (Monday) for a broader picture than the daily briefing.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_list_expiring_secrets mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_all_backups mcp__obsidian__* mcp__time__*"
---

# Week Starter

## Time window

- **Last week** (past 7 days): look back for anything unresolved.
- **This week**: calendar, tasks, and any scheduled maintenance.

## Step 1 — Last week's state

Run in parallel:
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — Aaron's tasks still open. Primary source for his task list.
- `planner_list_plans` (IT Team group: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) to catch any newly created plans, then `planner_list_tasks` for the known operational boards:
  - IT Sysadmin Tasks: `-aZEdilGAUqLC8B8GwOLfmQAAh9M`
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`

  Also pull `planner_list_tasks` for project boards (surface in Projects section, not team boards):
  - Office Network Standardization: `E4PruQekE0K25KH40pWa9WQAAfAr`
  - BDR Testing: `lJQrriNYnUuLKm5u485GX2QAE_WS`
  - Information Security Program (ISP): `2es7HS5UakyP3K6ZkwRfd2QAF3I_`
  - CMMC Level 1: `qxQKzAEGd0m3Q6EUysaGVmQADbmg`
  - Copilot Audit for IT team: `wP9PL7YWCEqGbG6o4aYVT2QADaLq`
- `todo_list_task_lists` then `todo_list_tasks` — any uncompleted personal tasks.
- `wazuh_search_alerts` / `mde_list_alerts` — unresolved alerts from the past 7 days.
- `entra_list_risky_users` — open risky user flags.
- `ninja_list_all_backups` — any failed backups from last week.

### Separating your tasks from team tasks

**Your tasks** — two sources, combined and de-duplicated:
1. All results from `planner_get_user_tasks` (assigned to Aaron by user ID, across all plans including personal board)
2. Tasks from `planner_list_tasks` where the Planner label (`appliedCategories`) matches "Aaron" in that plan's category definitions — move these into Your Tasks

Include To Do items. Show overdue first, then this week, then upcoming.

**IT team boards** — tasks from `planner_list_tasks` NOT in Your Tasks (not assigned to Aaron, not tagged). Group by plan. Overdue items get a full row; everything else is a one-liner.

**Projects** — whole Planner boards representing a project initiative (e.g. "Office Network Standardization"). Do not mix into IT team boards. Aaron's current priority project is **Office Network Standardization**.

## Step 2 — This week's load

Run in parallel:
- `calendar_list_events` — this week's full calendar. Flag heavy days and anything needing prep.
- `mail_search` — unread or high-importance messages from the past 7 days needing action. External senders and flagged items first.
- `ninja_list_pending_patches` — patches pending across all devices.
- `entra_list_expiring_secrets` — app secrets expiring within 30 days.
- `admin_list_service_incidents` — any active M365 incidents carrying over.

## Step 3 — Write to Obsidian

Write `Briefings/Weekly/YYYY-WW.md`:

```yaml
---
date: YYYY-MM-DD
skill: Week Starter
status: draft
tags: [briefing, weekly]
---
```

Sections:
1. **🔴 Needs attention now** — unresolved alerts, risky users, active incidents carrying over from last week
2. **📅 This week's calendar** — day-by-day summary, heavy days flagged, anything needing prep
3. **📨 Mail** — unread or high-importance messages from the past week needing action
4. **📋 Your tasks** — tasks assigned to Aaron (by user ID or Planner label) + To Do items. Overdue first, then due this week, then upcoming
5. **🗂 Projects** — active project-type Planner boards (e.g. Office Network Standardization). Open milestones or blockers, separate from operational boards
6. **📋 IT team boards** — open tasks from IT plans Aaron isn't on. Group by plan. Context only
7. **🟡 Things to watch** — expiring secrets, pending patches, stale alerts, anything that could escalate
8. **💡 Suggested first move** — single most important thing to tackle Monday
