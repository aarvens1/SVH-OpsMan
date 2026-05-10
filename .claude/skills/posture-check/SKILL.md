---
name: posture-check
description: Cross-system security posture snapshot, scored Green / Yellow / Red across six categories: Identity, Endpoints, Patching, Infrastructure, SIEM, and Cloud. Trigger phrases: "posture check", "state of the land", "health check", "security posture".
when_to_use: Use for a broad security health check across all systems — not for investigating a specific alert.
allowed-tools: "mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_list_expiring_secrets mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_list_devices mcp__svh-opsman__intune_list_devices mcp__svh-opsman__intune_get_device_compliance mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__unifi_get_site_health mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_list_agents mcp__svh-opsman__azure_list_advisor_recommendations mcp__svh-opsman__admin_get_service_health mcp__obsidian__* mcp__time__*"
---

# Security Posture Snapshot

Run all six categories in parallel, then synthesise.

## Identity
- `entra_list_risky_users` — any High or Medium risky users
- `entra_list_expiring_secrets` — app secrets expiring within 30 days
- `entra_get_audit_logs` — anomalies: bulk role changes, guest invitations, consent grants in the past 7 days

🟢 No risky users, no secrets expiring < 14 days, no audit anomalies  
🟡 1–2 risky users (Medium), secrets expiring 14–30 days  
🔴 Any High risky user, secrets expiring < 14 days, or suspicious audit event

## Endpoints
- `mde_list_alerts` — open alerts at High or Critical severity
- `intune_list_devices` + `intune_get_device_compliance` — non-compliant devices
- `mde_list_devices` — devices without recent check-in (> 7 days)

🟢 No High/Critical alerts, < 5% non-compliant, all devices checked in  
🟡 1–3 High alerts (no Critical), 5–15% non-compliant  
🔴 Any Critical alert, > 15% non-compliant, or significant gap in device visibility

## Patching
- `ninja_list_pending_patches` — patches pending by severity
- `mde_list_devices` — TVM exposure score (from Defender)

🟢 No Critical patches pending, Low exposure score  
🟡 Critical patches pending on < 10% of devices  
🔴 Critical patches pending on ≥ 10% of devices, or High exposure score

## Infrastructure
- `ninja_list_all_backups` — failed or missed backups in the past 7 days
- `ninja_list_device_alerts` — alerts on servers (not workstations)
- `unifi_get_site_health` — for each site, note any device offline or site alert

🟢 All backups succeeded, no server alerts, all sites healthy  
🟡 1–2 non-critical backup failures, minor site alerts  
🔴 Any server backup failure, critical server alert, or site offline

## SIEM
- `wazuh_search_alerts` — High-severity alerts in the past 24h, count and top rules
- `wazuh_list_agents` — any agents disconnected

🟢 0–2 High alerts, all agents connected  
🟡 3–10 High alerts, 1–2 agents disconnected  
🔴 > 10 High alerts, critical alerts, or > 2 agents disconnected

## Cloud
- `azure_list_advisor_recommendations` — filtered to Security category
- `admin_get_service_health` — any active M365 incidents

🟢 No High/Critical Advisor recommendations, no M365 incidents  
🟡 1–3 Medium Advisor recommendations  
🔴 Any High/Critical Advisor recommendation, or active M365 incident

---

## Output

Write a timestamped snapshot note (do not overwrite previous ones):

`Briefings/Daily/YYYY-MM-DD-posture.md`

```yaml
---
date: YYYY-MM-DD
skill: Security Posture Snapshot
status: draft
tags: [posture, security, briefing]
---
```

Format: summary scorecard at the top (all six categories with colour), then findings by category below. No alerts are sent unless the user asks.
