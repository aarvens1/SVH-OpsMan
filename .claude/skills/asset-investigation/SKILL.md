---
name: asset-investigation
description: Deep-dive investigation of a single asset — server, workstation, or user. Aggregates data from all relevant systems into a persistent Obsidian note. For servers/workstations, produces an Excalidraw network position diagram. Trigger phrases: "tell me everything about [asset]", "asset report for X", "investigate [server/user]".
when_to_use: Use when you need a complete picture of a specific device or user across all systems.
allowed-tools: "mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_services mcp__svh-opsman__ninja_list_processes mcp__svh-opsman__ninja_list_volumes mcp__svh-opsman__ninja_list_device_backups mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__ninja_get_patch_history mcp__svh-opsman__ninja_get_device_custom_fields mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_get_fim_events mcp__svh-opsman__wazuh_get_agent_vulnerabilities mcp__svh-opsman__mde_get_device mcp__svh-opsman__mde_get_device_vulnerabilities mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_user_mfa_methods mcp__svh-opsman__entra_get_role_members mcp__svh-opsman__entra_list_conditional_access_policies mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__azure_get_vm mcp__svh-opsman__unifi_list_clients mcp__obsidian__* mcp__excalidraw__* mcp__time__*"
---

# Asset Investigation

Read any existing `Assets/[name].md` from Obsidian before starting — update in place rather than creating a duplicate.

## Route: Server or Workstation

Run in parallel:

**NinjaOne:**
- `ninja_get_server` — hardware, OS, uptime, organization
- `ninja_list_services` — running services, any stopped
- `ninja_list_volumes` — disk usage
- `ninja_list_device_backups` — recent backup history and status
- `ninja_get_patch_history` — recent patches, any failures
- `ninja_list_device_alerts` — active alerts
- `ninja_get_device_custom_fields` — any custom metadata (owner, role, location)

**Wazuh:**
- `wazuh_search_alerts` — alerts on this host in the past 30 days
- `wazuh_get_fim_events` — recent file integrity monitoring events
- `wazuh_get_agent_vulnerabilities` — vulnerabilities detected by Wazuh

**Defender:**
- `mde_get_device` — device profile, exposure level, risk score, last seen
- `mde_get_device_vulnerabilities` — CVEs affecting this device
- `mde_list_alerts` — alerts linked to this device

**Azure (if cloud VM):**
- `azure_get_vm` — VM size, resource group, networking

**UniFi:**
- `unifi_list_clients` — is this device visible? Which VLAN, switch, AP?

**Diagram:**
Create `Diagrams/Assets/[name].excalidraw` showing:
- Host → switch/port → VLAN → upstream firewall → adjacent devices/servers it talks to
- Active firewall rules that apply to it

---

## Route: User

Run in parallel:
- `entra_get_sign_in_logs` — last 30 days of sign-ins. Flag unusual locations, devices, or failed attempts.
- `entra_get_user_mfa_methods` — MFA registration status and methods
- `entra_get_role_members` — which roles this user is in (look up by user)
- `entra_list_conditional_access_policies` — which CA policies apply
- `entra_get_audit_logs` — changes made by or to this account
- `mde_list_alerts` — any Defender alerts involving this user

---

## Output

Write (or update) `Assets/[name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Asset Investigation
status: draft
tags: [asset]
asset_type: server|workstation|user
ninja_device_id: <id field from ninja_get_server response>
mde_machine_id: <id field from mde_get_device response>
---
```

Populate `ninja_device_id` and `mde_machine_id` from the API responses whenever available — leave blank if the asset isn't in that system. These IDs are used by `Get-SVHPatchSurface` and `Invoke-SVHUserLockdown` in the PowerShell module suite, and storing them in the note saves having to look them up each time.

This is a **persistent note** — each investigation appends a dated section rather than overwriting. Structure: Asset summary → Current state → Recent findings → Open items → History (dated sections).

For servers/workstations: embed the network diagram with `![[name.excalidraw]]`.
