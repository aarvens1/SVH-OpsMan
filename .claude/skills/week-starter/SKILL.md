---
name: week-starter
description: Monday morning weekly briefing. Last week's loose ends plus this week's load — what closed, open threads, upcoming calendar and tasks, anything stale that needs a nudge, and a suggested first move. Trigger phrases: "week starter", "what does the week look like", "weekly briefing".
when_to_use: Use at the start of the work week (Monday) for a broader picture than the daily briefing.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_list_expiring_secrets mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_all_backups mcp__obsidian__* mcp__time__*"
---

# Week Starter

## Time window

- **Last week** (past 7 days): look back for anything unresolved.
- **This week**: calendar, tasks, and any scheduled maintenance.

## Step 1 — Last week's state

Run in parallel:
- `planner_list_tasks` — tasks from last week still open or overdue.
- `todo_list_tasks` — any uncompleted personal tasks.
- `wazuh_search_alerts` / `mde_list_alerts` — unresolved alerts from the past 7 days.
- `entra_list_risky_users` — open risky user flags.
- `ninja_list_all_backups` — any failed backups from last week.

## Step 2 — This week's load

Run in parallel:
- `calendar_list_events` — this week's full calendar. Flag heavy days and anything needing prep.
- `planner_list_tasks` — tasks due this week.
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
1. **Carrying over from last week** — open items with recommended disposition (close, escalate, reassign)
2. **This week's calendar** — day-by-day summary, prep flagged
3. **Tasks due this week** — prioritised list
4. **Things to watch** — expiring secrets, pending patches, stale alerts
5. **Suggested first move** — single most important thing to tackle Monday
