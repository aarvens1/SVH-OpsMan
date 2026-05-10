# SVH.Confluence.psm1 — Atlassian Confluence REST API v2
# Requires: SVH.Core
# Auth: HTTP Basic (email:api_token, base64-encoded)

Set-StrictMode -Version Latest

function script:cfHeaders {
    $pair = [Convert]::ToBase64String(
        [Text.Encoding]::UTF8.GetBytes("$(Get-SVHCredential 'CONFLUENCE_EMAIL'):$(Get-SVHCredential 'CONFLUENCE_API_TOKEN')")
    )
    @{ Authorization = "Basic $pair"; Accept = 'application/json' }
}

function script:cfBase { "https://$(Get-SVHCredential 'CONFLUENCE_DOMAIN').atlassian.net/wiki/api/v2" }

function script:cfGet($path, $query = @{}) {
    Invoke-SVHRest -Uri "$(cfBase)$path" -Headers (cfHeaders) -Query $query
}

function script:cfPost($path, $body) {
    Invoke-SVHRest -Method POST -Uri "$(cfBase)$path" -Headers (cfHeaders) -Body $body
}

function script:cfPut($path, $body) {
    Invoke-SVHRest -Method PUT -Uri "$(cfBase)$path" -Headers (cfHeaders) -Body $body
}

# ── VERIFY ────────────────────────────────────────────────────────────────────

function Get-SVHConfluenceSpaces {
    <#
    .SYNOPSIS  List all Confluence spaces.
    .EXAMPLE   Get-SVHConfluenceSpaces | Where-Object type -eq 'global'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Limit = 50)
    (cfGet '/spaces' @{ limit = $Limit }).results
}
Export-ModuleMember -Function Get-SVHConfluenceSpaces

function Search-SVHConfluencePages {
    <#
    .SYNOPSIS  Search Confluence pages using CQL.
    .EXAMPLE   Search-SVHConfluencePages -Cql 'space = "IT" AND label = "runbook"'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)]
        [string]$Cql,
        [int]$Limit = 25
    )
    (cfGet '/pages' @{ cql = $Cql; limit = $Limit }).results
}
Export-ModuleMember -Function Search-SVHConfluencePages

function Get-SVHConfluencePage {
    <#
    .SYNOPSIS  Get a Confluence page by ID.
    .EXAMPLE   Get-SVHConfluencePage -PageId '12345'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PageId,
        [ValidateSet('storage','view','export_view')]
        [string]$BodyFormat = 'storage'
    )
    process { cfGet "/pages/$PageId" @{ 'body-format' = $BodyFormat } }
}
Export-ModuleMember -Function Get-SVHConfluencePage

function Get-SVHConfluencePageChildren {
    <#
    .SYNOPSIS  List child pages of a Confluence page.
    .EXAMPLE   Get-SVHConfluencePageChildren -PageId '12345'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PageId,
        [int]$Limit = 25
    )
    process { (cfGet "/pages/$PageId/children" @{ limit = $Limit }).results }
}
Export-ModuleMember -Function Get-SVHConfluencePageChildren

function Get-SVHConfluencePageComments {
    <#
    .SYNOPSIS  List footer comments on a Confluence page, newest first.
    .EXAMPLE   Get-SVHConfluencePageComments -PageId '12345'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PageId,
        [int]$Limit = 25
    )
    process {
        (cfGet "/pages/$PageId/footer-comments" @{ limit = $Limit; sort = '-created-date' }).results
    }
}
Export-ModuleMember -Function Get-SVHConfluencePageComments

# ── ACT ───────────────────────────────────────────────────────────────────────

function New-SVHConfluencePage {
    <#
    .SYNOPSIS  Create a new Confluence page in a space.
    .EXAMPLE
        New-SVHConfluencePage -SpaceId 'IT' -Title 'Runbook: SQL01' -Body '<p>Content here</p>' -ParentId '100'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SpaceId,
        [Parameter(Mandatory)][string]$Title,
        [Parameter(Mandatory)][string]$Body,
        [string]$ParentId,
        [ValidateSet('current','draft')]
        [string]$Status = 'current'
    )
    if ($PSCmdlet.ShouldProcess($Title, "Create Confluence page in space $SpaceId")) {
        $payload = @{
            spaceId = $SpaceId
            title   = $Title
            status  = $Status
            body    = @{ representation = 'storage'; value = $Body }
        }
        if ($ParentId) { $payload['parentId'] = $ParentId }
        $result = cfPost '/pages' $payload
        Write-Verbose "[Confluence] Page '$Title' created: $($result.id)"
        $result
    }
}
Export-ModuleMember -Function New-SVHConfluencePage

function Set-SVHConfluencePage {
    <#
    .SYNOPSIS  Update an existing Confluence page.
    .DESCRIPTION
        Auto-fetches the current version and increments it. Pass -Title and/or -Body to update only what you need.
    .EXAMPLE
        Set-SVHConfluencePage -PageId '12345' -Body '<p>Updated content</p>'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PageId,
        [string]$Title,
        [string]$Body,
        [ValidateSet('current','draft')]
        [string]$Status = 'current'
    )
    process {
        $current = Get-SVHConfluencePage -PageId $PageId
        $newVersion = $current.version.number + 1
        if ($PSCmdlet.ShouldProcess("page $PageId", "Update to version $newVersion")) {
            $payload = @{
                id      = $PageId
                status  = $Status
                version = @{ number = $newVersion }
                title   = if ($Title) { $Title } else { $current.title }
            }
            if ($Body) { $payload['body'] = @{ representation = 'storage'; value = $Body } }
            $result = cfPut "/pages/$PageId" $payload
            Write-Verbose "[Confluence] Page $PageId updated to version $newVersion"
            $result
        }
    }
}
Export-ModuleMember -Function Set-SVHConfluencePage

function Add-SVHConfluenceComment {
    <#
    .SYNOPSIS  Add a footer comment to a Confluence page.
    .EXAMPLE   Add-SVHConfluenceComment -PageId '12345' -Body '<p>Verified 2026-05-10 — no issues.</p>'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PageId,
        [Parameter(Mandatory)]
        [string]$Body
    )
    process {
        if ($PSCmdlet.ShouldProcess("page $PageId", 'Add comment')) {
            $result = cfPost "/pages/$PageId/footer-comments" @{
                body = @{ representation = 'storage'; value = $Body }
            }
            Write-Verbose "[Confluence] Comment added to page $PageId"
            $result
        }
    }
}
Export-ModuleMember -Function Add-SVHConfluenceComment
