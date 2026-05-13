---
name: day-ender
description: End-of-day wrap-up. Covers the period since the last day-starter or day-ender ran, with a 24-hour cap. Falls back to 12h if no state exists. Override with "last N hours" or "reset" to use defaults. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__obsidian__* mcp__time__*"
---

# Day Ender

## Time window

### Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp.
2. Check whether the user specified an explicit override in their invocation:
   - **"reset"** or **"default"**: skip the state file. Use 12h. Write current timestamp to state after the run.
   - **"last N hours"** / any explicit time range: use that window. Write current timestamp to state after the run.
3. If no override, read `System/briefing-state.md` from the Obsidian vault:
   - If the file doesn't exist or can't be parsed: treat as no state.
   - Prefer `last_day_ender` as the reference point. If absent, fall back to `last_day_starter`.
   - If the chosen timestamp is present and **≤ 24 hours ago**: set the window to `now − that timestamp`.
   - If missing or **> 24 hours ago**: fall back to 12h. Log "No recent state found — using default window" in the note.
4. Note the computed window — use it as **N hours** in all data queries below.

## Step 1 — Gather close-out data

The day-starter already established the morning baseline. This step gathers only what you need to close out the day — what moved, what's still live, what came in.

Run in parallel:
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — Aaron's tasks across all boards. Cross-reference against the morning briefing to identify what closed and what's still open.
- `todo_list_task_lists` then `todo_list_tasks` — unchecked personal To Do items. (If HTTP 400, skip and note "To Do unavailable.")
- `mde_list_alerts` + `wazuh_search_alerts` — security alerts still active. Compare against morning briefing — note only what's new or still unresolved. (If Wazuh unavailable, skip and note it.)
- `entra_list_risky_users` — any still-open risky users.
- `ninja_list_servers` → `ninja_list_device_alerts` in parallel for all devices — compare against morning alerts. Note only alerts that are new since morning or still active from morning.
- `unifi_list_sites` — check for active issues only: offlineDevice > 0, criticalNotification > 0, or primary WAN downtime. Compare against morning snapshot.
- `mail_search` — search for emails received since `last_day_starter` timestamp (from the state file). Focus on external senders, flagged items, and anything needing a reply. This is the explicit EOD mail check — do not skip it.
- For DMs: `teams_list_my_chats` → `teams_get_chat_messages` (top: 10, as a **number not a string**) for threads with activity since `last_day_starter`. IT Team channels: `teams_list_teams` → `teams_list_channels` → `teams_list_messages` on General, Changes, Infrastructure, Alerts. Filter to messages after `last_day_starter`.
- `confluence_search_pages` — pages modified today in INF, PROC, POL, SITE.

## Step 2 — Read today's note

Read `Briefings/Daily/YYYY-MM-DD.md` from Obsidian to understand what was flagged this morning.

**IMPORTANT:** If the read returns only metadata (e.g. `{"fileName":...,"fileType":"markdown"}` with no body), do NOT assume the file is empty. The day starter may have already written content that the tool failed to surface. Always treat the file as potentially having existing content.

## Step 3 — Append to today's note

**CRITICAL: Always use `mode: append` when writing to the daily note. Never use `mode: rewrite`. The day starter content must be preserved.**

The daily note already contains a `# 🌆 Day Ender` placeholder section created by day-starter. Append the end-of-day content to `Briefings/Daily/YYYY-MM-DD.md` — it will naturally land in that section.

The day-ender's job is close-out, not repetition. The morning starter already has the full infra snapshot and team board. Do not re-run those tables. Write only what changed, what's still live, and what needs to move to tomorrow.

```markdown
## ✅ Closed today
- [What actually got done — cross-reference against this morning's open items and tasks]

## 🔄 Still open — yours
- [Aaron's tasks only. One line each: task + one-line next action. Not the team board.]

## 🔴 Active issues at EOD
- [Only alerts or infra problems that are still live right now, or that are new since the morning briefing. If a morning alert cleared: note "NinjaOne: morning alerts cleared" as a one-liner. If nothing is active: "✅ No active issues at EOD."]

## 📨 Communications close-out
- [Emails that arrived during the day needing a response — from the mail search. External senders and flagged items first. DMs or @mentions that are still unresolved. If an email from someone important arrived late in the day, call it out explicitly here rather than burying it in a list.]

## 🌅 First move tomorrow
- [Single item — most time-sensitive or highest-impact.]
```

### 📝 Draft Planner updates

Always include this section. Nothing is created or changed until Aaron explicitly confirms. Format each task as an editable named subsection — Aaron can change any field in place, then say "push these to Planner."

Focus at EOD on:
- **UPDATE** tasks that were completed today (set percentComplete to 100)
- **UPDATE** tasks that are overdue and need a new due date
- **CREATE** any new tasks surfaced by EOD findings (security alerts, infra issues, follow-ups from Teams/mail)

Default destination for new tasks:
- **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`) — operational/sysadmin follow-ups, security findings, infrastructure issues
- **Personal To Do** — smaller personal action items not appropriate for the team board

**UPDATE format** (one subsection per task):

```
#### UPDATE — "[existing task title]"
- **Plan:** [plan name]
- **Change:** [what to update: set percentComplete to 100 / new due date YYYY-MM-DD / new assignee / etc.]
- **Notes:** [optional — reason for the update]
```

**CREATE format** (one subsection per task):

```
#### CREATE — [task title]
- **Plan:** [plan name] (`plan_id`)
- **Bucket:** [bucket name or leave blank]
- **Due:** YYYY-MM-DD
- **Start:** [YYYY-MM-DD or leave blank]
- **Priority:** [Urgent / Important / Medium / Low — or leave blank]
- **Assigned:** Aaron Stevens
- **Labels:** [label names or leave blank]
- **Attachments:** [filepath or URL — or leave blank]
- **Notes:** [1–2 sentences of context. Include process suggestions or approach notes here — not in the checklist.]
- **Checklist:**
  - [ ] [what needs to happen — outcome, not steps]
  - [ ] [what needs to happen]
  - [ ] [what needs to happen]
```

Checklist items are **what** needs to happen, not **how**. Each should be a short outcome phrase (5–10 words). Keep 3–5 items max. Put process guidance, suggestions, and approach notes in the Notes field.

## Step 4 — Update state file

After the Obsidian note is appended, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_day_ender` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T17:00:00-07:00`).
- Preserve the existing `last_day_starter` value if present; omit the field if it was never set.
- Use `mode: rewrite` since this is a state file, not a daily note.
