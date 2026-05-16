# SVH.Core.psm1 — Shared infrastructure for all SVH PowerShell modules
#
# Every other SVH module depends on this one. connect.ps1 imports it first.
# Provides: credential access, OAuth2 token caching, a single REST wrapper,
# domain constants, and credential-tier helpers.

Set-StrictMode -Version Latest

# ── Domain Constants ───────────────────────────────────────────────────────────
# Exported so any module or interactive session can reference them.

$SVHMailDomain    = 'shoestringvalley.com'   # UPNs, mail addresses
$SVHOnPremDomain  = 'andersen-cost.com'      # AD FQDN for PSRemoting targets
$SVHOnPremNetBIOS = 'ACCO'                   # NetBIOS domain name

Export-ModuleMember -Variable SVHMailDomain, SVHOnPremDomain, SVHOnPremNetBIOS

# ── Token Cache ────────────────────────────────────────────────────────────────
# Keyed by an arbitrary cache key (e.g. 'Graph', 'ARM', 'MDE', 'Ninja').
# Module-scoped — survives for the life of the PowerShell session.

$script:TokenCache = @{}

# ── Credential Access ──────────────────────────────────────────────────────────

function Get-SVHCredential {
    <#
    .SYNOPSIS
        Retrieve a credential value from the loaded SVH credential store.
    .DESCRIPTION
        Safe accessor for $Global:SVHCreds. Throws a descriptive error when a
        required key is missing rather than silently returning $null.
    .PARAMETER Key
        The credential key (matches the Bitwarden custom field name in the 'SVH OpsMan' vault item).
    .EXAMPLE
        $tenantId = Get-SVHCredential 'GRAPH_TENANT_ID'
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$Key
    )
    process {
        if (-not $Global:SVHCreds) {
            throw 'SVH credentials not loaded. Run: . ./connect.ps1'
        }
        $value = $Global:SVHCreds[$Key]
        if ([string]::IsNullOrEmpty($value)) {
            throw "Credential '$Key' is not set. Add it to Bitwarden 'SVH OpsMan' (custom fields)."
        }
        $value
    }
}
Export-ModuleMember -Function Get-SVHCredential

# ── OAuth2 Token Acquisition ───────────────────────────────────────────────────

function Get-SVHOAuth2Token {
    <#
    .SYNOPSIS
        Acquire and cache an OAuth2 client-credentials bearer token.
    .DESCRIPTION
        Supports Microsoft identity platform (supply TenantId) and any other
        OAuth2 client-credentials endpoint (supply TokenEndpoint directly).
        Caches the result until 60 seconds before expiry.
    .PARAMETER CacheKey
        Unique identifier for this token in the cache (e.g. 'Graph', 'NinjaOne').
    .PARAMETER TenantId
        Azure AD tenant ID. Required when TokenEndpoint is not specified.
    .PARAMETER ClientId
        App registration or API client ID.
    .PARAMETER ClientSecret
        Client secret.
    .PARAMETER Scope
        OAuth2 scope. For Microsoft APIs: '<resource>/.default'.
    .PARAMETER TokenEndpoint
        Full token URL. Overrides TenantId when specified — use for non-Microsoft OAuth2 services.
    .EXAMPLE
        Get-SVHOAuth2Token -CacheKey 'Graph' `
            -TenantId     (Get-SVHCredential 'GRAPH_TENANT_ID') `
            -ClientId     (Get-SVHCredential 'GRAPH_CLIENT_ID') `
            -ClientSecret (Get-SVHCredential 'GRAPH_CLIENT_SECRET') `
            -Scope        'https://graph.microsoft.com/.default'
    .EXAMPLE
        Get-SVHOAuth2Token -CacheKey 'NinjaOne' `
            -TokenEndpoint 'https://app.ninjarmm.com/ws/oauth/token' `
            -ClientId     (Get-SVHCredential 'NINJA_CLIENT_ID') `
            -ClientSecret (Get-SVHCredential 'NINJA_CLIENT_SECRET') `
            -Scope        'monitoring management control'
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$CacheKey,
        [string]$TenantId,
        [Parameter(Mandatory)][string]$ClientId,
        [Parameter(Mandatory)][string]$ClientSecret,
        [Parameter(Mandatory)][string]$Scope,
        [string]$TokenEndpoint
    )

    $cached = $script:TokenCache[$CacheKey]
    if ($cached -and (Get-Date) -lt $cached.Expiry) {
        Write-Verbose "[$CacheKey] Using cached token (expires $($cached.Expiry.ToString('HH:mm:ss')))"
        return $cached.Token
    }

    if (-not $TokenEndpoint) {
        if (-not $TenantId) { throw "[$CacheKey] TenantId is required when TokenEndpoint is not specified." }
        $TokenEndpoint = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    }

    Write-Verbose "[$CacheKey] Acquiring new token from $TokenEndpoint"
    $r = Invoke-RestMethod -Method Post `
        -Uri $TokenEndpoint `
        -Body @{
            grant_type    = 'client_credentials'
            client_id     = $ClientId
            client_secret = $ClientSecret
            scope         = $Scope
        } -ContentType 'application/x-www-form-urlencoded' -ErrorAction Stop

    $script:TokenCache[$CacheKey] = @{
        Token  = $r.access_token
        Expiry = (Get-Date).AddSeconds($r.expires_in - 60)
    }
    Write-Verbose "[$CacheKey] Token acquired, valid for ~$([math]::Round($r.expires_in/60)) minutes"
    $r.access_token
}
Export-ModuleMember -Function Get-SVHOAuth2Token

function Clear-SVHTokenCache {
    <#
    .SYNOPSIS
        Flush all cached OAuth2 tokens, forcing re-acquisition on next call.
    .EXAMPLE
        Clear-SVHTokenCache
    #>
    [CmdletBinding()]
    param()
    $count = $script:TokenCache.Count
    $script:TokenCache = @{}
    Write-Verbose "Token cache cleared ($count entries removed)"
}
Export-ModuleMember -Function Clear-SVHTokenCache

# ── REST Wrapper ───────────────────────────────────────────────────────────────

function Invoke-SVHRest {
    <#
    .SYNOPSIS
        Standardized REST call with consistent error formatting.
    .DESCRIPTION
        Thin wrapper around Invoke-RestMethod that:
          - Builds query strings from a hashtable (correct for GET requests)
          - JSON-serializes non-string bodies for POST/PATCH/PUT
          - Throws a clean "HTTP NNN: <message>" error on failure
          - Emits Write-Verbose for every call (visible with -Verbose)
    .PARAMETER Method
        HTTP method. Defaults to GET.
    .PARAMETER Uri
        Full URI without query string.
    .PARAMETER Headers
        Request headers hashtable. Include Authorization here.
    .PARAMETER Query
        Hashtable of query-string parameters. Always appended to URI.
    .PARAMETER Body
        Request body. Strings are sent as-is; objects are JSON-serialized.
    .PARAMETER SkipCertificateCheck
        Skip TLS validation (required for on-prem Wazuh and UniFi controller).
    .EXAMPLE
        Invoke-SVHRest -Uri 'https://graph.microsoft.com/v1.0/users' `
            -Headers @{ Authorization = "Bearer $token" } `
            -Query @{ '$top' = 10; '$select' = 'displayName,mail' }
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('GET','POST','PATCH','PUT','DELETE')]
        [string]$Method = 'GET',

        [Parameter(Mandatory)]
        [string]$Uri,

        [hashtable]$Headers = @{},
        [hashtable]$Query   = @{},
        [object]$Body,
        [string]$ContentType = 'application/json',
        [switch]$SkipCertificateCheck
    )

    if ($Query.Count -gt 0) {
        $qs  = ($Query.GetEnumerator() | Sort-Object Key | ForEach-Object {
            "$([uri]::EscapeDataString($_.Key))=$([uri]::EscapeDataString([string]$_.Value))"
        }) -join '&'
        $Uri = "$Uri`?$qs"
    }

    $params = @{
        Method      = $Method
        Uri         = $Uri
        Headers     = $Headers
        ErrorAction = 'Stop'
    }

    if ($null -ne $Body -and $Method -ne 'GET') {
        $params['Body']        = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 20 -Compress }
        $params['ContentType'] = $ContentType
    }

    if ($SkipCertificateCheck) { $params['SkipCertificateCheck'] = $true }

    Write-Verbose "$Method $Uri"

    try {
        Invoke-RestMethod @params
    } catch {
        $status = $_.Exception.Response?.StatusCode.value__
        $detail = try {
            $e = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
            $e?.error?.message ?? $e?.error ?? $e?.message ?? $_.ErrorDetails.Message
        } catch { $_.Exception.Message }
        $msg = if ($status) { "HTTP $status`: $detail" } else { $detail }
        throw [System.Exception]::new($msg, $_.Exception)
    }
}
Export-ModuleMember -Function Invoke-SVHRest

# ── Credential Tier Helper ─────────────────────────────────────────────────────

function Get-SVHTierUsername {
    <#
    .SYNOPSIS
        Return the expected username for a given SVH admin tier.
    .DESCRIPTION
        SVH uses five credential tiers. This function returns the conventional
        UPN or domain account for each tier so you know what to pass as
        -Credential to PSRemoting functions.

        Tiers:
          standard  astevens@shoestringvalley.com    — day-to-day; passkey (BW) — no PSCredential
          server    sa_stevens@andersen-cost.com      — server admin, PSRemoting; PASSWORD auth
          m365      ma_stevens@shoestringvalley.com   — Entra / M365 admin; passkey (BW) — interactive only
          app       aa_stevens@shoestringvalley.com   — SaaS platform admin; passkey (BW) — interactive only
          domain    ACCO\da_stevens                   — AD domain admin (rarely used); PASSWORD auth
          ra        ra_stevens@andersen-cost.com      — read-only PSRemoting for Desktop Commander; PASSWORD auth

        Passkey accounts (standard, m365, app) cannot be used as PSCredential objects.
        They authenticate via an interactive browser flow — e.g. Connect-ExchangeOnline
        opens a browser window. There is no unattended/scripted path for those tiers.

        Password accounts (server, domain, ra) can use Get-Credential or be supplied via
        $PSCmdlet -Credential for PSRemoting and domain operations. From a domain-joined
        Windows Terminal session already running as sa_stevens@, Kerberos handles
        PSRemoting to domain machines transparently — no explicit credential needed.

        The ra tier (ra_stevens) is a constrained service account — Remote Management Users
        and Event Log Readers only. Use it when Desktop Commander needs PSRemoting for
        diagnostic queries. Do not use it for write operations; it has no permission to do so.

        The app registrations loaded by connect.ps1 (Graph, MDE, ARM, NinjaOne, etc.)
        are service principals — they are not any of these human accounts.
    .PARAMETER Tier
        The credential tier name.
    .EXAMPLE
        $cred = Get-Credential (Get-SVHTierUsername -Tier server)
        Get-SVHEventLogSummary -ComputerName SVH-SQL01 -Credential $cred
    .EXAMPLE
        # Desktop Commander diagnostic PSRemoting — read-only account
        $cred = New-Object PSCredential(
            (Get-SVHTierUsername -Tier ra),
            (ConvertTo-SecureString $env:DC_REMOTE_PASSWORD -AsPlainText -Force)
        )
        Invoke-Command -ComputerName ACCOSERVER01 -Credential $cred -ScriptBlock {
            Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-4)}
        }
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)]
        [ValidateSet('standard','server','m365','app','domain','ra')]
        [string]$Tier
    )
    switch ($Tier) {
        'standard' { "astevens@$SVHMailDomain" }
        'server'   { "sa_stevens@$SVHOnPremDomain" }
        'm365'     { "ma_stevens@$SVHMailDomain" }
        'app'      { "aa_stevens@$SVHMailDomain" }
        'domain'   { "$SVHOnPremNetBIOS\da_stevens" }
        'ra'       { "ra_stevens@$SVHOnPremDomain" }
    }
}
Export-ModuleMember -Function Get-SVHTierUsername
