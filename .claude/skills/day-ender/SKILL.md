---
name: day-ender
description: End-of-day wrap-up. Covers the period since the last day-starter or day-ender ran, with a 24-hour cap. Falls back to 12h if no state exists. Override with "last N hours" or "reset" to use defaults. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__obsidian__* mcp__time__*"
---

# Day Ender

## Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp.
2. Check for an explicit override:
   - **"reset"** / **"default"**: use 12h.
   - **"last N hours"** / explicit range: use that window.
3. If no override, read `SVH/System/briefing-state.md`:
   - Prefer `last_day_ender` as reference. Fall back to `last_day_starter`.
   - If ≤ 24h ago: window = `now − that timestamp`.
   - Otherwise: default 12h. Log "No recent state — using default."
4. Note the computed window as **N hours**.

## Step 1 — Gather close-out data

The day-starter established the morning baseline. Gather only what you need to close the day — what moved, what's still live, what came in.

Run in parallel:

- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — Aaron's tasks across all boards. Cross-reference against morning briefing — identify what closed and what's still open.
- `todo_list_task_lists` then `todo_list_tasks` (user_id: `astevens@shoestringvalley.com`) — unchecked personal To Do. If HTTP 400, skip and note it.
- `mde_list_alerts` + `wazuh_search_alerts` (last N hours, severity ≥ medium) — compare against morning. Note only what's new or still unresolved.
- `entra_list_risky_users` — still-open risky users.
- `entra_get_sign_in_logs` (risk_only: true, hours: since last_day_starter) — risky sign-ins during the day. Surface only new or escalated accounts vs. morning.
- `entra_get_audit_logs` (security_events_only: true, hours: since last_day_starter) — new security-category changes since morning only: role assignments, MFA changes, app consent, policy changes, user creation/deletion.
- `ninja_list_servers` → `ninja_list_device_alerts` in parallel — compare against morning. Note only new or still-active alerts.
- `unifi_list_sites` — active issues only: `offlineDevice > 0`, `criticalNotification > 0`, primary WAN downtime. Compare against morning.
- `mail_search` — emails since `last_day_starter` timestamp. External senders, flagged items, anything needing a reply.
- Teams DMs: `teams_list_my_chats` → `teams_get_chat_messages` (top: 10 — **number, not string**) for threads with activity since `last_day_starter`. IT Team channels: `teams_list_teams` → `teams_list_channels` → `teams_list_messages` on General, Changes, Infrastructure, Alerts. Filter to messages after `last_day_starter`.
- `confluence_search_pages` — pages modified today in INF, PROC, POL, SITE.

## Step 2 — Append to today's note

**Do NOT read today's daily note before writing.** Your morning vs. current comparison comes from Step 1 tool results, not from re-reading the note. Reading before appending risks an overwrite if the Obsidian tool returns metadata-only.

**Always use `mode: append`.** Never `mode: rewrite`.

```markdown
## Closed today
- [What got done — based on Planner task state from Step 1 vs. morning. If nothing: "Nothing confirmed closed today."]

## Still open — yours
- [Aaron's tasks only. One line each: task + next action. Link to active notes: `→ [[SVH/Record/YYYY-MM-DD-topic]]`]

## Active issues at EOD
- [Alerts or infra problems still live right now, or new since morning. If all clear: "✅ No active issues at EOD." Link to open incident notes: `→ [[SVH/Record/YYYY-MM-DD-incident-name]]`]

## Communications close-out
- [Emails needing a response. External senders and flagged items first. Unresolved DMs or @mentions.]

## First move tomorrow
- [Single item — most time-sensitive or highest-impact.]

## Carry Forward
**Open (must action):**
- [Item + suggested first move — only things not already in Planner]

**Context to hold:**
- [Brief fact worth knowing tomorrow]

**Watching:**
- [Item that doesn't need action but should stay on radar]
```

Keep Carry Forward tight — 25 lines max. Skip anything already tracked in Planner.

### Draft Planner actions

Always include. Nothing pushed without Aaron confirming.

Focus at EOD on:
- **UPDATE** tasks completed today (set percentComplete to 100)
- **UPDATE** overdue tasks needing a new due date
- **CREATE** new tasks from EOD findings

Default destinations:
- **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`) — operational follow-ups, security findings, infra issues
- **Personal To Do** — smaller personal items

**UPDATE format:**
```
#### UPDATE — "[existing task title]"
- **Plan:** [plan name]
- **Change:** [what to update]
- **Notes:** [optional reason]
```

**CREATE format:**
```
#### CREATE — [task title]
- **Plan:** [plan name] (`plan_id`)
- **Bucket:** [bucket or leave blank]
- **Due:** YYYY-MM-DD
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Tag:** Aaron (category23)
- **Notes:** [1–2 sentences]
- **Checklist:**
  - [ ] [outcome — 5–10 words]
```

**REMOVE / TODO** — same formats as Day Starter.

After Aaron confirms each block, remove it from the note with `edit_block`. Set `has_pending_tasks: true` in frontmatter if any blocks remain unconfirmed.

## Step 3 — Update state file

After the note is appended, update `SVH/System/briefing-state.md`:
- Set `last_day_ender` to the current ISO timestamp with timezone offset.
- Preserve all other fields.
- Use `mode: rewrite`.
