<#
.SYNOPSIS
    Daily security posture snapshot across all SVH systems.
.DESCRIPTION
    Pulls six categories and writes a colour-coded summary to the console.
    Pipe to Out-File or ConvertTo-Json for automation/logging.

    Requires SVH modules — dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

.EXAMPLE
    . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1
    .\Get-SVHSecurityPosture.ps1

.EXAMPLE
    .\Get-SVHSecurityPosture.ps1 -ExportJson -OutputPath C:\posture.json
#>

[CmdletBinding()]
param(
    [switch]$ExportJson,
    [string]$OutputPath = "$env:USERPROFILE\Downloads\svh-posture-$(Get-Date -Format 'yyyyMMdd').json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Write-Section([string]$Title, [string]$Color = 'Cyan') {
    Write-Host "`n── $Title " -ForegroundColor $Color -NoNewline
    Write-Host ('─' * (60 - $Title.Length)) -ForegroundColor DarkGray
}

$report = [ordered]@{
    GeneratedAt = (Get-Date -Format 'o')
    Identity    = @{}
    Endpoints   = @{}
    Secrets     = @{}
    MDE         = @{}
    Infrastructure = @{}
    Patches     = @{}
}

# ── 1. Identity ───────────────────────────────────────────────────────────────
Write-Section 'Identity'
try {
    $riskyUsers = Get-SVHRiskyUsers -RiskLevel high -Top 25
    $mfaGap     = Get-SVHMFAGap
    $report.Identity = @{
        HighRiskUsers = $riskyUsers | Select-Object userDisplayName, riskLevel, riskState, riskLastUpdatedDateTime
        MFAGapCount   = ($mfaGap | Measure-Object).Count
        MFAGapUsers   = $mfaGap | Select-Object displayName, userPrincipalName
    }
    $riskColor = if ($riskyUsers) { 'Red' } else { 'Green' }
    Write-Host "  Risky users (high):  " -NoNewline; Write-Host ($riskyUsers | Measure-Object).Count -ForegroundColor $riskColor
    $mfaColor = if ($mfaGap) { 'Yellow' } else { 'Green' }
    Write-Host "  No MFA registered:   " -NoNewline; Write-Host ($mfaGap | Measure-Object).Count -ForegroundColor $mfaColor
    if ($riskyUsers) { $riskyUsers | Format-Table userDisplayName, riskLevel, riskState -AutoSize | Out-String | Write-Host }
} catch { Write-Warning "Identity: $_" }

# ── 2. App secrets expiring ───────────────────────────────────────────────────
Write-Section 'App Secrets'
try {
    $expiring30  = Get-SVHAppSecrets -ExpiringWithinDays 30
    $expiring60  = Get-SVHAppSecrets -ExpiringWithinDays 60
    $report.Secrets = @{
        ExpiringIn30Days = $expiring30 | Select-Object AppName, SecretName, ExpiresOn
        ExpiringIn60Days = $expiring60 | Select-Object AppName, SecretName, ExpiresOn
    }
    $secColor = if ($expiring30) { 'Red' } elseif ($expiring60) { 'Yellow' } else { 'Green' }
    Write-Host "  Expiring ≤30 days:   " -NoNewline; Write-Host ($expiring30 | Measure-Object).Count -ForegroundColor $secColor
    Write-Host "  Expiring ≤60 days:   " -NoNewline; Write-Host ($expiring60 | Measure-Object).Count -ForegroundColor Yellow
    if ($expiring30) { $expiring30 | Format-Table AppName, SecretName, ExpiresOn -AutoSize | Out-String | Write-Host }
} catch { Write-Warning "App Secrets: $_" }

# ── 3. MDE alerts ─────────────────────────────────────────────────────────────
Write-Section 'Defender Alerts'
try {
    $mdeAlerts = Get-SVHMDEAlerts | Where-Object severity -in 'High','Critical' | Where-Object status -ne 'Resolved'
    $report.MDE = @{
        OpenHighCritical = $mdeAlerts | Select-Object title, severity, status, machineName, detectionSource, creationTime
    }
    $mdeColor = if ($mdeAlerts) { 'Red' } else { 'Green' }
    Write-Host "  Open high/critical:  " -NoNewline; Write-Host ($mdeAlerts | Measure-Object).Count -ForegroundColor $mdeColor
    if ($mdeAlerts) { $mdeAlerts | Format-Table machineName, severity, title, creationTime -AutoSize | Out-String | Write-Host }
} catch { Write-Warning "MDE: $_" }

# ── 4. Infrastructure (offline devices) ───────────────────────────────────────
Write-Section 'Infrastructure'
try {
    $offlineDevices = Get-SVHNinjaOfflineDevices | Where-Object { $_.isMaintenanceModeEnabled -ne $true }
    $diskAlerts     = Get-SVHNinjaDiskAlerts
    $report.Infrastructure = @{
        OfflineDevices = $offlineDevices | Select-Object systemName, organizationName, lastContact, os
        DiskAlerts     = $diskAlerts | Select-Object systemName, message, created
    }
    $infColor = if ($offlineDevices) { 'Yellow' } else { 'Green' }
    Write-Host "  Offline (excl. maint): " -NoNewline; Write-Host ($offlineDevices | Measure-Object).Count -ForegroundColor $infColor
    Write-Host "  Disk alerts:           " -NoNewline; Write-Host ($diskAlerts | Measure-Object).Count -ForegroundColor $(if ($diskAlerts) { 'Yellow' } else { 'Green' })
} catch { Write-Warning "Infrastructure: $_" }

# ── 5. Stale Intune devices ───────────────────────────────────────────────────
Write-Section 'Endpoints'
try {
    $staleDevices = Get-SVHStaleIntuneDevices
    $nonCompliant = Get-SVHIntuneDeviceCompliance | Where-Object complianceState -eq 'noncompliant'
    $report.Endpoints = @{
        StaleDevices  = ($staleDevices | Measure-Object).Count
        NonCompliant  = $nonCompliant | Select-Object deviceName, userPrincipalName, complianceState, lastSyncDateTime
    }
    Write-Host "  Stale Intune devices: " -NoNewline; Write-Host ($staleDevices | Measure-Object).Count -ForegroundColor $(if ($staleDevices) { 'Yellow' } else { 'Green' })
    Write-Host "  Non-compliant:        " -NoNewline; Write-Host ($nonCompliant | Measure-Object).Count -ForegroundColor $(if ($nonCompliant) { 'Red' } else { 'Green' })
} catch { Write-Warning "Endpoints: $_" }

# ── 6. Critical fleet alerts ──────────────────────────────────────────────────
Write-Section 'NinjaOne Critical Alerts'
try {
    $critAlerts = Get-SVHNinjaCriticalAlerts
    $report.Patches = @{ CriticalAlerts = $critAlerts | Select-Object systemName, message, created }
    $critColor = if ($critAlerts) { 'Red' } else { 'Green' }
    Write-Host "  Fleet critical alerts: " -NoNewline; Write-Host ($critAlerts | Measure-Object).Count -ForegroundColor $critColor
} catch { Write-Warning "NinjaOne alerts: $_" }

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Section 'Summary' 'White'
$issues = @(
    if ($report.Identity.HighRiskUsers)    { "⚠ $(@($report.Identity.HighRiskUsers).Count) risky user(s)" }
    if ($report.Identity.MFAGapCount -gt 0){ "⚠ $($report.Identity.MFAGapCount) user(s) with no MFA" }
    if ($report.Secrets.ExpiringIn30Days)  { "🔑 $(@($report.Secrets.ExpiringIn30Days).Count) secret(s) expiring ≤30d" }
    if ($report.MDE.OpenHighCritical)      { "🛡 $(@($report.MDE.OpenHighCritical).Count) open MDE alert(s)" }
    if ($report.Infrastructure.OfflineDevices) { "📡 $(@($report.Infrastructure.OfflineDevices).Count) offline device(s)" }
)
if ($issues) {
    $issues | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
} else {
    Write-Host '  All clear — no actionable items.' -ForegroundColor Green
}

if ($ExportJson) {
    $report | ConvertTo-Json -Depth 6 | Set-Content $OutputPath
    Write-Host "`nExported to $OutputPath" -ForegroundColor Cyan
}
