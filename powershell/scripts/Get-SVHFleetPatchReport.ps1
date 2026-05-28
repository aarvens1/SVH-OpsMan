<#
.SYNOPSIS
    Fleet-wide pending patch report from NinjaOne — all orgs, sorted by severity.

.DESCRIPTION
    Queries every NinjaOne organization, pulls pending patches from every server,
    and produces a summary table. Critical/Important patches are highlighted.

    Dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

.PARAMETER CriticalOnly  Only report Critical and Important patches.
.PARAMETER ExportCsv     Write results to CSV (path printed on completion).
.PARAMETER OutputPath    Override the default CSV output path.
.PARAMETER ExcludeMaint  Skip devices in NinjaOne maintenance mode (default: $true).

.EXAMPLE
    .\Get-SVHFleetPatchReport.ps1 -CriticalOnly

.EXAMPLE
    .\Get-SVHFleetPatchReport.ps1 -ExportCsv -OutputPath C:\patches.csv
#>

[CmdletBinding()]
param(
    [switch]$CriticalOnly,
    [switch]$ExportCsv,
    [string]$OutputPath    = "$env:USERPROFILE\Downloads\svh-patches-$(Get-Date -Format 'yyyyMMdd').csv",
    [bool]$ExcludeMaint    = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$severityOrder = @{ 'CRITICAL' = 0; 'IMPORTANT' = 1; 'MODERATE' = 2; 'LOW' = 3; 'UNSPECIFIED' = 4 }
$results       = [System.Collections.Generic.List[PSObject]]::new()

Write-Host "Fetching NinjaOne organizations..." -ForegroundColor Cyan
$orgs = Get-SVHNinjaOrgs
Write-Host "Found $($orgs.Count) org(s). Pulling servers..." -ForegroundColor Cyan

foreach ($org in $orgs) {
    $servers = Get-SVHNinjaServers -OrgId $org.id
    $active  = if ($ExcludeMaint) { $servers | Where-Object { $_.maintenanceModeEnabled -ne $true } } else { $servers }
    if (-not $active) { continue }

    Write-Host "  $($org.name): $($active.Count) server(s)" -ForegroundColor DarkGray

    foreach ($server in $active) {
        try {
            $filter = if ($CriticalOnly) { 'critical' } else { '' }
            $patches = Get-SVHNinjaPatches -DeviceId $server.id -Severity $filter

            foreach ($patch in $patches) {
                $results.Add([PSCustomObject]@{
                    Org          = $org.name
                    Device       = $server.systemName
                    PatchId      = $patch.id
                    Name         = $patch.name
                    Severity     = $patch.severity
                    SevSort      = $severityOrder[$patch.severity.ToUpper()] ?? 5
                    KBNumber     = $patch.kbNumber
                    PublishedDate = $patch.releaseDate
                    Status       = $patch.status
                })
            }
        } catch {
            Write-Verbose "  Skipped $($server.systemName): $_"
        }
    }
}

if ($results.Count -eq 0) {
    Write-Host "`nNo pending patches found." -ForegroundColor Green
    return
}

$sorted = $results | Sort-Object SevSort, Org, Device

# Console summary
Write-Host "`n── Patch Summary ─────────────────────────────────────────────────" -ForegroundColor Cyan
$sorted | Group-Object Severity | Sort-Object { $severityOrder[$_.Name.ToUpper()] ?? 5 } | ForEach-Object {
    $color = switch ($_.Name.ToUpper()) {
        'CRITICAL'    { 'Red' }
        'IMPORTANT'   { 'Yellow' }
        'MODERATE'    { 'DarkYellow' }
        default       { 'Gray' }
    }
    Write-Host ("  {0,-12} {1,4} patch(es) across {2} device(s)" -f $_.Name, $_.Count, ($_.Group | Select-Object -ExpandProperty Device -Unique).Count) -ForegroundColor $color
}

Write-Host "`n── Critical / Important Detail ───────────────────────────────────" -ForegroundColor Yellow
$sorted | Where-Object { $_.SevSort -le 1 } |
    Format-Table Org, Device, Severity, Name, KBNumber, PublishedDate -AutoSize |
    Out-String | Write-Host

if ($ExportCsv) {
    $sorted | Select-Object Org, Device, Severity, Name, KBNumber, PublishedDate, Status |
        Export-Csv -Path $OutputPath -NoTypeInformation
    Write-Host "Exported to $OutputPath" -ForegroundColor Cyan
}

$results | Select-Object Org, Device, Severity, Name
