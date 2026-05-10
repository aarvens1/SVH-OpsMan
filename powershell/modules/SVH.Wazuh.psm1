# SVH.Wazuh.psm1 — Wazuh SIEM REST API
# Requires: SVH.Core
# Self-signed cert on the on-prem manager — SSL verification is skipped.
# JWT is obtained via HTTP Basic and cached for 14 min (server issues 15-min tokens).

Set-StrictMode -Version Latest

$script:WazuhJwt       = $null
$script:WazuhJwtExpiry = [DateTime]::MinValue

function script:Get-WazuhJwt {
    if ($script:WazuhJwt -and (Get-Date) -lt $script:WazuhJwtExpiry) {
        Write-Verbose "[Wazuh] Using cached JWT (expires $($script:WazuhJwtExpiry.ToString('HH:mm:ss')))"
        return $script:WazuhJwt
    }
    Write-Verbose '[Wazuh] Acquiring new JWT'
    $url  = Get-SVHCredential 'WAZUH_URL'
    $pair = [Convert]::ToBase64String(
        [Text.Encoding]::ASCII.GetBytes("$(Get-SVHCredential 'WAZUH_USERNAME'):$(Get-SVHCredential 'WAZUH_PASSWORD')")
    )
    $r = Invoke-SVHRest -Method POST `
        -Uri "$url/security/user/authenticate" `
        -Headers @{ Authorization = "Basic $pair" } `
        -SkipCertificateCheck
    $script:WazuhJwt       = $r.data.token
    $script:WazuhJwtExpiry = (Get-Date).AddMinutes(14)
    Write-Verbose '[Wazuh] JWT acquired'
    $r.data.token
}

function script:wHeaders { @{ Authorization = "Bearer $(Get-WazuhJwt)" } }
function script:wUrl     { Get-SVHCredential 'WAZUH_URL' }

function script:wGet($path, $query = @{}) {
    Invoke-SVHRest -Uri "$(wUrl)$path" -Headers (wHeaders) -Query $query -SkipCertificateCheck
}

function script:wPost($path, $body) {
    Invoke-SVHRest -Method POST -Uri "$(wUrl)$path" -Headers (wHeaders) -Body $body -SkipCertificateCheck
}

function script:wPut($path, $body) {
    Invoke-SVHRest -Method PUT -Uri "$(wUrl)$path" -Headers (wHeaders) -Body $body -SkipCertificateCheck
}

# ── VERIFY: Agents ────────────────────────────────────────────────────────────

function Get-SVHWazuhAgents {
    <#
    .SYNOPSIS  List Wazuh agents, optionally filtered by status or OS platform.
    .EXAMPLE   Get-SVHWazuhAgents -Status active
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('active','disconnected','never_connected','pending','')]
        [string]$Status     = '',
        [string]$OsPlatform,
        [string]$Search,
        [int]$Limit         = 100,
        [int]$Offset        = 0
    )
    $query = @{ limit = $Limit; offset = $Offset }
    if ($Status)     { $query['status']      = $Status }
    if ($OsPlatform) { $query['os.platform'] = $OsPlatform }
    if ($Search)     { $query['search']      = $Search }
    (wGet '/agents' $query).data
}
Export-ModuleMember -Function Get-SVHWazuhAgents

function Get-SVHWazuhDisconnectedAgents {
    <#
    .SYNOPSIS  List agents that are currently disconnected — quick health check.
    .EXAMPLE   Get-SVHWazuhDisconnectedAgents | Select-Object name, ip, lastKeepAlive
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Limit = 100)
    Write-Verbose '[Wazuh] Querying disconnected agents'
    $data = (wGet '/agents' @{ status = 'disconnected'; limit = $Limit }).data
    $data.affected_items
}
Export-ModuleMember -Function Get-SVHWazuhDisconnectedAgents

# ── VERIFY: Alerts ────────────────────────────────────────────────────────────

function Get-SVHWazuhAlerts {
    <#
    .SYNOPSIS  Query Wazuh alerts with optional agent, level, time, and rule-group filters.
    .EXAMPLE   Get-SVHWazuhAlerts -MinLevel 10 -TimeFrom '2026-05-10T00:00:00'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$AgentId,
        [int]$MinLevel     = 6,
        [string]$TimeFrom,
        [string]$TimeTo,
        [string]$RuleGroup,
        [string]$Query,
        [int]$Limit        = 100
    )
    $query = @{ limit = $Limit; 'rule.level' = $MinLevel }
    if ($AgentId)   { $query['agents_list']    = $AgentId }
    if ($TimeFrom)  { $query['timestamp_from'] = $TimeFrom }
    if ($TimeTo)    { $query['timestamp_to']   = $TimeTo }
    if ($RuleGroup) { $query['rule.groups']    = $RuleGroup }
    if ($Query)     { $query['q']              = $Query }
    (wGet '/alerts' $query).data
}
Export-ModuleMember -Function Get-SVHWazuhAlerts

function Get-SVHWazuhHighAlerts {
    <#
    .SYNOPSIS  Return level-12+ alerts from the past N hours — focused triage view.
    .EXAMPLE   Get-SVHWazuhHighAlerts -Hours 4 | Format-Table agent.name, rule.description, timestamp
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$MinLevel = 12,
        [int]$Hours    = 24,
        [int]$Limit    = 200
    )
    Write-Verbose "[Wazuh] Fetching level $MinLevel+ alerts from the last $Hours hours"
    $from  = (Get-Date).ToUniversalTime().AddHours(-$Hours).ToString('yyyy-MM-ddTHH:mm:ss')
    $data  = (wGet '/alerts' @{ limit = $Limit; 'rule.level' = $MinLevel; timestamp_from = $from }).data
    $data.affected_items
}
Export-ModuleMember -Function Get-SVHWazuhHighAlerts

function Get-SVHWazuhAuthFailures {
    <#
    .SYNOPSIS  Return authentication failure alerts — key sign of brute force or misconfigured accounts.
    .EXAMPLE   Get-SVHWazuhAuthFailures -Hours 1 | Group-Object { $_.agent.name } | Sort-Object Count -Descending
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$Hours = 24,
        [int]$Limit = 500
    )
    Write-Verbose "[Wazuh] Fetching authentication failure alerts from the last $Hours hours"
    $from = (Get-Date).ToUniversalTime().AddHours(-$Hours).ToString('yyyy-MM-ddTHH:mm:ss')
    $data = (wGet '/alerts' @{
        limit           = $Limit
        'rule.groups'   = 'authentication_failed,authentication_failures'
        timestamp_from  = $from
    }).data
    $data.affected_items
}
Export-ModuleMember -Function Get-SVHWazuhAuthFailures

# ── VERIFY: Vulnerabilities ───────────────────────────────────────────────────

function Get-SVHWazuhVulns {
    <#
    .SYNOPSIS  List vulnerabilities detected on a Wazuh agent.
    .EXAMPLE   Get-SVHWazuhVulns -AgentId '001' -Severity critical
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$AgentId,
        [ValidateSet('critical','high','medium','low','')]
        [string]$Severity = '',
        [int]$Limit       = 100
    )
    process {
        $query = @{ limit = $Limit }
        if ($Severity) { $query['severity'] = $Severity }
        (wGet "/vulnerability/$AgentId" $query).data
    }
}
Export-ModuleMember -Function Get-SVHWazuhVulns

# ── VERIFY: FIM ───────────────────────────────────────────────────────────────

function Get-SVHWazuhFIM {
    <#
    .SYNOPSIS  Query File Integrity Monitoring events for an agent.
    .EXAMPLE   Get-SVHWazuhFIM -AgentId '001' -EventType modified -TimeFrom '2026-05-10T00:00:00'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$AgentId,
        [string]$TimeFrom,
        [string]$TimeTo,
        [string]$Path,
        [ValidateSet('added','modified','deleted','')]
        [string]$EventType = '',
        [int]$Limit        = 100
    )
    process {
        $query = @{ limit = $Limit }
        if ($TimeFrom)  { $query['date_add_from'] = $TimeFrom }
        if ($TimeTo)    { $query['date_add_to']   = $TimeTo }
        if ($Path)      { $query['path']          = $Path }
        if ($EventType) { $query['type']          = $EventType }
        (wGet "/syscheck/$AgentId" $query).data
    }
}
Export-ModuleMember -Function Get-SVHWazuhFIM

# ── VERIFY: Rootcheck ─────────────────────────────────────────────────────────

function Get-SVHWazuhRootcheck {
    <#
    .SYNOPSIS  List outstanding rootcheck findings for an agent.
    .EXAMPLE   Get-SVHWazuhRootcheck -AgentId '001'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$AgentId,
        [ValidateSet('all','outstanding','solved')]
        [string]$Status = 'outstanding',
        [int]$Limit     = 100
    )
    process {
        $query = @{ limit = $Limit }
        if ($Status -ne 'all') { $query['status'] = $Status }
        (wGet "/rootcheck/$AgentId" $query).data
    }
}
Export-ModuleMember -Function Get-SVHWazuhRootcheck

# ── VERIFY: Rules & Decoders ──────────────────────────────────────────────────

function Get-SVHWazuhRules {
    <#
    .SYNOPSIS  Search or browse the Wazuh rule set.
    .EXAMPLE   Get-SVHWazuhRules -Group 'sshd' -MinLevel 10
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$Search,
        [string]$Group,
        [int]$MinLevel,
        [string]$RuleId,
        [int]$Limit = 50
    )
    $query = @{ limit = $Limit }
    if ($Search)   { $query['search']     = $Search }
    if ($Group)    { $query['groups']     = $Group }
    if ($MinLevel) { $query['level.from'] = $MinLevel }
    if ($RuleId)   { $query['rule_ids']   = $RuleId }
    (wGet '/rules' $query).data
}
Export-ModuleMember -Function Get-SVHWazuhRules

function Get-SVHWazuhDecoders {
    <#
    .SYNOPSIS  List Wazuh decoders.
    .EXAMPLE   Get-SVHWazuhDecoders -Search 'nginx'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$Search,
        [int]$Limit = 50
    )
    $query = @{ limit = $Limit }
    if ($Search) { $query['search'] = $Search }
    (wGet '/decoders' $query).data
}
Export-ModuleMember -Function Get-SVHWazuhDecoders

# ── ACT: Agent Management ─────────────────────────────────────────────────────

function Restart-SVHWazuhAgent {
    <#
    .SYNOPSIS  Restart a single Wazuh agent.
    .EXAMPLE   Restart-SVHWazuhAgent -AgentId '001' -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$AgentId
    )
    process {
        if ($PSCmdlet.ShouldProcess("agent $AgentId", 'Restart')) {
            wPost "/agents/$AgentId/restart" @{}
            Write-Verbose "[Wazuh] Restart requested for agent $AgentId"
        }
    }
}
Export-ModuleMember -Function Restart-SVHWazuhAgent

function Restart-SVHWazuhAgents {
    <#
    .SYNOPSIS  Restart multiple Wazuh agents in a single call.
    .EXAMPLE   Restart-SVHWazuhAgents -AgentIds '001','002','003'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]
        [string[]]$AgentIds
    )
    if ($PSCmdlet.ShouldProcess("$($AgentIds.Count) agent(s)", 'Restart')) {
        wPost '/agents/restart' @{ agents_list = $AgentIds }
        Write-Verbose "[Wazuh] Restart requested for $($AgentIds.Count) agent(s)"
    }
}
Export-ModuleMember -Function Restart-SVHWazuhAgents
