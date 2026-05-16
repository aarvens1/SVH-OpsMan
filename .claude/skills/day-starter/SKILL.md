---
name: day-starter
description: Morning briefing. Covers the period since the last briefing ran, with a 72-hour cap. Falls back to 24h (72h on Monday) if no state exists. Override with "last N days/hours" or "reset" to use defaults. Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_get_device mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__intune_list_devices mcp__svh-opsman__intune_get_device_compliance mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__confluence_search_pages mcp__claude_ai_Fathom__list_meetings mcp__obsidian__* mcp__time__*"
---

# Day Starter

## Time window

### Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp and day of week.
2. Check whether the user specified an explicit override in their invocation:
   - **"reset"** or **"default"**: skip the state file. Use 24h (72h if Monday). Write current timestamp to state after the run.
   - **"last N days"** / **"last N hours"** / any explicit time range: use that window. Write current timestamp to state after the run.
3. If no override, read `System/briefing-state.md` from the Obsidian vault:
   - If the file doesn't exist or can't be parsed: treat as no state.
   - If `last_day_starter` is present and **≤ 72 hours ago**: set the window to `now − last_day_starter`.
   - If `last_day_starter` is missing or **> 72 hours ago**: fall back to defaults — 24h (72h if Monday). Log "No recent state found — using default window" in the note.
4. Note the computed window (e.g., "14h 22m") — use it consistently as **N hours** in all data queries below.

### State file format

`System/briefing-state.md` in the Obsidian vault uses YAML frontmatter only:

```yaml
---
last_day_starter: 2026-05-12T08:30:00-07:00
last_day_ender: 2026-05-12T17:00:00-07:00
---
```

Preserve the `last_day_ender` value when updating `last_day_starter`. If the file doesn't exist yet, create it with only the `last_day_starter` field.

## Step 1 — Security & monitoring

Run these in parallel:

- `wazuh_search_alerts` — query last N hours, severity ≥ medium. Note rule IDs, agent names, and alert counts. (If the tool is not in the deferred tool list this session, skip it and note "Wazuh unavailable this session" — do not let this block the run.)
- `ninja_list_servers` first to enumerate all server device IDs across all organizations, then run `ninja_list_device_alerts` in parallel for every returned device ID. Do not use a hardcoded list — always discover dynamically. Also check inbox for NinjaOne alert emails to catch anything not covered by the device-level queries.
- For each device with at least one active NinjaOne alert, run `mde_get_device` and `intune_get_device_compliance` in parallel (match by hostname). Record per device: NinjaOne alert text + MDE risk level + Intune compliance state. A device where all three sources flag a problem ("triple-confirmed") gets elevated to 🔴 regardless of individual severity. If MDE or Intune has no record of the device, note "not enrolled in [system]" — that is itself a finding worth surfacing.
- `mde_list_alerts` — Defender alerts. Flag High/Critical severity.
- `entra_list_risky_users` — any users currently flagged as risky.
- `entra_get_audit_logs` — last N hours. Flag: admin role assignments, MFA method changes, app consent grants, user creation/deletion, bulk operations, and password resets by non-owners. These are the "did someone mess with the tenant?" signals.
- `entra_get_sign_in_logs` — last N hours, filter to failed and risky events. Flag: any user with >5 failures in the window, any successful login from a new country, any event marked risky by Identity Protection. If a user appears in both audit logs AND risky sign-ins, that is a priority finding regardless of individual severity.
- `admin_list_service_incidents` — active M365 service incidents.
- `unifi_list_sites` — check all sites for offline devices, critical notifications, and WAN issues. Flag any site where `offlineDevice > 0`, `criticalNotification > 0`, or `wanDowntime: true`. Note the ISP name and client counts to help identify the location, since site names come back as "Default" — cross-reference by gateway MAC or IP if needed.

## Step 1b — Compliance gap (Mondays only)

On Mondays, include this note verbatim in the Obsidian briefing under **🔴 Needs attention now** (or **🟡 Worth watching** if no critical items were found in Step 1):

> **Run weekly compliance gap scan** — open a PowerShell terminal and run:
> ```powershell
> . ./connect.ps1
> Get-SVHComplianceGap | Format-Table Category, Finding, Detail -AutoSize
> ```
> Checks: MFA gaps, guest users, stale Intune devices (30+ days), disconnected Wazuh agents, licensed-but-disabled users.

Do NOT attempt to run this as an MCP tool — `Get-SVHComplianceGap` is a PowerShell module function, not an MCP-exposed endpoint. Just surface the reminder.

## Step 2 — Tasks & calendar

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
- `todo_list_task_lists` then `todo_list_tasks` — personal To Do task lists, anything open or due today. (If `todo_list_task_lists` returns HTTP 400, delegated auth is unavailable — skip and note "To Do unavailable (service account limitation)" in the note.)
- `mail_search` — use the exact `last_day_ender` timestamp from the state file as the lower bound: query `received>={last_day_ender_iso}` (e.g. `received>=2026-05-12T17:11:02Z`). If no day-ender timestamp exists, fall back to `received>={lookback_start_iso}`. Focus on external senders, anything flagged, or subjects suggesting action. Skip routine system notifications (NinjaOne bursts, Planner digests, marketing). Always note how many emails were found and whether there is a `@odata.nextLink` indicating more pages — if there is, fetch the next page until you have all mail in the window.
- For DMs: call `teams_list_my_chats` (top: 50) to get all recent chat threads. Filter the returned list to threads where `lastMessage.createdDateTime >= lookback_start`. Fetch `teams_get_chat_messages` (top: 10, as a **number not a string**) only for those threads — do not fetch threads with no activity in the window. Note: Teams self-chat (Aaron messaging himself) returns HTTP 404 via application auth — skip it and note the limitation; Aaron's self-notes should be captured via email or a dedicated IT Team channel post instead.
- For IT Team channels: `teams_list_teams` → `teams_list_channels` (team_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) → `teams_list_messages` on General, Changes, Infrastructure, and Alerts channels. **After fetching, filter messages to only those where `createdDateTime >= lookback_start` before writing to the note.** Do not surface older messages as current activity — if a channel had no posts in the lookback window, write "*No posts since [lookback_start].*" Skip high-volume notification channels (Support).
- `confluence_search_pages` — search for pages modified in the last N hours in active global spaces (INF, PROC, POL, SITE). Flag anything that looks like a new incident document, outage note, policy change, or major runbook update. Skip personal and archived spaces.

### Separating your tasks from team tasks

**Your tasks** — two sources, combined and de-duplicated:
1. All results from `planner_get_user_tasks` (tasks assigned to Aaron by user ID, across all plans including personal board)
2. Tasks from `planner_list_tasks` where the Planner label (`appliedCategories`) matches "Aaron" in that plan's category definitions — move these into Your Tasks, do not leave them in IT team boards

Include To Do items alongside Planner tasks. Show due-today and overdue first, then upcoming.

**IT team boards** — tasks from `planner_list_tasks` that are NOT in Your Tasks (not assigned to Aaron, not tagged with his name). Group by plan. Overdue items get a full row; everything else is a one-liner. This is context, not a to-do list.

**Projects** — whole Planner boards representing a project initiative rather than an operational queue (e.g. "Office Network Standardization"). Definition is TBD — for now, call these out by plan name when you encounter them but do not mix them into IT team boards. Aaron's current priority project is **Office Network Standardization**.

## Step 2b — Carry forward open items from yesterday

Read only the `# 🌆 Day Ender` section of the previous business day's briefing note (`Briefings/Daily/YYYY-MM-DD.md`). The Day Ender is always the last top-level section — use `offset` to read from that point rather than loading the full note. Look for:

1. **"🔄 Still open"** items in the EOD section — explicitly unresolved items from the day-ender
2. **"📝 Draft Planner actions"** that were written as CREATE, UPDATE, or TODO but not yet confirmed/pushed — surface them again so Aaron can act on them or discard. Skip any REMOVE blocks — those need no action.
3. **"🟡 Worth watching"** items that had a clear suggested action and weren't resolved

Write a **"⏮ Carried from yesterday"** section in the new note, placed immediately after **🔴 Needs attention now**. Format each item as:

```
- **[Item title]** *(→ [[Briefings/Daily/YYYY-MM-DD]])* — [one-sentence status or action needed]
```

Skip items that are already surfacing today via Planner task list or current security alerts (they're accounted for). Only surface items that might otherwise fall off.

If yesterday's note doesn't exist or the EOD section is missing (day-ender wasn't run), note it in the section: "*No EOD note found for [date] — open items may need manual review.*"

## Step 3 — Synthesise and write

Write `Briefings/Daily/YYYY-MM-DD.md` to the Obsidian vault at `/mnt/c/Users/astevens/vaults/OpsManVault/`. The note has three top-level sections — create all three in a single write so the structure is visible from the start of the day:

```markdown
---
date: YYYY-MM-DD
skill: Day Starter
status: draft
tags: [briefing, daily]
---

# 🌅 Day Starter — HH:MM

[all day-starter content sections]

<!-- DAY-STARTER-END -->

---

# 📝 Notes

*Links to active investigations, meeting notes, and mid-day findings go here. If it has a note in the vault, link to it — don't duplicate the content.*

---

# 🌆 Day Ender

*To be completed at end of day.*
```

All day-starter content (the sections below) goes under the `# 🌅 Day Starter — HH:MM` header.

### 🔴 Needs attention now
Any Critical/High alerts, risky users, active M365 incidents, or overdue tasks. One bullet per item with source and recommended action. If an incident note or investigation already exists for a finding, link to it inline (`→ [[Incidents/Active/YYYY-MM-DD-name]]`). If the finding is serious enough to open a new note, do so and link from here.

### ⏮ Carried from yesterday
Items surfaced by Step 2b — open threads, unpushed draft tasks, and unresolved worth-watching items from the previous day's note. Omit this section if there is nothing to carry forward.

### 📅 Today
Calendar events in time order. Flag any meeting that needs prep. If a meeting-prep note already exists (`Meetings/YYYY-MM-DD-name.md`), link to it inline rather than restating the prep details.

For each meeting on today's calendar, check whether a Fathom recording already exists (`list_meetings` filtered to today). If one exists:
- Show the meeting name, time, and a 1-sentence summary from Fathom's notes
- Link to the full Obsidian note if already filed: `→ [[Meetings/YYYY-MM-DD-name]]`
- If not yet filed, note "Fathom recording available — run /meeting-prep to file notes"

If no recordings exist for today's meetings, no mention needed.

### 📨 Mail
Unread or high-importance messages from the last N hours needing action. External senders and flagged items first. Skip routine system notifications.

### 💬 Teams
Unread DMs (from `teams_list_my_chats` + `teams_get_chat_messages`) and IT Team channel @mentions (from `teams_list_messages`) from the last N hours. Focus on messages directed at Aaron. Skip high-volume notification channels. If nothing actionable: state "No unread DMs or @mentions."

### 📋 Your tasks
Tasks assigned to Aaron (by user ID or Planner label) across all plans and personal board, plus To Do items. Due today or overdue first, then upcoming.

### 🗂 Projects
Active project-type Planner boards (e.g. Office Network Standardization). Call out open tasks or milestones — keep separate from operational team boards. Definition TBD.

### 📋 IT team boards
Open tasks from IT plans that Aaron isn't assigned to or tagged on. Group by plan. Overdue items only get a full row; everything else is a one-liner. Context only.

### 🟡 Worth watching
Medium-severity findings, anything that could escalate. No action required yet.

### 🔍 Overnight tenant activity
Sourced from `entra_get_audit_logs` and `entra_get_sign_in_logs` pulled in Step 1. Present as a compact timeline grouped by actor — not a raw dump. Surface: role assignments, MFA resets, app consent grants, policy changes, bulk operations, suspicious sign-in patterns. If an actor appears in both admin audit logs AND risky sign-ins, call it out explicitly (e.g., "⚠️ jsmith made 2 admin changes AND had a risky sign-in at 02:14 from Romania"). If nothing of note: one line — "No admin actions or risky sign-ins in the last N hours." Keep this section tight — it's a trip-wire, not a log dump.

### 💡 Suggested next moves
2–3 concrete recommendations (e.g., "Dismiss risky user X after reviewing sign-in logs", "Prep agenda for 2pm call").

### 🖥 Infrastructure status

**Always include this section — even when everything is clean.** A clean result is still useful signal. Do not skip or merge this into other sections.

**NinjaOne — All servers**
1. Call `ninja_list_servers` to get all server device IDs across all organizations.
2. Run `ninja_list_device_alerts` in parallel for every returned device ID.
3. Show a table grouped by organization (org name from `ninja_list_servers`). Columns: Device name, NinjaOne status, MDE risk, Intune compliance. If no active alerts: ✅ Clean for that device. For devices with alerts, populate MDE risk and Intune compliance from the cross-reference done in Step 1. If a device is not enrolled in MDE or Intune, show "—". Always show every server regardless of status — a clean result is still useful signal.

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

Flag any row where offlineDevice > 0, criticalNotification > 0, or wanDowntime: true on the primary WAN. Note: WAN2 showing `wanDowntime` with count=288 is a persistent pattern for offline secondary/failover links — do not flag it as an active incident; note it once at the bottom of the table.

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

**Processing and cleanup:**

After Aaron confirms and you execute any block — CREATE pushed to Planner, UPDATE pushed to Planner, TODO pushed to To Do, REMOVE discarded — immediately remove that subsection from the daily note using `edit_block`. When all blocks in the section have been processed, remove the `### 📝 Draft Planner actions` section header as well.

## Step 4 — Update state file

After the Obsidian briefing note is written, update `System/briefing-state.md` in the Obsidian vault:
- Set `last_day_starter` to the current ISO timestamp (with timezone offset, e.g. `2026-05-12T08:30:00-07:00`).
- Preserve the existing `last_day_ender` value if present; omit the field if it was never set.
- Use `mode: rewrite` since this is a state file, not a daily note.
