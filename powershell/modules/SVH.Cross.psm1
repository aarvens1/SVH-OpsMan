# SVH.Cross.psm1 — Cross-system utility functions
# These aggregate data from multiple modules. Requires all other SVH modules loaded.

function Get-SVHAssetSummary {
    <#
    .SYNOPSIS
        Pull a quick summary of a named asset across NinjaOne, Defender MDE, and Wazuh.
    .EXAMPLE
        Get-SVHAssetSummary -Name 'SVH-SQL01'
    #>
    param([Parameter(Mandatory)][string]$Name)

    Write-Host "[svh] Pulling asset summary for '$Name'..." -ForegroundColor Cyan

    $result = [ordered]@{ Asset = $Name }

    # NinjaOne
    try {
        $ninjaDevices = Get-SVHNinjaServers | Where-Object { $_.systemName -like "*$Name*" }
        $result['NinjaOne'] = $ninjaDevices | Select-Object systemName, nodeClass, status, ipAddresses, uptime, os
    } catch { $result['NinjaOne'] = "Error: $_" }

    # Defender MDE
    try {
        $mdeDevices = Get-SVHMDEDevices | Where-Object { $_.computerDnsName -like "*$Name*" }
        $result['DefenderMDE'] = $mdeDevices | Select-Object computerDnsName, healthStatus, riskScore, exposureScore, lastSeen, osPlatform
    } catch { $result['DefenderMDE'] = "Error: $_" }

    # Wazuh
    try {
        $wazuhAgents = Get-SVHWazuhAgents -Search $Name
        $result['Wazuh'] = $wazuhAgents.affected_items | Select-Object name, status, ip, lastKeepAlive, os
    } catch { $result['Wazuh'] = "Error: $_" }

    [PSCustomObject]$result
}
Export-ModuleMember -Function Get-SVHAssetSummary

function Get-SVHUserSummary {
    <#
    .SYNOPSIS
        Pull a full picture of a user across Entra, licenses, MFA, sign-ins, Intune, and mailbox.
    .EXAMPLE
        Get-SVHUserSummary -UserPrincipalName 'jdoe@svh.com'
    #>
    param([Parameter(Mandatory)][string]$UserPrincipalName)

    Write-Host "[svh] Pulling user summary for '$UserPrincipalName'..." -ForegroundColor Cyan

    $result = [ordered]@{ UPN = $UserPrincipalName }

    try { $result['EntraUser']     = Get-SVHUser -UserPrincipalName $UserPrincipalName } catch { $result['EntraUser'] = "Error: $_" }
    try { $result['MFAMethods']    = (Get-SVHUserMFA -UserPrincipalName $UserPrincipalName).value } catch { $result['MFAMethods'] = "Error: $_" }
    try { $result['Licenses']      = (Get-SVHUserLicenses -UserPrincipalName $UserPrincipalName).value } catch { $result['Licenses'] = "Error: $_" }
    try { $result['RecentSignIns'] = (Get-SVHSignInLogs -UserPrincipalName $UserPrincipalName -Hours 72 -Top 10).value } catch { $result['RecentSignIns'] = "Error: $_" }
    try { $result['IntuneDevices'] = (Get-SVHIntuneDevice | Where-Object { $_.userPrincipalName -eq $UserPrincipalName }) } catch { $result['IntuneDevices'] = "Error: $_" }
    try { $result['MailboxSettings'] = Get-SVHMailboxSettings -UserPrincipalName $UserPrincipalName } catch { $result['MailboxSettings'] = "Error: $_" }

    [PSCustomObject]$result
}
Export-ModuleMember -Function Get-SVHUserSummary

function Get-SVHPatchSurface {
    <#
    .SYNOPSIS
        Cross-reference NinjaOne pending patches with Defender TVM severity for a device.
        Returns patches sorted by TVM exposure impact — what to fix first.
    .EXAMPLE
        Get-SVHPatchSurface -NinjaDeviceId 42 -MDEMachineId 'abc123...'
    #>
    param(
        [Parameter(Mandatory)][int]$NinjaDeviceId,
        [Parameter(Mandatory)][string]$MDEMachineId
    )

    Write-Host "[svh] Pulling patch surface for Ninja:$NinjaDeviceId / MDE:$MDEMachineId..." -ForegroundColor Cyan

    $pendingPatches = Get-SVHNinjaPatches -DeviceId $NinjaDeviceId
    $mdeVulns       = Get-SVHMDEDeviceVulns -MachineId $MDEMachineId

    $vulnIndex = @{}
    foreach ($v in $mdeVulns) {
        if ($v.cveId) { $vulnIndex[$v.cveId] = $v }
    }

    $enriched = foreach ($patch in $pendingPatches) {
        $tvmMatch = $null
        if ($patch.kbNumber) {
            $tvmMatch = $mdeVulns | Where-Object { $_.patchReferenceUrl -like "*$($patch.kbNumber)*" } | Select-Object -First 1
        }
        [PSCustomObject]@{
            KBNumber      = $patch.kbNumber
            PatchName     = $patch.name
            NinjaSeverity = $patch.severity
            TVMSeverity   = $tvmMatch?.severity
            TVMCvssScore  = $tvmMatch?.cvssV3
            CveId         = $tvmMatch?.cveId
            RebootRequired = $patch.rebootRequired
        }
    }
    $enriched | Sort-Object { switch ($_.TVMSeverity) { 'Critical' { 0 } 'High' { 1 } 'Medium' { 2 } 'Low' { 3 } default { 4 } } }
}
Export-ModuleMember -Function Get-SVHPatchSurface

function Test-SVHWinRM {
    <#
    .SYNOPSIS
        Verify WinRM connectivity from WSL to a Windows target.
        Wraps the trust setup steps from references/setup-winrm.md.
    .EXAMPLE
        Test-SVHWinRM -ComputerName 'SVH-SQL01' -Credential (Get-Credential)
    #>
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )

    $result = [ordered]@{ ComputerName = $ComputerName }

    # DNS
    try {
        $dns = Resolve-DnsName -Name $ComputerName -ErrorAction Stop
        $result['DNS'] = "$($dns.IPAddress -join ', ')"
    } catch {
        $result['DNS'] = "FAILED: $_"
    }

    # Ping
    $ping = Test-Connection -ComputerName $ComputerName -Count 1 -Quiet
    $result['Ping'] = if ($ping) { 'OK' } else { 'FAILED' }

    # WinRM port
    $tcpTest = Test-NetConnection -ComputerName $ComputerName -Port 5985 -WarningAction SilentlyContinue
    $result['WinRM-5985'] = if ($tcpTest.TcpTestSucceeded) { 'Open' } else { 'Closed' }

    $tcpTestS = Test-NetConnection -ComputerName $ComputerName -Port 5986 -WarningAction SilentlyContinue
    $result['WinRM-5986'] = if ($tcpTestS.TcpTestSucceeded) { 'Open' } else { 'Closed' }

    # PSSession
    try {
        $sessionParams = @{ ComputerName = $ComputerName; ErrorAction = 'Stop' }
        if ($Credential) { $sessionParams['Credential'] = $Credential }
        $session = New-PSSession @sessionParams
        $result['PSSession'] = 'OK'
        Remove-PSSession $session
    } catch {
        $result['PSSession'] = "FAILED: $_"
    }

    [PSCustomObject]$result | Format-List
}
Export-ModuleMember -Function Test-SVHWinRM

function Get-SVHEventLogSummary {
    <#
    .SYNOPSIS
        Run a targeted Get-WinEvent query against a remote Windows host via PSRemoting.
        Mirrors the recipes in references/ps-remoting-snippets.md.
    .EXAMPLE
        Get-SVHEventLogSummary -ComputerName 'SVH-SQL01' -LogName System -Level Error -Hours 4
    #>
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [ValidateSet('System','Security','Application')][string]$LogName = 'System',
        [ValidateSet('Critical','Error','Warning','Information')][string]$Level = 'Error',
        [int]$Hours   = 1,
        [int]$MaxEvents = 50,
        [string]$ProviderName,
        [int]$EventId,
        [System.Management.Automation.PSCredential]$Credential
    )

    $levelMap = @{ Critical = 1; Error = 2; Warning = 3; Information = 4 }
    $levelNum = $levelMap[$Level]
    $since    = (Get-Date).AddHours(-$Hours)

    $filterHash = @{
        LogName   = $LogName
        Level     = $levelNum
        StartTime = $since
    }
    if ($ProviderName) { $filterHash['ProviderName'] = $ProviderName }
    if ($EventId)      { $filterHash['Id']           = $EventId }

    $sessionParams = @{ ComputerName = $ComputerName }
    if ($Credential) { $sessionParams['Credential'] = $Credential }

    Invoke-Command @sessionParams -ScriptBlock {
        param($fh, $max)
        Get-WinEvent -FilterHashtable $fh -MaxEvents $max -ErrorAction SilentlyContinue |
            Select-Object TimeCreated, Id, LevelDisplayName, ProviderName, Message
    } -ArgumentList $filterHash, $MaxEvents
}
Export-ModuleMember -Function Get-SVHEventLogSummary
