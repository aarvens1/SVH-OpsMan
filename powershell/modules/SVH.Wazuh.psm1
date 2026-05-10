# SVH.Wazuh.psm1 — Wazuh SIEM REST API
# Self-signed cert on the on-prem manager — SSL verification is skipped.
# JWT is cached for 14 minutes (server issues 15-minute tokens).

$script:WazuhJwt        = $null
$script:WazuhJwtExpiry  = [DateTime]::MinValue

function script:Get-WazuhJwt {
    if ($script:WazuhJwt -and (Get-Date) -lt $script:WazuhJwtExpiry) {
        return $script:WazuhJwt
    }
    $c    = $Global:SVHCreds
    $url  = $c['WAZUH_URL'] ?? 'https://localhost:55000'
    $pair = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$($c['WAZUH_USERNAME']):$($c['WAZUH_PASSWORD'])"))
    $r    = Invoke-RestMethod -Method Post `
        -Uri "$url/security/user/authenticate" `
        -Headers @{ Authorization = "Basic $pair" } `
        -SkipCertificateCheck
    $script:WazuhJwt       = $r.data.token
    $script:WazuhJwtExpiry = (Get-Date).AddMinutes(14)
    return $script:WazuhJwt
}

function script:wGet($endpoint, $params = @{}) {
    $url  = $Global:SVHCreds['WAZUH_URL'] ?? 'https://localhost:55000'
    $uri  = "$url$endpoint"
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri `
        -Headers @{ Authorization = "Bearer $(Get-WazuhJwt)" } `
        -SkipCertificateCheck
}

function script:wPost($endpoint, $body) {
    $url = $Global:SVHCreds['WAZUH_URL'] ?? 'https://localhost:55000'
    Invoke-RestMethod -Method Post -Uri "$url$endpoint" `
        -Headers @{ Authorization = "Bearer $(Get-WazuhJwt)"; 'Content-Type' = 'application/json' } `
        -Body ($body | ConvertTo-Json -Depth 10) `
        -SkipCertificateCheck
}

# ── VERIFY: Agents ────────────────────────────────────────────────────────────

function Get-SVHWazuhAgents {
    param(
        [ValidateSet('active','disconnected','never_connected','pending','')][string]$Status = '',
        [string]$OsPlatform,
        [string]$Search,
        [int]$Limit  = 100,
        [int]$Offset = 0
    )
    $params = @{ limit = $Limit; offset = $Offset }
    if ($Status)     { $params['status']      = $Status }
    if ($OsPlatform) { $params['os.platform'] = $OsPlatform }
    if ($Search)     { $params['search']      = $Search }
    (wGet '/agents' $params).data
}
Export-ModuleMember -Function Get-SVHWazuhAgents

# ── VERIFY: Alerts ────────────────────────────────────────────────────────────

function Get-SVHWazuhAlerts {
    param(
        [string]$AgentId,
        [int]$MinLevel     = 6,
        [string]$TimeFrom,
        [string]$TimeTo,
        [string]$RuleGroup,
        [string]$Query,
        [int]$Limit        = 100
    )
    $params = @{ limit = $Limit; 'rule.level' = $MinLevel }
    if ($AgentId)   { $params['agents_list']  = $AgentId }
    if ($TimeFrom)  { $params['timestamp_from'] = $TimeFrom }
    if ($TimeTo)    { $params['timestamp_to']   = $TimeTo }
    if ($RuleGroup) { $params['rule.groups']    = $RuleGroup }
    if ($Query)     { $params['q']              = $Query }
    (wGet '/alerts' $params).data
}
Export-ModuleMember -Function Get-SVHWazuhAlerts

# ── VERIFY: Vulnerabilities ───────────────────────────────────────────────────

function Get-SVHWazuhVulns {
    param(
        [Parameter(Mandatory)][string]$AgentId,
        [ValidateSet('critical','high','medium','low','')][string]$Severity = '',
        [int]$Limit = 100
    )
    $params = @{ limit = $Limit }
    if ($Severity) { $params['severity'] = $Severity }
    (wGet "/vulnerability/$AgentId" $params).data
}
Export-ModuleMember -Function Get-SVHWazuhVulns

# ── VERIFY: FIM ───────────────────────────────────────────────────────────────

function Get-SVHWazuhFIM {
    param(
        [Parameter(Mandatory)][string]$AgentId,
        [string]$TimeFrom,
        [string]$TimeTo,
        [string]$Path,
        [ValidateSet('added','modified','deleted','')][string]$EventType = '',
        [int]$Limit = 100
    )
    $params = @{ limit = $Limit }
    if ($TimeFrom)  { $params['date_add_from'] = $TimeFrom }
    if ($TimeTo)    { $params['date_add_to']   = $TimeTo }
    if ($Path)      { $params['path']          = $Path }
    if ($EventType) { $params['type']          = $EventType }
    (wGet "/syscheck/$AgentId" $params).data
}
Export-ModuleMember -Function Get-SVHWazuhFIM

# ── VERIFY: Rootcheck ─────────────────────────────────────────────────────────

function Get-SVHWazuhRootcheck {
    param(
        [Parameter(Mandatory)][string]$AgentId,
        [ValidateSet('all','outstanding','solved')][string]$Status = 'outstanding',
        [int]$Limit = 100
    )
    $params = @{ limit = $Limit }
    if ($Status -ne 'all') { $params['status'] = $Status }
    (wGet "/rootcheck/$AgentId" $params).data
}
Export-ModuleMember -Function Get-SVHWazuhRootcheck

# ── VERIFY: Rules & Decoders ──────────────────────────────────────────────────

function Get-SVHWazuhRules {
    param(
        [string]$Search,
        [string]$Group,
        [int]$MinLevel,
        [string]$RuleId,
        [int]$Limit = 50
    )
    $params = @{ limit = $Limit }
    if ($Search)   { $params['search']      = $Search }
    if ($Group)    { $params['groups']      = $Group }
    if ($MinLevel) { $params['level.from']  = $MinLevel }
    if ($RuleId)   { $params['rule_ids']    = $RuleId }
    (wGet '/rules' $params).data
}
Export-ModuleMember -Function Get-SVHWazuhRules

function Get-SVHWazuhDecoders {
    param([string]$Search, [int]$Limit = 50)
    $params = @{ limit = $Limit }
    if ($Search) { $params['search'] = $Search }
    (wGet '/decoders' $params).data
}
Export-ModuleMember -Function Get-SVHWazuhDecoders

# ── ACT: Agent Management ─────────────────────────────────────────────────────

function Restart-SVHWazuhAgent {
    param([Parameter(Mandatory)][string]$AgentId)
    wPost "/agents/$AgentId/restart" @{}
    Write-Host "[svh] Restart requested for Wazuh agent $AgentId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Restart-SVHWazuhAgent

function Restart-SVHWazuhAgents {
    param([string[]]$AgentIds)
    wPost '/agents/restart' @{ agents_list = $AgentIds }
    Write-Host "[svh] Restart requested for $($AgentIds.Count) Wazuh agent(s)" -ForegroundColor Yellow
}
Export-ModuleMember -Function Restart-SVHWazuhAgents
