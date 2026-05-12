---
name: day-ender
description: End-of-day wrap-up. Covers the last 12 hours — what got done, what's still open, anything that needs a handoff note or follow-up before tomorrow. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__calendar_list_events mcp__obsidian__* mcp__time__*"
---

# Day Ender

## Time window

Last 12 hours.

## Step 1 — What's still open

Run in parallel:
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — tasks still assigned to Aaron across all boards.
- `planner_list_tasks` for the operational boards — anything In Progress or not started, still open:
  - IT Sysadmin Tasks: `-aZEdilGAUqLC8B8GwOLfmQAAh9M`
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`
- `todo_list_task_lists` then `todo_list_tasks` — unchecked personal To Do items.
- `wazuh_search_alerts` / `mde_list_alerts` — any unresolved alerts from the day.
- `entra_list_risky_users` — any still-open risky users.
- `ninja_list_servers` first to enumerate all server device IDs, then `ninja_list_device_alerts` in parallel for every returned device ID. Do not use a hardcoded list.
- `unifi_list_sites` — end-of-day site health snapshot.
- `confluence_search_pages` — pages modified today in INF, PROC, POL, SITE. CQL: `space.key IN ("INF","PROC","POL","SITE") AND lastModified >= "-1d" ORDER BY lastModified DESC`.
- `teams_list_messages` — any unread DMs or @mentions from today that haven't been addressed.

## Step 2 — Read today's note

Read `Briefings/Daily/YYYY-MM-DD.md` from Obsidian to understand what was flagged this morning.

**IMPORTANT:** If the read returns only metadata (e.g. `{"fileName":...,"fileType":"markdown"}` with no body), do NOT assume the file is empty. The day starter may have already written content that the tool failed to surface. Always treat the file as potentially having existing content.

## Step 3 — Append to today's note

**CRITICAL: Always use `mode: append` when writing to the daily note. Never use `mode: rewrite`. The day starter content must be preserved.**

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

### 🖥 Infrastructure status (end of day)

**Always include this section even when everything is clean.**

**NinjaOne:** Table of all servers (discovered via `ninja_list_servers`), grouped by org. Status per device. ✅ Clean or alert details.

**UniFi:** Table of all sites — Site name (cross-reference gateway MAC with known site table), ISP, wifi/wired clients, total devices, offline count, alerts. Flag offlineDevice > 0, criticalNotification > 0, or primary WAN downtime.

**Confluence:** Any pages modified today in INF, PROC, POL, SITE. If none: "No changes today."

**Teams:** Any unread DMs or @mentions still outstanding at end of day. If none: "No open threads."
