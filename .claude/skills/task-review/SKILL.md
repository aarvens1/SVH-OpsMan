---
name: task-review
description: Full task triage across MS To Do and all Planner boards. Pulls everything fresh, organizes by urgency and owner, then supports bulk actions (close, reschedule, mark done). Trigger phrases: "task review", "let's bust out some tasks", "triage my tasks", "clear out tasks", "task triage".
when_to_use: Use when you want a comprehensive, interactive triage session across all open tasks — not for a daily briefing snapshot. Day Starter gives a task summary; this skill is for acting on them.
allowed-tools: "mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_update_task mcp__svh-opsman__todo_create_task mcp__svh-opsman__todo_get_task mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_buckets mcp__svh-opsman__planner_update_task mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_get_task mcp__svh-opsman__planner_get_task_details mcp__svh-opsman__ninja_set_maintenance_mode mcp__desktop-commander__write_file mcp__desktop-commander__edit_block"
---

# Task Review

Interactive triage session across MS To Do and all Planner boards. Pull everything fresh, organize by urgency, ask triage questions, then execute bulk actions.

## Step 1 — Pull all task sources in parallel

**Critical:** Use `user.entra_id` from config (the object ID) for all To Do calls — NOT the UPN. The UPN returns HTTP 403 from the To Do API.

Fire in parallel:
- `todo_list_task_lists` (user_id: entra_id from config)
- `planner_list_tasks` (plan_id: config.planner.sysadmin) — IT Sysadmin Tasks
- `planner_list_tasks` (plan_id: config.planner.recurring) — IT Recurring Tasks
- `planner_list_tasks` (plan_id: config.planner.management) — IT Management Tasks

Immediately after To Do lists resolve, fire parallel reads for all returned lists:
- `todo_list_tasks` (user_id: entra_id, list_id: each, open_only: true)

**Project boards** — include by default unless the user scopes down:
- `planner_list_tasks` (plan_id: config.planner.office_network)
- `planner_list_tasks` (plan_id: config.planner.bdr_testing)
- `planner_list_tasks` (plan_id: config.planner.isp)
- `planner_list_tasks` (plan_id: config.planner.cmmc_l1)
- `planner_list_tasks` (plan_id: config.planner.copilot_audit)

**Large response handling:** Planner boards routinely return 100k–300k chars. If a board response exceeds the context limit and is saved to a file, use a subagent (Agent tool) to parse it. Instruct the subagent to slice the file in ~80,000-char spans and return a table: Title | Due | % complete | Assigned to me (true/false, where "me" = user.entra_id from config). Keep subagent output out of main context — summarize it here.

## Step 2 — Organize

A task is "yours" if `user.entra_id` appears in its assignments object. Unassigned tasks on team boards are team-owned, not yours.

Build five buckets:

**A — Overdue (yours):** assigned to you, dueDateTime is in the past  
**B — Due today or tomorrow (yours)**  
**C — Due this week / in-flight (yours):** due within 7 days, OR percentComplete ≥ 50% regardless of due date  
**D — No due date (yours)**  
**E — Team tasks:** not assigned to you — surface for awareness, not action  

Also flag **Stale/suspect** candidates separately:
- Recurring board tasks overdue by > 14 days
- Tasks with no body, no assignment, and no due date created > 60 days ago
- Tasks that look like garbled voice input or personal reminders that don't belong on IT boards

## Step 3 — Present

Show buckets A–D as tables: `| Task | Board | Due | % |`  
Show bucket E collapsed — count by board, not full list, unless asked.  
Show stale/suspect as a flat list with ages.

Keep the presentation tight. Don't narrate — tables only.

After presenting, ask these triage questions in one block:
1. Which items are already done and just need marking complete?
2. Which are stale/no-longer-relevant and should be dismissed?
3. Any due dates to push out?
4. Any quick actions to fire right now (e.g., NinjaOne maintenance mode)?

## Step 4 — Execute

After triage answers, batch the updates. Confirm before firing:
> "Marking N items complete, dismissing M, updating X due dates — go ahead?"

Then execute in parallel:
- `todo_update_task` — set status "completed" for done To Do items
- `planner_update_task` — set percentComplete 100 for done Planner items, or update dueDateTime for reschedules
- `ninja_set_maintenance_mode` — for any NinjaOne device actions surfaced

## Step 5 — Optional note

Only write a note if the user explicitly asks for a record. If so, append a brief summary to `Briefings/Daily/YYYY-MM-DD.md` in the `# Activity Log` section using the `edit_block` / `<!-- DAY-STARTER-END -->` sentinel pattern from the obsidian-output rules. Keep it to: N closed, N rescheduled, still-open count.
