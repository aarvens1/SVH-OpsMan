---
name: day-ender
description: End-of-day wrap-up. Covers the period since the last day-starter or day-ender ran, with a 24-hour cap. Falls back to 12h if no state exists. Override with "last N hours" or "reset" to use defaults. Trigger phrases: "day ender", "wrap up today", "end of day", "EOD".
when_to_use: Use at the end of each workday to close out the day cleanly.
allowed-tools: "Read mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search"
---

# Day Ender

## Time window

### Step 0 — Compute the lookback window

1. Get the current timestamp from session context (injected by session-start hook — do not call a time tool).
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
- `planner_get_user_tasks` (user_id: `config.user.upn`, open_only: true) — Aaron's tasks across all boards. Cross-reference against the morning briefing to identify what closed and what's still open.
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

## Step 1.5 — Scan for untracked commitments

Review the current session context for any verbal commitments Aaron made that are not yet captured as Planner tasks or To Do items. Look for phrases like: "I'll...", "I need to...", "I should...", "remind me to...", "I'm going to...", "I have to..."

For each uncaptured commitment found: pre-fill a `#### CREATE —` block in the Evening Tasks section (Step 2, Phase 1). If nothing was committed, skip this step silently.

This compensates for the recurring pattern where in-session intentions don't make it into task tracking.

## Step 2 — Write to today's note

This is a two-phase write.

**Phase 1: Inject Evening Tasks into Activity Log**

Use `edit_block` to insert the Evening Tasks section immediately before `# Day Ender`:

- **`old_string`**: `\n# Day Ender\n`
- **`new_string`**: `\n### Evening Tasks — HH:MM\n\n*Edit fields in place, then say "push these to Planner." Formats: CREATE · UPDATE · TODO · REMOVE — see `.claude/templates/task-blocks.md`.*\n\n*EOD focus: UPDATE completed tasks to 100%, UPDATE overdue due dates, CREATE any new items from EOD findings.*\n\n[task blocks here]\n\n# Day Ender\n`

Generate all task blocks using the formats in `.claude/templates/task-blocks.md` (Read it if needed). EOD priority order: UPDATE completed → UPDATE overdue → CREATE new items from security/infra/comms findings.

**Phase 2: Append close-out narrative**

After injecting the evening tasks, append the close-out narrative to the end of the file. **Always use `mode: append`.** Never `mode: rewrite`.

The appended content must NOT include the Draft Planner actions section, as it now lives in the Activity Log.

```markdown
## ✅ Closed today
- [What actually got done — based on Planner task state from Step 1 vs. what was open this morning]

## 📨 Communications close-out
- [Emails needing a response from the mail search. External senders and flagged items first. Unresolved DMs or @mentions. This section surfaces findings that feed the Active issues and Still open sections below.]

## 🔴 Active issues at EOD
- [Only alerts or infra problems still live right now, or new since morning. If everything cleared: "✅ No active issues at EOD." Link to any open incident notes: `→ [[Incidents/Active/YYYY-MM-DD-name]]`]

## 🔄 Still open — yours
- [Aaron's tasks only. One line each: task + one-line next action. Not the team board. If the task has a related investigation, incident, or change note, link to it: `→ [[Investigations/YYYY-MM-DD-topic]]`]

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

**Phase 2.5: Verify write**

Read the daily note file back immediately after Phase 2. Check that `## ✅ Closed today` appears in the content.

- **Present** — continue to Step 3.
- **Absent** — Obsidian Sync likely reverted the file. Re-attempt Phase 2 (append) once. Read the file back again.
  - If present on retry: continue to Step 3 and note "⚠️ Day Ender write required a retry (Obsidian Sync conflict)" at the end of your response.
  - If still absent after retry: **do not proceed silently**. Output the full Day Ender content as a fenced markdown block in the chat so it can be manually pasted. Then surface: "⛔ Day Ender write failed twice — Obsidian Sync conflict. Content is above. Paste into the daily note manually, then confirm and I'll run Steps 3 and 4." Skip Steps 3 and 4 until Aaron confirms the content is in the file.

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

## Skill log

After writing the note, append one line to `System/skill-log.md` in the vault:
`YYYY-MM-DD HH:MM | day-ender | Briefings/Daily/YYYY-MM-DD.md | [N tasks closed, key EOD finding or "clean close"]`
