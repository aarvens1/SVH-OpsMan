---
name: staging-review
description: Quick summary of the latest collector staging data — what was gathered, how fresh it is, and any gaps. Trigger phrases: "what's in staging", "show me the latest data", "staging summary", "what did the last gather collect", "staging check", "check staging"
when_to_use: When you want a fast read on what data is available before a briefing, or to spot missing/failed jobs, without running a full day starter.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read"
---

**Step 1** — Call `staging_status`. Note: collection timestamp, age, available files, any jobs that failed or are missing.

**Step 2** — Read each available file in parallel using `staging_read`:
- ninja-devices, ninja-alerts
- graph-mail, graph-calendar, graph-audit
- graph-service-health
- planner-tasks
- unifi-alerts

Skip files not listed in the manifest.

**Output** — Reply in chat, no vault note. Structure:

```
Collected: <timestamp> (<age>)

Source         | Records | Notes
---------------|---------|-------
ninja-devices  | N       |
ninja-alerts   | N       | N active
graph-mail     | N       | N unread
graph-calendar | N       |
graph-audit    | N       |
planner-tasks  | N       |
...            |         |

Missing/failed: <list or "none">
```

One callout line at the bottom if anything warrants attention (high alert count, stale data > 4h, failed jobs).

## Skill log

Append one line to `System/skill-log.md` in the vault:
`YYYY-MM-DD HH:MM | staging-review | inline | [overall status: N green, N yellow, N red]`
