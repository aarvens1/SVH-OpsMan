<#
.SYNOPSIS
    Complete M365 user offboarding: revoke sessions, disable account, set auto-reply,
    convert mailbox to shared, remove licenses, and notify IT via Teams.

.DESCRIPTION
    Dot-source connect.ps1 first:
        . C:\Users\astevens\SVH-OpsMan\powershell\connect.ps1

    All steps are attempted independently so one failure does not stop the rest.
    Supports -WhatIf throughout. The license is removed last — mailbox needs it until
    the shared mailbox conversion is confirmed.

.PARAMETER UserPrincipalName   UPN of the departing user.
.PARAMETER ManagerUPN          UPN to forward auto-reply and delegate mailbox access to.
.PARAMETER LastDay             Date string for the auto-reply message (e.g. 'May 30, 2026').
.PARAMETER ConvertToShared     Convert the mailbox to shared after disabling. Default: $true.
.PARAMETER RevokeMFAMethods    Remove registered MFA methods. Default: $true.
.PARAMETER IsolateMDEDevice    Network-isolate the user's primary MDE device. Default: $false.

.EXAMPLE
    .\Invoke-SVHUserOffboarding.ps1 `
        -UserPrincipalName 'jdoe@shoestringvalley.com' `
        -ManagerUPN 'jsmith@shoestringvalley.com' `
        -LastDay 'May 30, 2026'
#>

[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)] [string]$UserPrincipalName,
    [string]$ManagerUPN,
    [string]$LastDay = (Get-Date -Format 'MMMM d, yyyy'),
    [bool]$ConvertToShared    = $true,
    [bool]$RevokeMFAMethods   = $true,
    [bool]$IsolateMDEDevice   = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$upn    = $UserPrincipalName
$errors = [System.Collections.Generic.List[string]]::new()

function Step([string]$Label, [scriptblock]$Action) {
    Write-Host "`n[$Label]" -ForegroundColor Yellow
    if ($PSCmdlet.ShouldProcess($upn, $Label)) {
        try { & $Action; Write-Host "  OK" -ForegroundColor Green }
        catch { $msg = "  FAILED: $_"; Write-Warning $msg; $errors.Add("$Label — $_") }
    } else {
        Write-Host "  (WhatIf)" -ForegroundColor DarkGray
    }
}

$user = Get-SVHUser -Identity $upn
Write-Host "`nOffboarding: $($user.displayName) ($upn)" -ForegroundColor Cyan

# ── 1. Revoke all active sessions ─────────────────────────────────────────────
Step 'Revoke sessions' {
    Revoke-SVHUserSessions -Identity $upn
}

# ── 2. Disable Entra account ──────────────────────────────────────────────────
Step 'Disable Entra account' {
    Set-SVHUserEnabled -Identity $upn -Enabled $false
}

# ── 3. Remove MFA methods ─────────────────────────────────────────────────────
if ($RevokeMFAMethods) {
    Step 'Remove MFA methods' {
        $methods = Get-SVHUserMFA -Identity $upn
        foreach ($m in $methods) {
            if ($m.odataType -ne '#microsoft.graph.passwordAuthenticationMethod') {
                Remove-SVHUserMFAMethod -Identity $upn -MethodId $m.id
                Write-Host "  Removed: $($m.odataType)" -ForegroundColor DarkGray
            }
        }
    }
}

# ── 4. Set auto-reply ─────────────────────────────────────────────────────────
Step 'Set auto-reply (OOF)' {
    $oofMsg = "Thank you for your email. $($user.displayName) is no longer with Andersen Construction as of $LastDay. " +
              "$(if ($ManagerUPN) { "Please contact $ManagerUPN for assistance." } else { 'Please contact IT for assistance.' })"
    Set-SVHEXOLitigationHold -Identity $upn  # preserve mailbox content before shared conversion
    Set-SVHMailboxAutoReply -Identity $upn -Enabled $true -InternalMessage $oofMsg -ExternalMessage $oofMsg
}

# ── 5. Remove license (after shared conversion staging) ───────────────────────
if ($ConvertToShared) {
    Step 'Convert mailbox to shared' {
        $body = @{ '@odata.type' = '#microsoft.graph.convertUserMailboxRequest' }
        gPost "/users/$($user.id)/convertUserMailboxRequest" $body
    }
}

Step 'Remove all licenses' {
    $licenses = Get-SVHUserLicenses -Identity $upn
    foreach ($lic in $licenses) {
        Set-SVHUserLicense -Identity $upn -SkuId $lic.skuId -Action Remove
        Write-Host "  Removed license: $($lic.skuPartNumber)" -ForegroundColor DarkGray
    }
}

# ── 6. Optional: delegate mailbox to manager ──────────────────────────────────
if ($ManagerUPN) {
    Step "Delegate mailbox to $ManagerUPN" {
        gPost "/users/$upn/mailFolders/inbox/messageRules" @{
            displayName = "Forward to $ManagerUPN"
            isEnabled   = $true
            sequence    = 1
            actions     = @{ forwardTo = @(@{ emailAddress = @{ address = $ManagerUPN } }) }
            conditions  = @{}
        }
    }
}

# ── 7. Optional: MDE isolation ────────────────────────────────────────────────
if ($IsolateMDEDevice) {
    Step 'Isolate primary MDE device' {
        $mdeDevices = Get-SVHMDEDevices | Where-Object lastLoggedOnUser -like "*$($upn.Split('@')[0])*" | Select-Object -First 1
        if ($mdeDevices) {
            Invoke-SVHMDEIsolation -MachineId $mdeDevices.id -Comment "Offboarding: $upn"
            Write-Host "  Isolated: $($mdeDevices.computerDnsName)" -ForegroundColor DarkGray
        } else {
            Write-Host "  No MDE device found for user." -ForegroundColor DarkGray
        }
    }
}

# ── Teams notification ────────────────────────────────────────────────────────
$msg = "**User offboarded** 🔒`n" +
       "**UPN:** $upn`n**Display name:** $($user.displayName)`n" +
       "**Last day:** $LastDay`n" +
       "$(if ($ManagerUPN) { "**Manager notified:** $ManagerUPN`n" })" +
       "$(if ($errors) { "**⚠ Errors:**`n" + ($errors | ForEach-Object { "- $_" } | Out-String) })" +
       "_Offboarded by: $env:USERNAME on $(Get-Date -Format 'yyyy-MM-dd HH:mm')_"

try {
    $itTeam    = (Get-SVHTeams | Where-Object displayName -like '*IT*' | Select-Object -First 1).id
    $itChannel = (Get-SVHTeamChannels -TeamId $itTeam | Where-Object displayName -like '*General*' | Select-Object -First 1).id
    if ($PSCmdlet.ShouldProcess('IT Teams channel', 'Send offboarding notification')) {
        Send-SVHTeamsMessage -TeamId $itTeam -ChannelId $itChannel -Content $msg
        Write-Host "`nTeams notification sent." -ForegroundColor Green
    }
} catch { Write-Warning "Teams notification failed: $_" }

if ($errors) {
    Write-Host "`n⚠ Completed with $($errors.Count) error(s) — review above." -ForegroundColor Yellow
} else {
    Write-Host "`nOffboarding complete for $upn" -ForegroundColor Cyan
}
