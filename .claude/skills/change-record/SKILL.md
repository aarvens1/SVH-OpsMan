---
name: change-record
description: Document a change before or during implementation. Captures scope, risk classification, test plan, rollback procedure, comms plan, and schedule. Produces an impact-scope Excalidraw diagram. Trigger phrases: "about to make a change", "document this rollout", "change record for X", "I'm about to change Y".
when_to_use: Use before any significant change — config changes, deployments, infrastructure changes, major updates.
allowed-tools: "mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__confluence_create_page mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_channels mcp__obsidian__* mcp__excalidraw__* mcp__time__*"
---

# Change Record

## Step 1 — Capture change details

Ask (or infer from context):
1. **What's changing?** — system, component, configuration
2. **Why?** — business driver or technical reason
3. **Scope** — which systems, sites, or users are affected
4. **Schedule** — proposed date/time and maintenance window
5. **Risk level** — Low / Medium / High (see below)

**Risk classification:**
- **Low** — reversible, no production downtime, affects < 10 users, tested in lab
- **Medium** — brief downtime possible, or production system, or no lab test
- **High** — extended downtime possible, or irreversible, or unknown dependencies

## Step 2 — Check backup state

`ninja_list_all_backups` — confirm recent successful backup for any affected server before proceeding.

`ninja_list_servers` — identify all servers in scope.

`confluence_search_pages` — check if there's existing documentation for this system.

## Step 3 — Structure the record

Produce:
- **Scope** — what's changing, what's explicitly out of scope
- **Test plan** — how to verify the change worked
- **Rollback procedure** — exactly how to revert if something goes wrong
- **Comms plan** — who needs to know, when, through what channel
- **Schedule** — start time, expected duration, rollback decision point

## Step 4 — Impact diagram

Create `Diagrams/Changes/CHG-YYYY-NNN.excalidraw` showing:
- What's changing (centre)
- What depends on it (upstream)
- What it affects (downstream)
- What's explicitly out of scope (greyed out)

Embed in the note with `![[CHG-YYYY-NNN.excalidraw]]`.

## Output

Write `Changes/CHG-YYYY-NNN.md`:

```yaml
---
date: YYYY-MM-DD
skill: Change Record
status: draft
tags: [change]
change_id: CHG-YYYY-NNN
risk: low|medium|high
window: YYYY-MM-DD HH:MM – HH:MM
---
```

Also produce (as staged drafts):
- **Confluence page** — `confluence_create_page` in the IT changes space
- **Planner card** — `planner_create_task` for tracking
- **Teams notification draft** — for the techs channel (not sent until user confirms). Draft in Aaron's voice following the `aaron-voice` rules: no greeting, declarative tone, state what's changing, start time, and expected duration. Bold the maintenance window if users need to plan around it (e.g., `**Maintenance window: Sunday 2026-05-10 22:00–00:00 — file server will be offline.**`). Run the self-check before presenting.
