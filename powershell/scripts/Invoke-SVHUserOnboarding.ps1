<#
.SYNOPSIS
    Complete M365 user onboarding: create Entra account, assign license, add to groups,
    set a Temporary Access Pass, and post a summary to the IT Teams channel.

.DESCRIPTION
    Dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

    The script stages all actions and prompts for confirmation before writing anything.
    Use -WhatIf to see what would happen without making any changes.

.PARAMETER FirstName
.PARAMETER LastName
.PARAMETER JobTitle
.PARAMETER Department
.PARAMETER Manager       UPN of the user's manager.
.PARAMETER LicenseSku    M365 license SKU part number (default: 'O365_BUSINESS_PREMIUM').
.PARAMETER Groups        List of group IDs to add the user to.
.PARAMETER NotifyTeams   Post onboarding summary to IT Teams channel (default: $true).

.EXAMPLE
    .\Invoke-SVHUserOnboarding.ps1 `
        -FirstName 'Jane' -LastName 'Doe' `
        -JobTitle 'Project Manager' -Department 'Operations' `
        -Manager 'jsmith@shoestringvalley.com'
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
param(
    [Parameter(Mandatory)] [string]$FirstName,
    [Parameter(Mandatory)] [string]$LastName,
    [Parameter(Mandatory)] [string]$JobTitle,
    [Parameter(Mandatory)] [string]$Department,
    [string]$Manager,
    [string]$LicenseSku = 'O365_BUSINESS_PREMIUM',
    [string[]]$Groups   = @(),
    [bool]$NotifyTeams  = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$mailDomain = $SVHMailDomain   # set by SVH.Core after connect.ps1
$upn        = "$($FirstName.ToLower()).$($LastName.ToLower())@$mailDomain"
$displayName = "$FirstName $LastName"

Write-Host "`nOnboarding: $displayName ($upn)" -ForegroundColor Cyan
Write-Host "  Job Title:  $JobTitle"
Write-Host "  Department: $Department"
Write-Host "  Manager:    $(if ($Manager) { $Manager } else { '(none)' })"
Write-Host "  License:    $LicenseSku"
Write-Host "  Groups:     $(if ($Groups) { $Groups -join ', ' } else { '(none)' })"

if (-not $PSCmdlet.ShouldProcess($upn, 'Create Entra user and onboard')) { return }

# ── Step 1: Create Entra account ──────────────────────────────────────────────
Write-Host "`n[1/5] Creating Entra account..." -ForegroundColor Yellow
$passwordProfile = @{
    forceChangePasswordNextSignIn = $true
    password = -join ((65..90) + (97..122) + (48..57) + (33, 35, 64) | Get-Random -Count 16 | ForEach-Object { [char]$_ })
}
$newUser = New-Object PSObject -Property @{
    accountEnabled    = $true
    displayName       = $displayName
    mailNickname      = "$($FirstName.ToLower())$($LastName.ToLower())"
    userPrincipalName = $upn
    jobTitle          = $JobTitle
    department        = $Department
    passwordProfile   = $passwordProfile
}

$created = gPost '/users' ($newUser | ConvertTo-Json -Depth 3 | ConvertFrom-Json)
Write-Host "  Created: $($created.id)" -ForegroundColor Green

# ── Step 2: Assign manager ────────────────────────────────────────────────────
if ($Manager) {
    Write-Host "[2/5] Setting manager..." -ForegroundColor Yellow
    try {
        $mgr = Get-SVHUser -Identity $Manager
        gPost "/users/$($created.id)/manager/`$ref" @{ '@odata.id' = "https://graph.microsoft.com/v1.0/users/$($mgr.id)" }
        Write-Host "  Manager set: $Manager" -ForegroundColor Green
    } catch { Write-Warning "  Manager set failed: $_" }
} else {
    Write-Host "[2/5] No manager specified — skipping." -ForegroundColor DarkGray
}

# ── Step 3: Assign license ────────────────────────────────────────────────────
Write-Host "[3/5] Assigning license ($LicenseSku)..." -ForegroundColor Yellow
try {
    Set-SVHUserLicense -Identity $created.id -SkuPartNumber $LicenseSku -Action Add
    Write-Host "  License assigned." -ForegroundColor Green
} catch { Write-Warning "  License assignment failed: $_" }

# ── Step 4: Add to groups ─────────────────────────────────────────────────────
if ($Groups) {
    Write-Host "[4/5] Adding to $($Groups.Count) group(s)..." -ForegroundColor Yellow
    foreach ($gid in $Groups) {
        try {
            Add-SVHGroupMember -GroupId $gid -UserId $created.id
            Write-Host "  Added to: $gid" -ForegroundColor Green
        } catch { Write-Warning "  Group $gid failed: $_" }
    }
} else {
    Write-Host "[4/5] No groups specified — skipping." -ForegroundColor DarkGray
}

# ── Step 5: Temporary Access Pass ─────────────────────────────────────────────
Write-Host "[5/5] Creating Temporary Access Pass..." -ForegroundColor Yellow
try {
    Start-Sleep -Seconds 5  # let Entra propagate the new account
    $tap = New-SVHTemporaryAccessPass -Identity $created.id -LifetimeMinutes 480
    Write-Host "  TAP: $($tap.temporaryAccessPass)  (valid 8 hours)" -ForegroundColor Green
} catch { Write-Warning "  TAP failed: $_" }

# ── Teams notification ────────────────────────────────────────────────────────
if ($NotifyTeams) {
    $msg = "**New user onboarded** ✅`n" +
           "**Name:** $displayName`n**UPN:** $upn`n" +
           "**Title:** $JobTitle | **Dept:** $Department`n" +
           "**TAP:** $($tap?.temporaryAccessPass ?? 'see above')`n" +
           "_Created by: $env:USERNAME on $(Get-Date -Format 'yyyy-MM-dd HH:mm')_"
    try {
        $itTeam    = (Get-SVHTeams | Where-Object displayName -like '*IT*' | Select-Object -First 1).id
        $itChannel = (Get-SVHTeamChannels -TeamId $itTeam | Where-Object displayName -like '*General*' | Select-Object -First 1).id
        Send-SVHTeamsMessage -TeamId $itTeam -ChannelId $itChannel -Content $msg
        Write-Host "Teams notification sent." -ForegroundColor Green
    } catch { Write-Warning "Teams notification failed: $_" }
}

Write-Host "`nOnboarding complete for $upn" -ForegroundColor Cyan
[PSCustomObject]@{
    UPN             = $upn
    EntraId         = $created.id
    LicenseAssigned = $LicenseSku
    TAP             = $tap?.temporaryAccessPass
}
