<#
.SYNOPSIS
    M365 license utilization report — which SKUs, how many assigned vs available,
    and which users have duplicate or wasted licenses.

.DESCRIPTION
    Dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

.EXAMPLE
    .\Get-SVHLicenseReport.ps1

.EXAMPLE
    .\Get-SVHLicenseReport.ps1 -ExportCsv
#>

[CmdletBinding()]
param(
    [switch]$ExportCsv,
    [string]$OutputPath = "$env:USERPROFILE\Downloads\svh-licenses-$(Get-Date -Format 'yyyyMMdd').csv"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host "Pulling tenant subscriptions..." -ForegroundColor Cyan
$subs = Get-SVHTenantSubscriptions

Write-Host "`n── M365 License Summary ──────────────────────────────────────────────" -ForegroundColor Cyan
Write-Host ("{0,-40} {1,8} {2,8} {3,8} {4,8}" -f 'SKU', 'Total', 'Assigned', 'Free', 'Consumed%') -ForegroundColor White
Write-Host ('-' * 76) -ForegroundColor DarkGray

$rows = foreach ($sub in $subs | Sort-Object skuPartNumber) {
    $total    = $sub.prepaidUnits.enabled
    $assigned = $sub.consumedUnits
    $free     = $total - $assigned
    $pct      = if ($total -gt 0) { [int]($assigned / $total * 100) } else { 0 }
    $color    = if ($pct -ge 90) { 'Red' } elseif ($free -le 0) { 'Red' } elseif ($pct -ge 75) { 'Yellow' } else { 'Green' }
    Write-Host ("{0,-40} {1,8} {2,8} {3,8} {4,7}%" -f $sub.skuPartNumber, $total, $assigned, $free, $pct) -ForegroundColor $color
    [PSCustomObject]@{
        SKU      = $sub.skuPartNumber
        Total    = $total
        Assigned = $assigned
        Free     = $free
        Consumed = $pct
    }
}

# License waste — users with no recent sign-in holding a paid license
Write-Host "`n── Potentially Wasted Licenses ──────────────────────────────────────" -ForegroundColor Yellow
try {
    $waste = Get-SVHLicenseWaste
    if ($waste) {
        $waste | Format-Table displayName, userPrincipalName, lastSignIn, assignedLicenses -AutoSize | Out-String | Write-Host
        Write-Host "  $($waste.Count) user(s) with assigned licenses and no recent sign-in." -ForegroundColor Yellow
    } else {
        Write-Host "  None found." -ForegroundColor Green
    }
} catch { Write-Warning "License waste check failed: $_" }

if ($ExportCsv) {
    $rows | Export-Csv -Path $OutputPath -NoTypeInformation
    Write-Host "`nExported to $OutputPath" -ForegroundColor Cyan
}

$rows
