---
name: week-starter
description: Monday morning weekly briefing. Last week's loose ends plus this week's load — what closed, open threads, upcoming calendar and tasks, anything stale that needs a nudge, and a suggested first move. Trigger phrases: "week starter", "what does the week look like", "weekly briefing".
when_to_use: Use at the start of the work week (Monday) for a broader picture than the daily briefing.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_list_expiring_secrets mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_all_backups mcp__obsidian__* mcp__time__*"
---

# Week Starter

## Time window

### Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp.
2. Check whether the user specified an explicit override:
   - **"reset"** or **"default"**: skip the state file. Use 7 days. Write current timestamp to state after the run.
   - **"last N days/hours"** / any explicit range: use that window. Write current timestamp to state after the run.
3. If no override, read `System/briefing-state.md` from the Obsidian vault:
   - If `last_week_ender` is present: set the lookback to `now − last_week_ender`. Log "Anchoring to last Week Ender (TIMESTAMP)" in the note.
   - If `last_week_ender` is absent but `last_week_starter` is present and ≤ 10 days ago: set the lookback to `now − last_week_starter`.
   - If neither is present or both are stale: fall back to 7 days. Log "No recent weekly state — using 7-day default" in the note.
4. Use the computed window as **N days** in all data queries below.

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
- `wazuh_search_alerts` / `mde_list_alerts` — unresolved alerts from the last N days.
- `entra_list_risky_users` — open risky user flags.
- `ninja_list_all_backups` — any failed backups in the last N days.
- `ninja_list_servers` — enumerate all servers across all organizations, then run `ninja_list_device_alerts` in parallel for every returned device ID. Show results grouped by org in the Infrastructure status section.
- `unifi_list_sites` — full site health snapshot.
- `confluence_search_pages` — pages modified since the lookback start in INF, PROC, POL, SITE. CQL: `space.key IN ("INF","PROC","POL","SITE") AND lastModified >= "YYYY-MM-DD" ORDER BY lastModified DESC` (substitute the lookback start date from Step 0).

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
- `mail_search` — unread or high-importance messages from the last N days needing action. External senders and flagged items first.
- `ninja_list_pending_patches` — patches pending across all devices.
- `entra_list_expiring_secrets` — app secrets expiring within 30 days.
- `admin_list_service_incidents` — any active M365 incidents carrying over.
- **DMs:** `teams_list_my_chats` (top: 50) → filter to threads with activity since lookback start → `teams_get_chat_messages` (top: 10, as a **number not a string**) for active threads.
- **IT Team channels:** `teams_list_teams` → `teams_list_channels` (team_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) → `teams_list_messages` on General, Changes, Infrastructure, and Alerts channels. Filter to messages since lookback start.

## Step 3 — Write to Obsidian

Write `Briefings/Weekly/YYYY-WW.md`:

```yaml
---
date: YYYY-MM-DD
skill: Week Starter
status: draft
tags: [briefing, weekly]
week: YYYY-WW
has_pending_tasks: false
---
```

Sections:
1. **🔴 Needs attention now** — unresolved alerts, risky users, active incidents carrying over from last week
2. **📅 This week's calendar** — day-by-day summary, heavy days flagged, anything needing prep
3. **📨 Mail** — unread or high-importance messages from the last N days needing action
4. **📋 Your tasks** — tasks assigned to Aaron (by user ID or Planner label) + To Do items. Overdue first, then due this week, then upcoming
5. **🗂 Projects** — active project-type Planner boards (e.g. Office Network Standardization). Open milestones or blockers, separate from operational boards
6. **📋 IT team boards** — open tasks from IT plans Aaron isn't on. Group by plan. Context only
7. **🟡 Things to watch** — expiring secrets, pending patches, stale alerts, anything that could escalate
8. **💬 Teams** — unread DMs and IT Team channel messages from the last N days needing follow-up. If nothing actionable: "No open threads."
9. **🖥 Infrastructure status** — Always include. NinjaOne: all servers (discover via `ninja_list_servers`), grouped by org, status per device. UniFi: all sites table (site name, ISP, clients, devices, offline, alerts). Confluence: pages modified since lookback start in INF/PROC/POL/SITE, or "No changes this week."
10. **💡 Suggested first move** — single most important thing to tackle Monday
11. **📝 Draft Planner actions** — Always include. Nothing is created or changed until Aaron explicitly confirms. Use CREATE / UPDATE / REMOVE / TODO format (same as Day Starter). Default plan: IT Sysadmin Tasks (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`). After Aaron confirms any block, remove it from the note with `edit_block`.

## Step 4 — Update state file

After the Obsidian note is written, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_week_starter` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T08:45:00-07:00`).
- Preserve all other fields (`last_day_starter`, `last_day_ender`, `last_week_ender`).
- Use `mode: rewrite`.

If any Draft Planner action blocks remain in the weekly note at the end of the session (i.e. Aaron did not confirm them), update `has_pending_tasks` to `true` in the weekly note's frontmatter using `edit_block`.
