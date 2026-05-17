---
name: patch-campaign
description: Plan a patch campaign across all managed devices. Pulls pending patches from NinjaOne, cross-references Defender TVM priority, groups into tiers, and creates a Planner board for tracking. Trigger phrases: "patch campaign", "what needs patching", "let's plan patching", "patching this month".
when_to_use: Use when planning a scheduled patching cycle or responding to a critical patch release.
allowed-tools: "mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_organizations mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__mde_get_security_recommendations mcp__svh-opsman__mde_list_devices mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_plan mcp__svh-opsman__planner_create_bucket mcp__svh-opsman__planner_create_task mcp__obsidian__* mcp__firecrawl__* mcp__time__*"
---

# Patch Campaign

## Step 1 — Inventory pending patches

`ninja_list_pending_patches` — all devices, all pending patches. Group by:
- CVE severity (Critical, High, Medium, Low)
- KB / patch name
- Affected device count

`mde_get_security_recommendations` — Defender TVM recommendations. Cross-reference with NinjaOne pending patches to identify CVEs with active exploit activity.

`ninja_list_servers` — separate server list from workstations. Servers get their own patching tier due to change control requirements.

`ninja_list_all_backups` — confirm all servers have a recent successful backup before scheduling patches.

## Step 2 — Tier assignment

| Tier | Criteria | Target |
|------|----------|--------|
| **Emergency** | Critical CVE on KEV, or CVSS ≥ 9.0 with EPSS ≥ 0.50 | 24–48h |
| **This Week** | Critical CVE not on KEV, or High + TVM recommended | 7 days |
| **Next Cycle** | High CVE, not TVM-recommended, or Medium with broad exposure | Next maintenance window |
| **Accept** | Low/Medium, no exploit path, internal-only systems | Track and revisit quarterly |

Use Firecrawl to spot-check EPSS and KEV status for any Critical CVEs if not in Defender. If Firecrawl is unavailable, skip EPSS/KEV enrichment — note it in the output and rely on Defender TVM exposure score as the primary priority signal.

## Step 3 — Create Planner board

If no patching plan exists, `planner_create_plan` named "Patch Campaign — YYYY-MM".

Create buckets: `planner_create_bucket` for Emergency, This Week, Next Cycle.

Create tasks: `planner_create_task` per patch group with:
- Title: KB/CVE name + affected device count
- Bucket: matching tier
- Due date: matching timeline
- Notes: list of affected devices, backup status

Write all CREATE blocks to the Obsidian note using the standard draft format (same as day-starter `### 📝 Draft Planner actions`). Nothing is created until Aaron confirms. After confirmation, execute sequentially — plan first, then buckets, then tasks — and remove each block with `edit_block` after success. Set `has_pending_tasks: true` in the frontmatter until all blocks are pushed.

## Output

Write `Reviews/Patches/YYYY-MM-DD-patch-campaign.md`:

```yaml
---
date: YYYY-MM-DD
skill: Patch Campaign
status: draft
tags: [patching, campaign]
has_pending_tasks: true
---
```

Sections: Summary (total patches, by tier) → Emergency items → Tier breakdown table → Planner board link → Backup status → Draft Planner actions.
