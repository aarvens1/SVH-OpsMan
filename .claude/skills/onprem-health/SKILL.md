---
name: onprem-health
description: On-prem server health check across all managed Windows servers. NinjaOne for inventory and backup status, Desktop Commander PSRemoting for disk/service spot-checks, Hyper-V and cluster state flagged separately. Trigger phrases: "onprem health", "check the servers", "server health", "how are the servers doing".
when_to_use: Use for a broad on-prem infrastructure health sweep — not for investigating a specific server (use /asset-investigation for that) or a specific incident.
allowed-tools: "mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_all_backups mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_list_volumes mcp__svh-opsman__ninja_list_services mcp__svh-opsman__ninja_list_processes mcp__desktop-commander__* mcp__obsidian__* mcp__time__* Read(powershell/**)"
---

# On-Prem Server Health

Skip any device in maintenance mode — offline/alert state is intentional there.
ACCOPDXARCHIVE is always in maintenance mode — never surface it.

## Step 1 — NinjaOne inventory sweep (run in parallel)

- `ninja_list_servers` — full server list with online/offline status
- `ninja_list_device_alerts` — active alerts on servers; note severity and device
- `ninja_list_all_backups` — last backup result per device; flag any failures or stale (>24h for daily jobs, >7d for weekly)
- `ninja_list_pending_patches` — critical and security patches pending on servers

## Step 2 — Disk and volume check via PSRemoting

**Before running commands:** read `powershell/README.md` to verify function names and any recent changes. Prefer SVH module functions (`Get-SVHServerDisk`, `Get-SVHServerServices`, `Get-SVHPendingReboot`) over raw cmdlets — they handle credential patterns and output formatting consistently. If a required capability is missing, note the gap and suggest which module it belongs in.

For each online server, use Desktop Commander to run pwsh from `/home/wsl_stevens/SVH-OpsMan/powershell`:

```powershell
. ./connect.ps1

# Build ra_stevens credential (non-interactive — uses BW DC_REMOTE_USER/DC_REMOTE_PASSWORD)
$cred = New-Object PSCredential(
    (Get-SVHTierUsername -Tier ra),
    (ConvertTo-SecureString $env:DC_REMOTE_PASSWORD -AsPlainText -Force)
)

# Disk space — flag volumes below 15% free
Get-SVHServerDisk -ComputerName <server> -Credential $cred

# Services — flag stopped services with StartType Automatic
Get-SVHServerServices -ComputerName <server> -Credential $cred -Filter ''

# Pending reboot flag
Get-SVHPendingReboot -ComputerName <server> -Credential $cred
```

Batch servers where possible. `ra_stevens` covers disk/service/reboot checks.

## Step 3 — Hyper-V, cluster, and MABS (sa_stevens required)

These need `sa_stevens@andersen-cost.com`, which requires an interactive credential.
If the user is in an active pwsh session, run:

```powershell
$adminCred = Get-Credential (Get-SVHTierUsername -Tier server)
Get-SVHHyperVVMs    -ComputerName <hv-host>   -Credential $adminCred
Get-SVHClusterState -ComputerName <hv-host>   -Credential $adminCred
Get-SVHMABSJobStatus -ComputerName <mabs-host> -Credential $adminCred -Hours 24
```

If not in an active session, flag these as "requires interactive sa_stevens session" and skip — NinjaOne alerts will have caught any MABS failures.

## Step 4 — Output

Write to `Investigations/YYYY-MM-DD-onprem-health.md`:

```yaml
---
date: YYYY-MM-DD
skill: onprem-health
status: draft
tags: [infrastructure, onprem, health]
---
```

Structure:
- **Summary** — overall status (Green / Yellow / Red), total servers checked, any offline
- **Alerts** — NinjaOne active alerts by server
- **Backups** — failed or stale backup jobs
- **Patches** — critical patches pending, by server
- **Disk** — volumes below threshold, sorted by free% ascending
- **Services** — stopped automatic services
- **Pending reboots** — servers waiting on a reboot
- **Hyper-V / Cluster / MABS** — results if sa_stevens session was available, otherwise "skipped — requires interactive session"
