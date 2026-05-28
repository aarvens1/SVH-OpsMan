<#
.SYNOPSIS
    Backup health report across all NinjaOne organizations.

.DESCRIPTION
    Pulls backup job status from NinjaOne for every managed server, highlights
    failures and stale jobs (no successful backup in N days), and outputs a
    sorted summary. Works with MABS and any NinjaOne-monitored backup agent.

    Dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

.PARAMETER StaleDays     Flag devices with no successful backup in this many days (default: 3).
.PARAMETER ExportCsv     Export results to CSV.
.PARAMETER OutputPath    Override default CSV path.

.EXAMPLE
    .\Get-SVHBackupHealthReport.ps1

.EXAMPLE
    .\Get-SVHBackupHealthReport.ps1 -StaleDays 2 -ExportCsv
#>

[CmdletBinding()]
param(
    [int]$StaleDays    = 3,
    [switch]$ExportCsv,
    [string]$OutputPath = "$env:USERPROFILE\Downloads\svh-backups-$(Get-Date -Format 'yyyyMMdd').csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$cutoff = (Get-Date).AddDays(-$StaleDays)
$results = [System.Collections.Generic.List[PSObject]]::new()

Write-Host "Pulling backup data from NinjaOne (cutoff: last $StaleDays days)..." -ForegroundColor Cyan

$orgs = Get-SVHNinjaOrgs
foreach ($org in $orgs) {
    $servers = Get-SVHNinjaServers -OrgId $org.id | Where-Object { $_.maintenanceModeEnabled -ne $true }
    if (-not $servers) { continue }

    foreach ($server in $servers) {
        try {
            $backups = Get-SVHNinjaDeviceBackups -DeviceId $server.id
            if (-not $backups) {
                $results.Add([PSCustomObject]@{
                    Org         = $org.name
                    Device      = $server.systemName
                    Status      = 'NO_DATA'
                    LastSuccess = $null
                    DaysSince   = 999
                    JobName     = '—'
                    IsStale     = $true
                })
                continue
            }

            foreach ($job in $backups) {
                $lastSuccess = $job.lastSuccessfulRunTime ?? $job.lastRunTime
                $ts          = if ($lastSuccess) { [datetime]$lastSuccess } else { $null }
                $daysSince   = if ($ts) { [int]((Get-Date) - $ts).TotalDays } else { 999 }
                $isStale     = $daysSince -ge $StaleDays -or $job.status -eq 'FAILED'

                $results.Add([PSCustomObject]@{
                    Org         = $org.name
                    Device      = $server.systemName
                    Status      = $job.status ?? 'UNKNOWN'
                    LastSuccess = if ($ts) { $ts.ToString('yyyy-MM-dd HH:mm') } else { 'Never' }
                    DaysSince   = $daysSince
                    JobName     = $job.name ?? $job.type ?? '—'
                    IsStale     = $isStale
                })
            }
        } catch {
            Write-Verbose "  Skipped $($server.systemName): $_"
        }
    }
}

if ($results.Count -eq 0) {
    Write-Host "No backup data found." -ForegroundColor Yellow
    return
}

$failed = $results | Where-Object { $_.Status -eq 'FAILED' -or $_.Status -eq 'NO_DATA' }
$stale  = $results | Where-Object { $_.IsStale -and $_.Status -notin 'FAILED','NO_DATA' }
$ok     = $results | Where-Object { -not $_.IsStale }

Write-Host "`n── Backup Health ─────────────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("  {'Failed / No Data',-20} {0}" -f $failed.Count) -ForegroundColor $(if ($failed) { 'Red' } else { 'Green' })
Write-Host ("  {'Stale (>',$StaleDays,' days)',-20} {0}" -f $stale.Count) -ForegroundColor $(if ($stale) { 'Yellow' } else { 'Green' })
Write-Host ("  {'OK',-20} {0}" -f $ok.Count) -ForegroundColor Green

if ($failed) {
    Write-Host "`n── Failed / No Data ────────────────────────────────────────────────" -ForegroundColor Red
    $failed | Format-Table Org, Device, Status, LastSuccess, DaysSince, JobName -AutoSize | Out-String | Write-Host
}
if ($stale) {
    Write-Host "`n── Stale (over $StaleDays days) ────────────────────────────────────────" -ForegroundColor Yellow
    $stale | Sort-Object DaysSince -Descending | Format-Table Org, Device, Status, LastSuccess, DaysSince -AutoSize | Out-String | Write-Host
}

if ($ExportCsv) {
    $results | Select-Object Org, Device, Status, LastSuccess, DaysSince, JobName, IsStale |
        Export-Csv -Path $OutputPath -NoTypeInformation
    Write-Host "Exported to $OutputPath" -ForegroundColor Cyan
}

$results | Select-Object Org, Device, Status, LastSuccess, DaysSince
