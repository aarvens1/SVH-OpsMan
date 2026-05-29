---
name: license-count
description: Quick E1/E3 license seat count. Shows total purchased, consumed, and available seats for M365 E1 and E3 subscriptions. Alerts if seats are critically low or exhausted and drafts a To Do task to notify procurement. Trigger phrases: "license count", "how many E1/E3 licenses", "check license inventory", "are we low on licenses", "E1 seats", "E3 seats".
when_to_use: Use for a quick license headroom check — runs in ~10 seconds. For a full cost/compliance audit (per-user cross-join, ghost accounts, orphaned licenses), use /license-audit instead.
allowed-tools: "mcp__svh-opsman__admin_list_subscriptions mcp__svh-opsman__todo_list_task_lists mcp__svh-opsman__todo_create_task mcp__obsidian__* mcp__time__*"
---

# License Count

Quick seat headroom check for M365 E1 and E3 subscriptions.

## PowerShell equivalents (reference before building)

The underlying data for this skill is already available in the PowerShell module suite:
- `Get-SVHTenantSubscriptions` (SVH.Entra) — returns all SKUs with total/consumed/available
- `Get-SVHLicenseSeatAlert` (SVH.Entra) — filters to E1/E3 pattern, applies threshold, returns only flagged SKUs

When Claude or an operator needs the same data outside a session, use those functions rather than calling this skill.

## Step 1 — Pull subscriptions

Call `admin_list_subscriptions`. This returns all active M365 subscriptions.

Filter results to identify E1 and E3 SKUs. Look for these product name patterns (case-insensitive):
- **E1**: contains "E1", "STANDARDPACK", "Business Basic", or "Essentials"
- **E3**: contains "E3", "ENTERPRISEPACK", "Business Standard"

If the response includes more specific subscription names, use the full name in output.

## Step 2 — Compute headroom

For each matched SKU:
- **Total**: `prepaidUnits.enabled` (or equivalent "total purchased" field)
- **Consumed**: `consumedUnits`
- **Available**: Total − Consumed

Apply thresholds:
| Available | Status |
|-----------|--------|
| 0 | 🔴 Zero seats — critical |
| 1+ | 🟢 Healthy |

SVH intentionally runs at 1 available seat as standard practice — do not flag this as a warning.

If a SKU has no matching subscriptions at all: note "No E1/E3 subscription found" — that itself is worth investigating.

## Step 3 — Threshold actions

**If available = 0 for any SKU:**
- Flag 🔴 in output
- Draft a To Do task (format below) — do not create until confirmed

**Draft To Do task format:**
```
#### TODO — Order more M365 [E1/E3] licenses — seats exhausted
- **List:** [default personal list]
- **Due:** [next calendar day]
- **Priority:** Urgent
- **Notes:** M365 [E1/E3] hit zero available seats as of [date]. Notify Peter and Brian to place an order before new hires or role changes are blocked.
- **Checklist:**
  - [ ] Notify Peter re: license count
  - [ ] Notify Brian re: license count
  - [ ] Confirm order placed with Microsoft/reseller
  - [ ] Verify new seats appear in admin portal
```

## Step 4 — Output

**Inline summary** (always shown in chat):

```
M365 License Headroom — YYYY-MM-DD HH:MM

| SKU | Total | Consumed | Available | Status |
|-----|-------|----------|-----------|--------|
| M365 E1 | N | N | N | 🟢/🟡/🔴 |
| M365 E3 | N | N | N | 🟢/🟡/🔴 |
```

If called from the day-starter, return just the table and threshold flags — skip the Obsidian note write. The day-starter handles its own note.

If called adhoc, append a brief entry to `System/skill-log.md`:
`YYYY-MM-DD HH:MM | license-count | inline | E1: N avail, E3: N avail`

If any SKU is 🔴, present the draft To Do task and wait for Aaron to confirm before creating it.
