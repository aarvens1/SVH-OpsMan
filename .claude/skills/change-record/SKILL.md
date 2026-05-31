---
name: change-record
description: Draft a Teams Changes channel post before making a change. Goal is to warn the help desk of anything that could generate tickets — not a formal RFC, just a practical heads-up. Composable: can be called mid-skill when another skill (patch-campaign, network-troubleshooter, etc.) is about to push changes. Trigger phrases: "change record for X", "log this change", "post to changes channel", "I'm about to change Y", "about to make a change".
when_to_use: Use before any change that could cause user-visible effects or help desk calls — config changes, patch windows, network changes, service restarts. Also invoked automatically by other skills that produce a change plan.
allowed-tools: "mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__svh-opsman__teams_list_teams mcp__svh-opsman__teams_list_channels mcp__svh-opsman__teams_send_message"
---

# Change Record

## When called from another skill

If this skill is invoked mid-flow by patch-campaign, network-troubleshooter, or any skill that has already established a change plan, skip intake questions and use the context already in the conversation. Jump to Step 2.

## Step 1 — Intake (stand-alone invocation)

Ask or infer from context — do not ask for more than you need:

1. **What's changing?** System, service, or config being modified.
2. **When?** Date and time window. If during business hours, flag that.
3. **Who or what is affected?** Sites, users, or services that could be disrupted.
4. **What might the help desk see?** Think in terms of inbound tickets: "can't print", "slow VPN", "app not loading", "password reset". If the change is transparent to end users, say so explicitly.
5. **Risk level** (infer from context, confirm only if unclear):
   - **Low** — reversible, no expected downtime, < 10 users affected
   - **Medium** — brief downtime possible, or affects a production system
   - **High** — extended downtime, irreversible, or unknown dependencies

For High-risk changes: check `ninja_list_all_backups` to confirm recent backup for any affected server before proceeding. Recommend `/onprem-health` if there's any question about baseline state.

## Step 2 — Draft Teams message

Write the Teams post in Aaron's voice. No greeting. Lead with what's happening and when. End with what the help desk should watch for.

**Format:**
```
[What's happening] — [Window or start time].

[1–2 sentences: what users or the help desk might see, and whether that's expected or a problem signal.]

[Optional: what to do if they hit an issue / who to contact.]
```

**Tone:** Conversational, direct. No "Please be advised." No bullet lists unless there are 3+ distinct impacts. Bold the window if it overlaps business hours.

**Example:**
```
Patching all R12 app servers tonight starting at 22:00. Servers will reboot once each — expect ~15 min downtime per server staggered.

If CMiC or Textura is slow Monday morning, that's the most likely cause. Reboot cycle should be done by 01:00 but let me know if anything's still down at 08:00.
```

Write the draft as a `> [!note] Teams draft — Changes channel` callout in the vault note (Step 3). Do not send until Aaron confirms.

Also check: Does this draft pass the tone check? Scan for defensive framing, blame language, minimizing language, or promises that can't be kept. Flag in one line if any are present.

## Step 3 — Write vault note

Write `Changes/CHG-YYYY-NNN.md`. Increment CHG number from the highest existing in `Changes/`:

```yaml
---
date: YYYY-MM-DD
skill: change-record
status: draft
tags: [change]
change_id: CHG-YYYY-NNN
risk: low|medium|high
window: YYYY-MM-DD HH:MM – HH:MM
change_date: YYYY-MM-DD
---
```

If called from another skill that is tagged with a project slug, add `project/<slug>` to the tags.

**Note structure:**

```
## What's changing
[One paragraph: system, scope, reason]

## Timing
[Window, duration, any business-hours overlap]

## Help desk watch items
[Bulleted list of what users might report, and whether it's expected]

## If something goes wrong
[One paragraph: rollback or escalation path]

> [!note] Teams draft — Changes channel
> [paste the draft from Step 2]
```

For High-risk changes only, add:
- `## Test plan` — how to verify the change worked
- `## Rollback procedure` — exact steps to revert

Include `## Related`: `[[Changes/changes-home]]` first, then affected infrastructure/asset notes, then project note if applicable.

## Step 4 — Push to Teams (after confirmation)

When Aaron says "send it", "push it", or confirms the draft:

1. Look up the Teams channel: `teams_list_teams` → `teams_list_channels` (team: `config.groups.it_team`) → find the **Changes** channel.
2. Send with `teams_send_message`.
3. Update the vault note: change `status: draft` → `status: filed` and add `✅ Posted to Changes channel — YYYY-MM-DD HH:MM` below the draft callout.

## Step 5 — Skill log

Append to `System/skill-log.md`:
```
YYYY-MM-DD HH:MM | change-record | Changes/CHG-YYYY-NNN.md | [one-line summary of change]
```
