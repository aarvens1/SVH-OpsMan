---
name: day-ender
description: End-of-day wrap-up. Covers the last 12 hours — what got done, what's still open, anything that needs a handoff note or follow-up before tomorrow. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__calendar_list_events mcp__obsidian__* mcp__time__*"
---

# Day Ender

## Time window

Last 12 hours.

## Step 1 — What's still open

Run in parallel:
- `planner_list_tasks` — anything that was In Progress or not started today, still open.
- `todo_list_tasks` — unchecked items from today's lists.
- `wazuh_search_alerts` / `mde_list_alerts` — any unresolved alerts from the day.
- `entra_list_risky_users` — any still-open risky users.

## Step 2 — Read today's note

Read `Briefings/Daily/YYYY-MM-DD.md` from Obsidian to understand what was flagged this morning.

## Step 3 — Append to today's note

Append an **End of Day** section to `Briefings/Daily/YYYY-MM-DD.md`:

```markdown
---
## End of Day — HH:MM

### ✅ Closed today
- Item 1
- Item 2

### 🔄 Still open
- Item + suggested next action

### 📨 Before tomorrow
- Anything needing a handoff note, follow-up message, or Planner update

### 🌅 First move tomorrow
- Single highest-priority item to tackle first thing
```

Suggested follow-up messages and Planner updates go at the bottom as clearly-labelled drafts. Nothing sends without the user saying so.
