# SVH.UniFi.psm1 — UniFi Cloud API + UniFi Network Controller
# Cloud API: https://api.ui.com (X-API-KEY header)
# Controller: UNIFI_CONTROLLER_URL (session cookie, username/password auth)

$script:UniFiSession     = $null  # WebRequestSession holding the cookie

function script:uCloudGet($path, $params = @{}) {
    $uri = "https://api.ui.com$path"
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri `
        -Headers @{ 'X-API-KEY' = $Global:SVHCreds['UNIFI_API_KEY']; Accept = 'application/json' }
}

function script:Get-UniFiSession {
    if ($script:UniFiSession) { return $script:UniFiSession }
    $c   = $Global:SVHCreds
    $url = $c['UNIFI_CONTROLLER_URL']
    $script:UniFiSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    Invoke-RestMethod -Method Post `
        -Uri "$url/api/auth/login" `
        -Body (@{ username = $c['UNIFI_USERNAME']; password = $c['UNIFI_PASSWORD'] } | ConvertTo-Json) `
        -ContentType 'application/json' `
        -WebSession $script:UniFiSession `
        -SkipCertificateCheck | Out-Null
    return $script:UniFiSession
}

function script:uCtrlGet($path, $params = @{}) {
    $url  = $Global:SVHCreds['UNIFI_CONTROLLER_URL']
    $uri  = "$url$path"
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri `
        -WebSession (Get-UniFiSession) -SkipCertificateCheck
}

function script:uCtrlPost($path, $body) {
    $url = $Global:SVHCreds['UNIFI_CONTROLLER_URL']
    Invoke-RestMethod -Method Post -Uri "$url$path" `
        -Body ($body | ConvertTo-Json -Depth 10) -ContentType 'application/json' `
        -WebSession (Get-UniFiSession) -SkipCertificateCheck
}

function script:uCtrlPut($path, $body) {
    $url = $Global:SVHCreds['UNIFI_CONTROLLER_URL']
    Invoke-RestMethod -Method Put -Uri "$url$path" `
        -Body ($body | ConvertTo-Json -Depth 10) -ContentType 'application/json' `
        -WebSession (Get-UniFiSession) -SkipCertificateCheck
}

function script:uCtrlDelete($path) {
    $url = $Global:SVHCreds['UNIFI_CONTROLLER_URL']
    Invoke-RestMethod -Method Delete -Uri "$url$path" `
        -WebSession (Get-UniFiSession) -SkipCertificateCheck
}

# ── VERIFY: Cloud API ─────────────────────────────────────────────────────────

function Get-SVHUniFiSites {
    uCloudGet '/api/v2/sites'
}
Export-ModuleMember -Function Get-SVHUniFiSites

function Get-SVHUniFiSite {
    param([Parameter(Mandatory)][string]$SiteId)
    uCloudGet "/api/v2/sites/$SiteId"
}
Export-ModuleMember -Function Get-SVHUniFiSite

function Get-SVHUniFiCloudDevices {
    param([Parameter(Mandatory)][string]$SiteId)
    uCloudGet "/api/v2/sites/$SiteId/devices"
}
Export-ModuleMember -Function Get-SVHUniFiCloudDevices

function Get-SVHUniFiCloudDevice {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$DeviceId
    )
    uCloudGet "/api/v2/sites/$SiteId/devices/$DeviceId"
}
Export-ModuleMember -Function Get-SVHUniFiCloudDevice

# ── VERIFY: Controller API ────────────────────────────────────────────────────

function Get-SVHUniFiSiteHealth {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/health"
}
Export-ModuleMember -Function Get-SVHUniFiSiteHealth

function Get-SVHUniFiNetworks {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/networks"
}
Export-ModuleMember -Function Get-SVHUniFiNetworks

function Get-SVHUniFiFirewallRules {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/firewallrules"
}
Export-ModuleMember -Function Get-SVHUniFiFirewallRules

function Get-SVHUniFiDevices {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/devices"
}
Export-ModuleMember -Function Get-SVHUniFiDevices

function Get-SVHUniFiClients {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [switch]$AllClients
    )
    $url = if ($AllClients) { "/api/v2/sites/$SiteId/clients" } else { "/api/v2/sites/$SiteId/clients?active=true" }
    uCtrlGet $url
}
Export-ModuleMember -Function Get-SVHUniFiClients

function Get-SVHUniFiWLANs {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/wlans"
}
Export-ModuleMember -Function Get-SVHUniFiWLANs

function Get-SVHUniFiPortProfiles {
    param([Parameter(Mandatory)][string]$SiteId)
    uCtrlGet "/api/v2/sites/$SiteId/portprofiles"
}
Export-ModuleMember -Function Get-SVHUniFiPortProfiles

function Get-SVHUniFiSwitchPorts {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$SwitchMac
    )
    $mac    = $SwitchMac.ToLower() -replace ':', ''
    $device = uCtrlGet "/api/v2/sites/$SiteId/devices/$mac"
    [PSCustomObject]@{
        DeviceName = $device.name
        Ports      = $device.port_table ?? $device.portTable
    }
}
Export-ModuleMember -Function Get-SVHUniFiSwitchPorts

# ── ACT: Client Management ────────────────────────────────────────────────────

function Block-SVHUniFiClient {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$MacAddress
    )
    uCtrlPost "/api/v2/sites/$SiteId/clients/$($MacAddress.ToLower())/block" @{}
    Write-Host "[svh] Client $MacAddress blocked on site $SiteId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Block-SVHUniFiClient

function Unblock-SVHUniFiClient {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$MacAddress
    )
    uCtrlPost "/api/v2/sites/$SiteId/clients/$($MacAddress.ToLower())/unblock" @{}
    Write-Host "[svh] Client $MacAddress unblocked on site $SiteId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Unblock-SVHUniFiClient

# ── ACT: WLAN Toggle ──────────────────────────────────────────────────────────

function Set-SVHUniFiWLAN {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$WlanId,
        [Parameter(Mandatory)][bool]$Enabled
    )
    uCtrlPut "/api/v2/sites/$SiteId/wlans/$WlanId" @{ enabled = $Enabled }
    Write-Host "[svh] WLAN $WlanId on site $SiteId set to enabled=$Enabled" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHUniFiWLAN

# ── ACT: Port Profile ─────────────────────────────────────────────────────────

function Set-SVHUniFiPortProfile {
    <#
    .SYNOPSIS
        Change the port profile assigned to a switch port — effectively changes its VLAN.
    .NOTES
        Get current port state via Get-SVHUniFiSwitchPorts. ProfileId comes from Get-SVHUniFiPortProfiles.
    #>
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$SwitchMac,
        [Parameter(Mandatory)][int]$PortIndex,
        [Parameter(Mandatory)][string]$PortProfileId
    )
    $mac    = $SwitchMac.ToLower() -replace ':', ''
    $device = uCtrlGet "/api/v2/sites/$SiteId/devices/$mac"
    $ports  = $device.port_overrides ?? @()

    $found = $false
    for ($i = 0; $i -lt $ports.Count; $i++) {
        if ($ports[$i].port_idx -eq $PortIndex) {
            $ports[$i].portconf_id = $PortProfileId
            $found = $true; break
        }
    }
    if (-not $found) {
        $ports += @{ port_idx = $PortIndex; portconf_id = $PortProfileId }
    }

    uCtrlPut "/api/v2/sites/$SiteId/devices/$mac" @{ port_overrides = $ports }
    Write-Host "[svh] Port $PortIndex on $SwitchMac set to profile $PortProfileId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHUniFiPortProfile

# ── ACT: Device Restart ───────────────────────────────────────────────────────

function Restart-SVHUniFiDevice {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$DeviceMac
    )
    $mac = $DeviceMac.ToLower() -replace ':', ''
    uCtrlPost "/api/v2/sites/$SiteId/devices/$mac/restart" @{}
    Write-Host "[svh] Restart requested for device $DeviceMac on site $SiteId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Restart-SVHUniFiDevice

# ── ACT: Firewall Rules ───────────────────────────────────────────────────────

function New-SVHUniFiFirewallRule {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('allow','drop','reject')][string]$Action,
        [Parameter(Mandatory)][ValidateSet('in','out','local')][string]$Ruleset,
        [int]$RuleIndex = 2000,
        [string]$SrcAddress,
        [string]$DstAddress,
        [string]$Protocol = 'all'
    )
    $body = @{
        name         = $Name
        action       = $Action
        ruleset      = $Ruleset
        rule_index   = $RuleIndex
        protocol     = $Protocol
        enabled      = $true
        src_address  = $SrcAddress ?? ''
        dst_address  = $DstAddress ?? ''
        src_mac_address = ''
    }
    $result = uCtrlPost "/api/v2/sites/$SiteId/firewallrules" $body
    Write-Host "[svh] Firewall rule '$Name' created on site $SiteId" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function New-SVHUniFiFirewallRule

function Remove-SVHUniFiFirewallRule {
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RuleId
    )
    uCtrlDelete "/api/v2/sites/$SiteId/firewallrules/$RuleId"
    Write-Host "[svh] Firewall rule $RuleId removed from site $SiteId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Remove-SVHUniFiFirewallRule
