# SVH.NinjaOne.psm1 — NinjaOne RMM REST API
# Requires: SVH.Core
# Base URL: https://app.ninjarmm.com/api/v2
# Auth: OAuth2 client credentials (NinjaOne's own token endpoint — not Microsoft)

Set-StrictMode -Version Latest

function script:Get-NinjaToken {
    Get-SVHOAuth2Token -CacheKey 'NinjaOne' `
        -TokenEndpoint 'https://app.ninjarmm.com/ws/oauth/token' `
        -ClientId     (Get-SVHCredential 'NINJA_CLIENT_ID') `
        -ClientSecret (Get-SVHCredential 'NINJA_CLIENT_SECRET') `
        -Scope        'monitoring management control'
}

function script:nHeaders { @{ Authorization = "Bearer $(Get-NinjaToken)" } }

function script:ResolveNinjaOrg([int]$OrgId) {
    if ($OrgId -gt 0) { return $OrgId }
    $v = $Global:SVHCreds?['SVH_NINJA_DEFAULT_ORG']
    if ($v) { [int]$v } else { 0 }
}

function script:nGet($path, $query = @{}) {
    Invoke-SVHRest -Uri "https://app.ninjarmm.com/api/v2$path" -Headers (nHeaders) -Query $query
}

function script:nPost($path, $body) {
    Invoke-SVHRest -Method POST -Uri "https://app.ninjarmm.com/api/v2$path" -Headers (nHeaders) -Body $body
}

# ── VERIFY: Device Discovery ───────────────────────────────────────────────────

function Get-SVHNinjaServers {
    <#
    .SYNOPSIS  List servers managed by NinjaOne.
    .EXAMPLE   Get-SVHNinjaServers | Where-Object status -eq 'ONLINE'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$OsFilter = 'WINDOWS_SERVER,LINUX_SERVER',
        [int]$OrgId       = 0,
        [int]$PageSize    = 50
    )
    $filterStr  = ($OsFilter -split ',' | ForEach-Object { "osType:$($_.Trim())" }) -join ','
    $query      = @{ pageSize = $PageSize; filter = $filterStr }
    $resolvedOrg = ResolveNinjaOrg $OrgId
    if ($resolvedOrg -gt 0) { $query['organizationId'] = $resolvedOrg }
    nGet '/devices' $query
}
Export-ModuleMember -Function Get-SVHNinjaServers

function Get-SVHNinjaDevice {
    <#
    .SYNOPSIS  Get detailed info for a single NinjaOne device.
    .EXAMPLE   Get-SVHNinjaDevice -DeviceId 42
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId
    )
    process { nGet "/device/$DeviceId" }
}
Export-ModuleMember -Function Get-SVHNinjaDevice

function Get-SVHNinjaOrgs {
    <#
    .SYNOPSIS  List all NinjaOne organizations.
    .EXAMPLE   Get-SVHNinjaOrgs
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$PageSize = 50)
    nGet '/organizations' @{ pageSize = $PageSize }
}
Export-ModuleMember -Function Get-SVHNinjaOrgs

function Get-SVHNinjaOrg {
    <#
    .SYNOPSIS  Get a single NinjaOne organization by ID.
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [int]$OrgId
    )
    nGet "/organization/$OrgId"
}
Export-ModuleMember -Function Get-SVHNinjaOrg

# ── VERIFY: Fleet-Wide Summaries ──────────────────────────────────────────────

function Get-SVHNinjaOfflineDevices {
    <#
    .SYNOPSIS  List all devices currently offline — quick fleet health check.
    .DESCRIPTION
        When SVH_NINJA_DEFAULT_ORG is set in credentials, scopes to that org automatically.
    .EXAMPLE   Get-SVHNinjaOfflineDevices | Select-Object systemName, lastContact, os
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$OrgId    = 0,
        [int]$PageSize = 200
    )
    Write-Verbose '[Ninja] Querying offline devices'
    $query = @{ pageSize = $PageSize; filter = 'status:OFFLINE' }
    $resolvedOrg = ResolveNinjaOrg $OrgId
    if ($resolvedOrg -gt 0) { $query['organizationId'] = $resolvedOrg }
    nGet '/devices' $query
}
Export-ModuleMember -Function Get-SVHNinjaOfflineDevices

function Get-SVHNinjaDiskAlerts {
    <#
    .SYNOPSIS  Find devices with disk volumes above a usage threshold.
    .DESCRIPTION
        Queries volumes for all servers and returns those exceeding -ThresholdPct (default 85%).
        This is a polling function — it calls the volumes endpoint per device and may be slow on
        large fleets. Use -OsFilter to narrow to servers only.
    .EXAMPLE   Get-SVHNinjaDiskAlerts -ThresholdPct 90
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$ThresholdPct = 85,
        [string]$OsFilter  = 'WINDOWS_SERVER,LINUX_SERVER',
        [int]$PageSize     = 100
    )
    Write-Verbose "[Ninja] Scanning disk usage (threshold: ${ThresholdPct}%)"
    $devices = Get-SVHNinjaServers -OsFilter $OsFilter -PageSize $PageSize
    foreach ($device in $devices) {
        try {
            $vols = nGet "/device/$($device.id)/volumes"
            foreach ($vol in $vols) {
                if ($vol.capacity -gt 0) {
                    $pct = [math]::Round(($vol.usedSpace / $vol.capacity) * 100, 1)
                    if ($pct -ge $ThresholdPct) {
                        [PSCustomObject]@{
                            DeviceId    = $device.id
                            SystemName  = $device.systemName
                            VolumeName  = $vol.name
                            DriveLetter = $vol.deviceType
                            UsedPct     = $pct
                            TotalGB     = [math]::Round($vol.capacity / 1GB, 1)
                            FreeGB      = [math]::Round(($vol.capacity - $vol.usedSpace) / 1GB, 1)
                        }
                    }
                }
            }
        } catch {
            Write-Verbose "Skipped $($device.systemName): $_"
        }
    }
}
Export-ModuleMember -Function Get-SVHNinjaDiskAlerts

function Get-SVHNinjaCriticalAlerts {
    <#
    .SYNOPSIS  List all active critical/urgent alerts across the fleet.
    .EXAMPLE   Get-SVHNinjaCriticalAlerts | Format-Table systemName, message, created
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$PageSize = 200)
    Write-Verbose '[Ninja] Fetching fleet-wide critical alerts'
    $alerts = nGet '/alerts' @{ pageSize = $PageSize; severity = 'CRITICAL' }
    $alerts | ForEach-Object {
        $device = $null
        try { $device = nGet "/device/$($_.deviceId)" } catch {}
        $_ | Add-Member -NotePropertyName systemName -NotePropertyValue $device?.systemName -Force -PassThru
    }
}
Export-ModuleMember -Function Get-SVHNinjaCriticalAlerts

# ── VERIFY: System State ───────────────────────────────────────────────────────

function Get-SVHNinjaServices {
    <#
    .SYNOPSIS  List Windows services on a device, optionally filtered by name.
    .EXAMPLE   Get-SVHNinjaServices -DeviceId 42 -Filter 'SQL'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [string]$Filter
    )
    process {
        $query = @{}
        if ($Filter) { $query['filter'] = "name:$Filter" }
        nGet "/device/$DeviceId/windows/services" $query
    }
}
Export-ModuleMember -Function Get-SVHNinjaServices

function Get-SVHNinjaProcesses {
    <#
    .SYNOPSIS  List running processes on a device.
    .EXAMPLE   Get-SVHNinjaProcesses -DeviceId 42 -Filter 'sqlservr'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [string]$Filter
    )
    process {
        $query = @{}
        if ($Filter) { $query['filter'] = "name:$Filter" }
        nGet "/device/$DeviceId/processes" $query
    }
}
Export-ModuleMember -Function Get-SVHNinjaProcesses

function Get-SVHNinjaVolumes {
    <#
    .SYNOPSIS  List disk volumes on a device with computed percent-used.
    .EXAMPLE   Get-SVHNinjaVolumes -DeviceId 42 | Where-Object percentUsed -gt 80
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId
    )
    process {
        $vols = nGet "/device/$DeviceId/volumes"
        $vols | ForEach-Object {
            $pct = if ($_.capacity -gt 0) { [math]::Round(($_.usedSpace / $_.capacity) * 100, 1) } else { 0 }
            $_ | Add-Member -NotePropertyName percentUsed -NotePropertyValue $pct -Force -PassThru
        }
    }
}
Export-ModuleMember -Function Get-SVHNinjaVolumes

function Get-SVHNinjaEventLog {
    <#
    .SYNOPSIS  Query the Windows event log on a device via NinjaOne's API.
    .EXAMPLE   Get-SVHNinjaEventLog -DeviceId 42 -LogName System -Level Error
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [ValidateSet('System','Security','Application')]
        [string]$LogName  = 'System',
        [ValidateSet('Critical','Error','Warning','Information','')]
        [string]$Level    = '',
        [string]$Source,
        [int]$EventId,
        [int]$PageSize    = 50
    )
    process {
        $query   = @{ logName = $LogName; pageSize = $PageSize }
        $filters = @()
        if ($Level)   { $filters += "level:$Level" }
        if ($Source)  { $filters += "source:$Source" }
        if ($EventId) { $filters += "eventId:$EventId" }
        if ($filters) { $query['filter'] = $filters -join ',' }
        nGet "/device/$DeviceId/windows/eventlogs" $query
    }
}
Export-ModuleMember -Function Get-SVHNinjaEventLog

function Get-SVHNinjaAlerts {
    <#
    .SYNOPSIS  List active alerts for a device.
    .EXAMPLE   Get-SVHNinjaAlerts -DeviceId 42
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId
    )
    process { nGet "/device/$DeviceId/alerts" }
}
Export-ModuleMember -Function Get-SVHNinjaAlerts

# ── VERIFY: Patching ──────────────────────────────────────────────────────────

function Get-SVHNinjaPatches {
    <#
    .SYNOPSIS  List pending patches for a device, optionally filtered by severity.
    .EXAMPLE   Get-SVHNinjaPatches -DeviceId 42 -Severity critical
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [ValidateSet('critical','important','moderate','low','unspecified','')]
        [string]$Severity = '',
        [int]$PageSize    = 50
    )
    process {
        $query = @{ status = 'PENDING'; pageSize = $PageSize }
        if ($Severity) { $query['severity'] = $Severity.ToUpper() }
        nGet "/device/$DeviceId/patches" $query
    }
}
Export-ModuleMember -Function Get-SVHNinjaPatches

function Get-SVHNinjaPatchHistory {
    <#
    .SYNOPSIS  List recently installed patches for a device.
    .EXAMPLE   Get-SVHNinjaPatchHistory -DeviceId 42
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [int]$PageSize = 50
    )
    process { nGet "/device/$DeviceId/patches" @{ status = 'INSTALLED'; pageSize = $PageSize } }
}
Export-ModuleMember -Function Get-SVHNinjaPatchHistory

# ── VERIFY: Backups ───────────────────────────────────────────────────────────

function Get-SVHNinjaDeviceBackups {
    <#
    .SYNOPSIS  List backup jobs for a specific device.
    .EXAMPLE   Get-SVHNinjaDeviceBackups -DeviceId 42
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId
    )
    process { nGet "/device/$DeviceId/backup" }
}
Export-ModuleMember -Function Get-SVHNinjaDeviceBackups

function Get-SVHNinjaAllBackups {
    <#
    .SYNOPSIS  List backup status across all devices in an org.
    .EXAMPLE   Get-SVHNinjaAllBackups | Where-Object status -ne 'SUCCESS'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$OrgId    = 0,
        [int]$PageSize = 50
    )
    $query = @{ pageSize = $PageSize }
    $resolvedOrg = ResolveNinjaOrg $OrgId
    if ($resolvedOrg -gt 0) { $query['organizationId'] = $resolvedOrg }
    nGet '/devices/backup' $query
}
Export-ModuleMember -Function Get-SVHNinjaAllBackups

# ── VERIFY: Script Library & Custom Fields ────────────────────────────────────

function Get-SVHNinjaScripts {
    <#
    .SYNOPSIS  List scripts in the NinjaOne library.
    .EXAMPLE   Get-SVHNinjaScripts -Language POWERSHELL
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('POWERSHELL','CMD','BASH','PYTHON','')]
        [string]$Language = '',
        [int]$PageSize    = 50
    )
    $query = @{ pageSize = $PageSize }
    if ($Language) { $query['lang'] = $Language }
    nGet '/scripting/scripts' $query
}
Export-ModuleMember -Function Get-SVHNinjaScripts

function Get-SVHNinjaScript {
    <#
    .SYNOPSIS  Get a single script by ID.
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [int]$ScriptId
    )
    nGet "/scripting/script/$ScriptId"
}
Export-ModuleMember -Function Get-SVHNinjaScript

function Get-SVHNinjaDeviceCustomFields {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId
    )
    process { nGet "/device/$DeviceId/custom-fields" }
}
Export-ModuleMember -Function Get-SVHNinjaDeviceCustomFields

function Get-SVHNinjaOrgCustomFields {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [int]$OrgId
    )
    nGet "/organization/$OrgId/custom-fields"
}
Export-ModuleMember -Function Get-SVHNinjaOrgCustomFields

function Get-SVHNinjaScriptResult {
    <#
    .SYNOPSIS  Poll the result of a queued script run.
    .EXAMPLE   Get-SVHNinjaScriptResult -DeviceId 42 -ResultId 9001
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [Parameter(Mandatory)][int]$ResultId
    )
    nGet "/device/$DeviceId/script/result/$ResultId"
}
Export-ModuleMember -Function Get-SVHNinjaScriptResult

# ── ACT: Script Execution & Reboot ───────────────────────────────────────────

function Invoke-SVHNinjaScript {
    <#
    .SYNOPSIS  Queue a script from the NinjaOne library to run on a device.
    .DESCRIPTION
        Returns a resultId. Poll Get-SVHNinjaScriptResult to check completion.
        Supports -WhatIf and -Confirm.
    .EXAMPLE
        Invoke-SVHNinjaScript -DeviceId 42 -ScriptId 7 -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [Parameter(Mandatory)][int]$ScriptId,
        [hashtable]$Parameters = @{},
        [ValidateSet('SYSTEM','LOGGED_ON_USER')]
        [string]$RunAs = 'SYSTEM'
    )
    if ($PSCmdlet.ShouldProcess("device $DeviceId", "Run script $ScriptId as $RunAs")) {
        $result = nPost "/device/$DeviceId/script/run" @{
            id         = $ScriptId
            runAs      = $RunAs
            parameters = $Parameters
        }
        Write-Verbose "[Ninja] Script $ScriptId queued on device $DeviceId — result ID: $($result.resultId)"
        $result
    }
}
Export-ModuleMember -Function Invoke-SVHNinjaScript

function Restart-SVHNinjaDevice {
    <#
    .SYNOPSIS  Request a reboot of a NinjaOne-managed device.
    .EXAMPLE   Restart-SVHNinjaDevice -DeviceId 42 -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [int]$DeviceId,
        [string]$Reason = 'Restart requested via SVH PowerShell'
    )
    process {
        if ($PSCmdlet.ShouldProcess("device $DeviceId", 'Reboot')) {
            nPost "/device/$DeviceId/reboot" @{ reason = $Reason }
            Write-Verbose "[Ninja] Reboot requested for device $DeviceId"
        }
    }
}
Export-ModuleMember -Function Restart-SVHNinjaDevice
