# SVH.Network.psm1 — AD DNS, Windows DHCP, and cross-platform network validation
# Requires: SVH.Core
#
# PSRemoting functions (DNS/DHCP) use da_stevens@andersen-cost.com.
# Validation functions (Resolve-SVHDns, Test-SVHPort, Test-SVHNetworkPath) are
# pure .NET — no PSRemoting, runs from WSL without any credential.
#
# PSRemoting prerequisite from WSL: see references/setup-winrm.md

Set-StrictMode -Version Latest

function script:RemoteParams([string]$ComputerName, [System.Management.Automation.PSCredential]$Credential) {
    $p = @{ ComputerName = $ComputerName; ErrorAction = 'Stop' }
    if ($Credential) { $p['Credential'] = $Credential }
    $p
}

# ── AD DNS — Read ─────────────────────────────────────────────────────────────

function Get-SVHDnsZones {
    <#
    .SYNOPSIS  List all DNS zones hosted on a Windows DNS server.
    .EXAMPLE   Get-SVHDnsZones -ComputerName ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        Get-DnsServerZone | Select-Object ZoneName, ZoneType, IsAutoCreated, IsDsIntegrated, IsReverseLookupZone, ZoneFile
    }
}
Export-ModuleMember -Function Get-SVHDnsZones

function Get-SVHDnsRecords {
    <#
    .SYNOPSIS  List all DNS records in a zone.
    .EXAMPLE   Get-SVHDnsRecords -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ZoneName,
        [ValidateSet('A','AAAA','CNAME','MX','NS','PTR','SOA','SRV','TXT','All')]
        [string]$Type = 'All',
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        param($zone, $type)
        $params = @{ ZoneName = $zone; ErrorAction = 'Stop' }
        if ($type -ne 'All') { $params['RRType'] = $type }
        Get-DnsServerResourceRecord @params |
            Select-Object HostName, RecordType, TimeToLive,
                @{ n='RecordData'; e={ $_.RecordData.IPv4Address ?? $_.RecordData.HostNameAlias ?? $_.RecordData.NameServer ?? $_.RecordData.DomainName ?? ($_.RecordData | Out-String).Trim() } }
    } -ArgumentList $ZoneName, $Type
}
Export-ModuleMember -Function Get-SVHDnsRecords

function Get-SVHDnsRecord {
    <#
    .SYNOPSIS  Look up a specific hostname in a DNS zone.
    .EXAMPLE   Get-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com -Name server01
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ZoneName,
        [Parameter(Mandatory)][string]$Name,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        param($zone, $name)
        Get-DnsServerResourceRecord -ZoneName $zone -Name $name -ErrorAction Stop |
            Select-Object HostName, RecordType, TimeToLive,
                @{ n='RecordData'; e={ $_.RecordData.IPv4Address ?? $_.RecordData.HostNameAlias ?? $_.RecordData.NameServer ?? ($_.RecordData | Out-String).Trim() } }
    } -ArgumentList $ZoneName, $Name
}
Export-ModuleMember -Function Get-SVHDnsRecord

function Get-SVHDnsForwarders {
    <#
    .SYNOPSIS  Show configured DNS forwarders and root hints.
    .EXAMPLE   Get-SVHDnsForwarders -ComputerName ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        [PSCustomObject]@{
            Forwarders       = (Get-DnsServerForwarder).IPAddress.IPAddressToString
            UseRootHint      = (Get-DnsServerForwarder).UseRootHint
            ConditionalFwd   = Get-DnsServerZone | Where-Object ZoneType -eq Forwarder |
                                   Select-Object ZoneName, MasterServers
        }
    }
}
Export-ModuleMember -Function Get-SVHDnsForwarders

function Get-SVHDnsServerStats {
    <#
    .SYNOPSIS  DNS server statistics — query counts, failures, cache hits.
    .EXAMPLE   Get-SVHDnsServerStats -ComputerName ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        $s = Get-DnsServerStatistics
        [PSCustomObject]@{
            TotalQueries    = $s.Query2Statistics.Total
            RecursiveQ      = $s.Query2Statistics.Recurse
            Failures        = $s.Query2Statistics.Failure
            CacheHits       = $s.CacheStatistics.QuerySuccessful
            TcpQueries      = $s.Query2Statistics.Tcp
            UdpQueries      = $s.Query2Statistics.Udp
            Timeouts        = $s.RecursionStatistics.Failures
            SecureUpdates   = $s.UpdateStatistics.DynamicUpdateReceivedSecure
        }
    }
}
Export-ModuleMember -Function Get-SVHDnsServerStats

# ── AD DNS — Write ────────────────────────────────────────────────────────────

function Add-SVHDnsRecord {
    <#
    .SYNOPSIS  Add an A, CNAME, or PTR record to an AD-integrated DNS zone.
    .EXAMPLE   Add-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com -Name newserver -Type A -Value '10.1.2.50'
    .EXAMPLE   Add-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com -Name alias -Type CNAME -Value 'newserver.andersen-cost.com.'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ZoneName,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('A','AAAA','CNAME','PTR','TXT')][string]$Type,
        [Parameter(Mandatory)][string]$Value,
        [int]$Ttl = 3600,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess("$Name.$ZoneName", "Add $Type record → $Value")) {
        Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
            param($zone, $name, $type, $value, $ttl)
            $ts = [TimeSpan]::FromSeconds($ttl)
            switch ($type) {
                'A'     { Add-DnsServerResourceRecordA     -ZoneName $zone -Name $name -IPv4Address $value -TimeToLive $ts }
                'AAAA'  { Add-DnsServerResourceRecordAAAA  -ZoneName $zone -Name $name -IPv6Address $value -TimeToLive $ts }
                'CNAME' { Add-DnsServerResourceRecordCName -ZoneName $zone -Name $name -HostNameAlias $value -TimeToLive $ts }
                'PTR'   { Add-DnsServerResourceRecordPtr   -ZoneName $zone -Name $name -PtrDomainName $value -TimeToLive $ts }
                'TXT'   { Add-DnsServerResourceRecordTxt   -ZoneName $zone -Name $name -DescriptiveText $value -TimeToLive $ts }
            }
        } -ArgumentList $ZoneName, $Name, $Type, $Value, $Ttl
        Write-Verbose "Added $Type record: $Name.$ZoneName → $Value"
    }
}
Export-ModuleMember -Function Add-SVHDnsRecord

function Remove-SVHDnsRecord {
    <#
    .SYNOPSIS  Remove a DNS record from a zone.
    .EXAMPLE   Remove-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com -Name oldserver -Type A
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ZoneName,
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet('A','AAAA','CNAME','PTR','TXT','MX')][string]$Type,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess("$Name.$ZoneName", "Remove $Type record")) {
        Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
            param($zone, $name, $type)
            Remove-DnsServerResourceRecord -ZoneName $zone -Name $name -RRType $type -Force -ErrorAction Stop
        } -ArgumentList $ZoneName, $Name, $Type
        Write-Verbose "Removed $Type record: $Name.$ZoneName"
    }
}
Export-ModuleMember -Function Remove-SVHDnsRecord

# ── Windows DHCP ──────────────────────────────────────────────────────────────

function Get-SVHDhcpScopes {
    <#
    .SYNOPSIS  List DHCP scopes and their utilization.
    .EXAMPLE   Get-SVHDhcpScopes -ComputerName ACCODHCP01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        Get-DhcpServerv4Scope | ForEach-Object {
            $stats = Get-DhcpServerv4ScopeStatistics -ScopeId $_.ScopeId -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                ScopeId      = $_.ScopeId
                Name         = $_.Name
                SubnetMask   = $_.SubnetMask
                StartRange   = $_.StartRange
                EndRange     = $_.EndRange
                State        = $_.State
                AddressesInUse  = $stats?.AddressesInUse
                AddressesFree   = $stats?.AddressesFree
                PercentUsed     = if ($stats) { [math]::Round($stats.PercentageInUse, 1) } else { $null }
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHDhcpScopes

function Get-SVHDhcpLeases {
    <#
    .SYNOPSIS  List active DHCP leases for a scope (or all scopes).
    .EXAMPLE   Get-SVHDhcpLeases -ComputerName ACCODHCP01 -Credential $c -ScopeId '10.1.1.0'
    .EXAMPLE   Get-SVHDhcpLeases -ComputerName ACCODHCP01 -Credential $c   # all scopes
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [string]$ScopeId,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        param($scopeId)
        $params = @{}
        if ($scopeId) { $params['ScopeId'] = $scopeId }
        Get-DhcpServerv4Lease @params |
            Select-Object IPAddress, ClientId, HostName, AddressState, LeaseExpiryTime, ScopeId
    } -ArgumentList $ScopeId
}
Export-ModuleMember -Function Get-SVHDhcpLeases

function Get-SVHDhcpReservations {
    <#
    .SYNOPSIS  List DHCP reservations in a scope.
    .EXAMPLE   Get-SVHDhcpReservations -ComputerName ACCODHCP01 -Credential $c -ScopeId '10.1.1.0'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ScopeId,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        param($scopeId)
        Get-DhcpServerv4Reservation -ScopeId $scopeId |
            Select-Object IPAddress, ClientId, Name, Description, Type
    } -ArgumentList $ScopeId
}
Export-ModuleMember -Function Get-SVHDhcpReservations

function Get-SVHDhcpScopeOptions {
    <#
    .SYNOPSIS  Show DHCP options configured on a scope (router, DNS servers, etc.).
    .EXAMPLE   Get-SVHDhcpScopeOptions -ComputerName ACCODHCP01 -Credential $c -ScopeId '10.1.1.0'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [Parameter(Mandatory)][string]$ScopeId,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        param($scopeId)
        Get-DhcpServerv4OptionValue -ScopeId $scopeId |
            Select-Object OptionId, Name, Value
    } -ArgumentList $ScopeId
}
Export-ModuleMember -Function Get-SVHDhcpScopeOptions

# ── Network Validation (cross-platform .NET) ──────────────────────────────────

function Resolve-SVHDns {
    <#
    .SYNOPSIS  Resolve a hostname or IP using .NET (works from WSL — Resolve-DnsName is Windows-only).
    .DESCRIPTION
        Returns all addresses for a name, or the PTR record for an IP.
        Optionally queries a specific DNS server by setting the system resolver temporarily via
        a direct UDP DNS query (port 53) if -Server is provided.
    .EXAMPLE   Resolve-SVHDns -Name server01.andersen-cost.com
    .EXAMPLE   Resolve-SVHDns -Name 10.1.2.50                    # reverse lookup
    .EXAMPLE   Resolve-SVHDns -Name server01 -Server 10.1.1.1    # query specific server
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Name,
        [string]$Server
    )
    process {
        if ($Server) {
            # Send a raw DNS UDP query to the specified server
            try {
                $result = Resolve-SVHDnsViaServer -Name $Name -Server $Server
                return $result
            } catch {
                Write-Warning "Direct DNS query to $Server failed: $_. Falling back to system resolver."
            }
        }

        try {
            $addrs = [System.Net.Dns]::GetHostAddresses($Name)
            [PSCustomObject]@{
                Name      = $Name
                Addresses = ($addrs | ForEach-Object { $_.IPAddressToString })
                QueryType = if ($Name -match '^\d+\.\d+\.\d+\.\d+$') { 'PTR' } else { 'A/AAAA' }
                Resolver  = 'System'
            }
        } catch {
            [PSCustomObject]@{
                Name      = $Name
                Addresses = @()
                Error     = $_.Exception.Message
                Resolver  = 'System'
            }
        }
    }
}
Export-ModuleMember -Function Resolve-SVHDns

function script:Resolve-SVHDnsViaServer([string]$Name, [string]$Server, [int]$Port = 53) {
    # Minimal DNS query over UDP — resolves A records only
    # Builds a standard DNS query packet and parses the response
    $udp = [System.Net.Sockets.UdpClient]::new()
    try {
        $udp.Connect($Server, $Port)
        $udp.Client.ReceiveTimeout = 3000

        # Build query: header + question for A record
        $id     = [byte[]](Get-Random -Minimum 0 -Maximum 255), (Get-Random -Minimum 0 -Maximum 255)
        $header = $id + [byte[]](1,0,0,1,0,0,0,0,0,0)   # flags=standard query, qdcount=1
        $labels = foreach ($part in $Name.Split('.')) {
            [byte]$part.Length
            [System.Text.Encoding]::ASCII.GetBytes($part)
        }
        $question = $labels + [byte[]](0, 0,1, 0,1)     # null terminator, type A, class IN

        $packet = $header + $question
        $udp.Send($packet, $packet.Length) | Out-Null

        $ep  = [System.Net.IPEndPoint]::new([System.Net.IPAddress]::Any, 0)
        $buf = $udp.Receive([ref]$ep)

        # Parse answer count from response header (offset 6-7) and extract IPs
        $anCount = ($buf[6] -shl 8) -bor $buf[7]
        $addresses = @()
        if ($anCount -gt 0) {
            # Skip past the question section — find first 0x00 (end of name) after header
            $offset = 12
            while ($offset -lt $buf.Length -and $buf[$offset] -ne 0) { $offset++ }
            $offset += 5   # skip null + type + class

            for ($i = 0; $i -lt $anCount -and $offset + 10 -lt $buf.Length; $i++) {
                $offset  += 2   # skip name (pointer or label)
                $rtype    = ($buf[$offset] -shl 8) -bor $buf[$offset + 1]; $offset += 2
                $offset  += 2   # class
                $offset  += 4   # TTL
                $rdLength = ($buf[$offset] -shl 8) -bor $buf[$offset + 1]; $offset += 2
                if ($rtype -eq 1 -and $rdLength -eq 4) {
                    $addresses += '{0}.{1}.{2}.{3}' -f $buf[$offset], $buf[$offset+1], $buf[$offset+2], $buf[$offset+3]
                }
                $offset += $rdLength
            }
        }

        [PSCustomObject]@{
            Name      = $Name
            Addresses = $addresses
            QueryType = 'A'
            Resolver  = $Server
        }
    } finally {
        $udp.Close()
    }
}

function Get-SVHDnsLookup {
    <#
    .SYNOPSIS  Query a specific DNS server for a name — useful for comparing internal vs external resolution.
    .EXAMPLE   Get-SVHDnsLookup -Name server01.andersen-cost.com -Server 10.1.1.1
    .EXAMPLE   Get-SVHDnsLookup -Name server01.andersen-cost.com -Server 8.8.8.8   # should fail for internal names
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Server,
        [int]$Port = 53
    )
    Resolve-SVHDns -Name $Name -Server $Server
}
Export-ModuleMember -Function Get-SVHDnsLookup

function Test-SVHPort {
    <#
    .SYNOPSIS  Test TCP reachability to one or more ports on a host (cross-platform, no Test-NetConnection).
    .EXAMPLE   Test-SVHPort -ComputerName ACCOSERVER01 -Port 443,80,3389
    .EXAMPLE   'ACCOSERVER01','ACCOSQL01' | Test-SVHPort -Port 1433
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [string]$ComputerName,
        [Parameter(Mandatory)]
        [int[]]$Port,
        [int]$TimeoutMs = 2000
    )
    process {
        foreach ($p in $Port) {
            $tcp = [System.Net.Sockets.TcpClient]::new()
            try {
                $connect = $tcp.BeginConnect($ComputerName, $p, $null, $null)
                $ok      = $connect.AsyncWaitHandle.WaitOne($TimeoutMs)
                [PSCustomObject]@{
                    ComputerName = $ComputerName
                    Port         = $p
                    Status       = if ($ok) { 'Open' } else { 'Timeout' }
                }
            } catch {
                [PSCustomObject]@{
                    ComputerName = $ComputerName
                    Port         = $p
                    Status       = 'Error'
                    Error        = $_.Exception.Message
                }
            } finally {
                $tcp.Close()
            }
        }
    }
}
Export-ModuleMember -Function Test-SVHPort

function Test-SVHNetworkPath {
    <#
    .SYNOPSIS  Trace the path to a destination via ICMP TTL sweep (cross-platform traceroute).
    .DESCRIPTION
        Sends ICMP echo requests with incrementing TTL values and collects time-exceeded
        responses to reconstruct the path. Uses .NET Ping — works on WSL/Linux.
    .EXAMPLE   Test-SVHNetworkPath -Destination 8.8.8.8
    .EXAMPLE   Test-SVHNetworkPath -Destination gateway.andersen-cost.com -MaxHops 20
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$Destination,
        [int]$MaxHops    = 30,
        [int]$TimeoutMs  = 2000
    )
    $ping    = [System.Net.NetworkInformation.Ping]::new()
    $options = [System.Net.NetworkInformation.PingOptions]::new(1, $true)

    for ($ttl = 1; $ttl -le $MaxHops; $ttl++) {
        $options.Ttl = $ttl
        try {
            $reply = $ping.Send($Destination, $TimeoutMs, [byte[]](65..72), $options)
            $hop   = [PSCustomObject]@{
                Hop           = $ttl
                Address       = if ($reply.Address) { $reply.Address.ToString() } else { '*' }
                RoundtripMs   = if ($reply.Status -in 'Success','TtlExpired') { $reply.RoundtripTime } else { $null }
                Status        = $reply.Status.ToString()
            }
            $hop
            if ($reply.Status -eq 'Success') { break }
        } catch {
            [PSCustomObject]@{ Hop = $ttl; Address = '*'; RoundtripMs = $null; Status = 'Error' }
        }
    }
    $ping.Dispose()
}
Export-ModuleMember -Function Test-SVHNetworkPath

function Get-SVHNetworkAdapters {
    <#
    .SYNOPSIS  Get network adapter configuration from a remote Windows server.
    .EXAMPLE   Get-SVHNetworkAdapters -ComputerName ACCOSERVER01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ComputerName,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $ComputerName $Credential) -ScriptBlock {
        Get-NetIPConfiguration | ForEach-Object {
            [PSCustomObject]@{
                Interface    = $_.InterfaceAlias
                Status       = $_.NetAdapter.Status
                LinkSpeed    = $_.NetAdapter.LinkSpeed
                IPAddresses  = $_.IPv4Address.IPAddress
                Gateway      = $_.IPv4DefaultGateway.NextHop
                DnsServers   = $_.DNSServer | Where-Object AddressFamily -eq 2 | Select-Object -ExpandProperty ServerAddresses
                MACAddress   = $_.NetAdapter.MacAddress
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHNetworkAdapters
