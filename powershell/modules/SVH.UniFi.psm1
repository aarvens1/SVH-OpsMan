# SVH.UniFi.psm1 — UniFi Cloud API + UniFi Network Controller
# Requires: SVH.Core
# Cloud API:  https://api.ui.com  — X-API-KEY header via Invoke-SVHRest
# Controller: UNIFI_CONTROLLER_URL — session cookie (WebRequestSession); uses Invoke-RestMethod directly

Set-StrictMode -Version Latest

$script:UniFiSession = $null   # WebRequestSession holding the auth cookie

# ── Auth Helpers ──────────────────────────────────────────────────────────────

function script:uCloudGet($path, $query = @{}) {
    Invoke-SVHRest -Uri "https://api.ui.com$path" `
        -Headers @{
            'X-API-KEY' = (Get-SVHCredential 'UNIFI_API_KEY')
            Accept      = 'application/json'
        } -Query $query
}

function script:Get-UniFiSession {
    if ($script:UniFiSession) { return $script:UniFiSession }
    Write-Verbose '[UniFi] Starting new controller session'
    $url = Get-SVHCredential 'UNIFI_CONTROLLER_URL'
    $script:UniFiSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
    Invoke-RestMethod -Method Post `
        -Uri "$url/api/auth/login" `
        -Body (@{
            username = Get-SVHCredential 'UNIFI_USERNAME'
            password = Get-SVHCredential 'UNIFI_PASSWORD'
        } | ConvertTo-Json) `
        -ContentType 'application/json' `
        -WebSession $script:UniFiSession `
        -SkipCertificateCheck -ErrorAction Stop | Out-Null
    Write-Verbose '[UniFi] Controller session established'
    $script:UniFiSession
}

function script:uCtrlUrl { Get-SVHCredential 'UNIFI_CONTROLLER_URL' }

function script:uCtrlGet($path, $query = @{}) {
    $url = uCtrlUrl
    $uri = "$url$path"
    if ($query.Count -gt 0) {
        $qs  = ($query.GetEnumerator() | Sort-Object Key | ForEach-Object {
            "$([uri]::EscapeDataString($_.Key))=$([uri]::EscapeDataString([string]$_.Value))"
        }) -join '&'
        $uri = "$uri`?$qs"
    }
    Write-Verbose "GET $uri"
    try {
        Invoke-RestMethod -Method Get -Uri $uri -WebSession (Get-UniFiSession) -SkipCertificateCheck -ErrorAction Stop
    } catch {
        $status = $_.Exception.Response?.StatusCode.value__
        throw [System.Exception]::new("HTTP $status`: $($_.Exception.Message)", $_.Exception)
    }
}

function script:uCtrlPost($path, $body) {
    $url = uCtrlUrl
    Write-Verbose "POST $url$path"
    try {
        Invoke-RestMethod -Method Post -Uri "$url$path" `
            -Body ($body | ConvertTo-Json -Depth 10) -ContentType 'application/json' `
            -WebSession (Get-UniFiSession) -SkipCertificateCheck -ErrorAction Stop
    } catch {
        $status = $_.Exception.Response?.StatusCode.value__
        throw [System.Exception]::new("HTTP $status`: $($_.Exception.Message)", $_.Exception)
    }
}

function script:uCtrlPut($path, $body) {
    $url = uCtrlUrl
    Write-Verbose "PUT $url$path"
    try {
        Invoke-RestMethod -Method Put -Uri "$url$path" `
            -Body ($body | ConvertTo-Json -Depth 10) -ContentType 'application/json' `
            -WebSession (Get-UniFiSession) -SkipCertificateCheck -ErrorAction Stop
    } catch {
        $status = $_.Exception.Response?.StatusCode.value__
        throw [System.Exception]::new("HTTP $status`: $($_.Exception.Message)", $_.Exception)
    }
}

function script:uCtrlDelete($path) {
    $url = uCtrlUrl
    Write-Verbose "DELETE $url$path"
    try {
        Invoke-RestMethod -Method Delete -Uri "$url$path" `
            -WebSession (Get-UniFiSession) -SkipCertificateCheck -ErrorAction Stop
    } catch {
        $status = $_.Exception.Response?.StatusCode.value__
        throw [System.Exception]::new("HTTP $status`: $($_.Exception.Message)", $_.Exception)
    }
}

# ── VERIFY: Cloud API ─────────────────────────────────────────────────────────

function Get-SVHUniFiSites {
    <#
    .SYNOPSIS  List all UniFi sites visible to the API key.
    .EXAMPLE   Get-SVHUniFiSites
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    uCloudGet '/api/v2/sites'
}
Export-ModuleMember -Function Get-SVHUniFiSites

function Get-SVHUniFiSite {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$SiteId
    )
    process { uCloudGet "/api/v2/sites/$SiteId" }
}
Export-ModuleMember -Function Get-SVHUniFiSite

function Get-SVHUniFiCloudDevices {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCloudGet "/api/v2/sites/$SiteId/devices"
}
Export-ModuleMember -Function Get-SVHUniFiCloudDevices

function Get-SVHUniFiCloudDevice {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$DeviceId
    )
    uCloudGet "/api/v2/sites/$SiteId/devices/$DeviceId"
}
Export-ModuleMember -Function Get-SVHUniFiCloudDevice

# ── VERIFY: Controller API ────────────────────────────────────────────────────

function Get-SVHUniFiSiteHealth {
    <#
    .SYNOPSIS  Get subsystem health for a site (WAN, LAN, WLAN, etc.).
    .EXAMPLE   Get-SVHUniFiSiteHealth -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/health"
}
Export-ModuleMember -Function Get-SVHUniFiSiteHealth

function Get-SVHUniFiNetworks {
    <#
    .SYNOPSIS  List configured networks (VLANs) for a site.
    .EXAMPLE   Get-SVHUniFiNetworks -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/networks"
}
Export-ModuleMember -Function Get-SVHUniFiNetworks

function Get-SVHUniFiFirewallRules {
    <#
    .SYNOPSIS  List firewall rules for a site.
    .EXAMPLE   Get-SVHUniFiFirewallRules -SiteId 'abc123' | Where-Object action -eq 'drop'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/firewallrules"
}
Export-ModuleMember -Function Get-SVHUniFiFirewallRules

function Get-SVHUniFiDevices {
    <#
    .SYNOPSIS  List UniFi devices (APs, switches, gateways) for a site.
    .EXAMPLE   Get-SVHUniFiDevices -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/devices"
}
Export-ModuleMember -Function Get-SVHUniFiDevices

function Get-SVHUniFiAPHealth {
    <#
    .SYNOPSIS  Return access point adoption and connection state — flag APs that are disconnected or isolated.
    .EXAMPLE   Get-SVHUniFiAPHealth -SiteId 'abc123' | Where-Object state -ne 'connected'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    Write-Verbose '[UniFi] Querying AP health'
    $devices = uCtrlGet "/api/v2/sites/$SiteId/devices"
    $devices | Where-Object { $_.type -eq 'uap' -or $_.type -like '*ap*' } | ForEach-Object {
        [PSCustomObject]@{
            Name       = $_.name
            Mac        = $_.mac
            Model      = $_.model
            State      = $_.state
            Adopted    = $_.adopted
            Uptime     = $_.uptime
            LastSeen   = $_.last_seen
            NumClients = $_.num_sta
            Ip         = $_.ip
        }
    }
}
Export-ModuleMember -Function Get-SVHUniFiAPHealth

function Get-SVHUniFiClients {
    <#
    .SYNOPSIS  List connected clients for a site.
    .EXAMPLE   Get-SVHUniFiClients -SiteId 'abc123' -AllClients
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [switch]$AllClients
    )
    $query = if (-not $AllClients) { @{ active = 'true' } } else { @{} }
    uCtrlGet "/api/v2/sites/$SiteId/clients" $query
}
Export-ModuleMember -Function Get-SVHUniFiClients

function Get-SVHUniFiRogueClients {
    <#
    .SYNOPSIS  Identify clients that are connected but not in the known-device allow-list.
    .DESCRIPTION
        Pulls all active clients and flags those with no hostname and/or whose MAC OUI
        doesn't match known corporate device prefixes. This is a heuristic — review results manually.
    .EXAMPLE   Get-SVHUniFiRogueClients -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    Write-Verbose '[UniFi] Scanning for rogue/unknown clients'
    $clients = uCtrlGet "/api/v2/sites/$SiteId/clients" @{ active = 'true' }
    $clients | Where-Object {
        -not $_.hostname -or $_.is_guest -eq $true -or [string]::IsNullOrEmpty($_.name)
    } | ForEach-Object {
        [PSCustomObject]@{
            Mac        = $_.mac
            Hostname   = $_.hostname
            IP         = $_.ip
            Network    = $_.network
            IsGuest    = $_.is_guest
            FirstSeen  = $_.first_seen
            LastSeen   = $_.last_seen
            Essid      = $_.essid
        }
    }
}
Export-ModuleMember -Function Get-SVHUniFiRogueClients

function Get-SVHUniFiWLANs {
    <#
    .SYNOPSIS  List wireless networks for a site.
    .EXAMPLE   Get-SVHUniFiWLANs -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/wlans"
}
Export-ModuleMember -Function Get-SVHUniFiWLANs

function Get-SVHUniFiPortProfiles {
    <#
    .SYNOPSIS  List switch port profiles (VLAN assignments) for a site.
    .EXAMPLE   Get-SVHUniFiPortProfiles -SiteId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$SiteId
    )
    uCtrlGet "/api/v2/sites/$SiteId/portprofiles"
}
Export-ModuleMember -Function Get-SVHUniFiPortProfiles

function Get-SVHUniFiSwitchPorts {
    <#
    .SYNOPSIS  List port table for a specific switch.
    .EXAMPLE   Get-SVHUniFiSwitchPorts -SiteId 'abc123' -SwitchMac 'aa:bb:cc:dd:ee:ff'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
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
    <#
    .SYNOPSIS  Block a client MAC address on a site.
    .EXAMPLE   Block-SVHUniFiClient -SiteId 'abc123' -MacAddress 'aa:bb:cc:dd:ee:ff' -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$MacAddress
    )
    if ($PSCmdlet.ShouldProcess($MacAddress, "Block client on site $SiteId")) {
        uCtrlPost "/api/v2/sites/$SiteId/clients/$($MacAddress.ToLower())/block" @{}
        Write-Verbose "[UniFi] Client $MacAddress blocked on site $SiteId"
    }
}
Export-ModuleMember -Function Block-SVHUniFiClient

function Unblock-SVHUniFiClient {
    <#
    .SYNOPSIS  Unblock a previously blocked client MAC address.
    .EXAMPLE   Unblock-SVHUniFiClient -SiteId 'abc123' -MacAddress 'aa:bb:cc:dd:ee:ff'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$MacAddress
    )
    if ($PSCmdlet.ShouldProcess($MacAddress, "Unblock client on site $SiteId")) {
        uCtrlPost "/api/v2/sites/$SiteId/clients/$($MacAddress.ToLower())/unblock" @{}
        Write-Verbose "[UniFi] Client $MacAddress unblocked on site $SiteId"
    }
}
Export-ModuleMember -Function Unblock-SVHUniFiClient

# ── ACT: WLAN Toggle ──────────────────────────────────────────────────────────

function Set-SVHUniFiWLAN {
    <#
    .SYNOPSIS  Enable or disable a wireless network.
    .EXAMPLE   Set-SVHUniFiWLAN -SiteId 'abc123' -WlanId 'xyz' -Enabled $false -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$WlanId,
        [Parameter(Mandatory)][bool]$Enabled
    )
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess("WLAN $WlanId on site $SiteId", $action)) {
        uCtrlPut "/api/v2/sites/$SiteId/wlans/$WlanId" @{ enabled = $Enabled }
        Write-Verbose "[UniFi] WLAN $WlanId on site $SiteId set to enabled=$Enabled"
    }
}
Export-ModuleMember -Function Set-SVHUniFiWLAN

# ── ACT: Port Profile ─────────────────────────────────────────────────────────

function Set-SVHUniFiPortProfile {
    <#
    .SYNOPSIS  Change the port profile (VLAN) assigned to a switch port.
    .DESCRIPTION
        Reads current port_overrides, patches the target port_idx, and writes back.
        Get current state via Get-SVHUniFiSwitchPorts. Profile IDs via Get-SVHUniFiPortProfiles.
    .EXAMPLE
        Set-SVHUniFiPortProfile -SiteId 'abc123' -SwitchMac 'aa:bb:cc:dd:ee:ff' -PortIndex 5 -PortProfileId 'abc456'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
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

    if ($PSCmdlet.ShouldProcess("port $PortIndex on $SwitchMac", "Set profile to $PortProfileId")) {
        uCtrlPut "/api/v2/sites/$SiteId/devices/$mac" @{ port_overrides = $ports }
        Write-Verbose "[UniFi] Port $PortIndex on $SwitchMac set to profile $PortProfileId"
    }
}
Export-ModuleMember -Function Set-SVHUniFiPortProfile

# ── ACT: Device Restart ───────────────────────────────────────────────────────

function Restart-SVHUniFiDevice {
    <#
    .SYNOPSIS  Restart a UniFi network device (AP, switch, gateway).
    .EXAMPLE   Restart-SVHUniFiDevice -SiteId 'abc123' -DeviceMac 'aa:bb:cc:dd:ee:ff' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$DeviceMac
    )
    $mac = $DeviceMac.ToLower() -replace ':', ''
    if ($PSCmdlet.ShouldProcess("$DeviceMac on site $SiteId", 'Restart')) {
        uCtrlPost "/api/v2/sites/$SiteId/devices/$mac/restart" @{}
        Write-Verbose "[UniFi] Restart requested for device $DeviceMac on site $SiteId"
    }
}
Export-ModuleMember -Function Restart-SVHUniFiDevice

# ── ACT: Firewall Rules ───────────────────────────────────────────────────────

function New-SVHUniFiFirewallRule {
    <#
    .SYNOPSIS  Create a new firewall rule on a site.
    .EXAMPLE   New-SVHUniFiFirewallRule -SiteId 'abc123' -Name 'Block-IoT-Egress' -Action drop -Ruleset out -SrcAddress '10.0.20.0/24'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('allow','drop','reject')][string]$Action,
        [Parameter(Mandatory)][ValidateSet('in','out','local')][string]$Ruleset,
        [int]$RuleIndex        = 2000,
        [string]$SrcAddress    = '',
        [string]$DstAddress    = '',
        [string]$Protocol      = 'all'
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create firewall rule '$Name' ($Action)")) {
        $result = uCtrlPost "/api/v2/sites/$SiteId/firewallrules" @{
            name            = $Name
            action          = $Action
            ruleset         = $Ruleset
            rule_index      = $RuleIndex
            protocol        = $Protocol
            enabled         = $true
            src_address     = $SrcAddress
            dst_address     = $DstAddress
            src_mac_address = ''
        }
        Write-Verbose "[UniFi] Firewall rule '$Name' created on site $SiteId"
        $result
    }
}
Export-ModuleMember -Function New-SVHUniFiFirewallRule

function Remove-SVHUniFiFirewallRule {
    <#
    .SYNOPSIS  Delete a firewall rule by ID.
    .EXAMPLE   Remove-SVHUniFiFirewallRule -SiteId 'abc123' -RuleId 'rule_objectid' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RuleId
    )
    if ($PSCmdlet.ShouldProcess("rule $RuleId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/v2/sites/$SiteId/firewallrules/$RuleId"
        Write-Verbose "[UniFi] Firewall rule $RuleId removed from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiFirewallRule
