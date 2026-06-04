---
name: cluster-health
description: S2D cluster health snapshot. Queries the failover cluster and Storage Spaces Direct health across all nodes — pool state, virtual disk resiliency, physical disk alerts, CSV owners, and node states. Writes an Infrastructure note. Trigger phrases: "cluster health", "s2d health", "check the cluster", "storage pool status".
when_to_use: Run before a patch campaign (to establish baseline), after any node reboot, or when storage alerts fire. Not a substitute for live Wazuh/NinjaOne alerts — this is a deliberate deep-dive snapshot.
allowed-tools: "Bash Read Write Edit mcp__svh-opsman__ninja_get_device_health mcp__svh-opsman__ninja_list_alerts mcp__svh-opsman__ninja_run_script"
---

# Cluster Health

## Cluster inventory

The SVH S2D cluster consists of 6 nodes. All are in the same NinjaOne org and accessible via PS remoting using `SA_REMOTE_PASSWORD` from BW (`sa_stevens` account).

Known nodes (from NinjaOne MSDISK fleet):
- ACCOMSDISK1 through ACCOMSDISK6
- Connect to any online node — cluster cmdlets return fleet-wide state.

**Preferred entry node:** ACCOMSDISK1 (or whichever node NinjaOne reports as online). ACCOMSDISK3 is the safest first choice for drain operations (last rebooted 2023-02-13 — most stale, least risk of disrupting an active CSV owner).

## Step 1 — Identify a reachable node

Run in parallel:
- `ninja_list_alerts` — check for any MSDISK nodes with offline/critical alerts. Avoid connecting to a node with active alerts.
- `ninja_get_device_health` for ACCOMSDISK1 — confirm online status.

Pick the first online, alert-free node as the entry point. If all nodes have alerts, proceed with the least-critical one and note it in the output.

## Step 2 — Run cluster health queries via PS remoting

Connect to the entry node using `sa_stevens` credentials (password from BW field `SA_REMOTE_PASSWORD`). Run the following PowerShell via Bash:

```bash
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
ENTRY_NODE="ACCOMSDISK1"   # update to the node chosen in Step 1

pwsh -Command "
  \$pw = ConvertTo-SecureString '\$SA_PW' -AsPlainText -Force
  \$cred = New-Object PSCredential('SVH\sa_stevens', \$pw)
  
  # Load SVH.OnPrem module functions inline (no module install needed on remote)
  Invoke-Command -ComputerName '$ENTRY_NODE' -Credential \$cred -ScriptBlock {
    Import-Module FailoverClusters, Storage -ErrorAction SilentlyContinue
    
    # Cluster nodes
    \$nodes = Get-ClusterNode | Select-Object Name, State, NodeHighestVersion
    
    # Cluster resources — non-online only
    \$resources = Get-ClusterResource | Where-Object State -ne 'Online' |
      Select-Object Name, State, OwnerGroup, ResourceType
    
    # Cluster Shared Volumes
    \$csvs = Get-ClusterSharedVolume | Select-Object Name, State, OwnerNode,
      @{n='Path';e={\$_.SharedVolumeInfo.FriendlyVolumeName}},
      @{n='UsedGB';e={[math]::Round(\$_.SharedVolumeInfo.Partition.UsedSpace/1GB,1)}},
      @{n='SizeGB';e={[math]::Round(\$_.SharedVolumeInfo.Partition.Size/1GB,1)}}
    
    # Storage pool
    \$pool = Get-StoragePool -IsPrimordial \$false -ErrorAction SilentlyContinue |
      Select-Object FriendlyName, HealthStatus, OperationalStatus,
        @{n='TotalTB';e={[math]::Round(\$_.Size/1TB,2)}},
        @{n='AllocatedTB';e={[math]::Round(\$_.AllocatedSize/1TB,2)}}
    
    # Virtual disks
    \$vdisks = Get-VirtualDisk -ErrorAction SilentlyContinue |
      Select-Object FriendlyName, HealthStatus, OperationalStatus,
        ResiliencySettingName, NumberOfDataCopies,
        @{n='SizeGB';e={[math]::Round(\$_.Size/1GB,1)}},
        @{n='FootprintGB';e={[math]::Round(\$_.FootprintOnPool/1GB,1)}}
    
    # Physical disks — unhealthy only, plus summary counts
    \$pdisks = Get-PhysicalDisk -ErrorAction SilentlyContinue
    \$pdisk_summary = \$pdisks | Group-Object MediaType | Select-Object Name, Count
    \$pdisk_alerts  = \$pdisks | Where-Object {
      \$_.HealthStatus -ne 'Healthy' -or \$_.OperationalStatus -ne 'OK'
    } | Select-Object FriendlyName, MediaType, HealthStatus, OperationalStatus, Usage
    
    # Cluster networks
    \$networks = Get-ClusterNetwork | Select-Object Name, State, Role, Address
    
    [PSCustomObject]@{
      ClusterName   = (Get-Cluster).Name
      Nodes         = \$nodes
      Resources     = \$resources
      CSVs          = \$csvs
      StoragePool   = \$pool
      VirtualDisks  = \$vdisks
      PhysicalDisks = \$pdisk_summary
      DiskAlerts    = \$pdisk_alerts
      Networks      = \$networks
    }
  } | ConvertTo-Json -Depth 5
"
```

**If PS remoting fails** (auth error, WinRM unreachable): fall back to `ninja_run_script` if a stored S2D health script exists in NinjaOne. Note the fallback in the output. If neither path works, surface the error and stop — do not guess cluster state.

**SA_REMOTE_PASSWORD retrieval:** The password is available at runtime via the MCP BW integration or from session context if already resolved. Do not hardcode it — resolve from BW before the PS call.

## Step 3 — Synthesize findings

Parse the JSON output. Determine overall cluster health using this decision tree:

| Condition | Status |
|-----------|--------|
| Pool Healthy + all VDisks Healthy + 0 node offline | 🟢 Healthy |
| Pool Healthy + ≥1 VDisk Warning OR ≥1 node paused | 🟡 Degraded |
| Pool Unhealthy OR ≥1 VDisk Unhealthy OR ≥1 node offline | 🔴 Critical |
| PS remoting failed, no data | ⚠️ Unknown — data unavailable |

**Key findings to surface:**
- Any node not in `Up` state → flag with state and last reboot (from NinjaOne if available)
- Any CSV not in `Online` state → flag with current owner and path
- Any virtual disk not Healthy + OK → flag with resiliency type and footprint
- Any physical disk alert → flag with media type and usage (journal vs. data vs. hot spare)
- Storage pool utilization: flag if `AllocatedTB / TotalTB > 80%`
- Nodes with pending `WINDOWS_PM` reboots (cross-reference NinjaOne alerts from Step 1) — list in patch readiness section

## Step 4 — Write Infrastructure note

Write to `Infrastructure/s2d-cluster-health-YYYY-MM-DD.md` in the Obsidian vault:

```markdown
---
date: YYYY-MM-DD
skill: cluster-health
status: draft
tags: [infrastructure, s2d, cluster, storage]
---

# S2D Cluster Health — YYYY-MM-DD HH:MM

[overall status callout block]

## Cluster Nodes

[table: Node | State | NinjaOne status | Pending reboot]

## Storage Pool

[pool name, health, total/allocated TB, utilization %]

## Cluster Shared Volumes

[table: CSV name | Owner node | State | Used GB | Size GB | % full]

## Virtual Disks

[table: Name | Resiliency | Copies | Health | Operational | Size GB]

## Physical Disk Summary

[table: Media type | Count | Alerts]
[alert rows if any]

## Cluster Networks

[table: Name | State | Role | Subnet]

## Patch Readiness

Nodes with pending WINDOWS_PM reboots (safe drain order — start with ACCOMSDISK3):
[list or "None pending"]

## Next moves

[1–3 specific action items based on findings, or "No action required — cluster healthy."]

## Related

- [[Infrastructure/infrastructure-home]]
```

## Step 5 — Skill log

Append to `System/skill-log.md`:
```
YYYY-MM-DD HH:MM | cluster-health | Infrastructure/s2d-cluster-health-YYYY-MM-DD.md | [overall status] — N nodes, pool [health]
```
