---
name: user-report
description: On-demand activity summary for a specific user over the last N days. Sign-ins, Entra audit events, Defender alerts, Planner tasks, Teams activity, and mail. Faster and lighter than /asset-investigation — recent activity only, no diagram. Trigger phrases: "what has [user] been doing", "user report for X", "activity report for X", "show me what X has been up to".
when_to_use: Use for a quick recent-activity snapshot of any user. Use /access-review for permission audits, /asset-investigation for a full persistent profile with diagram.
allowed-tools: "mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_user_mfa_methods mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__planner_get_user_tasks mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_list_plans mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__teams_list_my_chats mcp__svh-opsman__teams_get_chat_messages mcp__svh-opsman__teams_list_messages mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_list_teams mcp__svh-opsman__mail_search mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__obsidian__* mcp__time__*"
---

# User Report

## Step 0 — Identify the user and window

1. Call `mcp__time__get_current_time` for the current timestamp.
2. Resolve the user:
   - If Aaron is the subject, use `astevens@shoestringvalley.com`
   - Otherwise, resolve the UPN from the name provided — ask if ambiguous
3. Parse the lookback window:
   - **Explicit** ("last 3 days", "this week"): use as specified
   - **Default**: 7 days

## Step 1 — Pull data in parallel

**Identity and access:**
- `entra_get_sign_in_logs` (UPN, last N days) — locations, devices, success/failure, risk flags. Flag: first-seen country, >5 failures in window, any event marked risky.
- `entra_get_audit_logs` (filter actor = this UPN, last N days) — admin actions taken BY this user (role changes, MFA resets, consent grants, etc.)
- `entra_get_user_mfa_methods` — current MFA registration state
- `entra_list_risky_users` — is this user currently flagged?

**Security:**
- `mde_list_alerts` — Defender alerts involving this user or their devices
- `ninja_list_servers` → `ninja_list_device_alerts` on devices associated with this user (match by owner/display name)

**Work activity — if the user is Aaron:**
- `planner_get_user_tasks` (user_id: `astevens@shoestringvalley.com`, open_only: false) — tasks touched in the window
- `todo_list_task_lists` → `todo_list_tasks` — personal To Do items
- `teams_list_my_chats` (top: 50) → filter to threads active in window → `teams_get_chat_messages` (top: 5)
- `teams_list_teams` → `teams_list_channels` (team_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) → `teams_list_messages` on General, Changes, Infrastructure, Alerts — filter to Aaron's posts
- `mail_search` — sent/received mail in the window

**Work activity — if the user is someone else:**
Application auth cannot access another user's DMs or personal To Do. Use:
- `planner_list_plans` → `planner_list_tasks` — tasks assigned to this user across known operational and project boards (look for their display name in assignments)
- `teams_list_messages` on IT Team channels — filter to posts by this user

## Step 2 — Synthesise

Produce a concise activity picture. For each category, if nothing notable: one line — "No anomalies in the last N days."

- **Security posture** — risky flag status, MFA state, any recent MFA changes
- **Sign-in pattern** — locations, devices, failure rate, anomalies
- **Admin actions** — what they did in Entra (role assignments, policy changes, etc.)
- **Alerts** — Defender or NinjaOne findings tied to this user or their devices
- **Work output** — tasks completed/open, Teams/mail activity highlights (Aaron only)
- **Flags** — anything that warrants follow-up, clearly called out

Keep it tight — this is a quick read, not a log dump.

## Output

Write `Investigations/user-report-YYYY-MM-DD-[name].md`:

```yaml
---
date: YYYY-MM-DD
skill: user-report
status: draft
tags: [investigation, user]
---
```

If findings warrant escalation, suggest the appropriate next step:
- Security anomaly → `/incident-open` or `/tenant-forensics`
- Permission concern → `/access-review`
- Full profile needed → `/asset-investigation`
