---
name: license-audit
description: Unified license + device audit. Cross-joins M365 license assignments, Intune enrollment, and MFA registration to surface orphaned licenses (licensed user, no device, no MFA), over-licensed users, and compliance gaps. Trigger phrases: "license audit", "orphaned licenses", "who has licenses but no device", "license waste", "unified license check".
when_to_use: Use for periodic license hygiene, cost audits, or when the "licensed but exposed" problem needs a concrete answer. Not for investigating a specific user — use /access-review for that.
allowed-tools: "mcp__svh-opsman__admin_get_user_licenses mcp__svh-opsman__intune_list_devices mcp__svh-opsman__entra_get_user_mfa_methods mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_list_risky_users mcp__obsidian__* mcp__time__*"
---

# License Audit

Cross-join M365 licenses, Intune enrollment, and MFA status to find the accounts where cost and risk intersect.

## Step 0 — Scope

Parse the user's invocation for any filters:
- **License SKU focus** (e.g., "E3 only", "E5 only"): filter results to that SKU
- **Risk focus**: highlight users who are also in Entra risky users list
- **Default**: run the full cross-join across all premium license SKUs (E3, E5, F3, EMS, Defender P1/P2)

Call `mcp__time__get_current_time` for timestamp. Define "inactive" as no sign-in in the past 30 days.

## Step 1 — Pull data in parallel

- `admin_get_user_licenses` — all licensed users with their assigned SKUs. This is the primary list; everything else is cross-referenced against it.
- `intune_list_devices` — all enrolled devices. Note: each device has a primary user (`userPrincipalName`). Build a map: UPN → [list of enrolled devices]. Users with zero devices are the gap.
- `entra_list_risky_users` — any users currently flagged. Cross-reference against the license list — a risky user who is also licensed and has no device is the worst-case finding.

## Step 2 — Per-user cross-reference

For each licensed user, determine:

| Field | Source | How to get it |
|-------|--------|---------------|
| Licenses | admin_get_user_licenses | Direct from Step 1 |
| Enrolled devices | intune_list_devices | Count of devices where primaryUser = this UPN |
| MFA registered | entra_get_user_mfa_methods | Call per user — batch for high counts; skip guests |
| Last sign-in | entra_get_sign_in_logs | Most recent login timestamp; flag if >30 days ago |
| Risky | entra_list_risky_users | Cross-reference from Step 1 |

**Batching:** `entra_get_user_mfa_methods` is per-user. For audits with >20 users, focus MFA checks on: (a) users with no Intune device, (b) risky users, (c) users with E5 or Defender P2 licenses. Don't call it for every user on a large tenant — it's expensive. Note the sampling in the output.

## Step 3 — Classify each user

Assign one or more tags:

| Tag | Criteria |
|-----|----------|
| 🔴 Exposed | Licensed + no MFA + no enrolled device |
| 🔴 Risky + licensed | In Entra risky users list AND has a premium license |
| 🟠 Ghost | Licensed + no sign-in in 30+ days (likely departed or unused) |
| 🟡 No device | Licensed + no Intune enrollment (may be intentional for some roles) |
| 🟡 No MFA | Licensed + no MFA method registered |
| 🟢 Clean | Licensed + enrolled device + MFA + active sign-in |

A user can have multiple tags. 🔴 findings always come first.

## Step 4 — Write the Obsidian note

Write to `Reviews/Access/license-audit-YYYY-MM-DD.md` in the Obsidian vault.

```markdown
---
date: YYYY-MM-DD
skill: license-audit
status: draft
tags: [audit, licensing, identity]
has_pending_tasks: true
---

# License Audit — YYYY-MM-DD

**Scope:** [all SKUs / E3 only / etc.]
**Total licensed users:** N
**Audited:** N (MFA checked for users with no device or risky flag; others sampled)

## 🔴 Critical findings

[Users tagged Exposed or Risky+licensed. One row per user:]
| User | Licenses | Devices | MFA | Last sign-in | Risk | Action |
|------|----------|---------|-----|--------------|------|--------|
| ... | ... | 0 | None | 45d ago | High | Disable or enforce MFA |

## 🟠 Ghost accounts (inactive ≥30 days)

[Users with no recent sign-in who still have premium licenses]
| User | Licenses | Last sign-in | Notes |
|------|----------|--------------|-------|
| ... | E3, EMS | 47d ago | May be departed — verify before disabling |

## 🟡 Gaps (no device or no MFA — not critical)

[Users missing one piece but not both — lower priority]
Summarize as a count with a representative sample: "12 users have licenses but no enrolled device — mostly [pattern, e.g., exec assistants, conference rooms]."

## 🟢 Clean

[Single line: "N users are licensed, enrolled, MFA-registered, and active."]

## License cost summary

| SKU | Assigned | Ghost (30d inactive) | Exposed (no device+MFA) | Est. waste |
|-----|----------|---------------------|------------------------|-----------|
| M365 E3 | N | N | N | N licenses |
| M365 E5 | N | N | N | N licenses |
| ... | | | | |

**Total ghost + exposed licenses:** N (est. $NNN/mo at list price — actual price varies by contract)

## Recommended actions

[Ordered by risk, not count:]
1. [Most critical finding + specific action: "Disable jdoe@... — no sign-in since March, E5 license"]
2. ...

## Draft Planner actions

[Draft tasks below for any findings that warrant follow-up. Nothing is created until Aaron confirms. After confirmation, remove the block using `edit_block`.]

#### CREATE — [task title]
- **Plan:** IT Sysadmin Tasks (`-aZEdilGAUqLC8B8GwOLfmQAAh9M`)
- **Bucket:** [bucket name or leave blank]
- **Due:** YYYY-MM-DD
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Notes:** [1–2 sentences of context]
- **Checklist:**
  - [ ] [outcome — not steps]
```

## Step 5 — Suggest next moves

- For any 🔴 Exposed user: suggest `/access-review` on that specific account before disabling
- For 🔴 Risky + licensed users: suggest `/tenant-forensics` to understand what they've done recently before disabling or investigating
- For ghost accounts: suggest verifying departure status before reclaiming license — a ghost that's still active is a bigger risk than a wasted license
- For no-MFA users: suggest staging a Conditional Access enforcement policy draft
- If cost waste is significant: note that license reclamation can be a monthly Planner campaign
