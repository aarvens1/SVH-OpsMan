# SVH.Confluence.psm1 — Atlassian Confluence REST API v2
# Auth: Basic (email:api_token, base64)

function script:cfHeader {
    $c    = $Global:SVHCreds
    $pair = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$($c['CONFLUENCE_EMAIL']):$($c['CONFLUENCE_API_TOKEN'])"))
    @{
        Authorization = "Basic $pair"
        Accept        = 'application/json'
    }
}

function script:cfBase {
    $domain = $Global:SVHCreds['CONFLUENCE_DOMAIN']
    "https://$domain.atlassian.net/wiki/api/v2"
}

function script:cfGet($path, $params = @{}) {
    $uri = "$(cfBase)$path"
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri -Headers (cfHeader)
}

function script:cfPost($path, $body) {
    Invoke-RestMethod -Method Post `
        -Uri "$(cfBase)$path" `
        -Headers (cfHeader) `
        -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

function script:cfPut($path, $body) {
    Invoke-RestMethod -Method Put `
        -Uri "$(cfBase)$path" `
        -Headers (cfHeader) `
        -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

# ── VERIFY ────────────────────────────────────────────────────────────────────

function Get-SVHConfluenceSpaces {
    param([int]$Limit = 50)
    (cfGet '/spaces' @{ limit = $Limit }).results
}
Export-ModuleMember -Function Get-SVHConfluenceSpaces

function Search-SVHConfluencePages {
    param(
        [Parameter(Mandatory)][string]$Cql,
        [int]$Limit = 25
    )
    (cfGet '/pages' @{ cql = $Cql; limit = $Limit }).results
}
Export-ModuleMember -Function Search-SVHConfluencePages

function Get-SVHConfluencePage {
    param(
        [Parameter(Mandatory)][string]$PageId,
        [ValidateSet('storage','view','export_view')][string]$BodyFormat = 'storage'
    )
    cfGet "/pages/$PageId" @{ 'body-format' = $BodyFormat }
}
Export-ModuleMember -Function Get-SVHConfluencePage

function Get-SVHConfluencePageChildren {
    param(
        [Parameter(Mandatory)][string]$PageId,
        [int]$Limit = 25
    )
    (cfGet "/pages/$PageId/children" @{ limit = $Limit }).results
}
Export-ModuleMember -Function Get-SVHConfluencePageChildren

function Get-SVHConfluencePageComments {
    param(
        [Parameter(Mandatory)][string]$PageId,
        [int]$Limit = 25
    )
    (cfGet "/pages/$PageId/footer-comments" @{ limit = $Limit; sort = '-created-date' }).results
}
Export-ModuleMember -Function Get-SVHConfluencePageComments

# ── ACT ───────────────────────────────────────────────────────────────────────

function New-SVHConfluencePage {
    param(
        [Parameter(Mandatory)][string]$SpaceId,
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Body,
        [string]$ParentId,
        [ValidateSet('current','draft')][string]$Status = 'current'
    )
    $payload = @{
        spaceId = $SpaceId
        title   = $Title
        status  = $Status
        body    = @{ representation = 'storage'; value = $Body }
    }
    if ($ParentId) { $payload['parentId'] = $ParentId }
    $result = cfPost '/pages' $payload
    Write-Host "[svh] Confluence page '$Title' created: $($result.id)" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function New-SVHConfluencePage

function Set-SVHConfluencePage {
    <#
    .SYNOPSIS
        Update an existing Confluence page.
    .NOTES
        Automatically fetches the current version number and increments it.
        Pass -Title and/or -Body to update only what you need.
    #>
    param(
        [Parameter(Mandatory)][string]$PageId,
        [string]$Title,
        [string]$Body,
        [ValidateSet('current','draft')][string]$Status = 'current'
    )
    $current = Get-SVHConfluencePage -PageId $PageId
    $payload = @{
        id      = $PageId
        status  = $Status
        version = @{ number = $current.version.number + 1 }
        title   = if ($Title) { $Title } else { $current.title }
    }
    if ($Body) { $payload['body'] = @{ representation = 'storage'; value = $Body } }
    $result = cfPut "/pages/$PageId" $payload
    Write-Host "[svh] Confluence page $PageId updated to version $($payload.version.number)" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Set-SVHConfluencePage

function Add-SVHConfluenceComment {
    param(
        [Parameter(Mandatory)][string]$PageId,
        [Parameter(Mandatory)][string]$Body
    )
    $result = cfPost "/pages/$PageId/footer-comments" @{
        body = @{ representation = 'storage'; value = $Body }
    }
    Write-Host "[svh] Comment added to page $PageId" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Add-SVHConfluenceComment
