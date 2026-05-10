---
name: network-troubleshooter
description: Network connectivity investigation at a specific site or between a user and a resource. Follows the path from UniFi Cloud through VLANs, firewall rules, switch ports, Wazuh IDS events, and endpoint state. Always produces an Excalidraw topology diagram of the affected path. Trigger phrases: "network issue at [site]", "why can't [users] reach [resource]", "network troubleshooter".
when_to_use: Use for any network connectivity problem — can't reach file server, VPN issues, inter-VLAN routing, site-to-site, client isolation.
allowed-tools: "mcp__svh-opsman__unifi_list_sites mcp__svh-opsman__unifi_get_site mcp__svh-opsman__unifi_get_site_health mcp__svh-opsman__unifi_get_site_device mcp__svh-opsman__unifi_list_site_devices mcp__svh-opsman__unifi_list_networks mcp__svh-opsman__unifi_list_firewall_rules mcp__svh-opsman__unifi_list_wlans mcp__svh-opsman__unifi_get_switch_ports mcp__svh-opsman__unifi_list_clients mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_list_agents mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_services mcp__obsidian__* mcp__excalidraw__* mcp__desktop-commander__* mcp__time__*"
---

# Network Troubleshooter

## Step 1 — Understand the path

Before any tools, state:
- **Source:** who/what is trying to connect (device, VLAN, site)
- **Destination:** what resource (IP, hostname, service, port)
- **Symptom:** timeout, refused, DNS failure, packet loss

## Step 2 — UniFi Cloud → Site health

1. `unifi_list_sites` — confirm the site exists and identify its ID.
2. `unifi_get_site_health` — overall health, uplink status, active alerts.
3. `unifi_list_site_devices` — which devices are online. Flag any offline.

## Step 3 — Network layer

1. `unifi_list_networks` — VLANs at the site. Note VLAN IDs, subnets, DHCP ranges.
2. `unifi_list_firewall_rules` — firewall rules that could block the path. Check both LAN-in and LAN-out rules relevant to source/destination VLANs.
3. `unifi_get_switch_ports` (if relevant) — port config on the switch the source device connects to. Check VLAN membership, PoE, profile.
4. `unifi_list_clients` — is the source device visible in UniFi? What IP, VLAN, and AP is it on?

## Step 4 — Wazuh IDS/IPS events

`wazuh_search_alerts` — query for the affected host/IP and time window. Look for:
- Dropped packet alerts
- IDS/IPS blocks
- Gateway authentication events
- Any rule group: `ids`, `firewall`, `syscheck`

## Step 5 — Endpoint state (NinjaOne)

`ninja_get_server` / `ninja_list_device_alerts` for the source and destination hosts if managed.
`ninja_list_services` — is the destination service running?

## Step 6 — Active tests (Desktop Commander)

Run connectivity tests from the host or MCP server:
- `ping [destination]`
- `Test-NetConnection [destination] -Port [port]`
- `tracert [destination]`
- `nslookup [hostname]`

## Step 7 — Diagram + note

Create an Excalidraw diagram showing the affected path:
- Source device → switch port → VLAN → firewall → destination
- Mark where the break is (or suspected break)
- Include VLAN IDs, relevant firewall rule, and any device states

Save to `Diagrams/Network/[site]-YYYY-MM-DD.excalidraw`.

Write `Investigations/YYYY-MM-DD-network-[site]-[topic].md`:

```yaml
---
date: YYYY-MM-DD
skill: Network Troubleshooter
status: draft
tags: [investigation, network]
---
```

Sections: Path description → Findings by layer → Root cause → Recommended fix → Diagram embedded.
