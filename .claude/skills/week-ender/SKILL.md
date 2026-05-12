---
name: week-ender
description: Thursday end-of-day weekly wrap-up. What shipped, what slipped, seeds for next week, and an optional summary draft for a manager or team. Trigger phrases: "week ender", "wrap up the week", "Thursday EOD", "weekly wrap".
when_to_use: Use at the end of the work week (Thursday) to close out cleanly and set up Monday.
allowed-tools: "mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__calendar_list_events mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__obsidian__* mcp__time__*"
---

# Week Ender

## Time window

This week (Monday through now).

## Step 1 — What happened this week

Run in parallel:
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: false) — Aaron's tasks including completed ones this week.
- `planner_list_tasks` for the operational boards (completed vs. still open):
  - IT Sysadmin Tasks: `-aZEdilGAUqLC8B8GwOLfmQAAh9M`
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`
- `planner_list_tasks` for project boards (progress this week):
  - Office Network Standardization: `E4PruQekE0K25KH40pWa9WQAAfAr`
  - BDR Testing: `lJQrriNYnUuLKm5u485GX2QAE_WS`
  - Information Security Program (ISP): `2es7HS5UakyP3K6ZkwRfd2QAF3I_`
  - CMMC Level 1: `qxQKzAEGd0m3Q6EUysaGVmQADbmg`
  - Copilot Audit for IT team: `wP9PL7YWCEqGbG6o4aYVT2QADaLq`
- `todo_list_task_lists` then `todo_list_tasks` — personal task completion.
- `calendar_list_events` — what meetings happened, which recurred.
- `wazuh_search_alerts` / `mde_list_alerts` — notable security events this week.
- `ninja_list_all_backups` — backup status for the week.
- `ninja_list_servers` — enumerate all servers, then `ninja_list_device_alerts` in parallel for every returned device ID. Show end-of-week alert state grouped by org in the Infrastructure status section.
- `unifi_list_sites` — end-of-week site health snapshot.
- `confluence_search_pages` — pages modified this week in INF, PROC, POL, SITE. CQL: `space.key IN ("INF","PROC","POL","SITE") AND lastModified >= "-7d" ORDER BY lastModified DESC`.
- `teams_list_messages` — any unread DMs or @mentions from this week still needing a response.

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

### 🖥 Infrastructure status (end of week)

**Always include this section.** NinjaOne: all servers (via `ninja_list_servers`), grouped by org, alert status per device. UniFi: all sites table (site name, ISP, clients, devices, offline, alerts). Confluence: pages modified this week in INF/PROC/POL/SITE worth flagging. Teams: any unread DMs or @mentions still outstanding at end of week. Each subsection gets a ✅ clean or a list of findings.
