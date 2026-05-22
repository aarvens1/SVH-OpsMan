---
name: day-starter
description: Morning briefing. Covers the period since the last Day Ender ran (on Mondays) or since the last Day Starter ran (other days), with a 72-hour cap. Falls back to 24h (72h if Monday) if no state exists. Override with "last N days/hours" or "reset" to use defaults. Trigger phrases: "day starter", "morning briefing", "what's on my plate", "start of day".
when_to_use: Use at the start of each workday to get a prioritized digest of what needs attention.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__collector_run mcp__svh-opsman__metrics_disk_over_threshold mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__calendar_list_events mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__mail_search mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__confluence_search_pages mcp__claude_ai_Fathom__list_meetings mcp__obsidian__* mcp__time__*"
---

# Day Starter

## Step 0 — Compute the lookback window

1. Call `mcp__time__get_current_time` to get the current timestamp and day of week.
2. Check for an explicit override in the invocation:
   - **"reset"** or **"default"**: skip the state file. Use 24h (72h if Monday).
   - **"last N days"** / **"last N hours"** / explicit range: use that window.
3. If no override, read `SVH/System/briefing-state.md` from the Obsidian vault:
   - **Monday and `last_day_ender` present**: window = `now − last_day_ender`. Log "Monday: anchoring to last Day Ender."
   - `last_day_starter` present and **≤ 72h ago**: window = `now − last_day_starter`.
   - Otherwise: default — 24h (72h if Monday). Log "No recent state — using default."
4. Note the computed window as **N hours** — use it consistently across all queries below.

### State file format

`SVH/System/briefing-state.md` — YAML frontmatter only:

```yaml
---
last_day_starter: 2026-05-12T08:30:00-07:00
last_day_ender: 2026-05-12T17:00:00-07:00
last_week_starter: 2026-05-11T08:45:00-07:00
last_week_ender: 2026-05-08T09:55:00-07:00
---
```

Preserve all other fields when updating `last_day_starter`. Create with only `last_day_starter` if the file doesn't exist.

## Step 1 — Check staging, then gather

### 1a — Staging check

Call `staging_status`. If stale (>2h old) or missing: call `collector_run` and wait. If specific jobs failed, note them in **Data gaps** — do not block the run.

### 1b — Infrastructure (from staging)

Run these in parallel after staging is confirmed:

- `staging_read ninja-devices` — device list. Note offline servers, maintenance mode devices (skip for alerting). ACCOPDXARCHIVE is always maintenance — never flag it.
- `staging_read ninja-alerts` — active alerts, maintenance-mode filtered. For each alert, cross-reference the device in the devices list.
- `metrics_disk_over_threshold` (threshold_pct: 80) — devices at or above 80% disk. Flag any at or above 85% as 🔴, 80–84% as 🟡. Treat this and ninja-alerts as independent signal sources — a disk issue with no alert is still real.
- `staging_read wazuh-alerts` — security alerts. Note rule IDs, agent names, severity counts.
- `staging_read unifi-alerts` — network alerts. Cross-reference with the known site table below.
- `staging_read graph-audit` — tenant changes last 24h. Flag: admin role assignments, MFA method changes, app consent grants, user creation/deletion, bulk operations, password resets by non-owners.

### 1c — Real-time security (direct API)

Run in parallel — these need live state, not a staging snapshot:

- `entra_list_risky_users` — users currently flagged as risky.
- `entra_get_sign_in_logs` — last N hours, filter to failed and risky events. Flag: any user with >5 failures, successful login from a new country, any event marked risky. If a user appears in both audit log (from staging) AND risky sign-ins here, that is a priority finding.
- `mde_list_alerts` — Defender alerts. Flag High/Critical.
- `admin_list_service_incidents` — active M365 service incidents.

### 1d — Compliance gap (Mondays only)

On Mondays, include this verbatim under **Needs attention now** (or **Worth watching** if no critical items):

> **Run weekly compliance gap scan** — open a PowerShell terminal and run:
> ```powershell
> . ./connect.ps1
> Get-SVHComplianceGap | Format-Table Category, Finding, Detail -AutoSize
> ```
> Checks: MFA gaps, guest users, stale Intune devices (30+ days), disconnected Wazuh agents, licensed-but-disabled users.

Do NOT attempt to run this as an MCP tool — `Get-SVHComplianceGap` is a PowerShell module function, not an MCP endpoint.

## Step 2 — Tasks, calendar, and comms

Run in parallel:

- `staging_read graph-calendar` — events for the next 7 days. Use this as the calendar source. If the staging data is from before today (edge case), fall back to `calendar_list_events`.
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: true) — all Planner tasks assigned to Aaron across every plan. Primary source for **Your tasks**.
- `staging_read planner-tasks` — IT Sysadmin Tasks board snapshot. Use as the base for **IT team boards**.
- `planner_list_tasks` for the remaining operational and project boards (staging only covers IT Sysadmin Tasks):
  - IT Recurring Tasks: `ZTlTUrl1gUunMMwExKSDRWQABKjH`
  - IT Management Tasks: `e0-6qZKUSkyZJUQg9nNbzmQAEjoO`
  - IT Task Overview: `nyrAlo2ciUKVEv8GXUA78WQAG8mL`
  - Office Network Standardization: `E4PruQekE0K25KH40pWa9WQAAfAr`
  - BDR Testing: `lJQrriNYnUuLKm5u485GX2QAE_WS`
  - Information Security Program: `2es7HS5UakyP3K6ZkwRfd2QAF3I_`
  - CMMC Level 1: `qxQKzAEGd0m3Q6EUysaGVmQADbmg`
  - Copilot Audit for IT team: `wP9PL7YWCEqGbG6o4aYVT2QADaLq`
- `todo_list_task_lists` then `todo_list_tasks` (user_id: `astevens@shoestringvalley.com`) — personal To Do. Always pass `user_id` explicitly — `/me` returns HTTP 400 with application credentials.
- `staging_read graph-mail` — inbox snapshot (last 24h). Use for mail summary. If the lookback window starts before the staging timestamp, supplement with `mail_search` using `received>={lookback_start_iso}` to catch the gap. Skip routine system notifications (NinjaOne bursts, Planner digests, marketing). Note total count and whether more pages exist.
- Teams DMs: `teams_list_my_chats` (top: 50), then `teams_get_chat_messages` (top: 10 — **number, not string**) only for threads with activity since lookback start. Skip threads with no activity.
- Teams channels: `teams_list_teams` → `teams_list_channels` (team_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) → `teams_list_messages` on General, Changes, Infrastructure, Alerts. Filter to messages ≥ lookback_start. If a channel had no posts: write "*No posts since [lookback_start].*"
- `confluence_search_pages` — pages modified in the last N hours in INF, PROC, POL, SITE. Flag incident docs, outage notes, policy changes, major runbook updates.

### Separating your tasks from team tasks

**Your tasks** — combined from `planner_get_user_tasks` (assigned by user ID) and tasks from board queries where the Planner label matches "Aaron" (`category23`). Include To Do items. Due today and overdue first, then upcoming.

**IT team boards** — tasks NOT in Your Tasks. Group by plan. Overdue items get a full row; everything else is a one-liner. Context only.

**Projects** — Planner boards representing project initiatives rather than operational queues (Office Network Standardization, BDR Testing, ISP, CMMC Level 1, Copilot Audit). Aaron's current priority project: **Office Network Standardization**.

## Step 2b — Carry forward from yesterday

Read `SVH/Daily/YYYY-MM-DD.md` (previous business day). Look for:
1. **"🔄 Still open"** items in the Day Ender section
2. **"📝 Draft Planner actions"** CREATE/UPDATE/TODO blocks not yet pushed
3. **"🟡 Worth watching"** items with a clear action that wasn't resolved

Write a **Carried from yesterday** section immediately after **Needs attention now**:

```
- **[Item title]** *(→ [[SVH/Daily/YYYY-MM-DD]])* — [one-sentence status or action]
```

Skip items already surfacing today via Planner or current alerts. If yesterday's note doesn't exist: note "*No EOD note found for [date].*"

## Step 2c — Suppress cleared items

Read `SVH/System/cleared-items.md`. For each entry, check whether a current finding matches by keyword or identifier:
- `Expires: never` or no expiry — omit the item entirely.
- Future `Expires: YYYY-MM-DD` — omit and add a footnote: `*[Item] suppressed — cleared by Aaron (DATE). Clears: YYYY-MM-DD.*`
- Expired entry — surface normally.

Skip this step if the file doesn't exist.

## Step 3 — Synthesise and write

**Data gaps:** Track every tool/staging failure as you run Steps 1 and 2. Write a `## Data gaps` section immediately after the lookback window line:

```markdown
## Data gaps

> [!warning] N data sources unavailable
> ⛔ **[Tool / system]** — [error code] | [diagnosis] | Fix: [next step]
```

One line per failure, specific diagnosis. Omit the section entirely if everything succeeded.

Write `SVH/Daily/YYYY-MM-DD.md` to the vault. Create all three top-level sections in a single write:

```markdown
---
date: YYYY-MM-DD
type: daily
status: active
tags: [briefing, daily]
has_pending_tasks: false
---

# Day Starter — HH:MM

[all day-starter content sections]

<!-- DAY-STARTER-END -->

---

# Notes

*Links to active investigations, meeting notes, and mid-day findings go here.*

---

# Day Ender

*To be completed at end of day.*
```

### Needs attention now

```
> [!danger] N items need action today
> ⛔ [subject] — [impact]
> ⚠️ [subject] — [action needed]
```

Critical/High alerts, risky users, active M365 incidents, overdue tasks. Link to existing Record/ notes inline (`→ [[SVH/Record/YYYY-MM-DD-name]]`).

### Carried from yesterday

From Step 2b. Omit if empty.

### Today

Calendar events in time order (from staging graph-calendar). Flag meetings needing prep. Check for Fathom recordings via `list_meetings` filtered to today — if one exists, show a 1-sentence summary and note "run /meeting-prep to file notes" if not yet filed.

### Mail

From staging graph-mail (supplemented by mail_search if needed). Unread/high-importance needing action. External senders and flagged items first.

### Teams

Unread DMs and IT Team channel activity since lookback start. Focus on messages directed at Aaron. If nothing actionable: "No unread DMs or @mentions."

### Your tasks

Table for overdue/due-today, compact list for upcoming. Due today or overdue first.

### Projects

Active project-type boards. Call out open tasks or milestones. Keep separate from IT team boards.

### IT team boards

Open tasks Aaron isn't assigned to. Group by plan. Context only.

### Worth watching

```
> [!warning] N items to monitor
> ⚠️ [subject] — [status or trend]
```

Medium-severity findings that could escalate. If nothing: `> [!success] Nothing elevated — all watches clear.`

### Tenant activity

From staging graph-audit + live sign-in logs. Compact timeline grouped by actor. Surface: role assignments, MFA resets, app consent, policy changes, suspicious sign-in patterns. If an actor appears in both audit and risky sign-ins, call it out explicitly. If nothing: "No admin actions or risky sign-ins in the last N hours."

### Next moves

2–3 concrete recommendations.

### Infrastructure

**Always include — even when clean.**

**NinjaOne — Servers**
Use staging ninja-devices and ninja-alerts + metrics_disk_over_threshold results. Flag every device with an active alert and every volume ≥ 80% disk used. Table: Device | Org | Issue | Disk | Status. Skip maintenance-mode devices. If clean: `✅ N servers checked — no active alerts or disk issues.`

**UniFi — All sites**
Table: Site name | ISP | Wifi clients | Wired clients | Total devices | Offline | Alert.

Cross-reference staging unifi-alerts with the known site table below. UniFi Cloud returns all sites as `name: "default"` — match by `wans.WAN.externalIp`:

| WAN IP | Site name |
|--------|-----------|
| 96.18.48.186 | BOI-Main Office |
| 24.119.221.58 | BOI-Warehouse |
| 216.115.11.190 | EUG-Main Office |
| 69.9.133.37 | EUG-Warehouse |
| 50.109.229.58 | FGT-Main Office 2 |
| 50.155.66.230 | KP trailer |
| 73.67.183.144 | PDX-Kaiser Warehouse |
| 50.227.115.162 | PDX-MAIN Office |
| 50.222.10.170 | SEA-Main Office |
| 173.160.252.90 | SEA-WAREHOUSE |
| 50.145.204.110 | SVH-Main Office |
| 50.188.182.109 | SYL-Main Office |
| 67.169.216.157 | Unknown — needs ID |

Flag rows where `offlineDevice > 0`, `criticalNotification > 0`, or primary WAN downtime. WAN2 `wanDowntime` count=288 is a persistent pattern for offline secondary links — note once at the bottom, not flagged as incident. If all clean: `✅ All sites — no offline devices or WAN issues.`

**Backups**
From staging ninja-devices backup data. Flag: `failed` or `unknown` status, `lastRunTime` > 24h ago. Table for flagged jobs only: Device | Plan | Status | Last Run. If all healthy: `✅ All backup jobs current.`

**Confluence — Recent changes**
Pages in INF, PROC, POL, SITE modified in the last N hours that look like incident docs, outage notes, policy changes, or runbook updates.

### Draft Planner actions

Always include this section. Nothing is created or changed until Aaron explicitly confirms.

Default destinations:
- **IT Sysadmin Tasks** (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`) — operational follow-ups, security findings, infra issues
- **Personal To Do** — smaller personal items

**CREATE format:**

```
#### CREATE — [task title]
- **Plan:** [plan name] (`plan_id`)
- **Bucket:** [bucket name or leave blank]
- **Due:** YYYY-MM-DD
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Tag:** Aaron (category23)
- **Notes:** [1–2 sentences. Process guidance goes here, not in checklist.]
- **Checklist:**
  - [ ] [outcome — 5–10 words]
  - [ ] [outcome]
```

Tag default: `Aaron (category23)` for IT Sysadmin Tasks. Sam: `category21`. Verify mapping on other plans via `planner_get_plan_details`. Priority integers when pushing: Urgent=0, Important=1, Medium=3, Low=5.

Pass `priority`, `notes`, `labels`, and `checklist_items` to `planner_create_task` in a single call.

**UPDATE / REMOVE / TODO / CARRYOVER** — same formats as before. On CARRYOVER: remove the block, add to a `### Deferred` subsection:

```
- 📌 **[task title]** — [reason]. Full context in [[SVH/Daily/YYYY-MM-DD]].
```

After Aaron confirms and each block is executed, remove it from the note with `edit_block`. Set `has_pending_tasks: true` in frontmatter if any blocks remain unconfirmed at end of session.

## Step 4 — Update state file

After the note is written, update `SVH/System/briefing-state.md`:
- Set `last_day_starter` to the current ISO timestamp with timezone offset.
- Preserve all other fields.
- Use `mode: rewrite`.
