---
name: incident-open
description: Formally declare and document an IT incident. Captures severity, affected systems, timeline, and initial hypothesis. Creates the Obsidian incident note, drafts a Planner tracking card, and stages a Teams alert. Trigger phrases: "open an incident", "declare an incident", "this is an incident", "incident for X".
when_to_use: Use when a problem is confirmed significant enough to warrant an incident record — not for preliminary investigation. Use /troubleshoot first if you're still diagnosing.
allowed-tools: "mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_list_plans mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_channels"
---

# Incident Open

## Step 1 — Establish incident details

Gather from the user's invocation or ask only for what's missing:

| Field | Notes |
|-------|-------|
| **Name** | Short slug (e.g., "vpn-outage", "entra-breach-suspected") |
| **Severity** | See classification below |
| **Affected systems** | Devices, services, sites, or user groups |
| **What's known** | Current symptom description |
| **Detection time** | When was this first noticed |
| **Related project (optional)** | If the incident is connected to an active project (e.g., a network-seg rollout that broke something), capture the project slug. Listed from `Projects/*.md` with `status: active`. Adds a `project/<slug>` tag to the incident frontmatter. |

**Severity classification:**
- **Critical** — production outage, data breach suspected, ransomware, complete service loss affecting multiple sites
- **High** — significant service degradation, single-site outage, active security event
- **Medium** — partial degradation, isolated outage, security finding requiring action
- **Low** — minor disruption, precautionary record, low-confidence security signal

## Step 2 — Pull supporting context

Run in parallel to populate the incident record with known facts:
- `mde_list_alerts` — High/Critical Defender alerts active now
- `wazuh_search_alerts` — Wazuh alerts on affected hosts in the last 2 hours
- `ninja_list_servers` → `ninja_list_device_alerts` on affected devices
- `entra_list_risky_users` — any risky users flagged
- `admin_list_service_incidents` — any active M365 incidents that may be related

Use these to fill in the "Supporting signals" section and rule out external causes before writing the note.

## Step 3 — Assign incident ID

Read `Incidents/Active/` from Obsidian to find the highest existing INC-YYYY-NNN for the current year. Assign the next number. If no incidents exist yet this year, start at INC-YYYY-001.

## Step 4 — Write incident note

Write `Incidents/Active/YYYY-MM-DD-[name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Incident Open
status: open
tags: [incident, project/<slug-if-applicable>]
incident_id: INC-YYYY-NNN
severity: critical|high|medium|low
---
```

Add `project/<slug>` to the tags only if Step 1 captured a related active project.

Sections:
- **Summary** — one paragraph: what broke, when, what's affected
- **Timeline** — bullet list of known events with timestamps. Start from detection time; add tool findings with their timestamps.
- **Affected systems** — devices, services, user groups
- **Current hypothesis** — best guess at root cause, clearly labelled as unconfirmed
- **Supporting signals** — findings from Step 2 (alerts, risky users, M365 incidents)
- **Next steps** — immediate actions in priority order
- **Open questions** — what's still unknown
- **Related** — `[[Incidents/incidents-home]]` as first link, plus affected asset and infrastructure notes

## Step 5 — Link from daily note

Append a line to today's `Briefings/Daily/YYYY-MM-DD.md` in the `# Activity Log` section using the `edit_block` / `<!-- DAY-STARTER-END -->` sentinel:

```markdown
→ [[Incidents/Active/YYYY-MM-DD-name]] — [one-sentence summary + severity]
```

If no daily note exists for today, skip this step.

## Skill log

Append one line to `System/skill-log.md`:
`YYYY-MM-DD HH:MM | incident-open | Incidents/Active/YYYY-MM-DD-[name].md | [severity + one-line summary]`

## Step 6 — Staged drafts (nothing sent or created until confirmed)

**Planner card draft:**

```
#### CREATE — [INC-YYYY-NNN] [name]
- **Plan:** IT Sysadmin Tasks (`config.planner.sysadmin`)
- **Bucket:** In progress
- **Due:** YYYY-MM-DD (today)
- **Priority:** Urgent (Critical/High) | Important (Medium) | Medium (Low)
- **Assigned:** Aaron Stevens
- **Notes:** [[Incidents/Active/YYYY-MM-DD-name]]
- **Checklist:**
  - [ ] Contain or mitigate
  - [ ] Identify root cause
  - [ ] Restore service
  - [ ] Write post-incident summary
```

**Teams alert draft** — IT Team Alerts channel (team_id from `config.yaml groups.it_team`, channel: Alerts). Not sent until Aaron confirms.

Write in Aaron's voice, no greeting, declarative:
- Lead with severity if Critical or High: `**[CRITICAL]**` or `**[HIGH]**`
- State what broke and when
- State what's being done now
- State where to follow updates

Keep it under 5 lines. Present as a clearly labelled draft block.
