---
name: day-ender
description: End-of-day wrap-up. Covers the period since the last day-starter or day-ender ran, with a 24-hour cap. Falls back to 12h if no state exists. Override with "last N hours" or "reset" to use defaults. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__obsidian__* mcp__time__* mcp__svh-opsman__gmail_list_recent mcp__svh-opsman__gmail_search mcp__svh-opsman__gmail_get_message mcp__svh-opsman__gmail_send mcp__svh-opsman__gcal_list_events mcp__svh-opsman__gcal_get_event mcp__svh-opsman__gcal_create_event mcp__svh-opsman__gcal_update_event mcp__svh-opsman__gtasks_list_task_lists mcp__svh-opsman__gtasks_list_tasks mcp__svh-opsman__gtasks_create_task mcp__svh-opsman__gtasks_complete_task mcp__svh-opsman__gdrive_list_files mcp__svh-opsman__gdrive_search mcp__svh-opsman__gdrive_read_file"
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
- `todo_list_task_lists` (user_id: `user.entra_id` from config) then `todo_list_tasks` (user_id: `user.entra_id` from config) — unchecked personal To Do items. **Always use the Entra object ID, not the UPN** — the UPN returns HTTP 403 with application credentials.
- `mde_list_alerts` + `wazuh_search_alerts` — security alerts still active. Compare against morning briefing — note only what's new or still unresolved. (If Wazuh unavailable, skip and note it.)
- `entra_list_risky_users` — any still-open risky users.
- `entra_get_sign_in_logs` (risk_only: true, hours: since last_day_starter, top: 500) — risky sign-ins that occurred during the day. Surface only: new accounts not in the morning briefing, or escalation of accounts already flagged this morning. If nothing new: one line. Use hours computed from last_day_starter timestamp, not the full ender lookback window.
- `entra_get_audit_logs` (security_events_only: true, hours: since last_day_starter, top: 200) — security-category directory changes since morning. Surface only genuinely new events not visible at day-start: role assignments, MFA changes, app consent, policy changes, user creation/deletion.
- Ninja devices: call `staging_status` — if fresh, use `staging_read { file: "ninja-alerts" }` for the EOD comparison (faster). Fall back to `ninja_list_servers` → `ninja_list_device_alerts` if staging is stale. Note only alerts new since morning or still active.
- UniFi: call `staging_read { file: "unifi-alerts" }` if staging is fresh. Fall back to `unifi_list_sites` if stale. Check for active issues only: offlineDevice > 0, criticalNotification > 0, or primary WAN downtime.
- `mail_search` — search for emails received since `last_day_starter` timestamp (from the state file). Focus on external senders, flagged items, and anything needing a reply. This is the explicit EOD mail check — do not skip it.
- For DMs: `teams_list_my_chats` → `teams_get_chat_messages` (top: 10, as a **number not a string**) for threads with activity since `last_day_starter`. IT Team channels: `teams_list_teams` → `teams_list_channels` → `teams_list_messages` on General, Changes, Infrastructure, Alerts. Filter to messages after `last_day_starter`.
- `confluence_search_pages` — pages modified today in INF, PROC, POL, SITE.
- `gmail_list_recent` — personal Gmail inbox since `last_day_starter`. Unread messages and anything flagged needing a reply.
- `gtasks_list_task_lists` then `gtasks_list_tasks` for each list — Google Tasks status: what's still open or overdue.

## Step 2 — Write to today's note

This is a two-phase write.

**Phase 1: Inject Evening Tasks into Activity Log**

First, use `edit_block` to insert the drafted Planner actions for the evening into the `# Activity Log`. This ensures they are co-located with the morning's tasks.

-   **`old_string`**: `\n# Day Ender\n`
-   **`new_string`**: `\n### Evening Tasks — HH:MM\n[task blocks]\n\n# Day Ender\n`

The `[task blocks]` placeholder should be replaced with the full `### 📝 Draft Planner actions` content, including all the format documentation. The section content itself is unchanged, only its location.

The full content to inject is:
```markdown
### Evening Tasks — HH:MM

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

**REMOVE format** (discard a draft — no Planner action, just delete the block):

```
#### REMOVE — [task title or brief reason]
- **Reason:** [optional — why this draft is being dropped]
```

**TODO format** (routes to personal To Do instead of Planner):

```
#### TODO — [task title]
- **List:** [To Do list name — or leave blank for default]
- **Due:** [YYYY-MM-DD or leave blank]
- **Notes:** [1–2 sentences of context]
```
```

**Phase 2: Append close-out narrative**

After injecting the evening tasks, append the close-out narrative to the end of the file. **Always use `mode: append`.** Never `mode: rewrite`.

The appended content must NOT include the Draft Planner actions section, as it now lives in the Activity Log.

```markdown
## ✅ Closed today
- [What actually got done — based on Planner task state from Step 1 vs. what was open this morning]

## 🔄 Still open — yours
- [Aaron's tasks only. One line each: task + one-line next action. Not the team board. If the task has a related investigation, incident, or change note, link to it: `→ [[Investigations/YYYY-MM-DD-topic]]`]

## 🔴 Active issues at EOD
- [Only alerts or infra problems still live right now, or new since morning. If everything cleared: "✅ No active issues at EOD." Link to any open incident notes: `→ [[Incidents/Active/YYYY-MM-DD-name]]`]

## 📨 Communications close-out
- [Emails needing a response from the mail search. External senders and flagged items first. Unresolved DMs or @mentions.]

## Personal close-out
- [Personal Gmail: unread messages needing a reply tonight, from `gmail_list_recent`. One line per thread: sender + subject. If nothing: "No personal mail needing attention."]
- [Google Tasks: open or overdue tasks from `gtasks_list_tasks`. Format: `[list] — [task]` + due. If nothing overdue: "No overdue Google Tasks."]

## 🌅 First move tomorrow
- [Single item — most time-sensitive or highest-impact.]

## 📌 Carry Forward
**Open (must action):**
- [Item + suggested first move — only things not already captured in Planner]

**Context to hold:**
- [Brief fact worth knowing tomorrow that isn't in Planner]

**Watching:**
- [Item that doesn't need action but should stay on radar]
```

Keep the Carry Forward section tight — 25 lines max. Only include items that would otherwise fall off between sessions. Skip anything already tracked in Planner.

**Processing and cleanup:**

After Aaron confirms and you execute any block (CREATE, UPDATE, TODO, REMOVE), the `edit_block` call to remove the processed subsection must target the block inside the `### Evening Tasks` subsection of the `# Activity Log`.

If any Draft Planner action blocks remain in the daily note at the end of the session (i.e. Aaron did not confirm them), update `has_pending_tasks` to `true` in the daily note's frontmatter using `edit_block`.

## Step 3 — Update state file

After the Obsidian note is appended, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_day_ender` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T17:00:00-07:00`).
- Preserve all other fields (`last_day_starter`, `last_week_starter`, `last_week_ender`).
- Use `mode: rewrite` since this is a state file, not a daily note.

## Step 4 — Run OneDrive backup

After updating the state file, run the OneDrive backup. This writes `last_onedrive_backup` to the state file on success.

Run in a Bash tool call:
```bash
bash ~/SVH-OpsMan/scripts/backup.sh --onedrive-only
```

Wait for it to complete (typically 3–8 minutes on first run, under a minute on subsequent runs). Report the result inline:
- **Success** — note "✅ OneDrive backup complete" at the end of your response.
- **Failure** — note it as `⚠️ OneDrive backup failed — check log at ~/.local/share/svh-opsman/backup-YYYY-MM-DD.log` and surface it in **Active issues at EOD** in the daily note via `edit_block`.
