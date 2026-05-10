# SVH.NinjaOne.psm1 — NinjaOne RMM REST API
# Base URL: https://app.ninjarmm.com/api/v2

$script:NinjaToken       = $null
$script:NinjaTokenExpiry = [DateTime]::MinValue

function script:Get-NinjaToken {
    if ($script:NinjaToken -and (Get-Date) -lt $script:NinjaTokenExpiry) {
        return $script:NinjaToken
    }
    $c    = $Global:SVHCreds
    $body = @{
        grant_type    = 'client_credentials'
        client_id     = $c['NINJA_CLIENT_ID']
        client_secret = $c['NINJA_CLIENT_SECRET']
        scope         = 'monitoring management control'
    }
    $r = Invoke-RestMethod -Method Post `
        -Uri 'https://app.ninjarmm.com/ws/oauth/token' `
        -Body $body -ContentType 'application/x-www-form-urlencoded'
    $script:NinjaToken       = $r.access_token
    $script:NinjaTokenExpiry = (Get-Date).AddSeconds($r.expires_in - 60)
    return $script:NinjaToken
}

function script:nGet($path, $params = @{}) {
    $uri     = "https://app.ninjarmm.com/api/v2$path"
    $headers = @{ Authorization = "Bearer $(Get-NinjaToken)" }
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString($_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
}

function script:nPost($path, $body) {
    Invoke-RestMethod -Method Post `
        -Uri "https://app.ninjarmm.com/api/v2$path" `
        -Headers @{ Authorization = "Bearer $(Get-NinjaToken)"; 'Content-Type' = 'application/json' } `
        -Body ($body | ConvertTo-Json -Depth 10)
}

# ── VERIFY: Device Discovery ───────────────────────────────────────────────────

function Get-SVHNinjaServers {
    param(
        [string]$OsFilter  = 'WINDOWS_SERVER,LINUX_SERVER',
        [int]$OrgId        = 0,
        [int]$PageSize     = 50
    )
    $filterStr = ($OsFilter -split ',' | ForEach-Object { "osType:$($_.Trim())" }) -join ','
    $params = @{ pageSize = $PageSize; filter = $filterStr }
    if ($OrgId -gt 0) { $params['organizationId'] = $OrgId }
    nGet '/devices' $params
}
Export-ModuleMember -Function Get-SVHNinjaServers

function Get-SVHNinjaDevice {
    param([Parameter(Mandatory)][int]$DeviceId)
    nGet "/device/$DeviceId"
}
Export-ModuleMember -Function Get-SVHNinjaDevice

function Get-SVHNinjaOrgs {
    param([int]$PageSize = 50)
    nGet '/organizations' @{ pageSize = $PageSize }
}
Export-ModuleMember -Function Get-SVHNinjaOrgs

function Get-SVHNinjaOrg {
    param([Parameter(Mandatory)][int]$OrgId)
    nGet "/organization/$OrgId"
}
Export-ModuleMember -Function Get-SVHNinjaOrg

# ── VERIFY: System State ───────────────────────────────────────────────────────

function Get-SVHNinjaServices {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [string]$Filter
    )
    $params = @{}
    if ($Filter) { $params['filter'] = "name:$Filter" }
    nGet "/device/$DeviceId/windows/services" $params
}
Export-ModuleMember -Function Get-SVHNinjaServices

function Get-SVHNinjaProcesses {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [string]$Filter
    )
    $params = @{}
    if ($Filter) { $params['filter'] = "name:$Filter" }
    nGet "/device/$DeviceId/processes" $params
}
Export-ModuleMember -Function Get-SVHNinjaProcesses

function Get-SVHNinjaVolumes {
    param([Parameter(Mandatory)][int]$DeviceId)
    $vols = nGet "/device/$DeviceId/volumes"
    $vols | ForEach-Object {
        $pct = if ($_.capacity -gt 0) { [math]::Round(($_.usedSpace / $_.capacity) * 100, 1) } else { 0 }
        $_ | Add-Member -NotePropertyName percentUsed -NotePropertyValue $pct -PassThru
    }
}
Export-ModuleMember -Function Get-SVHNinjaVolumes

function Get-SVHNinjaEventLog {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [ValidateSet('System','Security','Application')][string]$LogName = 'System',
        [ValidateSet('Critical','Error','Warning','Information','')][string]$Level = '',
        [string]$Source,
        [int]$EventId,
        [int]$PageSize = 50
    )
    $params   = @{ logName = $LogName; pageSize = $PageSize }
    $filters  = @()
    if ($Level)   { $filters += "level:$Level" }
    if ($Source)  { $filters += "source:$Source" }
    if ($EventId) { $filters += "eventId:$EventId" }
    if ($filters) { $params['filter'] = $filters -join ',' }
    nGet "/device/$DeviceId/windows/eventlogs" $params
}
Export-ModuleMember -Function Get-SVHNinjaEventLog

function Get-SVHNinjaAlerts {
    param([Parameter(Mandatory)][int]$DeviceId)
    nGet "/device/$DeviceId/alerts"
}
Export-ModuleMember -Function Get-SVHNinjaAlerts

# ── VERIFY: Patching ──────────────────────────────────────────────────────────

function Get-SVHNinjaPatches {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [ValidateSet('critical','important','moderate','low','unspecified','')][string]$Severity = '',
        [int]$PageSize = 50
    )
    $params = @{ status = 'PENDING'; pageSize = $PageSize }
    if ($Severity) { $params['severity'] = $Severity.ToUpper() }
    nGet "/device/$DeviceId/patches" $params
}
Export-ModuleMember -Function Get-SVHNinjaPatches

function Get-SVHNinjaPatchHistory {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [int]$PageSize = 50
    )
    nGet "/device/$DeviceId/patches" @{ status = 'INSTALLED'; pageSize = $PageSize }
}
Export-ModuleMember -Function Get-SVHNinjaPatchHistory

# ── VERIFY: Backups ───────────────────────────────────────────────────────────

function Get-SVHNinjaDeviceBackups {
    param([Parameter(Mandatory)][int]$DeviceId)
    nGet "/device/$DeviceId/backup"
}
Export-ModuleMember -Function Get-SVHNinjaDeviceBackups

function Get-SVHNinjaAllBackups {
    param([int]$OrgId = 0, [int]$PageSize = 50)
    $params = @{ pageSize = $PageSize }
    if ($OrgId -gt 0) { $params['organizationId'] = $OrgId }
    nGet '/devices/backup' $params
}
Export-ModuleMember -Function Get-SVHNinjaAllBackups

# ── VERIFY: Script Library & Custom Fields ────────────────────────────────────

function Get-SVHNinjaScripts {
    param(
        [ValidateSet('POWERSHELL','CMD','BASH','PYTHON','')][string]$Language = '',
        [int]$PageSize = 50
    )
    $params = @{ pageSize = $PageSize }
    if ($Language) { $params['lang'] = $Language }
    nGet '/scripting/scripts' $params
}
Export-ModuleMember -Function Get-SVHNinjaScripts

function Get-SVHNinjaScript {
    param([Parameter(Mandatory)][int]$ScriptId)
    nGet "/scripting/script/$ScriptId"
}
Export-ModuleMember -Function Get-SVHNinjaScript

function Get-SVHNinjaDeviceCustomFields {
    param([Parameter(Mandatory)][int]$DeviceId)
    nGet "/device/$DeviceId/custom-fields"
}
Export-ModuleMember -Function Get-SVHNinjaDeviceCustomFields

function Get-SVHNinjaOrgCustomFields {
    param([Parameter(Mandatory)][int]$OrgId)
    nGet "/organization/$OrgId/custom-fields"
}
Export-ModuleMember -Function Get-SVHNinjaOrgCustomFields

function Get-SVHNinjaScriptResult {
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
    .SYNOPSIS
        Queue a script from the NinjaOne library to run on a device.
    .NOTES
        Returns a result ID. Poll Get-SVHNinjaScriptResult to check completion.
    #>
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [Parameter(Mandatory)][int]$ScriptId,
        [hashtable]$Parameters  = @{},
        [ValidateSet('SYSTEM','LOGGED_ON_USER')][string]$RunAs = 'SYSTEM'
    )
    $body = @{
        id         = $ScriptId
        runAs      = $RunAs
        parameters = $Parameters
    }
    $result = nPost "/device/$DeviceId/script/run" $body
    Write-Host "[svh] Script $ScriptId queued on device $DeviceId — result ID: $($result.resultId)" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Invoke-SVHNinjaScript

function Restart-SVHNinjaDevice {
    param(
        [Parameter(Mandatory)][int]$DeviceId,
        [string]$Reason = 'Restart requested via SVH PowerShell'
    )
    nPost "/device/$DeviceId/reboot" @{ reason = $Reason }
    Write-Host "[svh] Reboot requested for device $DeviceId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Restart-SVHNinjaDevice
