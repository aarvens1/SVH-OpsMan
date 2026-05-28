---
name: day-starter
description: Morning briefing. Covers the period since the last Day Ender ran (on Mondays) or since the last Day Starter ran (other days), with a 120-hour cap. Falls back to 120h if no state exists (no shorter default). Override with "last N days/hours" or "reset" to use defaults. Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__collector_run mcp__svh-opsman__metrics_disk_over_threshold mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_alerts mcp__svh-opsman__ninja_list_fleet_volumes mcp__svh-opsman__ninja_get_device_health mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_get_backup_usage mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_get_device mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__intune_list_devices mcp__svh-opsman__intune_get_device_compliance mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__confluence_search_pages mcp__claude_ai_Fathom__list_meetings mcp__obsidian__* mcp__time__* mcp__svh-opsman__synology_m365_backup_status mcp__svh-opsman__synology_m365_backup_logs mcp__svh-opsman__gmail_list_recent mcp__svh-opsman__gmail_search mcp__svh-opsman__gmail_get_message mcp__svh-opsman__gmail_send mcp__svh-opsman__gcal_list_events mcp__svh-opsman__gcal_get_event mcp__svh-opsman__gcal_list_calendars mcp__svh-opsman__gcal_create_event mcp__svh-opsman__gcal_update_event mcp__svh-opsman__gtasks_list_task_lists mcp__svh-opsman__gtasks_list_tasks mcp__svh-opsman__gtasks_create_task mcp__svh-opsman__gtasks_complete_task mcp__svh-opsman__gdrive_list_files mcp__svh-opsman__gdrive_search mcp__svh-opsman__gdrive_read_file mcp__svh-opsman__gdrive_create_folder mcp__svh-opsman__gdrive_upload_text"
---

# Day Starter

## Time window

### Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp and day of week.
2. Check whether the user specified an explicit override in their invocation:
   - **"reset"** or **"default"**: skip the state file. Use 120h. Write current timestamp to state after the run.
   - **"last N days"** / **"last N hours"** / any explicit time range: use that window. Write current timestamp to state after the run.
3. If no override, read `System/briefing-state.md` from the Obsidian vault:
   - If the file doesn't exist or can't be parsed: treat as no state.
   - **If today is Monday and `last_day_ender` is present**: set the window to `now − last_day_ender`. This anchors to Thursday's EOD wrap so nothing in the Thu-afternoon → weekend gap falls through. Log "Monday: anchoring to last Day Ender (TIMESTAMP)" in the note. Skip the `last_day_starter` check below.
   - If `last_day_starter` is present and **≤ 120 hours ago**: set the window to `now − last_day_starter`.
   - If `last_day_starter` is missing or **> 120 hours ago**: use 120h from current time. Never fall back to a shorter window. Log "No recent state — using 120h window" in the note.
4. Note the computed window (e.g., "14h 22m") — use it consistently as **N hours** in all data queries below.

### State file format

`System/briefing-state.md` in the Obsidian vault uses YAML frontmatter only:

```yaml
---
last_day_starter: 2026-05-12T08:30:00-07:00
last_day_ender: 2026-05-12T17:00:00-07:00
last_week_starter: 2026-05-11T08:45:00-07:00
last_week_ender: 2026-05-08T09:55:00-07:00
last_onedrive_backup: 2026-05-12T17:05:00-07:00
last_gdrive_backup: 2026-05-08T10:00:00-07:00
---
```

Preserve all other fields when updating `last_day_starter`. If the file doesn't exist yet, create it with only the `last_day_starter` field.

### Backup currency check

After reading the state file, evaluate backup status and surface any failures in **Needs attention now**:

- **OneDrive**: if `last_onedrive_backup` is missing, OR `last_onedrive_backup < last_day_ender` (backup predates the most recent Day Ender run), flag it:
  `⚠️ OneDrive backup overdue — last backup: [DATE or "never"] / last Day Ender: [DATE]`
- If `last_onedrive_backup >= last_day_ender`: do not surface this. Record a healthy state only.

The OneDrive backup runs at the end of each Day Ender. If this check fires on a Monday, compare against `last_day_ender` — if the last backup was before Thursday EOD, flag it.

## Step 1a — Check and refresh staging

Call `staging_status` first.

- If `fresh: true` (< 2h old): proceed directly to Step 1 using staging data where noted.
- If `fresh: false` or no staging data exists: call `collector_run` (no job arg — runs all jobs). Wait for it to complete, then note the result in **Data gaps** if any jobs failed.

After staging is confirmed (fresh or just refreshed), the infrastructure-heavy parts of Step 1 read from `staging_read` instead of calling live APIs:
- Ninja devices/alerts → `staging_read { file: "ninja-devices" }` and `staging_read { file: "ninja-alerts" }`
- Wazuh alerts → `staging_read { file: "wazuh-alerts" }` (fall back to `wazuh_search_alerts` if the staging job failed)
- UniFi alerts → `staging_read { file: "unifi-alerts" }` (fall back to `unifi_list_sites` if the staging job failed)
- Tenant audit log → `staging_read { file: "graph-audit" }` (fall back to `entra_get_audit_logs` if the staging job failed)

The following always use live APIs regardless of staging state (real-time security signals that must not be stale):
- `entra_list_risky_users`
- `entra_get_sign_in_logs`
- `mde_list_alerts`
- `admin_list_service_incidents`
- All Planner/To Do/Mail/Calendar/Teams queries

## Step 1 — Security & monitoring

Run these in parallel:

- `wazuh_search_alerts` — query last N hours, severity ≥ medium. Note rule IDs, agent names, and alert counts. (If the tool is not in the deferred tool list this session, skip it and note "Wazuh unavailable this session" — do not let this block the run.)
- `ninja_list_alerts` — all active alerts across the entire fleet in one call. `ninja_list_fleet_volumes` — disk space for every volume fleet-wide; flag any volume ≤ 15% free regardless of whether an alert has fired. `ninja_list_servers` — online/offline status. Run all three in parallel.
- For each device with at least one active NinjaOne alert or a flagged volume, run `mde_get_device` and `intune_get_device_compliance` in parallel (match by hostname). Record per device: NinjaOne alert text + MDE risk level + Intune compliance state. A device where all three sources flag a problem ("triple-confirmed") gets elevated to 🔴 regardless of individual severity. If MDE or Intune has no record of the device, note "not enrolled in [system]" — that is itself a finding worth surfacing.
- `mde_list_alerts` — Defender alerts. Flag High/Critical severity.
- `entra_list_risky_users` — any users currently flagged as risky.
- `entra_get_audit_logs` — last N hours. Flag: admin role assignments, MFA method changes, app consent grants, user creation/deletion, bulk operations, and password resets by non-owners. These are the "did someone mess with the tenant?" signals.
- `entra_get_sign_in_logs` — last N hours, filter to failed and risky events. Flag: any user with >5 failures in the window, any successful login from a new country, any event marked risky by Identity Protection. If a user appears in both audit logs AND risky sign-ins, that is a priority finding regardless of individual severity.
- `admin_list_service_incidents` — active M365 service incidents.
- `unifi_list_sites` — check all sites for offline devices, critical notifications, and WAN issues. Flag any site where `offlineDevice > 0`, `criticalNotification > 0`, or `wanDowntime: true`. Note the ISP name and client counts to help identify the location, since site names come back as "Default" — cross-reference by gateway MAC or IP if needed.
- `ninja_list_all_backups` — all backup job results. Flag: any job in a `failed` or `unknown` state, any successful job where `lastRunTime` is more than 24 hours ago (stale). A job that has never run is also worth flagging. Note the device name, plan name, and last run time for each flagged job.

## Step 1b — Compliance gap (Mondays only)

On Mondays, include this note verbatim in the Obsidian briefing under **🔴 Needs attention now** (or **🟡 Worth watching** if no critical items were found in Step 1):

> **Run weekly compliance gap scan** — open a PowerShell terminal and run:
> ```powershell
> . ./connect.ps1
> Get-SVHComplianceGap | Format-Table Category, Finding, Detail -AutoSize
> ```
> Checks: MFA gaps, guest users, stale Intune devices (30+ days), disconnected Wazuh agents, licensed-but-disabled users.

Do NOT attempt to run this as an MCP tool — `Get-SVHComplianceGap` is a PowerShell module function, not an MCP-exposed endpoint. Just surface the reminder.

## Step 2 — Tasks, calendar & personal

Run these in parallel:

- `calendar_list_events` — today's events. Note any meetings in the next 2 hours and any prep required.
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — all Planner tasks assigned to Aaron across every plan. This is the primary source for **Your tasks**.
- `planner_list_plans` (IT Team group: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) to catch any newly created plans, then `planner_list_tasks` for the known operational boards:
  - IT Sysadmin Tasks: `-aZEdilGAUqLC8B8GwOLfmQAAh9M`
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`

  Also pull `planner_list_tasks` for active project boards and surface them in the **Projects** section (not IT team boards):
  - Office Network Standardization: `E4PruQekE0K25KH40pWa9WQAAfAr`
  - BDR Testing: `lJQrriNYnUuLKm5u485GX2QAE_WS`
  - Information Security Program (ISP): `2es7HS5UakyP3K6ZkwRfd2QAF3I_`
  - CMMC Level 1: `qxQKzAEGd0m3Q6EUysaGVmQADbmg`
  - Copilot Audit for IT team: `wP9PL7YWCEqGbG6o4aYVT2QADaLq`

  This is the source for **IT team boards** and **Projects**.
- `todo_list_task_lists` (user_id: "astevens@shoestringvalley.com") then `todo_list_tasks` (user_id: "astevens@shoestringvalley.com") for each list — personal To Do task lists, anything open or due today. Always pass `user_id` explicitly — the `/me` fallback requires delegated auth and returns HTTP 400 with application credentials.
- `mail_search` — use the exact `last_day_ender` timestamp from the state file as the lower bound: query `received>={last_day_ender_iso}` (e.g. `received>=2026-05-12T17:11:02Z`). If no day-ender timestamp exists, fall back to `received>={lookback_start_iso}`. Focus on external senders, anything flagged, or subjects suggesting action. Skip routine system notifications (NinjaOne bursts, Planner digests, marketing). Always note how many emails were found and whether there is a `@odata.nextLink` indicating more pages — if there is, fetch the next page until you have all mail in the window.
- For DMs: call `teams_list_my_chats` (top: 50) to get all recent chat threads. Filter the returned list to threads where `lastMessage.createdDateTime >= lookback_start`. Fetch `teams_get_chat_messages` (top: 10, as a **number not a string**) only for those threads — do not fetch threads with no activity in the window. Note: Teams self-chat (Aaron messaging himself) returns HTTP 404 via application auth — skip it and note the limitation; Aaron's self-notes should be captured via email or a dedicated IT Team channel post instead.
- For IT Team channels: `teams_list_teams` → `teams_list_channels` (team_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) → `teams_list_messages` on General, Changes, Infrastructure, and Alerts channels. **After fetching, filter messages to only those where `createdDateTime >= lookback_start` before writing to the note.** Do not surface older messages as current activity — if a channel had no posts in the lookback window, write "*No posts since [lookback_start].*" Skip high-volume notification channels (Support).
- `confluence_search_pages` — search for pages modified in the last N hours in active global spaces (INF, PROC, POL, SITE). Flag anything that looks like a new incident document, outage note, policy change, or major runbook update. Skip personal and archived spaces.

Also run in parallel for the personal digest:
- `gcal_list_events` (Google Calendar, calendar_id: "primary") — today's personal Google Calendar events.
- `gmail_list_recent` — personal Gmail inbox from the last N hours. Unread and flagged messages only.
- `gtasks_list_task_lists` — then `gtasks_list_tasks` for each returned list — Google Tasks due today or overdue.

### Separating your tasks from team tasks

**Your tasks** — two sources, combined and de-duplicated:
1. All results from `planner_get_user_tasks` (tasks assigned to Aaron by user ID, across all plans including personal board)
2. Tasks from `planner_list_tasks` where the Planner label (`appliedCategories`) matches "Aaron" in that plan's category definitions — move these into Your Tasks, do not leave them in IT team boards

Include To Do items alongside Planner tasks. Show due-today and overdue first, then upcoming.

**IT team boards** — tasks from `planner_list_tasks` that are NOT in Your Tasks (not assigned to Aaron, not tagged with his name). Group by plan. Overdue items get a full row; everything else is a one-liner. This is context, not a to-do list.

**Projects** — whole Planner boards representing a project initiative rather than an operational queue (e.g. "Office Network Standardization"). Definition is TBD — for now, call these out by plan name when you encounter them but do not mix them into IT team boards. Aaron's current priority project is **Office Network Standardization**.

## Step 2b — Carry forward open items from yesterday

Read the previous business day's briefing note (`Briefings/Daily/YYYY-MM-DD.md`). Check two locations:
- The `# Day Ender` section (last top-level section) for open items
- The `### Deferred` subsection within `### Draft Planner actions` for explicitly deferred tasks

Look for:

1. **"🔄 Still open"** items in the EOD section — explicitly unresolved items from the day-ender
2. **"📝 Draft Planner actions"** that were written as CREATE, UPDATE, or TODO but not yet confirmed/pushed — surface them again so Aaron can act on them or discard. Skip any REMOVE blocks — those need no action.
3. **"🟡 Worth watching"** items that had a clear suggested action and weren't resolved

Write a **"Carried from yesterday"** section in the new note, placed immediately after **Needs attention now**. Format each item as:

```
- **[Item title]** *(→ [[Briefings/Daily/YYYY-MM-DD]])* — [one-sentence status or action needed]
```

Skip items that are already surfacing today via Planner task list or current security alerts (they're accounted for). Only surface items that might otherwise fall off.

If yesterday's note doesn't exist or the EOD section is missing (day-ender wasn't run), note it in the section: "*No EOD note found for [date] — open items may need manual review.*"

## Step 2c — Suppress cleared items

Before writing any finding to **🔴 Needs attention now** or **🟡 Worth watching**, read `System/cleared-items.md` from the vault.

For each log entry in that file, check whether any current finding matches by keyword or identifier. If it matches:
- If the entry has `Expires: never` or no expiry — **omit the item entirely.** Do not surface it.
- If the entry has a future `Expires: YYYY-MM-DD` — omit and add a footnote under the section: `*[Item identifier] suppressed — previously cleared by Aaron (DATE). Clears: YYYY-MM-DD.*`
- If the entry's `Expires` date has passed — surface the item normally (the clearing has expired).

If `System/cleared-items.md` doesn't exist, skip this step.

## Step 3 — Synthesise and write

**Prose tone:** One finding per bullet. No filler phrases ("It is worth noting", "At this time", "Please note"). Format: `[subject] — [what's wrong] — [impact or action]`. See `.claude/rules/note-patterns.md` for the full design spec.

**Data gaps:** As you run Steps 1 and 2, track every tool failure (HTTP errors, timeouts, auth errors). Before writing any content section, write a `## Data gaps` section immediately after the lookback window line. Format:

```markdown
## Data gaps

> [!warning] N data sources unavailable
> ⛔ **[Tool / system name]** — [error code] | [one-line diagnosis] | Fix: [specific next step]
```

- One line per failure. Diagnosis must be specific (e.g. "invalid_scope — OAuth scopes not granted in NinjaOne app registration"), not generic ("unavailable").
- If all tools succeeded: **omit the section entirely.**
- In the affected section of the note, replace the failure message with a single italicised line: `*[System]: see Data gaps above.*`

Write `Briefings/Daily/YYYY-MM-DD.md` to the Obsidian vault at `/mnt/c/Users/astevens/vaults/OpsManVault/`. The note has three top-level sections — create all three in a single write so the structure is visible from the start of the day:

```markdown
---
date: YYYY-MM-DD
skill: Day Starter
status: draft
tags: [briefing, daily]
has_pending_tasks: false
---

# Day Starter — HH:MM

[all day-starter content sections]

<!-- DAY-STARTER-END -->

---

# Notes

*Links to active investigations, meeting notes, and mid-day findings go here. If it has a note in the vault, link to it — don't duplicate the content.*

---

# Day Ender

*To be completed at end of day.*
```

All day-starter content (the sections below) goes under the `# Day Starter — HH:MM` header.

### Needs attention now
Use an Obsidian callout block as the opening summary, then detail below only where needed:

```
> [!danger] N items need action today
> ⛔ [subject] — [impact]
> ⚠️ [subject] — [action needed]
```

Any Critical/High alerts, risky users, active M365 incidents, or overdue tasks. One bullet per item with source. If an incident note or investigation already exists for a finding, link to it inline (`→ [[Incidents/Active/YYYY-MM-DD-name]]`). If the finding is serious enough to open a new note, do so and link from here.

### Carried from yesterday
Items surfaced by Step 2b — open threads, unpushed draft tasks, and unresolved worth-watching items from the previous day's note. Omit this section if there is nothing to carry forward.

### Today
Calendar events in time order. Flag any meeting that needs prep. If a meeting-prep note already exists (`Meetings/YYYY-MM-DD-name.md`), link to it inline rather than restating the prep details.

For each meeting on today's calendar, check whether a Fathom recording already exists (`list_meetings` filtered to today). If one exists:
- Show the meeting name, time, and a 1-sentence summary from Fathom's notes
- Link to the full Obsidian note if already filed: `→ [[Meetings/YYYY-MM-DD-name]]`
- If not yet filed, note "Fathom recording available — run /meeting-prep to file notes"

If no recordings exist for today's meetings, no mention needed.

### Mail
Unread or high-importance messages from the last N hours needing action. External senders and flagged items first. Skip routine system notifications.

### Teams
Unread DMs (from `teams_list_my_chats` + `teams_get_chat_messages`) and IT Team channel @mentions (from `teams_list_messages`) from the last N hours. Focus on messages directed at Aaron. Skip high-volume notification channels. If nothing actionable: state "No unread DMs or @mentions."

### Your tasks
Tasks assigned to Aaron (by user ID or Planner label) across all plans and personal board, plus To Do items. Use a table for overdue/due-today items, compact list for upcoming. Due today or overdue first, then upcoming.

### Projects
Active project-type Planner boards (e.g. Office Network Standardization). Call out open tasks or milestones — keep separate from operational team boards. Definition TBD.

### IT team boards
Open tasks from IT plans that Aaron isn't assigned to or tagged on. Group by plan. Overdue items only get a full row; everything else is a one-liner. Context only.

### Worth watching
Use an Obsidian callout block as the opening summary:

```
> [!warning] N items to monitor
> ⚠️ [subject] — [status or trend]
```

Medium-severity findings, anything that could escalate. No action required yet. If nothing: state `> [!success] Nothing elevated — all watches clear.`

### Tenant activity
Sourced from `entra_get_audit_logs` and `entra_get_sign_in_logs` pulled in Step 1. Present as a compact timeline grouped by actor — not a raw dump. Surface: role assignments, MFA resets, app consent grants, policy changes, bulk operations, suspicious sign-in patterns. If an actor appears in both admin audit logs AND risky sign-ins, call it out explicitly (e.g., "⚠️ jsmith made 2 admin changes AND had a risky sign-in at 02:14 from Romania"). If nothing of note: one line — "No admin actions or risky sign-ins in the last N hours." Keep this section tight — it's a trip-wire, not a log dump.

### Next moves
2–3 concrete recommendations (e.g., "Dismiss risky user X after reviewing sign-in logs", "Prep agenda for 2pm call").

### Personal

Personal life digest sourced from Google Calendar, Gmail, and Google Tasks (gathered in Step 2).

**Personal calendar** — today's Google Calendar events in time order. Flag any that conflict with the work calendar or need prep. If nothing scheduled: "No personal events today."

**Personal inbox** — unread Gmail messages needing attention or a reply. One line per thread: sender + subject + one-sentence summary. Skip marketing, newsletters, and automated notifications. If nothing: "No personal mail needing attention."

**Google Tasks** — tasks due today or overdue across all lists. Format: `[list name] — [task title]` + due date. If nothing due: "No Google Tasks due today."

If any Google tools fail (auth error, timeout), note it inline with `*Google [service]: unavailable this session.*` and skip that subsection.

### Infrastructure

**Always include this section — even when clean.** An explicit all-clear is useful signal. Never skip or merge into other sections.

**NinjaOne — Servers**
1. `ninja_list_alerts` and `ninja_list_fleet_volumes` were already run in Step 1 — use those results here.
2. Flag every device with an active alert. Flag every volume ≤ 15% free — even if no alert has fired. These are two independent signal sources; a volume issue with no alert is just as real.
3. For each flagged device, run `ninja_get_event_logs` (device activities) and cross-reference MDE risk and Intune compliance from Step 1.
4. Compile a single table: Device | Org | Issue | MDE risk | Intune. One row per device, one issue column covering both alerts and volume findings.
5. Skip any device in maintenance mode — ACCOPDXARCHIVE is always in maintenance mode.
6. If no devices are flagged: `✅ N servers checked — no active alerts or disk issues.`

**UniFi — All sites**
Show a table with one row per site. Columns: **Site name**, ISP, Wifi clients, Wired clients, Total devices, Offline, Alert.

Site names: UniFi Cloud returns all sites as `name: "default"` and `desc: "Default"` — this is a Cloud limitation. Cross-reference by gateway MAC and ISP using the known site name table below. If a site MAC is not in the table, label it as "Unknown (MAC: xx:xx:xx:xx:xx:xx)" so it can be identified and added.

**Known site name table — cross-reference by `wans.WAN.externalIp`:**
| WAN IP | Gateway MAC | Site name |
|--------|-------------|-----------|
| 96.18.48.186 | ac:8b:a9:6c:2b:d5 | BOI-Main Office |
| 24.119.221.58 | d8:b3:70:4f:66:cf | BOI-Warehouse |
| 216.115.11.190 | d8:b3:70:59:f1:d0 | EUG-Main Office |
| 69.9.133.37 | 0c:ea:14:6e:9c:e9 | EUG-Warehouse |
| 50.109.229.58 | d8:b3:70:36:c6:31 | FGT-Main Office 2 |
| 50.155.66.230 | 8c:30:66:b2:36:09 | KP trailer |
| 73.67.183.144 | 70:a7:41:ac:65:cf | PDX-Kaiser Warehouse |
| 50.227.115.162 | e4:38:83:83:a0:89 | PDX-MAIN Office |
| 50.222.10.170 | e4:38:83:83:9f:c9 | SEA-Main Office |
| 173.160.252.90 | d0:21:f9:d9:7e:7f | SEA-WAREHOUSE |
| 50.145.204.110 | 0c:ea:14:d6:b1:b5 | SVH-Main Office |
| 50.188.182.109 | d8:b3:70:99:f5:df | SYL-Main Office |
| 67.169.216.157 | 6c:63:f8:a2:79:69 | Unknown — needs ID |

Notes:
- PDX Kaiser Suite 230 (10.1.10.179) and NVR appliances (PDX-MAINOFFICE-NVR, SEA-MAIN OFFICE-NVR, SEA-WAREHOUSE-NVR) have internal IPs and will not appear in `unifi_list_sites` results.
- Use `wans.WAN.externalIp` (not gateway MAC) as the primary lookup key — it's easier to match visually.

Flag any row where offlineDevice > 0, criticalNotification > 0, or wanDowntime: true on the primary WAN. Note: WAN2 showing `wanDowntime` with count=288 is a persistent pattern for offline secondary/failover links — do not flag it as an active incident; note it once at the bottom of the table. If all sites are clean: `✅ All sites — no offline devices or WAN issues.`

**Backups**
Run `ninja_list_all_backups` and `ninja_get_backup_usage` in parallel.

Lead with the summary line: **X of N servers backed up since [lookback_start]** — count servers that have at least one successful job within the lookback window vs. total servers in the fleet. Follow with storage from `ninja_get_backup_usage`: **X TB used / Y TB total (Z%)**.

Flag any job where: status is `failed` or `unknown`; `lastRunTime` is outside the lookback window (stale); or the job has never run. Show a table only for flagged jobs: Device | Plan | Status | Last Run. Call out any servers with no backup record at all.

If all jobs are healthy and recent: `✅ X of X servers backed up since [lookback_start]. Storage: X TB / Y TB (Z%).`

**Confluence — Recent changes**
List any pages in INF, PROC, POL, SITE modified in the last N hours that look like incident docs, outage notes, policy changes, or runbook updates. If nothing matches: state "No pages modified in the last N hours in INF/PROC/POL/SITE."

### 📝 Draft Planner actions

Always include this section. Nothing is created or changed until Aaron explicitly confirms. Format each task as an editable named subsection — Aaron can change any field in place, then say "push these to Planner."

Default destination for new tasks:
- **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`) — operational/sysadmin follow-ups, security findings, infrastructure issues
- **Personal To Do** — smaller personal action items not appropriate for the team board

**CREATE format** (one subsection per task):

```
#### CREATE — [task title]
- **Plan:** [plan name] (`plan_id`)
- **Bucket:** [bucket name or leave blank]
- **Due:** YYYY-MM-DD
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Tag:** Aaron (category23)
- **Notes:** [1–2 sentences of context. Include process suggestions or approach notes here — not in the checklist.]
- **Checklist:**
  - [ ] [what needs to happen — outcome, not steps]
  - [ ] [what needs to happen]
  - [ ] [what needs to happen]
```

**Tag field** — always include. Default is `Aaron (category23)` for IT Sysadmin Tasks. When assigned to Sam, use `Sam (category21)`. The category number must match the plan's label mapping — use `planner_get_plan_details` to verify on plans other than IT Sysadmin Tasks.

**Priority field** — always include. Map to Graph API integer when pushing: Urgent=0, Important=1, Medium=3, Low=5.

Checklist items are **what** needs to happen, not **how**. Each should be a short outcome phrase (5–10 words). Keep 3–5 items max. Put process guidance, suggestions, and approach notes in the Notes field.

**When pushing a CREATE block**, pass `priority` (integer), `notes`, `labels` (category key), and `checklist_items` to `planner_create_task` — all in a single call. Do not make a separate `planner_update_task_notes` call unless the create fails.

**UPDATE format** (one subsection per task):

```
#### UPDATE — "[existing task title]"
- **Plan:** [plan name]
- **Change:** [what to update: new due date / set percent complete / new assignee / etc.]
- **Notes:** [optional — reason for the update]
```

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

**IGNORE format** (discard a draft — no Planner action, remove from note):

```
#### IGNORE — [task title or brief reason]
```

Same outcome as REMOVE — remove the block. No entry anywhere. Use when Aaron explicitly dismisses a draft.

**CARRYOVER format** (defer to tomorrow — remove block, add deferred entry):

```
#### CARRYOVER — [task title]
- **Reason:** [why it's being deferred]
```

Remove the full block from the note. Add a one-line entry to a `### Deferred` subsection within `### Draft Planner actions`:

```
- 📌 **[task title]** — [reason]. Full context in [[Briefings/Daily/YYYY-MM-DD]].
```

Step 2b (carry forward) reads the `### Deferred` list from yesterday's note alongside the Day Ender section.

**Processing and cleanup:**

After Aaron confirms and you execute any block — CREATE pushed to Planner, UPDATE pushed to Planner, TODO pushed to To Do, REMOVE/IGNORE discarded, CARRYOVER deferred — immediately remove that subsection from the daily note using `edit_block`. When all action blocks in the section have been processed (only the `### Deferred` list may remain), remove the section header if nothing remains.

## Step 4 — Update state file

After the Obsidian briefing note is written, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_day_starter` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T08:30:00-07:00`).
- Preserve all other fields (`last_day_ender`, `last_week_starter`, `last_week_ender`).
- Use `mode: rewrite` since this is a state file, not a daily note.

If any Draft Planner action blocks remain in the daily note at the end of the session (i.e. Aaron did not confirm them), update `has_pending_tasks` to `true` in the daily note's frontmatter using `edit_block`.
