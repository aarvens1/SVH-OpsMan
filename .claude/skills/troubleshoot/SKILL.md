---
name: troubleshoot
description: Systematic IT troubleshooting. Restates the problem, scopes it, inventories what's working, generates ranked hypotheses, and works through them cheapest-first. Trigger phrases: "X is broken", "troubleshoot Y", "why isn't Z working", "users can't reach X".
when_to_use: Any time something is broken or misbehaving. Works for anything — printers, VPN, login failures, app errors, network issues.
allowed-tools: "mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_list_agents mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_processes mcp__svh-opsman__ninja_list_services mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_get_device mcp__svh-opsman__admin_get_service_health mcp__svh-opsman__admin_list_service_incidents mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__unifi_get_site_health mcp__svh-opsman__unifi_list_networks mcp__svh-opsman__unifi_list_firewall_rules mcp__svh-opsman__unifi_list_clients mcp__obsidian__* mcp__desktop-commander__* mcp__time__*"
---

# Troubleshoot

@../../references/common-failure-modes.md
@../../references/hypothesis-patterns.md

---

## Step 1 — Frame the problem

Write two sentences before touching any tool:
- **Expected:** What should happen?
- **Actual:** What is happening instead?

Then ask (or infer from context):
- Is this affecting one user or many?
- One site or all sites?
- When did it start? Any recent changes?

## Step 2 — Scope check

| Signal | Tool |
|--------|------|
| M365 service outage? | `admin_get_service_health`, `admin_list_service_incidents` |
| Wazuh alerts on affected host? | `wazuh_search_alerts` (filter by hostname, last 4h) |
| NinjaOne alerts? | `ninja_list_device_alerts` |
| Defender alerts? | `mde_list_alerts` |
| Sign-in failures? | `entra_get_sign_in_logs` |
| Network/site issue? | `unifi_get_site_health`, `unifi_list_networks` |

Scoping determines whether this is isolated or widespread, and cuts the hypothesis list immediately.

## Step 3 — Generate ranked hypotheses

Draw from `hypothesis-patterns.md` and `common-failure-modes.md`. List 3–5 hypotheses, most likely first. Cheapest-to-test takes priority when likelihood is equal.

## Step 4 — Work through hypotheses

For each hypothesis, state:
- What would confirm or rule it out
- Which tool or command to run
- Result

Use `desktop-commander` for direct shell access when needed (ping, traceroute, Test-NetConnection, netstat, etc.). Document each result before moving to the next hypothesis.

## Step 5 — Write findings to Obsidian

Write to `Investigations/YYYY-MM-DD-[topic].md` with:

```yaml
---
date: YYYY-MM-DD
skill: Troubleshoot
status: draft
tags: [investigation, troubleshoot]
---
```

Sections: Problem statement → Scope → Hypotheses tested → Root cause (or "inconclusive — next steps") → Recommended fix → Follow-up items.

## Escalation paths

- **Network connectivity** (can't reach a resource, VLAN routing, site issues) → `/network-troubleshooter` for a full layer-by-layer investigation and topology diagram
- **Deep event log analysis on a specific host** → `/event-log-triage` (live) or `/event-log-analyzer` (exported file)
- **Problem confirmed significant enough to declare** → `/incident-open`
- **Suspected security event** → `/tenant-forensics` or `/asset-investigation`
