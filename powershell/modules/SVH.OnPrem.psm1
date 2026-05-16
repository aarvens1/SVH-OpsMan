# SVH.OnPrem.psm1 — PSRemoting-native checks for domain servers
# Requires: SVH.Core (for Get-SVHTierUsername)
#
# All functions run via Invoke-Command against Windows servers.
# From a domain-joined terminal as sa_stevens@andersen-cost.com, Kerberos handles
# auth transparently — no -Credential needed. From WSL without Kerberos, pass
# -Credential (Get-Credential (Get-SVHTierUsername -Tier server)).
#
# References:
#   references/setup-winrm.md          — one-time WinRM trust setup from WSL
#   references/ps-remoting-snippets.md — Get-WinEvent recipes

Set-StrictMode -Version Latest

function script:RemoteParams([string]$ComputerName, [System.Management.Automation.PSCredential]$Credential) {
    $p = @{ ComputerName = $ComputerName; ErrorAction = 'Stop' }
    if ($Credential) { $p['Credential'] = $Credential }
    $p
}

# ── VERIFY: Disk & Storage ────────────────────────────────────────────────────

function Get-SVHServerDisk {
    <#
    .SYNOPSIS  Query disk free space on one or more remote servers via PSRemoting.
    .DESCRIPTION
        Returns all fixed drives. Flags volumes below -WarnThresholdPct (default 15%).
        Use -Credential only when Kerberos is not available (e.g., from non-domain WSL).
    .EXAMPLE   Get-SVHServerDisk -ComputerName SVH-SQL01
    .EXAMPLE   Get-SVHServerDisk -ComputerName SVH-SQL01,SVH-FS01 -WarnThresholdPct 20
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [int]$WarnThresholdPct = 15,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying disk on $computer"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    param($warn)
                    Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" |
                        Select-Object DeviceID,
                            @{N='TotalGB';  E={[math]::Round($_.Size/1GB,1)}},
                            @{N='FreeGB';   E={[math]::Round($_.FreeSpace/1GB,1)}},
                            @{N='UsedPct';  E={if($_.Size -gt 0){[math]::Round((($_.Size-$_.FreeSpace)/$_.Size)*100,1)}else{0}}},
                            @{N='Warning';  E={if($_.Size -gt 0){(($_.Size-$_.FreeSpace)/$_.Size*100) -ge (100-$warn)}else{$false}}}
                } -ArgumentList $WarnThresholdPct |
                    Select-Object * -ExcludeProperty PSComputerName, RunspaceId, PSShowComputerName |
                    ForEach-Object { $_ | Add-Member -NotePropertyName ComputerName -NotePropertyValue $computer -Force -PassThru }
            } catch {
                Write-Warning "[OnPrem] $computer disk query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHServerDisk

# ── VERIFY: Services ──────────────────────────────────────────────────────────

function Get-SVHServerServices {
    <#
    .SYNOPSIS  Query Windows service state on a remote server.
    .DESCRIPTION
        By default returns only stopped services with StartType=Automatic — the services
        that should be running but aren't. Pass -All to return all services.
    .EXAMPLE   Get-SVHServerServices -ComputerName SVH-SQL01
    .EXAMPLE   Get-SVHServerServices -ComputerName SVH-FS01 -Filter 'SQL'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [string]$Filter,
        [switch]$All,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying services on $computer"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    param($filter, $all)
                    $svcs = Get-Service | Sort-Object DisplayName
                    if ($filter)  { $svcs = $svcs | Where-Object { $_.DisplayName -like "*$filter*" -or $_.Name -like "*$filter*" } }
                    if (-not $all){ $svcs = $svcs | Where-Object { $_.Status -eq 'Stopped' -and $_.StartType -eq 'Automatic' } }
                    $svcs | Select-Object Name, DisplayName, Status, StartType
                } -ArgumentList $Filter, $All.IsPresent |
                    ForEach-Object { $_ | Add-Member -NotePropertyName ComputerName -NotePropertyValue $computer -Force -PassThru }
            } catch {
                Write-Warning "[OnPrem] $computer service query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHServerServices

# ── VERIFY: Pending Reboot ────────────────────────────────────────────────────

function Get-SVHPendingReboot {
    <#
    .SYNOPSIS  Check multiple reboot-pending indicators on a remote server.
    .DESCRIPTION
        Checks four independent indicators:
          - Component-Based Servicing (CBS) — Windows Update component pending
          - Windows Update pending reboot
          - SCCM client pending reboot
          - PendingFileRenameOperations registry key

        Any $true means a reboot is needed.
    .EXAMPLE   Get-SVHPendingReboot -ComputerName SVH-SQL01
    .EXAMPLE   'SVH-SQL01','SVH-FS01' | Get-SVHPendingReboot | Where-Object PendingReboot
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Checking pending reboot on $computer"
            try {
                $result = Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    $cbs     = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
                    $wu      = Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
                    $pfr     = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue)?.PendingFileRenameOperations -ne $null
                    $sccm    = $false
                    try {
                        $sccmProp = Invoke-CimMethod -Namespace root\ccm\clientsdk -ClassName CCM_ClientUtilities -MethodName DetermineIfRebootPending -ErrorAction Stop
                        $sccm = $sccmProp.RebootPending -or $sccmProp.IsHardRebootPending
                    } catch {}

                    [PSCustomObject]@{
                        CBSPending             = $cbs
                        WindowsUpdatePending   = $wu
                        PendingFileRename      = [bool]$pfr
                        SCCMPending            = $sccm
                        PendingReboot          = $cbs -or $wu -or [bool]$pfr -or $sccm
                    }
                }
                $result | Add-Member -NotePropertyName ComputerName -NotePropertyValue $computer -Force -PassThru
            } catch {
                Write-Warning "[OnPrem] $computer reboot check failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHPendingReboot

# ── VERIFY: Hyper-V ───────────────────────────────────────────────────────────

function Get-SVHHyperVVMs {
    <#
    .SYNOPSIS  List Hyper-V virtual machines on a host with their current state.
    .EXAMPLE   Get-SVHHyperVVMs -ComputerName SVH-HV01 | Where-Object State -ne Running
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying Hyper-V VMs on $computer"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    Get-VM | Select-Object Name, State, CPUUsage, MemoryAssigned, Uptime,
                        @{N='MemoryGB'; E={[math]::Round($_.MemoryAssigned/1GB,1)}},
                        Generation, Version, Path,
                        @{N='Checkpoints'; E={($_ | Get-VMCheckpoint).Count}}
                } | ForEach-Object { $_ | Add-Member -NotePropertyName Host -NotePropertyValue $computer -Force -PassThru }
            } catch {
                Write-Warning "[OnPrem] $computer Hyper-V query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHHyperVVMs

# ── VERIFY: Failover Cluster ──────────────────────────────────────────────────

function Get-SVHClusterState {
    <#
    .SYNOPSIS  Summarize failover cluster node and resource state.
    .DESCRIPTION
        Returns node status, offline/paused resources, and Cluster Shared Volume state.
        Run against any cluster node — does not require the Failover Clustering RSAT feature
        on the machine running this script, only on the remote target.
    .EXAMPLE   Get-SVHClusterState -ComputerName SVH-HV01
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Write-Verbose "[OnPrem] Querying cluster state via $ComputerName"
    try {
        Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
            $nodes     = Get-ClusterNode    | Select-Object Name, State, NodeHighestVersion
            $resources = Get-ClusterResource | Where-Object State -ne 'Online' |
                         Select-Object Name, State, OwnerGroup, ResourceType
            $csvs      = Get-ClusterSharedVolume | Select-Object Name, State, OwnerNode,
                         @{N='FaultState'; E={$_.SharedVolumeInfo?.FaultState}}
            [PSCustomObject]@{
                ClusterName      = (Get-Cluster).Name
                Nodes            = $nodes
                OfflineResources = $resources
                CSVs             = $csvs
            }
        }
    } catch {
        Write-Warning "[OnPrem] $ComputerName cluster query failed: $_"
    }
}
Export-ModuleMember -Function Get-SVHClusterState

# ── VERIFY: MABS / DPM Backup Jobs ───────────────────────────────────────────

function Get-SVHMABSJobStatus {
    <#
    .SYNOPSIS  Query MABS/DPM backup job status from the Application event log.
    .DESCRIPTION
        Microsoft Azure Backup Server (MABS) and DPM log job completion to the
        Application event log with ProviderName 'MSDPM'. Key event IDs:
          3175 — Backup job succeeded
          3176 — Backup job failed
          3111 — Backup job started
          3174 — Recovery job completed

        Run against the MABS server itself (or a node with access to MABS event logs).
        This does not require the DPM PowerShell console on the MCP host.
    .EXAMPLE   Get-SVHMABSJobStatus -ComputerName SVH-MABS01 -Hours 24
    .EXAMPLE   Get-SVHMABSJobStatus -ComputerName SVH-MABS01 -Hours 24 | Where-Object EventId -eq 3176
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [int]$Hours    = 24,
        [int]$MaxEvents = 200,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying MABS job log on $computer (last $Hours hours)"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    param($hours, $max)
                    $since = (Get-Date).AddHours(-$hours)
                    Get-WinEvent -FilterHashtable @{
                        LogName      = 'Application'
                        ProviderName = 'MSDPM'
                        Id           = 3175, 3176, 3111, 3174
                        StartTime    = $since
                    } -MaxEvents $max -ErrorAction SilentlyContinue |
                        Select-Object TimeCreated, Id, LevelDisplayName,
                            @{N='Outcome';     E={ switch($_.Id) { 3175{'Succeeded'} 3176{'Failed'} 3111{'Started'} 3174{'RecoveryDone'} default{'Unknown'} } }},
                            @{N='DataSource';  E={ if($_.Message -match 'data source (.+?) \(') { $Matches[1] } else { '' } }},
                            Message |
                        Sort-Object TimeCreated -Descending
                } -ArgumentList $Hours, $MaxEvents |
                    ForEach-Object { $_ | Add-Member -NotePropertyName MABSServer -NotePropertyValue $computer -Force -PassThru }
            } catch {
                Write-Warning "[OnPrem] $computer MABS log query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHMABSJobStatus

# ── VERIFY: SQL Server ────────────────────────────────────────────────────────

function Get-SVHSQLMemoryConfig {
    <#
    .SYNOPSIS  Check SQL Server max server memory configuration.
    .DESCRIPTION
        SQL Server will consume all available RAM if max server memory is uncapped
        (value 2147483647). On servers hosting SQL alongside MABS, IIS, or other
        services, this causes memory pressure across all processes.

        Returns current value_in_use. Flag anything at 2147483647 — it means uncapped.
    .EXAMPLE   Get-SVHSQLMemoryConfig -ComputerName SVH-SQL01
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [string]$InstanceName = 'MSSQLSERVER',
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying SQL memory config on $computer\\$InstanceName"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    param($instance)
                    $svc = Get-Service -Name $instance -ErrorAction Stop
                    if ($svc.Status -ne 'Running') {
                        return [PSCustomObject]@{ InstanceName = $instance; ServiceStatus = $svc.Status; MaxMemoryMB = $null; Uncapped = $null }
                    }
                    $result = Invoke-Sqlcmd -Query "SELECT name, value_in_use FROM sys.configurations WHERE name = 'max server memory (MB)'" `
                        -ServerInstance "." -ErrorAction Stop
                    [PSCustomObject]@{
                        InstanceName  = $instance
                        ServiceStatus = 'Running'
                        MaxMemoryMB   = $result.value_in_use
                        Uncapped      = $result.value_in_use -ge 2147483647
                    }
                } -ArgumentList $InstanceName |
                    Add-Member -NotePropertyName ComputerName -NotePropertyValue $computer -Force -PassThru
            } catch {
                Write-Warning "[OnPrem] $computer SQL memory query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHSQLMemoryConfig

function Get-SVHSQLWaitStats {
    <#
    .SYNOPSIS  Return top wait types on a SQL Server instance — first step in perf triage.
    .DESCRIPTION
        Queries sys.dm_os_wait_stats and returns the top wait types by total wait time,
        excluding idle/benign waits. A CXPACKET dominance suggests parallelism issues;
        PAGEIOLATCH suggests disk I/O pressure.
    .EXAMPLE   Get-SVHSQLWaitStats -ComputerName SVH-SQL01 -Top 10
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string[]]$ComputerName,
        [string]$InstanceName = 'MSSQLSERVER',
        [int]$Top             = 15,
        [System.Management.Automation.PSCredential]$Credential
    )
    process {
        foreach ($computer in $ComputerName) {
            Write-Verbose "[OnPrem] Querying SQL wait stats on $computer"
            try {
                Invoke-Command @(RemoteParams $computer $Credential) -ScriptBlock {
                    param($top)
                    $query = @"
SELECT TOP ($top)
    wait_type,
    waiting_tasks_count,
    CAST(wait_time_ms / 1000.0 AS DECIMAL(10,2)) AS wait_time_sec,
    CAST(signal_wait_time_ms / 1000.0 AS DECIMAL(10,2)) AS signal_wait_sec
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN (
    'SLEEP_TASK','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT',
    'HADR_FILESTREAM_IOMGR_IOCOMPLETION','HADR_WORK_QUEUE',
    'LAZYWRITER_SLEEP','LOGMGR_QUEUE','ONDEMAND_TASK_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH','RESOURCE_QUEUE','SERVER_IDLE_CHECK',
    'SLEEP_DBSTARTUP','SLEEP_DBRECOVER','SLEEP_MASTERDBREADY',
    'SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED','SLEEP_MSDBSTARTUP',
    'SLEEP_SYSTEMTASK','SLEEP_TEMPDBSTARTUP','SNI_HTTP_ACCEPT',
    'SP_SERVER_DIAGNOSTICS_SLEEP','SQLTRACE_BUFFER_FLUSH',
    'WAITFOR','XE_DISPATCHER_WAIT','XE_TIMER_EVENT',
    'BROKER_EVENTHANDLER','CHECKPOINT_QUEUE','DBMIRROR_EVENTS_QUEUE',
    'SQLTRACE_INCREMENTAL_FLUSH_SLEEP','WAIT_XTP_OFFLINE_CKPT_NEW_LOG'
)
ORDER BY wait_time_ms DESC;
"@
                    Invoke-Sqlcmd -Query $query -ServerInstance '.' -ErrorAction Stop
                } -ArgumentList $Top |
                    ForEach-Object { $_ | Add-Member -NotePropertyName ComputerName -NotePropertyValue $computer -Force -PassThru }
            } catch {
                Write-Warning "[OnPrem] $computer SQL wait stats query failed: $_"
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHSQLWaitStats
