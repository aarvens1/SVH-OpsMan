---
name: event-log-triage
description: Live event log investigation on a specific host or time window. Queries Wazuh first for broad correlation, then NinjaOne for anything Wazuh missed, then targeted PowerShell via Desktop Commander for precision. Trigger phrases: "check event logs on X", "what happened on Z around [time]", "event log triage for X".
when_to_use: Use when you need to investigate what happened on a specific host at a specific time, using live system access.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_list_agents mcp__svh-opsman__wazuh_get_fim_events mcp__svh-opsman__wazuh_get_rootcheck mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_processes mcp__svh-opsman__ninja_list_services mcp__obsidian__* mcp__desktop-commander__* mcp__time__* Read(powershell/**)"
---

# Event Log Triage

@../../references/common-event-clusters.md

---

Complements **Event Log Analyzer** (`/event-log-analyzer`), which works from an uploaded export file without live access. If the user provides an exported .xml, .csv, or .log file rather than a hostname, switch to `/event-log-analyzer` instead. Use this skill when you have live system access.

## Step 1 — Wazuh first (broad correlation)

`wazuh_search_alerts` — filter by agent hostname and the relevant time window. Note:
- Alert level (10+ is significant)
- Rule groups (authentication_failures, syscheck, etc.)
- Frequency and clustering of events

`wazuh_get_fim_events` — file integrity monitoring events on the host for the window. Any unexpected changes to system files, scripts, or startup items?

`wazuh_get_rootcheck` — rootcheck findings. Policy violations, hidden files, suspicious entries.

## Step 2 — NinjaOne for anything Wazuh missed

`ninja_get_event_logs` — pull Windows Event Log entries from NinjaOne for the host and time window. Focus on:
- Event IDs in `common-event-clusters.md`
- Logon events (4624, 4625, 4648, 4672)
- Process creation (4688) with command lines
- Service changes (7045, 7040)
- Scheduled task creation (4698)

`ninja_list_processes` — what's currently running. Compare against known-good baseline.
`ninja_list_services` — service states. Anything stopped that shouldn't be, or running that shouldn't be?

## Step 3 — PowerShell precision (Desktop Commander)

**Before writing PS commands:** read `powershell/README.md` and `references/ps-remoting-snippets.md`. Use SVH module functions where they exist. If a required query capability is missing from the modules, note the gap alongside the raw `Get-WinEvent` workaround.

For targeted deep-dives that NinjaOne and Wazuh don't surface, use Desktop Commander to run PowerShell on the host directly:

Common queries:
- `Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-4)}`
- `Get-ScheduledTask | Where-Object {$_.State -eq 'Running'}`
- Recent PowerShell history via `Get-Content $env:APPDATA\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt`

## Step 4 — Output

Write findings to `Investigations/YYYY-MM-DD-[host]-event-log.md`:

```yaml
---
date: YYYY-MM-DD
skill: Event Log Triage
status: draft
tags: [investigation, event-log]
---
```

Timeline of significant events → Notable clusters → Root cause or open questions → Recommended next steps.
