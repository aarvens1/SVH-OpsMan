---
name: day-starter
description: Morning briefing. Covers the period since the last Day Ender ran (on Mondays) or since the last Day Starter ran (other days), with a 120-hour cap. Falls back to 120h if no state exists (no shorter default). Override with "last N days/hours" or "reset" to use defaults. Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "Read mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__collector_run mcp__svh-opsman__metrics_disk_over_threshold mcp__svh-opsman__ninja_list_alerts mcp__svh-opsman__ninja_list_fleet_volumes mcp__svh-opsman__ninja_get_device_health mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_get_backup_usage mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_get_device mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__intune_list_devices mcp__svh-opsman__intune_get_device_compliance mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__admin_list_subscriptions mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__confluence_search_pages mcp__claude_ai_Fathom__list_meetings mcp__svh-opsman_... [truncated]"
---

# Day Starter

## Time window

### Step 0 — Compute the lookback window

1. Get the current timestamp and day of week from session context (today's date is always injected into the session system prompt — do not call a time tool).
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
- `admin_list_subscriptions` — M365 seat counts. Extract E1 and E3 SKUs: note total, consumed, and available. If available = 0 for either: 🔴 flag in "Needs attention now" and draft a To Do task.
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
- `planner_get_user_tasks` (user_id: `config.user.upn`, open_only: true) — all Planner tasks assigned to Aaron across every plan. This is the primary source for **Your tasks**.
- `planner_list_plans` (IT Team group: `config.groups.it_team`) to catch any newly created plans, then `planner_list_tasks` for the known operational boards:
  - IT Sysadmin Tasks: `config.planner.sysadmin`
  - IT Recurring Tasks: `config.planner.recurring`
  - IT Management Tasks: `config.planner.management`
  - IT Task Overview: `config.planner.overview`

  Also pull `planner_list_tasks` for active project boards and surface them in the **Projects** section (not IT team boards). Each board has an associated project note in `Projects/` — link to it:
  - Office Network Standardization: `config.planner.office_network` → [[Projects/Network-Segmentation]]
  - BDR Testing: `config.planner.bdr_testing` → (no vault note yet)
  - Information Security Program (ISP): `config.planner.isp` → (no vault note yet)
  - CMMC Level 1: `config.planner.cmmc_l1` → (no vault note yet)
  - Copilot Audit for IT team: `config.planner.copilot_audit` → (no vault note yet)

  For each project board, also compute **stale days** — the number of days since the most recent task update (max `lastModifiedDateTime` across all tasks in the plan, or plan creation date if no tasks have been touched). This drives the stale flag in the Projects section.

  This is the source for **IT team boards** and **Projects**.
- `todo_list_task_lists` (user_id: `user.entra_id` from config) then `todo_list_tasks` (user_id: `user.entra_id` from config) for each list — personal To Do task lists, anything open or due today. **Always use the Entra object ID, not the UPN** — the UPN returns HTTP 403 with application credentials; the /me fallback returns HTTP 400.
- `mail_search` — use the exact `last_day_ender` timestamp from the state file as the lower bound: query `received>={last_day_ender_iso}` (e.g. `received>=2026-05-12T17:11:02Z`). If no day-ender timestamp exists, fall back to `received>={lookback_start_iso}`. Focus on external senders, anything flagged, or subjects suggesting action. Skip routine system notifications (NinjaOne bursts, Planner digests, marketing). Always note how many emails were found and whether there is a `@odata.nextLink` indicating more pages — if there is, fetch the next page until you have all mail in the window.
- For DMs: call `teams_list_my_chats` (top: 50) to get all recent chat threads. Filter the returned list to threads where `lastMessage.createdDateTime >= lookback_start`. Fetch `teams_get_chat_messages` (top: 10, as a **number not a string**) only for those threads — do not fetch threads with no activity in the window. Note: Teams self-chat (Aaron messaging himself) returns HTTP 404 via application auth — skip it and note the limitation; Aaron's self-notes should be captured via email or a dedicated IT Team channel post instead.
- For IT Team channels: `teams_list_teams` → `teams_list_channels` (team_id: `config.groups.it_team`) → `teams_list_messages` on General, Changes, Infrastructure, and Alerts channels. **After fetching, filter messages to only those where `createdDateTime >= lookback_start` before writing to the note.** Do not surface older messages as current activity — if a channel had no posts in the lookback window, write "*No posts since [lookback_start].*" Skip high-volume notification channels (Support).
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

**Projects** — Planner boards registered as project initiatives (not operational queues). Each is paired with a vault project note in `Projects/`. For each registered project board:
- Render a row showing: plan name → vault project note wikilink (where one exists) → open task count → stale-days indicator
- **Stale flag** — read the corresponding project note's `priority` frontmatter:
  - `P1` projects: flag if stale ≥ 7 days
  - `P2` projects: flag if stale ≥ 14 days
  - `P3` projects: do not flag (always silent unless explicitly elevated)
- Don't mix project boards into IT team boards. Aaron's current priority project is **Office Network Standardization**.

## Step 2b — Carry forward open items from yesterday

Read the previous business day's briefing note (`Briefings/Daily/YYYY-MM-DD.md`).

**Part 1: Carry forward unresolved tasks from Activity Log**

1.  Check the frontmatter of yesterday's note for `has_pending_tasks: true`.
2.  If `true`, read the content of yesterday's `# Activity Log` section.
3.  Find any task blocks starting with `#### CREATE —`, `#### UPDATE —`, or `#### TODO —`. These are tasks that were drafted but not pushed.
4.  If any are found, create a `### Carried from YYYY-MM-DD` subsection in **today's** `# Activity Log`. This new subsection must be placed *before* the `### Morning Tasks` section.
5.  Copy the complete, unresolved task blocks from yesterday's note into this new subsection, preserving their content exactly.
6.  If `has_pending_tasks` is `false` or the flag is missing, skip this part entirely.

**Part 2: Carry forward open narrative items**

In parallel with Part 1, check two locations in yesterday's note for narrative items to carry forward:
- The `# Day Ender` section for any "🔄 Still open" or "🟡 Worth watching" items.
- The `# Activity Log` section for a `### Deferred` subsection containing items marked for CARRYOVER.

Write a **"Carried from yesterday"** section in the main body of the new `# Day Starter` content (this is separate from the task-block carry-over in the Activity Log). Place it immediately after **Needs attention now**.

Format each narrative item as:
```
- **[Item title]** *(→ [[Briefings/Daily/YYYY-MM-DD]])* — [one-sentence status or action needed]
```

Combine all narrative items (from Day Ender and the Deferred list) into this single section.

**Important:** Do not duplicate items. If a carried-forward task is already appearing in today's lists from a live `planner_get_user_tasks` call or as a current security alert, do not include it in the "Carried from yesterday" narrative section. This section is only for items that would otherwise be lost between sessions.

If yesterday's note doesn't exist or key sections are missing, note this in the narrative section: "*No EOD note found for [date] — open items may need manual review.*"

## Step 2d — Inbox carry-forward

Read `Inbox.md` from the vault root. This is the append-only `/brain-dump` capture file. Each entry is a timestamped bullet.

1. Find all entries with timestamps **since the last `last_day_starter`** (from `System/briefing-state.md`). If no state exists, fall back to entries from the last 24 hours.
2. If any are found, render them in the **Inbox** section of the briefing (see Step 3) so Aaron can triage them into Planner CREATE blocks, To Do items, or dismiss them.
3. If none are found, **omit the Inbox section entirely** from the briefing — don't render an empty section.
4. **Do not delete entries from `Inbox.md` automatically.** Inbox is append-only and carries forward until Aaron explicitly clears it via `/task-review` or manual edit. The day-starter only surfaces entries for triage; it does not consume them.

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
skill: day-starter
status: draft
tags: [briefing, daily]
has_pending_tasks: false
---

# Day Starter — HH:MM

[all day-starter content sections]

<!-- DAY-STARTER-END -->

---

# Activity Log

### Morning Tasks — HH:MM

*Edit fields in place, then say "push these to Planner" to create. Formats: CREATE · UPDATE · TODO · REMOVE · IGNORE · CARRYOVER — see `.claude/templates/task-blocks.md` for full spec.*

[task blocks drafted from morning findings go here]

---

# Day Ender

*To be completed at end of day.*
```

Generate all task blocks using the formats defined in `.claude/templates/task-blocks.md`. Read it if you need the spec. Default destination: IT Sysadmin Tasks (`config.planner.sysadmin`) for operational items, Personal To Do for personal items.

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
Items from Step 2b that would otherwise be lost — open narrative threads, uncommitted items, and unresolved worth-watching items from the previous day. **Do not re-list items that already appear as overdue Planner tasks in Your tasks** — they're captured there. Omit this section entirely if there's nothing to carry that isn't already in Planner.

### Today
Calendar events in time order. Flag any meeting that needs prep. If a meeting-prep note already exists (`Meetings/YYYY-MM-DD-name.md`), link to it inline rather than restating the prep details.

For each meeting on today's calendar, check whether a Fathom recording already exists (`list_meetings` filtered to today). If one exists:
- Show the meeting name, time, and a 1-sentence summary from Fathom's notes
- Link to the full Obsidian note if already filed: `→ [[Meetings/YYYY-MM-DD-name]]`
- If not yet filed, note "Fathom recording available — run /meeting-prep to file notes"

If no recordings exist for today's meetings, no mention needed.

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

**Known site name table:** use `config.unifi_sites` — cross-reference by `wans.WAN.externalIp`. Table is in `.claude/config.yaml`.

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

**M365 Licenses**
Using results from Step 1 `admin_list_subscriptions`: show a compact two-column table — SKU name | Total | Consumed | Available | Status.

Thresholds:
- 🔴 0 available — add to "Needs attention now" AND include draft To Do task block:
  ```
  #### TODO — Order more M365 [E1/E3] licenses — seats exhausted
  - **List:** [default personal list]
  - **Due:** [next calendar day]
  - **Priority:** Urgent
  - **Notes:** M365 [E1/E3] hit zero available seats as of [today]. Notify Peter and Brian before any new hires or role changes are blocked.
  - **Checklist:**
    - [ ] Notify Peter
    - [ ] Notify Brian
    - [ ] Confirm order placed with reseller
    - [ ] Verify new seats appear in admin portal
  ```
- 🟢 1+ available — one line: `✅ E1: N avail / E3: N avail`

SVH runs intentionally lean — 1 available seat is normal and healthy, not a warning.

If `admin_list_subscriptions` returned no data or timed out: note "License data unavailable this session" and skip the section.

### Communications
DMs and @mentions first (highest signal), then mail.

**DMs and channels** — Unread DMs (from `teams_list_my_chats` + `teams_get_chat_messages`) and IT Team channel posts (from `teams_list_messages`) from the last N hours. Focus on messages directed at Aaron. Skip high-volume notification channels. If nothing actionable: "No unread DMs or @mentions."

**Mail** — Unread or high-importance messages from the last N hours needing action. External senders and flagged items first. Skip routine system notifications.

### Inbox
Brain-dump entries captured since the last day-starter (per Step 2d). Render as a compact list — one line per entry, preserving the original timestamp. Below each entry add a single italicised triage suggestion: *"→ Planner CREATE block?"*, *"→ To Do?"*, *"→ Dismiss?"*, or *"→ Investigate"*. If nothing fits, leave the entry without a suggestion. Omit this section entirely if no Inbox entries were captured in the window.

### Your tasks
Tasks assigned to Aaron (by user ID or Planner label) across all plans and personal board, plus To Do items. Use a table for overdue/due-today items, compact list for upcoming. Due today or overdue first, then upcoming.

### Projects
Active project-type Planner boards paired with their vault project notes. One row per registered project:

```
| Project | Open tasks | Last touched | Notes |
|---------|-----------|--------------|-------|
| [[Projects/Network-Segmentation]] (Office Network Std.) | 4 | 2 days ago | rolling out at PDX |
| BDR Testing (no vault note) | 1 | 6 days ago | — |
| [[Projects/ISP]] (Info Sec Program) | 0 | ⚠️ 12d stale | P1 — flag |
```

Apply the stale flag thresholds from Step 2 (P1≥7d, P2≥14d, P3 silent). For P3 projects, omit from this section entirely unless they have open tasks Aaron is assigned to. If no project boards have activity or open tasks: state "*No active project work since [date].*"

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

### Personal

Personal life digest sourced from Google Calendar, Gmail, and Google Tasks (gathered in Step 2).

**Personal calendar** — today's Google Calendar events in time order. Flag any that conflict with the work calendar or need prep. If nothing scheduled: "No personal events today."

**Personal inbox** — unread Gmail messages needing attention or a reply. One line per thread: sender + subject + one-sentence summary. Skip marketing, newsletters, and automated notifications. If nothing: "No personal mail needing attention."

**Google Tasks** — tasks due today or overdue across all lists. Format: `[list name] — [task title]` + due date. If nothing due: "No Google Tasks due today."

If any Google tools fail (auth error, timeout), note it inline with `*Google [service]: unavailable this session.*` and skip that subsection.

### Next moves
2–3 concrete recommendations synthesizing everything above (e.g., "Dismiss risky user X after reviewing sign-in logs", "Prep agenda for 2pm call"). This is the synthesis — it comes last so it can reference findings from any section above.

## Step 4 — Update state file

After the Obsidian briefing note is written, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_day_starter` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T08:30:00-07:00`).
- Preserve all other fields (`last_day_ender`, `last_week_starter`, `last_week_ender`).
- Use `mode: rewrite` since this is a state file, not a daily note.

If any Draft Planner action blocks remain in the daily note at the end of the session (i.e. Aaron did not confirm them), update `has_pending_tasks` to `true` in the daily note's frontmatter using `edit_block`.

## Skill log

After writing the note, append one line to `System/skill-log.md` in the vault:
`YYYY-MM-DD HH:MM | day-starter | Briefings/Daily/YYYY-MM-DD.md | [top alert or "clean — N tasks staged"]`
