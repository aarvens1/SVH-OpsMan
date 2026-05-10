# SVH.Cross.psm1 — Cross-system composite functions
# Requires: All other SVH modules loaded (via connect.ps1).
# These functions aggregate data from multiple systems or coordinate
# write operations across more than one service.

Set-StrictMode -Version Latest

# ── VERIFY: Asset & User Summaries ────────────────────────────────────────────

function Get-SVHAssetSummary {
    <#
    .SYNOPSIS  Pull a quick cross-system summary of a named asset.
    .DESCRIPTION
        Queries NinjaOne, Defender MDE, and Wazuh for any device matching $Name.
        Results are best-effort — individual system errors are noted, not thrown.
    .EXAMPLE   Get-SVHAssetSummary -Name 'SVH-SQL01'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )
    Write-Verbose "[Cross] Pulling asset summary for '$Name'"
    $result = [ordered]@{ Asset = $Name }

    try {
        $result['NinjaOne'] = Get-SVHNinjaServers | Where-Object { $_.systemName -like "*$Name*" } |
            Select-Object systemName, nodeClass, status, ipAddresses, uptime, os
    } catch { $result['NinjaOne'] = "Error: $_" }

    try {
        $result['DefenderMDE'] = Get-SVHMDEDevices | Where-Object { $_.computerDnsName -like "*$Name*" } |
            Select-Object computerDnsName, healthStatus, riskScore, exposureScore, lastSeen, osPlatform
    } catch { $result['DefenderMDE'] = "Error: $_" }

    try {
        $agents = Get-SVHWazuhAgents -Search $Name
        $result['Wazuh'] = $agents.affected_items |
            Select-Object name, status, ip, lastKeepAlive, os
    } catch { $result['Wazuh'] = "Error: $_" }

    [PSCustomObject]$result
}
Export-ModuleMember -Function Get-SVHAssetSummary

function Get-SVHUserSummary {
    <#
    .SYNOPSIS  Pull a full cross-system picture of a user.
    .DESCRIPTION
        Aggregates Entra profile, MFA methods, licenses, recent sign-ins, Intune devices,
        and mailbox settings in a single call.
    .EXAMPLE   Get-SVHUserSummary -UserPrincipalName 'jdoe@shoestringvalley.com'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$UserPrincipalName
    )
    process {
        Write-Verbose "[Cross] Pulling user summary for '$UserPrincipalName'"
        $result = [ordered]@{ UPN = $UserPrincipalName }

        try { $result['EntraUser']     = Get-SVHUser -UserPrincipalName $UserPrincipalName } catch { $result['EntraUser'] = "Error: $_" }
        try { $result['MFAMethods']    = (Get-SVHUserMFA -UserPrincipalName $UserPrincipalName).value } catch { $result['MFAMethods'] = "Error: $_" }
        try { $result['Licenses']      = (Get-SVHUserLicenses -UserPrincipalName $UserPrincipalName).value } catch { $result['Licenses'] = "Error: $_" }
        try { $result['RecentSignIns'] = (Get-SVHSignInLogs -UserPrincipalName $UserPrincipalName -Hours 72 -Top 10).value } catch { $result['RecentSignIns'] = "Error: $_" }
        try { $result['IntuneDevices'] = Get-SVHIntuneDevice | Where-Object { $_.userPrincipalName -eq $UserPrincipalName } } catch { $result['IntuneDevices'] = "Error: $_" }
        try { $result['MailboxSettings'] = Get-SVHMailboxSettings -Identity $UserPrincipalName } catch { $result['MailboxSettings'] = "Error: $_" }

        [PSCustomObject]$result
    }
}
Export-ModuleMember -Function Get-SVHUserSummary

function Get-SVHPatchSurface {
    <#
    .SYNOPSIS  Cross-reference NinjaOne pending patches with Defender TVM severity.
    .DESCRIPTION
        Returns patches sorted by Defender TVM exposure impact — tells you what to fix first.
    .EXAMPLE   Get-SVHPatchSurface -NinjaDeviceId 42 -MDEMachineId 'abc123...'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][int]$NinjaDeviceId,
        [Parameter(Mandatory)][string]$MDEMachineId
    )
    Write-Verbose "[Cross] Pulling patch surface for Ninja:$NinjaDeviceId / MDE:$MDEMachineId"
    $pendingPatches = Get-SVHNinjaPatches -DeviceId $NinjaDeviceId
    $mdeVulns       = Get-SVHMDEDeviceVulns -MachineId $MDEMachineId

    $enriched = foreach ($patch in $pendingPatches) {
        $tvmMatch = $null
        if ($patch.kbNumber) {
            $tvmMatch = $mdeVulns | Where-Object { $_.patchReferenceUrl -like "*$($patch.kbNumber)*" } | Select-Object -First 1
        }
        [PSCustomObject]@{
            KBNumber       = $patch.kbNumber
            PatchName      = $patch.name
            NinjaSeverity  = $patch.severity
            TVMSeverity    = $tvmMatch?.severity
            TVMCvssScore   = $tvmMatch?.cvssV3
            CveId          = $tvmMatch?.cveId
            RebootRequired = $patch.rebootRequired
        }
    }
    $enriched | Sort-Object {
        switch ($_.TVMSeverity) { 'Critical' { 0 } 'High' { 1 } 'Medium' { 2 } 'Low' { 3 } default { 4 } }
    }
}
Export-ModuleMember -Function Get-SVHPatchSurface

# ── VERIFY: Fleet-Wide Health ─────────────────────────────────────────────────

function Get-SVHBackupHealth {
    <#
    .SYNOPSIS  Cross-system backup status: NinjaOne jobs + Azure Recovery Services vaults.
    .DESCRIPTION
        Returns a unified view of backup failures from NinjaOne (managed backup) and
        Azure Recovery Services. Red-flags any job not in 'Completed' or 'CompletedWithWarnings'.
    .EXAMPLE   Get-SVHBackupHealth | Where-Object Status -notin 'Completed','CompletedWithWarnings'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$SubscriptionId,
        [int]$NinjaPageSize = 100
    )
    Write-Verbose '[Cross] Pulling backup health'

    # NinjaOne managed backups
    try {
        $ninjaBackups = Get-SVHNinjaAllBackups -PageSize $NinjaPageSize
        foreach ($b in $ninjaBackups) {
            [PSCustomObject]@{
                Source     = 'NinjaOne'
                DeviceName = $b.deviceName ?? $b.systemName
                JobName    = $b.planName
                Status     = $b.lastRunStatus
                LastRun    = $b.lastRunTime
                NextRun    = $b.nextScheduledTime
            }
        }
    } catch {
        Write-Verbose "[Cross] NinjaOne backup query failed: $_"
    }

    # Azure Recovery Services
    if ($SubscriptionId) {
        try {
            $vaults = Get-SVHRecoveryVaults -SubscriptionId $SubscriptionId
            foreach ($v in $vaults) {
                try {
                    $jobs = Get-SVHRecoveryJobs -SubscriptionId $SubscriptionId `
                        -ResourceGroupName $v.resourceGroup -VaultName $v.name
                    foreach ($j in $jobs) {
                        [PSCustomObject]@{
                            Source     = 'AzureRSV'
                            DeviceName = $j.properties?.entityFriendlyName
                            JobName    = $v.name
                            Status     = $j.properties?.status
                            LastRun    = $j.properties?.startTime
                            NextRun    = $null
                        }
                    }
                } catch { Write-Verbose "[Cross] Azure vault '$($v.name)' job query failed: $_" }
            }
        } catch { Write-Verbose "[Cross] Azure Recovery Services query failed: $_" }
    }
}
Export-ModuleMember -Function Get-SVHBackupHealth

function Get-SVHComplianceGap {
    <#
    .SYNOPSIS  Identify compliance gaps across Entra, Intune, and Wazuh in one call.
    .DESCRIPTION
        Returns a consolidated list of findings from:
          - Get-SVHMFAGap          (users without MFA)
          - Get-SVHGuestUsers       (external guests in the tenant)
          - Get-SVHLicenseWaste     (disabled users holding licenses)
          - Get-SVHStaleIntuneDevices (devices not checked in for 30+ days)
          - Get-SVHWazuhDisconnectedAgents (offline SIEM agents)
    .EXAMPLE   Get-SVHComplianceGap | Format-Table Category, Finding, Detail
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$StaleDeviceDays = 30,
        [int]$Top             = 500
    )
    Write-Verbose '[Cross] Running compliance gap scan'

    function emit($category, $finding, $detail) {
        [PSCustomObject]@{ Category = $category; Finding = $finding; Detail = $detail }
    }

    try {
        $mfa = Get-SVHMFAGap -Top $Top
        foreach ($u in $mfa) { emit 'MFA' 'No MFA method registered' "$($u.displayName) ($($u.userPrincipalName))" }
    } catch { emit 'MFA' 'Query failed' "$_" }

    try {
        $guests = Get-SVHGuestUsers -Top $Top
        foreach ($g in $guests) { emit 'GuestAccess' 'Guest user in tenant' "$($g.displayName) ($($g.mail))" }
    } catch { emit 'GuestAccess' 'Query failed' "$_" }

    try {
        $waste = Get-SVHLicenseWaste -Top $Top
        foreach ($u in $waste) { emit 'Licensing' 'Disabled user holding license' "$($u.displayName) ($($u.userPrincipalName))" }
    } catch { emit 'Licensing' 'Query failed' "$_" }

    try {
        $stale = Get-SVHStaleIntuneDevices -DaysThreshold $StaleDeviceDays
        foreach ($d in $stale) { emit 'Intune' "Device not seen in $StaleDeviceDays days" "$($d.deviceName) (last: $($d.lastSyncDateTime))" }
    } catch { emit 'Intune' 'Query failed' "$_" }

    try {
        $disconnected = Get-SVHWazuhDisconnectedAgents
        foreach ($a in $disconnected) { emit 'Wazuh' 'Agent disconnected' "$($a.name) ($($a.ip))" }
    } catch { emit 'Wazuh' 'Query failed' "$_" }
}
Export-ModuleMember -Function Get-SVHComplianceGap

function Get-SVHCriticalAlertSummary {
    <#
    .SYNOPSIS  Pull critical alerts from every connected SIEM/RMM system in one call.
    .DESCRIPTION
        Aggregates critical alerts from Defender MDE, Wazuh (level 12+), and NinjaOne.
        Returns a unified [PSCustomObject] stream tagged by Source.
    .EXAMPLE   Get-SVHCriticalAlertSummary -Hours 4 | Sort-Object Timestamp -Descending | Format-Table
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Hours = 24)
    Write-Verbose "[Cross] Pulling critical alerts from the last $Hours hours"

    # Defender MDE
    try {
        $mdeAlerts = Get-SVHMDEAlerts -Severity High
        foreach ($a in $mdeAlerts) {
            [PSCustomObject]@{
                Source    = 'DefenderMDE'
                Severity  = $a.severity
                Title     = $a.title
                Device    = $a.computerDnsName
                Timestamp = $a.alertCreationTime
                Status    = $a.status
                Detail    = $a.description
            }
        }
    } catch { Write-Verbose "[Cross] MDE alert query failed: $_" }

    # Wazuh high alerts
    try {
        $wazuhAlerts = Get-SVHWazuhHighAlerts -MinLevel 12 -Hours $Hours
        foreach ($a in $wazuhAlerts) {
            [PSCustomObject]@{
                Source    = 'Wazuh'
                Severity  = "Level $($a.rule?.level)"
                Title     = $a.rule?.description
                Device    = $a.agent?.name
                Timestamp = $a.timestamp
                Status    = 'active'
                Detail    = $a.full_log
            }
        }
    } catch { Write-Verbose "[Cross] Wazuh alert query failed: $_" }

    # NinjaOne critical alerts
    try {
        $ninjaAlerts = Get-SVHNinjaCriticalAlerts
        foreach ($a in $ninjaAlerts) {
            [PSCustomObject]@{
                Source    = 'NinjaOne'
                Severity  = $a.severity
                Title     = $a.message
                Device    = $a.systemName
                Timestamp = $a.createTime
                Status    = $a.status
                Detail    = $a.details
            }
        }
    } catch { Write-Verbose "[Cross] NinjaOne alert query failed: $_" }
}
Export-ModuleMember -Function Get-SVHCriticalAlertSummary

# ── ACT: IR Composite ─────────────────────────────────────────────────────────

function Invoke-SVHUserLockdown {
    <#
    .SYNOPSIS  IR composite: revoke sessions, disable Entra account, and isolate MDE device.
    .DESCRIPTION
        Coordinates three write operations in sequence:
          1. Revoke-SVHUserSessions   — invalidates all active tokens
          2. Set-SVHUserEnabled       — disables the Entra account
          3. Invoke-SVHMDEIsolation   — network-isolates the device in Defender

        Step 3 is skipped if -MDEMachineId is not provided.
        All steps support -WhatIf. Each step is attempted independently — a failure in one
        does not stop the others, but all errors are re-thrown at the end.
    .EXAMPLE
        Invoke-SVHUserLockdown -UserPrincipalName 'jdoe@shoestringvalley.com' -MDEMachineId 'abc123' -WhatIf
    .EXAMPLE
        Invoke-SVHUserLockdown -UserPrincipalName 'jdoe@shoestringvalley.com'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)]
        [string]$UserPrincipalName,
        [string]$MDEMachineId,
        [string]$IsolationComment = 'Isolated via SVH IR lockdown procedure'
    )

    $errors = @()

    Write-Verbose "[Cross] Starting lockdown for $UserPrincipalName"

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, 'Revoke all sessions')) {
        try {
            Revoke-SVHUserSessions -UserPrincipalName $UserPrincipalName
            Write-Verbose "[Cross] Sessions revoked for $UserPrincipalName"
        } catch {
            $errors += "Session revoke failed: $_"
            Write-Warning "[Cross] Session revoke failed: $_"
        }
    }

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, 'Disable Entra account')) {
        try {
            Set-SVHUserEnabled -UserPrincipalName $UserPrincipalName -Enabled $false
            Write-Verbose "[Cross] Entra account disabled for $UserPrincipalName"
        } catch {
            $errors += "Account disable failed: $_"
            Write-Warning "[Cross] Account disable failed: $_"
        }
    }

    if ($MDEMachineId -and $PSCmdlet.ShouldProcess($MDEMachineId, 'Isolate device in Defender MDE')) {
        try {
            Invoke-SVHMDEIsolation -MachineId $MDEMachineId -Comment $IsolationComment
            Write-Verbose "[Cross] MDE isolation requested for machine $MDEMachineId"
        } catch {
            $errors += "MDE isolation failed: $_"
            Write-Warning "[Cross] MDE isolation failed: $_"
        }
    }

    if ($errors.Count -gt 0) {
        throw "Lockdown completed with $($errors.Count) error(s):`n$($errors -join "`n")"
    }

    Write-Verbose "[Cross] Lockdown complete for $UserPrincipalName"
    [PSCustomObject]@{
        UserPrincipalName = $UserPrincipalName
        MDEMachineId      = $MDEMachineId
        SessionsRevoked   = $true
        AccountDisabled   = $true
        DeviceIsolated    = [bool]$MDEMachineId
    }
}
Export-ModuleMember -Function Invoke-SVHUserLockdown

# ── Connectivity ──────────────────────────────────────────────────────────────

function Test-SVHWinRM {
    <#
    .SYNOPSIS  Verify WinRM connectivity from WSL to a Windows target.
    .DESCRIPTION
        Runs DNS, ping, TCP port checks (5985/5986), and a test PSSession.
        Reference: powershell/references/setup-winrm.md
    .EXAMPLE   Test-SVHWinRM -ComputerName 'SVH-SQL01'
    .EXAMPLE   Test-SVHWinRM -ComputerName 'SVH-SQL01' -Credential (Get-Credential (Get-SVHTierUsername -Tier server))
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    $result = [ordered]@{ ComputerName = $ComputerName }

    try {
        $dns = Resolve-DnsName -Name $ComputerName -ErrorAction Stop
        $result['DNS'] = $dns.IPAddress -join ', '
    } catch { $result['DNS'] = "FAILED: $_" }

    $result['Ping']       = if (Test-Connection -ComputerName $ComputerName -Count 1 -Quiet) { 'OK' } else { 'FAILED' }
    $result['WinRM-5985'] = if ((Test-NetConnection -ComputerName $ComputerName -Port 5985 -WarningAction SilentlyContinue).TcpTestSucceeded) { 'Open' } else { 'Closed' }
    $result['WinRM-5986'] = if ((Test-NetConnection -ComputerName $ComputerName -Port 5986 -WarningAction SilentlyContinue).TcpTestSucceeded) { 'Open' } else { 'Closed' }

    try {
        $sp = @{ ComputerName = $ComputerName; ErrorAction = 'Stop' }
        if ($Credential) { $sp['Credential'] = $Credential }
        $session = New-PSSession @sp
        $result['PSSession'] = 'OK'
        Remove-PSSession $session
    } catch { $result['PSSession'] = "FAILED: $_" }

    [PSCustomObject]$result | Format-List
}
Export-ModuleMember -Function Test-SVHWinRM

function Get-SVHEventLogSummary {
    <#
    .SYNOPSIS  Run a targeted Get-WinEvent query against a remote Windows host via PSRemoting.
    .DESCRIPTION
        Mirrors the recipes in powershell/references/ps-remoting-snippets.md.
        Kerberos handles auth transparently when running as sa_stevens@ from a domain-joined terminal.
    .EXAMPLE   Get-SVHEventLogSummary -ComputerName 'SVH-SQL01' -LogName System -Level Error -Hours 4
    .EXAMPLE   Get-SVHEventLogSummary -ComputerName 'SVH-SQL01' -Credential (Get-Credential (Get-SVHTierUsername -Tier server))
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [ValidateSet('System','Security','Application')]
        [string]$LogName    = 'System',
        [ValidateSet('Critical','Error','Warning','Information')]
        [string]$Level      = 'Error',
        [int]$Hours         = 1,
        [int]$MaxEvents     = 50,
        [string]$ProviderName,
        [int]$EventId,
        [System.Management.Automation.PSCredential]$Credential
    )

    $levelMap   = @{ Critical = 1; Error = 2; Warning = 3; Information = 4 }
    $filterHash = @{
        LogName   = $LogName
        Level     = $levelMap[$Level]
        StartTime = (Get-Date).AddHours(-$Hours)
    }
    if ($ProviderName) { $filterHash['ProviderName'] = $ProviderName }
    if ($EventId)      { $filterHash['Id']           = $EventId }

    $sp = @{ ComputerName = $ComputerName }
    if ($Credential) { $sp['Credential'] = $Credential }

    Invoke-Command @sp -ScriptBlock {
        param($fh, $max)
        Get-WinEvent -FilterHashtable $fh -MaxEvents $max -ErrorAction SilentlyContinue |
            Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message
    } -ArgumentList $filterHash, $MaxEvents
}
Export-ModuleMember -Function Get-SVHEventLogSummary
