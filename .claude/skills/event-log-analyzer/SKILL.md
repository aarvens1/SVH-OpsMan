---
name: event-log-analyzer
description: Analyzes an exported Windows event log file (.xml, .csv, .txt, .log) without live system access. Produces a triage report with findings, patterns, probable cause, and next steps. References SVH-specific event signatures. Trigger phrases: "analyze this event log", "triage these Windows events", "look at the event log export from X".
when_to_use: Use when you have an exported log file rather than live system access. Complements Event Log Triage (which queries Wazuh and NinjaOne live).
allowed-tools: "mcp__obsidian__* Read(*)"
---

# Event Log Analyzer

@../../references/common-event-clusters.md

---

Use this skill when the log file has been exported and provided — not when you have live system access (use `/event-log-triage` instead).

## Step 1 — Parse the input

Accepted formats:
- **.xml** (preferred) — Windows XML event log export. Richest data: all fields, timestamps, process IDs, command lines.
- **.csv** — spreadsheet export. Check which columns are present; timestamp format may vary.
- **.txt / .log** — plain text. Parse best-effort.

Read the file. Note: total event count, date range, log source (Security, System, Application, other).

## Step 2 — Scan for significant events

Match against `common-event-clusters.md` signatures. Focus on:

**Authentication:**
- 4624 (successful logon) — note logon type (3=network, 10=remote interactive) and logon process
- 4625 (failed logon) — bursts of failures = brute force
- 4648 (explicit credential logon) — unusual if on a non-admin account
- 4672 (special privileges assigned) — admin-level logon

**Privilege and account changes:**
- 4720 (user account created), 4726 (deleted)
- 4728/4732/4756 (user added to security/local/universal group)
- 4698 (scheduled task created)

**Process and execution:**
- 4688 (process created with command line) — look for: powershell.exe with encoded commands, wscript/cscript, unusual parent processes
- 7045 (new service installed)

**System:**
- 6005/6006 (EventLog start/stop — system restart or log clearing)
- 1102 (audit log cleared) — significant

## Step 3 — Pattern analysis

After cataloguing events, look for:
- **Burst patterns** — many events of the same type in a short window (brute force, mass logon, repeated service starts)
- **Sequencing** — logon failure → success → privilege escalation (attack pattern)
- **Off-hours activity** — logins or process creation at unusual times
- **New accounts or services** — anything created in the log window
- **Log clearing** — always flag

## Step 4 — Output

Write analysis to Obsidian:

`Investigations/YYYY-MM-DD-[hostname]-log-analysis.md`

```yaml
---
date: YYYY-MM-DD
skill: Event Log Analyzer
status: draft
tags: [investigation, event-log, analysis]
---
```

Sections:
1. **Log summary** — source, date range, total events, format
2. **Key findings** — numbered, most significant first, with event IDs and timestamps
3. **Patterns observed** — clusters, sequences, anomalies
4. **Probable cause** — best assessment given the evidence
5. **Recommended next steps** — what to investigate live, what to escalate, what to close
