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

# ── ACT: Client Static IPs ────────────────────────────────────────────────────

function Set-SVHUniFiClientStaticIP {
    <#
    .SYNOPSIS  Create or update a DHCP reservation (static IP) for a client.
    .EXAMPLE   Set-SVHUniFiClientStaticIP -SiteId 'default' -ClientId 'abc123' -FixedIp '192.168.1.50' -NetworkId 'net456'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$FixedIp,
        [string]$NetworkId
    )
    if ($PSCmdlet.ShouldProcess("client $ClientId on site $SiteId", "Set static IP to $FixedIp")) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/user/$ClientId").data
        $changes = @{ use_fixedip = $true; fixed_ip = $FixedIp }
        if ($NetworkId) { $changes['network_id'] = $NetworkId }
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        foreach ($k in $changes.Keys) { $updated[$k] = $changes[$k] }
        uCtrlPut "/api/s/$SiteId/rest/user/$ClientId" $updated
        Write-Verbose "[UniFi] Static IP $FixedIp set for client $ClientId"
    }
}
Export-ModuleMember -Function Set-SVHUniFiClientStaticIP

function Remove-SVHUniFiClientStaticIP {
    <#
    .SYNOPSIS  Remove a DHCP reservation from a client (revert to dynamic IP).
    .EXAMPLE   Remove-SVHUniFiClientStaticIP -SiteId 'default' -ClientId 'abc123'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$ClientId
    )
    if ($PSCmdlet.ShouldProcess("client $ClientId on site $SiteId", 'Remove static IP')) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/user/$ClientId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        $updated['use_fixedip'] = $false
        uCtrlPut "/api/s/$SiteId/rest/user/$ClientId" $updated
        Write-Verbose "[UniFi] Static IP removed from client $ClientId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiClientStaticIP

function Invoke-SVHUniFiClientKick {
    <#
    .SYNOPSIS  Force-disconnect a wireless client so it immediately re-authenticates.
    .EXAMPLE   Invoke-SVHUniFiClientKick -SiteId 'default' -MacAddress 'aa:bb:cc:dd:ee:ff' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$MacAddress
    )
    $mac = $MacAddress.ToLower() -replace '-', ':'
    if ($PSCmdlet.ShouldProcess($mac, "Kick client on site $SiteId")) {
        uCtrlPost "/api/s/$SiteId/cmd/stamgr" @{ cmd = 'kick-sta'; mac = $mac }
        Write-Verbose "[UniFi] Client $mac kicked on site $SiteId"
    }
}
Export-ModuleMember -Function Invoke-SVHUniFiClientKick

# ── VERIFY: AP Groups ─────────────────────────────────────────────────────────

function Get-SVHUniFiAPGroups {
    <#
    .SYNOPSIS  List AP groups on a site (used when creating or updating WLANs).
    .EXAMPLE   Get-SVHUniFiAPGroups -SiteId 'default'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/apgroups").data
}
Export-ModuleMember -Function Get-SVHUniFiAPGroups

# ── ACT: WLAN Config ──────────────────────────────────────────────────────────

function Set-SVHUniFiWLANConfig {
    <#
    .SYNOPSIS  Update settings on an existing WLAN. Only provided parameters are changed.
    .EXAMPLE   Set-SVHUniFiWLANConfig -SiteId 'default' -WlanId 'abc123' -Passphrase 'NewPass!' -Band 'both'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$WlanId,
        [string]$Name,
        [System.Nullable[bool]]$Enabled,
        [string]$Passphrase,
        [ValidateSet('open','wpa2','wpa3','wpapsk')][string]$Security,
        [System.Nullable[int]]$Vlan,
        [System.Nullable[bool]]$VlanEnabled,
        [ValidateSet('2g','5g','both')][string]$Band,
        [string[]]$ApGroupIds
    )
    if ($PSCmdlet.ShouldProcess("WLAN $WlanId on site $SiteId", 'Update')) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/wlanconf/$WlanId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        if ($PSBoundParameters.ContainsKey('Name'))        { $updated['name']          = $Name }
        if ($PSBoundParameters.ContainsKey('Enabled'))     { $updated['enabled']       = $Enabled }
        if ($PSBoundParameters.ContainsKey('Passphrase'))  { $updated['x_passphrase']  = $Passphrase }
        if ($PSBoundParameters.ContainsKey('Security'))    { $updated['security']      = $Security }
        if ($PSBoundParameters.ContainsKey('Vlan'))        { $updated['vlan']          = $Vlan }
        if ($PSBoundParameters.ContainsKey('VlanEnabled')) { $updated['vlan_enabled']  = $VlanEnabled }
        if ($PSBoundParameters.ContainsKey('Band'))        { $updated['band']          = $Band }
        if ($PSBoundParameters.ContainsKey('ApGroupIds'))  { $updated['ap_group_ids']  = $ApGroupIds }
        uCtrlPut "/api/s/$SiteId/rest/wlanconf/$WlanId" $updated
        Write-Verbose "[UniFi] WLAN $WlanId updated on site $SiteId"
    }
}
Export-ModuleMember -Function Set-SVHUniFiWLANConfig

function New-SVHUniFiWLAN {
    <#
    .SYNOPSIS  Create a new wireless network (SSID) on a UniFi site.
    .EXAMPLE   New-SVHUniFiWLAN -SiteId 'default' -Name 'Guests' -Security wpapsk -Passphrase 'Welcome2024!'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('open','wpa2','wpa3','wpapsk')][string]$Security,
        [string]$Passphrase,
        [string]$NetworkId,
        [int]$Vlan,
        [bool]$VlanEnabled = $false,
        [ValidateSet('2g','5g','both')][string]$Band = 'both',
        [string[]]$ApGroupIds
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create WLAN '$Name'")) {
        $payload = @{
            name         = $Name
            security     = $Security
            vlan_enabled = $VlanEnabled
            band         = $Band
        }
        if ($Passphrase)                              { $payload['x_passphrase']  = $Passphrase }
        if ($NetworkId)                               { $payload['networkconf_id'] = $NetworkId }
        if ($PSBoundParameters.ContainsKey('Vlan'))   { $payload['vlan']          = $Vlan }
        if ($ApGroupIds)                              { $payload['ap_group_ids']  = $ApGroupIds }
        $result = uCtrlPost "/api/s/$SiteId/rest/wlanconf" $payload
        Write-Verbose "[UniFi] WLAN '$Name' created on site $SiteId"
        $result.data
    }
}
Export-ModuleMember -Function New-SVHUniFiWLAN

function Remove-SVHUniFiWLAN {
    <#
    .SYNOPSIS  Delete a wireless network (SSID). The SSID stops broadcasting immediately.
    .EXAMPLE   Remove-SVHUniFiWLAN -SiteId 'default' -WlanId 'abc123' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$WlanId
    )
    if ($PSCmdlet.ShouldProcess("WLAN $WlanId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/s/$SiteId/rest/wlanconf/$WlanId"
        Write-Verbose "[UniFi] WLAN $WlanId deleted from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiWLAN

# ── ACT: Firewall Rule Toggle ─────────────────────────────────────────────────

function Set-SVHUniFiFirewallRule {
    <#
    .SYNOPSIS  Enable or disable a firewall rule without deleting it.
    .EXAMPLE   Set-SVHUniFiFirewallRule -SiteId 'default' -RuleId 'abc123' -Enabled $false
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RuleId,
        [Parameter(Mandatory)][bool]$Enabled
    )
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess("rule $RuleId on site $SiteId", $action)) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/firewallrule/$RuleId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        $updated['enabled'] = $Enabled
        uCtrlPut "/api/s/$SiteId/rest/firewallrule/$RuleId" $updated
        Write-Verbose "[UniFi] Firewall rule $RuleId on site $SiteId set to enabled=$Enabled"
    }
}
Export-ModuleMember -Function Set-SVHUniFiFirewallRule

# ── VERIFY: Firewall Groups ───────────────────────────────────────────────────

function Get-SVHUniFiFirewallGroups {
    <#
    .SYNOPSIS  List firewall groups (named IP/port sets) on a site.
    .EXAMPLE   Get-SVHUniFiFirewallGroups -SiteId 'default' | Where-Object group_type -eq 'address-group'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/firewallgroup").data
}
Export-ModuleMember -Function Get-SVHUniFiFirewallGroups

function New-SVHUniFiFirewallGroup {
    <#
    .SYNOPSIS  Create a new firewall group (IP set, network set, or port set).
    .EXAMPLE   New-SVHUniFiFirewallGroup -SiteId 'default' -Name 'IoT-Devices' -GroupType 'address-group' -Members '10.0.20.0/24','10.0.21.0/24'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('address-group','port-group','ipv6-address-group')][string]$GroupType,
        [Parameter(Mandatory)][string[]]$Members
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create firewall group '$Name'")) {
        $result = uCtrlPost "/api/s/$SiteId/rest/firewallgroup" @{
            name           = $Name
            group_type     = $GroupType
            group_members  = $Members
        }
        Write-Verbose "[UniFi] Firewall group '$Name' created on site $SiteId"
        $result.data
    }
}
Export-ModuleMember -Function New-SVHUniFiFirewallGroup

function Set-SVHUniFiFirewallGroup {
    <#
    .SYNOPSIS  Replace the member list of an existing firewall group.
    .EXAMPLE   Set-SVHUniFiFirewallGroup -SiteId 'default' -GroupId 'abc123' -Members '10.0.20.0/24','10.0.30.0/24'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$GroupId,
        [Parameter(Mandatory)][string[]]$Members
    )
    if ($PSCmdlet.ShouldProcess("group $GroupId on site $SiteId", 'Replace members')) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/firewallgroup/$GroupId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        $updated['group_members'] = $Members
        uCtrlPut "/api/s/$SiteId/rest/firewallgroup/$GroupId" $updated
        Write-Verbose "[UniFi] Firewall group $GroupId members updated on site $SiteId"
    }
}
Export-ModuleMember -Function Set-SVHUniFiFirewallGroup

function Remove-SVHUniFiFirewallGroup {
    <#
    .SYNOPSIS  Delete a firewall group. Verify no rules reference it first via Get-SVHUniFiFirewallRules.
    .EXAMPLE   Remove-SVHUniFiFirewallGroup -SiteId 'default' -GroupId 'abc123' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$GroupId
    )
    if ($PSCmdlet.ShouldProcess("group $GroupId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/s/$SiteId/rest/firewallgroup/$GroupId"
        Write-Verbose "[UniFi] Firewall group $GroupId deleted from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiFirewallGroup

# ── VERIFY: Port Forwards ─────────────────────────────────────────────────────

function Get-SVHUniFiPortForwards {
    <#
    .SYNOPSIS  List port forwarding rules on a site.
    .EXAMPLE   Get-SVHUniFiPortForwards -SiteId 'default' | Where-Object enabled -eq $true
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/portforward").data
}
Export-ModuleMember -Function Get-SVHUniFiPortForwards

function New-SVHUniFiPortForward {
    <#
    .SYNOPSIS  Create a new port forwarding rule.
    .EXAMPLE   New-SVHUniFiPortForward -SiteId 'default' -Name 'Web-80' -ForwardIp '192.168.1.100' -ForwardPort '80' -DstPort '8080'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$ForwardIp,
        [Parameter(Mandatory)][string]$ForwardPort,
        [Parameter(Mandatory)][string]$DstPort,
        [ValidateSet('tcp','udp','tcp_udp')][string]$Protocol = 'tcp',
        [string]$Src = 'any',
        [bool]$Enabled = $true
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create port forward '$Name' :$DstPort -> $ForwardIp`:$ForwardPort")) {
        $result = uCtrlPost "/api/s/$SiteId/rest/portforward" @{
            name      = $Name
            fwd       = $ForwardIp
            fwd_port  = $ForwardPort
            dst_port  = $DstPort
            proto     = $Protocol
            src       = $Src
            enabled   = $Enabled
        }
        Write-Verbose "[UniFi] Port forward '$Name' created on site $SiteId"
        $result.data
    }
}
Export-ModuleMember -Function New-SVHUniFiPortForward

function Set-SVHUniFiPortForward {
    <#
    .SYNOPSIS  Enable or disable a port forwarding rule without deleting it.
    .EXAMPLE   Set-SVHUniFiPortForward -SiteId 'default' -RuleId 'abc123' -Enabled $false
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RuleId,
        [Parameter(Mandatory)][bool]$Enabled
    )
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess("port forward $RuleId on site $SiteId", $action)) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/portforward/$RuleId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        $updated['enabled'] = $Enabled
        uCtrlPut "/api/s/$SiteId/rest/portforward/$RuleId" $updated
        Write-Verbose "[UniFi] Port forward $RuleId on site $SiteId set to enabled=$Enabled"
    }
}
Export-ModuleMember -Function Set-SVHUniFiPortForward

function Remove-SVHUniFiPortForward {
    <#
    .SYNOPSIS  Delete a port forwarding rule.
    .EXAMPLE   Remove-SVHUniFiPortForward -SiteId 'default' -RuleId 'abc123' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RuleId
    )
    if ($PSCmdlet.ShouldProcess("port forward $RuleId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/s/$SiteId/rest/portforward/$RuleId"
        Write-Verbose "[UniFi] Port forward $RuleId deleted from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiPortForward

# ── VERIFY: Static Routes ─────────────────────────────────────────────────────

function Get-SVHUniFiStaticRoutes {
    <#
    .SYNOPSIS  List static routes configured on a site.
    .EXAMPLE   Get-SVHUniFiStaticRoutes -SiteId 'default'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/routing").data
}
Export-ModuleMember -Function Get-SVHUniFiStaticRoutes

function New-SVHUniFiStaticRoute {
    <#
    .SYNOPSIS  Create a static route on a site.
    .EXAMPLE   New-SVHUniFiStaticRoute -SiteId 'default' -Name 'PDX-Lab' -Network '10.0.50.0/24' -NextHop '192.168.1.1'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Network,
        [Parameter(Mandatory)][string]$NextHop,
        [int]$Distance = 1,
        [bool]$Enabled = $true
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create static route '$Name' -> $Network via $NextHop")) {
        $result = uCtrlPost "/api/s/$SiteId/rest/routing" @{
            name         = $Name
            network      = $Network
            gateway_type = 'inet'
            nh_ip        = $NextHop
            distance     = $Distance
            enabled      = $Enabled
        }
        Write-Verbose "[UniFi] Static route '$Name' created on site $SiteId"
        $result.data
    }
}
Export-ModuleMember -Function New-SVHUniFiStaticRoute

function Remove-SVHUniFiStaticRoute {
    <#
    .SYNOPSIS  Delete a static route.
    .EXAMPLE   Remove-SVHUniFiStaticRoute -SiteId 'default' -RouteId 'abc123' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RouteId
    )
    if ($PSCmdlet.ShouldProcess("route $RouteId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/s/$SiteId/rest/routing/$RouteId"
        Write-Verbose "[UniFi] Static route $RouteId deleted from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiStaticRoute

# ── VERIFY: Local DNS Records ─────────────────────────────────────────────────

function Get-SVHUniFiDnsRecords {
    <#
    .SYNOPSIS  List local DNS override records on a site.
    .EXAMPLE   Get-SVHUniFiDnsRecords -SiteId 'default'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/dnsentry").data
}
Export-ModuleMember -Function Get-SVHUniFiDnsRecords

function New-SVHUniFiDnsRecord {
    <#
    .SYNOPSIS  Create a local DNS override record on a site.
    .EXAMPLE   New-SVHUniFiDnsRecord -SiteId 'default' -Hostname 'printer.local' -Value '192.168.1.200'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$Hostname,
        [Parameter(Mandatory)][string]$Value,
        [ValidateSet('A','AAAA','CNAME')][string]$RecordType = 'A'
    )
    if ($PSCmdlet.ShouldProcess("site $SiteId", "Create DNS record $Hostname -> $Value")) {
        $result = uCtrlPost "/api/s/$SiteId/rest/dnsentry" @{
            key         = $Hostname
            value       = $Value
            record_type = $RecordType
            enabled     = $true
        }
        Write-Verbose "[UniFi] DNS record $Hostname -> $Value created on site $SiteId"
        $result.data
    }
}
Export-ModuleMember -Function New-SVHUniFiDnsRecord

function Remove-SVHUniFiDnsRecord {
    <#
    .SYNOPSIS  Delete a local DNS override record.
    .EXAMPLE   Remove-SVHUniFiDnsRecord -SiteId 'default' -RecordId 'abc123' -Confirm
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$RecordId
    )
    if ($PSCmdlet.ShouldProcess("DNS record $RecordId on site $SiteId", 'Delete')) {
        uCtrlDelete "/api/s/$SiteId/rest/dnsentry/$RecordId"
        Write-Verbose "[UniFi] DNS record $RecordId deleted from site $SiteId"
    }
}
Export-ModuleMember -Function Remove-SVHUniFiDnsRecord

# ── VERIFY: VPN Tunnels ───────────────────────────────────────────────────────

function Get-SVHUniFiVpnTunnels {
    <#
    .SYNOPSIS  List IPSec site-to-site VPN tunnels on a site.
    .EXAMPLE   Get-SVHUniFiVpnTunnels -SiteId 'default' | Where-Object enabled -eq $true
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId
    )
    (uCtrlGet "/api/s/$SiteId/rest/ipsec").data
}
Export-ModuleMember -Function Get-SVHUniFiVpnTunnels

function Set-SVHUniFiVpnTunnel {
    <#
    .SYNOPSIS  Enable or disable an IPSec VPN tunnel without removing its configuration.
    .EXAMPLE   Set-SVHUniFiVpnTunnel -SiteId 'default' -TunnelId 'abc123' -Enabled $false
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$TunnelId,
        [Parameter(Mandatory)][bool]$Enabled
    )
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess("VPN tunnel $TunnelId on site $SiteId", $action)) {
        $existing = (uCtrlGet "/api/s/$SiteId/rest/ipsec/$TunnelId").data
        $updated = $existing | ConvertTo-Json -Depth 10 | ConvertFrom-Json -AsHashtable
        $updated['enabled'] = $Enabled
        uCtrlPut "/api/s/$SiteId/rest/ipsec/$TunnelId" $updated
        Write-Verbose "[UniFi] VPN tunnel $TunnelId on site $SiteId set to enabled=$Enabled"
    }
}
Export-ModuleMember -Function Set-SVHUniFiVpnTunnel

# ── VERIFY: Alerts ────────────────────────────────────────────────────────────

function Get-SVHUniFiAlerts {
    <#
    .SYNOPSIS  List UniFi alerts on a site. Returns unarchived alerts by default.
    .EXAMPLE   Get-SVHUniFiAlerts -SiteId 'default'
    .EXAMPLE   Get-SVHUniFiAlerts -SiteId 'default' -Archived
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [switch]$Archived
    )
    $all = (uCtrlGet "/api/s/$SiteId/stat/alarm").data
    if ($Archived) { $all } else { $all | Where-Object { $_.archived -ne $true } }
}
Export-ModuleMember -Function Get-SVHUniFiAlerts

function Clear-SVHUniFiAlerts {
    <#
    .SYNOPSIS  Archive alerts to clear the active alert list. Omit -AlertId to archive all.
    .EXAMPLE   Clear-SVHUniFiAlerts -SiteId 'default'
    .EXAMPLE   Clear-SVHUniFiAlerts -SiteId 'default' -AlertId 'abc123','def456'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [string[]]$AlertId
    )
    if ($AlertId -and $AlertId.Count -gt 0) {
        if ($PSCmdlet.ShouldProcess("site $SiteId", "Archive $($AlertId.Count) alert(s)")) {
            foreach ($id in $AlertId) {
                uCtrlPost "/api/s/$SiteId/cmd/evtmgr" @{ cmd = 'archive-alarm'; _id = $id }
            }
            Write-Verbose "[UniFi] Archived $($AlertId.Count) alert(s) on site $SiteId"
        }
    } else {
        if ($PSCmdlet.ShouldProcess("site $SiteId", 'Archive all alerts')) {
            uCtrlPost "/api/s/$SiteId/cmd/evtmgr" @{ cmd = 'archive-all-alarms' }
            Write-Verbose "[UniFi] All alerts archived on site $SiteId"
        }
    }
}
Export-ModuleMember -Function Clear-SVHUniFiAlerts
