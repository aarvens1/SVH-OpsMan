---
name: week-ender
description: Thursday end-of-day weekly wrap-up. What shipped, what slipped, seeds for next week, and an optional summary draft for a manager or team. Trigger phrases: "week ender", "wrap up the week", "Thursday EOD", "weekly wrap".
when_to_use: Use at the end of the work week (Thursday) to close out cleanly and set up Monday.
allowed-tools: "mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__calendar_list_events mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__confluence_search_pages mcp__obsidian__* mcp__time__*"
---

# Week Ender

## Time window

This week (Monday through now).

## Step 1 — What happened this week

Run in parallel:
- `planner_list_tasks` — tasks completed this week vs. still open.
- `todo_list_tasks` — personal task completion.
- `calendar_list_events` — what meetings happened, which recurred.
- `wazuh_search_alerts` / `mde_list_alerts` — notable security events this week.
- `ninja_list_all_backups` — backup status for the week.

Also read any `Incidents/Active/` notes from Obsidian created this week.

## Step 2 — What slipped

Items that were due this week and are still open. Assess: Is this a priority slip, a scope change, or a blocker?

## Step 3 — Write retrospective to Obsidian

Append a **Week Ender** section to `Briefings/Weekly/YYYY-WW.md` (or create if it doesn't exist):

```markdown
## Week Ender — Thursday

### ✅ Shipped this week
### 🔄 Slipped to next week (with reason)
### 🌱 Seeds for next week
### 📝 Summary draft (optional)
```

The **summary draft** (for a manager or team update) goes at the bottom, clearly labelled as a draft, if the user asks for one. Draft it in Aaron's voice following the `aaron-voice` rules — use the register matrix to pick the right tone (internal leadership vs. cross-functional group), pick the right opener/closer from the tables, and run the self-check before presenting. Nothing gets sent without explicit instruction.

Optionally stage as a Confluence draft if the user asks.
