---
name: tenant-forensics
description: "What broke and who touched it?" forensic pair. Cross-references Azure activity logs + Entra audit logs by timestamp and actor to produce a human-readable change timeline for a given window. Trigger phrases: "who touched it", "what changed before X broke", "tenant forensics", "forensic audit", "what happened in Azure around [time]".
when_to_use: Use when something broke and you need to know what changed in the 30–60 minutes before it. Also useful for ad-hoc change auditing, compliance checks, or "someone did something they shouldn't have" investigations.
allowed-tools: "mcp__svh-opsman__azure_get_activity_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_role_members mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__ninja_get_patch_history mcp__obsidian__* mcp__time__*"
---

# Tenant Forensics

"What broke and who touched it?" — cross-reference Azure activity logs and Entra audit logs by timestamp and actor to produce a unified change timeline.

## Step 0 — Establish the window

1. Call `mcp__time__get_current_time` for the current timestamp.
2. Parse the user's invocation for a time window. Accept any of:
   - Explicit range: "between 2pm and 3pm yesterday", "from 14:00 to 15:30 on May 12"
   - Relative: "last 2 hours", "last 30 minutes"
   - Incident-anchored: "30 minutes before the [thing] broke" — ask the user for the incident time if not provided
   - Default if nothing specified: last 2 hours
3. Note the resolved window clearly at the top of the output (e.g., "Window: 2026-05-14 13:30–14:45 PDT").
4. Optional focus: if the user named a resource, service, or user, note it — use it to filter or highlight results.

## Step 1 — Pull all sources in parallel

Run simultaneously:

- `azure_get_activity_logs` — for the window. Captures: resource create/update/delete, NSG rule changes, VM start/stop/resize, storage config changes, RBAC assignments, policy changes, diagnostic setting changes.
- `entra_get_audit_logs` — for the window. Captures: user/group/role changes, MFA method changes, app registrations, consent grants, conditional access policy edits, password resets, license assignments, guest invitations.

**NinjaOne — if a specific host is named:**
1. `ninja_list_servers` to find the device ID for the named host.
2. Run in parallel for that device:
   - `ninja_list_device_alerts` — active alerts on this device right now. A pre-existing alert correlating with the window is significant.
   - `ninja_get_event_logs` (log_name: System, level: Error/Critical, page_size: 500) — service crashes, driver failures, unexpected restarts, disk errors in the window.
   - `ninja_get_event_logs` (log_name: Application, level: Error/Critical, page_size: 500) — application crashes, .NET exceptions, SQL errors.
   - `ninja_get_event_logs` (log_name: Security, page_size: 500) — account logons, privilege use, audit failures (event IDs 4624, 4625, 4648, 4672, 4698, 4702). **Note:** Security log is often high-volume — filter to error/warning or known-important event IDs when possible.
   - `ninja_get_patch_history` — any patches installed in the window. A patch install right before an incident is a strong causal candidate.

**Scope note:** NinjaOne gives you System, Application, and Security channels only — up to 500 events per call. For deeper channels (PowerShell Operational, Task Scheduler, WMI Activity) use `/event-log-triage` which goes via Desktop Commander + PS remoting.

Optionally (if the window is ≤4 hours and there's a specific suspected actor):
- `entra_get_sign_in_logs` — to see if the suspected actor had a login event just before the change. Correlate login time → admin action → incident.

## Step 2 — Merge and sort

Combine all events from both sources into a single list sorted by timestamp ascending. Normalize the actor field across sources:
- Azure: `caller` field (UPN or service principal app ID)
- Entra: `initiatedBy.user.userPrincipalName` or `initiatedBy.app.displayName`

Group by actor. For each actor, show their events in chronological order. If an actor made changes across BOTH Azure and Entra in the window, that's notable — call it out.

## Step 3 — Highlight signal

Flag the following patterns regardless of actor:

| Pattern | Why it matters |
|---------|---------------|
| RBAC role assignment (Azure or Entra) | Privilege escalation |
| Conditional Access policy edit | Auth control change |
| NSG rule added/modified | Network exposure change |
| MFA method reset | Account takeover vector |
| App consent grant | OAuth abuse vector |
| Resource deletion | Data loss / sabotage |
| Service principal secret added | Lateral movement |
| Config change < 30 min before a reported break | Likely causal |

If the user named a specific broken resource: check whether any actor touched that resource (or its containing resource group, VNet, NSG, or policy set) in the window. If yes, highlight that actor's full action sequence.

## Step 4 — Write the Obsidian note

Write to `Investigations/YYYY-MM-DD-tenant-forensics-HHmm.md` in the Obsidian vault.

```markdown
---
date: YYYY-MM-DD
skill: tenant-forensics
status: draft
tags: [forensics, audit, investigation]
---

# Tenant Forensics — [window description]

**Window:** [start] – [end] ([timezone])
**Focus:** [named resource/user/service, or "general"]
**Sources:** Azure Activity Logs · Entra Audit Logs[· Sign-in Logs]

## Timeline

[Chronological list, one entry per event, format:]
**HH:MM** · [source: Azure / Entra] · **[actor]** · [action] → [target resource or object]
  - [Detail: old value → new value if available]

## Actor summary

For each actor who made changes:
### [actor UPN or service principal name]
- N changes in window
- [List of actions, one per line]
- [If also in sign-in logs: signed in at HH:MM from [IP/location] — [N minutes] before first change]

## NinjaOne — [hostname] *(omit section if no host named)*

**Patches installed in window:**
[List any patches with install timestamp, KB number, and success/failure. A patch install < 30 min before an incident is highlighted.]

**System / Application errors in window:**
[Chronological list: timestamp · event ID · source · message. Flag anything that correlates with the reported break time.]

**Security events of note:**
[High-value event IDs only: 4625 (failed logon), 4648 (explicit cred use), 4672 (special privilege), 4698/4702 (scheduled task created/modified). Skip routine 4624 logon noise unless the user account or time is suspicious.]

**Channel coverage note:** System · Application · Security only. Use `/event-log-triage` for PowerShell Operational, Task Scheduler, WMI Activity.

## Findings

[Highlighted patterns from Step 3. If causal link to a broken resource is likely, state it clearly: "At 14:22, jsmith modified NSG rule X — this is 4 minutes before the reported connectivity loss on VLAN 20." If a NinjaOne patch install or event correlates with the Azure/Entra timeline, call that out explicitly.]

## Not explained

[List any known-broken things from the user's description that do NOT appear to have a corresponding change in either log source — these need other investigation paths.]
```

## Step 5 — Suggest next moves

Based on findings:
- If a causal actor is identified: suggest `entra_get_audit_logs` broader window on that actor, or `/asset-investigation` on the affected resource
- If a suspicious actor made admin changes: suggest `/access-review` on that account to assess current permissions and whether the account should be suspended
- If an RBAC change was found: `entra_get_role_members` to check current state of the role
- If nothing explains the break: suggest `/event-log-triage` on the affected host (covers PowerShell Operational, Task Scheduler, WMI — channels not in NinjaOne), or `/network-troubleshooter` if it's connectivity
- If a suspicious actor is found but no clear break: suggest `/user-report` for a 7-day activity snapshot, and stage a Planner task to review
- If findings are serious enough to declare: suggest `/incident-open`
