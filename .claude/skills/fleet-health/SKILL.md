---
name: fleet-health
description: Fleet-level server health roll-up. Aggregates disk, patch lag, backup currency, compliance, and active alerts across all servers into a single-page summary — not per-device detail. Trigger phrases: "fleet health", "how are my servers doing", "server fleet overview", "fleet status".
when_to_use: Use when you want a cross-fleet picture rather than a per-device drill-down. For deep investigation on a single device, use /asset-investigation instead. Run after an incident or before a patch campaign to establish baseline.
allowed-tools: "mcp__svh-opsman__staging_status mcp__svh-opsman__staging_read mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_alerts mcp__svh-opsman__ninja_list_fleet_volumes mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_get_backup_usage mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__mde_list_devices mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__intune_list_devices mcp__svh-opsman__intune_get_device_compliance mcp__svh-opsman__metrics_disk_over_threshold mcp__svh-opsman__metrics_disk_trend"
---

# Fleet Health

## Step 1 — Data collection

Check staging first. If staging is fresh (< 2h), read device and alert data from there. If stale, call live APIs.

Run in parallel:

**From staging or live NinjaOne:**
- `staging_status` → if fresh, use `staging_read { file: "ninja-devices" }` and `staging_read { file: "ninja-alerts" }`.
- If stale: `ninja_list_servers` (org: 25 — Servers), `ninja_list_alerts` (no org filter — known to include all), `ninja_list_fleet_volumes`.
- `ninja_list_all_backups` + `ninja_get_backup_usage` — backup state and storage totals.
- `ninja_list_pending_patches` — patches pending across fleet; count by severity.
- `metrics_disk_over_threshold` — volumes at or below threshold from metrics DB.

**From live APIs (always fresh):**
- `mde_list_devices` — Defender device list; note risk levels (High/Critical).
- `mde_list_alerts` — active Defender alerts.
- `intune_list_devices` — Intune device list; note compliance state.

## Step 2 — Aggregate per server

For each server, build a single-row summary across all data sources:

| Column | Source | Flag when |
|--------|--------|-----------|
| Device | NinjaOne | — |
| Org | NinjaOne | — |
| Alerts | NinjaOne `ninja_list_alerts` | Any active alert |
| Disk (worst vol %) | `ninja_list_fleet_volumes` or `metrics_disk_over_threshold` | ≤ 15% free |
| Last backup | `ninja_list_all_backups` | > 24h ago or failed |
| Pending patches | `ninja_list_pending_patches` | Critical/High patches pending |
| MDE risk | `mde_list_devices` | High or Critical |
| Intune | `intune_list_devices` | Non-compliant |
| Status | Aggregate | 🔴 if 2+ flags; 🟡 if 1 flag; 🟢 if clean |

Skip ACCOPDXARCHIVE (always in maintenance mode).

## Step 3 — Compute summary stats

- Total servers in fleet
- Servers with active alerts: N
- Servers with disk ≤ 15%: N
- Servers with stale/failed backups: N
- Servers with Critical/High patches pending: N
- Servers non-compliant in Intune: N
- Servers not enrolled in MDE: N
- Backup storage: X TB used / Y TB total (Z%)

## Step 4 — Write vault note

Write `Reviews/YYYY-MM-DD-fleet-health.md`:

```yaml
---
date: YYYY-MM-DD
skill: fleet-health
status: draft
tags: [review, fleet, servers]
---
```

**Note structure:**

Open with a callout that summarizes the fleet state:

```
> [!danger] N servers need attention   ← if any 🔴
> ⛔ [Device] — [worst issue]
> ⚠️ [Device] — [issue]

or

> [!success] Fleet healthy — N servers checked, no flags   ← if all clean
```

Then:

### Fleet summary

One-line stats block: total servers, alerts, disk warnings, stale backups, pending patches, MDE/Intune gaps.

Backup storage: `X TB used / Y TB (Z%)`.

### Server table

One row per server. Use 🔴/🟡/🟢 in the Status column. Sort: 🔴 first, then 🟡, then 🟢. Omit clean (🟢) rows if there are more than 10 — note "N servers clean, not shown."

### Data gaps

If any tool call failed or returned incomplete data, list it here with the error. If all tools succeeded, omit this section.

### Related

`[[Reviews/reviews-home]]` · `[[Assets/assets-home]]`

## Step 5 — Skill log

Append to `System/skill-log.md`:
```
YYYY-MM-DD HH:MM | fleet-health | Reviews/YYYY-MM-DD-fleet-health.md | N servers: N critical, N warning, N clean
```
