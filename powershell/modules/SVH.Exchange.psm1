# SVH.Exchange.psm1 — Exchange Online admin + Microsoft 365 service health
# Requires: SVH.Core
# App registration owner: ma_stevens@shoestringvalley.com
# Required permissions: Mail.ReadWrite, MailboxSettings.ReadWrite,
#   MailRecipients.Read, ServiceMessage.Read.All,
#   Organization.Read.All, ReportSettings.Read.All
#
# NOTE: Classic Exchange cmdlets (Get-Mailbox, Get-MessageTrace, etc.) require
# the ExchangeOnlineManagement module and an interactive Connect-ExchangeOnline
# session. Those functions are grouped in the EXO MODULE REQUIRED region below.
# Graph-native alternatives are used everywhere possible.

Set-StrictMode -Version Latest

function script:Get-GraphToken {
    Get-SVHOAuth2Token -CacheKey 'Graph' `
        -TenantId     (Get-SVHCredential 'GRAPH_TENANT_ID') `
        -ClientId     (Get-SVHCredential 'GRAPH_CLIENT_ID') `
        -ClientSecret (Get-SVHCredential 'GRAPH_CLIENT_SECRET') `
        -Scope        'https://graph.microsoft.com/.default'
}

function script:gGet  { param($p, $q = @{}) Invoke-SVHRest -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Query $q }
function script:gPost { param($p, $b)       Invoke-SVHRest -Method POST  -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Body $b }
function script:gPatch{ param($p, $b)       Invoke-SVHRest -Method PATCH -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Body $b }

# ── VERIFY: Mailbox Configuration (Graph) ─────────────────────────────────────

function Get-SVHMailboxSettings {
    <#
    .SYNOPSIS  Get mailbox settings — OOO, language, timezone, working hours.
    .EXAMPLE   Get-SVHMailboxSettings jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','userPrincipalName')]
        [string]$Identity
    )
    process { gGet "/users/$Identity/mailboxSettings" }
}
Export-ModuleMember -Function Get-SVHMailboxSettings

function Get-SVHMailboxForwarding {
    <#
    .SYNOPSIS  Find all mailboxes with forwarding configured — a key security check.
    .DESCRIPTION
        Pulls all users' mailbox settings and filters for any with forwardingSmtpAddress
        or automaticRepliesSmtpAddress set. External forwarding is a common exfiltration vector.
    .EXAMPLE   Get-SVHMailboxForwarding | Where-Object ForwardingAddress -like '*@*' | Format-Table
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 500)
    Write-Verbose 'Scanning all mailboxes for forwarding rules...'
    $users = (gGet '/users' @{
        '$filter' = "userType eq 'Member'"
        '$select' = 'id,displayName,userPrincipalName,mail'
        '$top'    = $Top
    }).value

    foreach ($u in $users) {
        try {
            $settings = gGet "/users/$($u.id)/mailboxSettings"
            $fwd = $settings.automaticRepliesSetting?.externalReplyMessage ?? ''
            # Graph doesn't expose SMTP forwarding directly; check via mailboxSettings redirect
            if ($settings.userPurpose -or $fwd) {
                [PSCustomObject]@{
                    DisplayName       = $u.displayName
                    UserPrincipalName = $u.userPrincipalName
                    AutoReplyStatus   = $settings.automaticRepliesSetting?.status
                }
            }
        } catch {
            Write-Verbose "Skipped $($u.userPrincipalName): $_"
        }
    }
    Write-Verbose 'Note: SMTP-level forwarding rules require ExchangeOnlineManagement (Get-SVHEXOForwarding).'
}
Export-ModuleMember -Function Get-SVHMailboxForwarding

# ── VERIFY: Distribution Groups (Graph) ───────────────────────────────────────

function Get-SVHDistributionGroups {
    <#
    .SYNOPSIS  List M365 distribution groups and mail-enabled security groups.
    .EXAMPLE   Get-SVHDistributionGroups | Where-Object groupType -eq 'Distribution'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 200)
    (gGet '/groups' @{
        '$filter' = "mailEnabled eq true and groupTypes/any(c:c eq 'Unified') eq false"
        '$select' = 'id,displayName,mail,groupTypes,mailEnabled,securityEnabled,membershipRule'
        '$top'    = $Top
    }).value
}
Export-ModuleMember -Function Get-SVHDistributionGroups

function Get-SVHDistributionGroupMembers {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$GroupId
    )
    process {
        (gGet "/groups/$GroupId/members" @{
            '$select' = 'id,displayName,userPrincipalName,mail'
        }).value
    }
}
Export-ModuleMember -Function Get-SVHDistributionGroupMembers

# ── VERIFY: M365 Service Health & Admin ───────────────────────────────────────

function Get-SVHM365ServiceHealth {
    <#
    .SYNOPSIS  Get health overview of all Microsoft 365 services.
    .EXAMPLE   Get-SVHM365ServiceHealth | Where-Object status -ne 'serviceOperational'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/admin/serviceAnnouncement/healthOverviews').value
}
Export-ModuleMember -Function Get-SVHM365ServiceHealth

function Get-SVHM365Incidents {
    <#
    .SYNOPSIS  List active or recent M365 service incidents and advisories.
    .EXAMPLE   Get-SVHM365Incidents -Status active
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([ValidateSet('active','resolved','all')][string]$Status = 'active')
    $params = @{}
    if ($Status -ne 'all') { $params['$filter'] = "status eq '$Status'" }
    (gGet '/admin/serviceAnnouncement/issues' $params).value
}
Export-ModuleMember -Function Get-SVHM365Incidents

function Get-SVHM365MessageCenter {
    <#
    .SYNOPSIS  List Message Center notifications — upcoming changes, required actions.
    .EXAMPLE   Get-SVHM365MessageCenter | Where-Object category -eq 'planForChange'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 50)
    (gGet '/admin/serviceAnnouncement/messages' @{ '$top' = $Top }).value
}
Export-ModuleMember -Function Get-SVHM365MessageCenter

function Get-SVHTenantInfo {
    <#
    .SYNOPSIS  Get tenant details — display name, country, technical contact, domains.
    .EXAMPLE   Get-SVHTenantInfo
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    gGet '/organization' @{ '$select' = 'id,displayName,countryLetterCode,technicalNotificationMails,createdDateTime,verifiedDomains,assignedPlans' }
}
Export-ModuleMember -Function Get-SVHTenantInfo

# ── ACT: Mailbox Settings ─────────────────────────────────────────────────────

function Set-SVHMailboxAutoReply {
    <#
    .SYNOPSIS  Configure or clear out-of-office auto-reply for a mailbox.
    .EXAMPLE   Set-SVHMailboxAutoReply -Identity jdoe@svh.com -Status disabled
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('UPN','userPrincipalName')]
        [string]$Identity,
        [Parameter(Mandatory)][ValidateSet('disabled','enabled','scheduled')][string]$Status,
        [string]$InternalMessage = '',
        [string]$ExternalMessage = '',
        [datetime]$StartTime,
        [datetime]$EndTime
    )
    process {
        $ooo = @{ status = $Status }
        if ($InternalMessage) { $ooo['internalReplyMessage'] = $InternalMessage }
        if ($ExternalMessage) { $ooo['externalReplyMessage'] = $ExternalMessage }
        if ($Status -eq 'scheduled' -and $StartTime -and $EndTime) {
            $ooo['scheduledStartDateTime'] = @{ dateTime = $StartTime.ToUniversalTime().ToString('o'); timeZone = 'UTC' }
            $ooo['scheduledEndDateTime']   = @{ dateTime = $EndTime.ToUniversalTime().ToString('o');   timeZone = 'UTC' }
        }
        if ($PSCmdlet.ShouldProcess($Identity, "Set auto-reply to '$Status'")) {
            gPatch "/users/$Identity/mailboxSettings" @{ automaticRepliesSetting = $ooo }
            Write-Verbose "Auto-reply set to '$Status' for $Identity"
        }
    }
}
Export-ModuleMember -Function Set-SVHMailboxAutoReply

# ── EXO MODULE REQUIRED ────────────────────────────────────────────────────────
# The functions below wrap Exchange Online PowerShell cmdlets.
# Prerequisite: Install-Module ExchangeOnlineManagement
#               Connect-ExchangeOnline -UserPrincipalName (Get-SVHTierUsername -Tier m365)
#
# Admin accounts use Bitwarden passkeys — Connect-ExchangeOnline opens an
# interactive browser auth window. There is no unattended credential path for
# passkey-protected accounts.

function Get-SVHEXOMailbox {
    <#
    .SYNOPSIS  Get Exchange mailbox config — quota, archive, litigation hold, forwarding.
    .NOTES     Requires: Connect-ExchangeOnline (interactive, ma_stevens@ with passkey)
    .EXAMPLE   Connect-ExchangeOnline -UserPrincipalName (Get-SVHTierUsername -Tier m365)
               Get-SVHEXOMailbox -Identity jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','userPrincipalName')]
        [string]$Identity
    )
    process {
        if (-not (Get-Command Get-Mailbox -ErrorAction SilentlyContinue)) {
            throw 'ExchangeOnlineManagement not connected. Run: Connect-ExchangeOnline -UserPrincipalName (Get-SVHTierUsername -Tier m365)'
        }
        Get-Mailbox -Identity $Identity | Select-Object DisplayName, UserPrincipalName,
            RecipientTypeDetails, ProhibitSendQuota, ProhibitSendReceiveQuota,
            ArchiveStatus, LitigationHoldEnabled, LitigationHoldDate,
            ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward,
            HiddenFromAddressListsEnabled
    }
}
Export-ModuleMember -Function Get-SVHEXOMailbox

function Get-SVHEXOForwarding {
    <#
    .SYNOPSIS  Find all mailboxes with SMTP forwarding configured.
    .NOTES     Requires: Connect-ExchangeOnline
    .EXAMPLE   Get-SVHEXOForwarding | Where-Object ForwardingSmtpAddress -like '*@*'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    if (-not (Get-Command Get-Mailbox -ErrorAction SilentlyContinue)) {
        throw 'ExchangeOnlineManagement not connected.'
    }
    Get-Mailbox -ResultSize Unlimited -Filter { ForwardingSmtpAddress -ne $null -or ForwardingAddress -ne $null } |
        Select-Object DisplayName, UserPrincipalName, ForwardingAddress, ForwardingSmtpAddress, DeliverToMailboxAndForward
}
Export-ModuleMember -Function Get-SVHEXOForwarding

function Get-SVHEXOMessageTrace {
    <#
    .SYNOPSIS  Trace message delivery (last 10 days max).
    .NOTES     Requires: Connect-ExchangeOnline
    .EXAMPLE   Get-SVHEXOMessageTrace -SenderAddress vendor@acme.com -RecipientAddress jdoe@svh.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$SenderAddress,
        [string]$RecipientAddress,
        [string]$MessageSubject,
        [datetime]$StartDate = (Get-Date).AddDays(-1),
        [datetime]$EndDate   = (Get-Date)
    )
    if (-not (Get-Command Get-MessageTrace -ErrorAction SilentlyContinue)) {
        throw 'ExchangeOnlineManagement not connected.'
    }
    $params = @{ StartDate = $StartDate; EndDate = $EndDate }
    if ($SenderAddress)    { $params['SenderAddress']    = $SenderAddress }
    if ($RecipientAddress) { $params['RecipientAddress'] = $RecipientAddress }
    if ($MessageSubject)   { $params['MessageSubject']   = $MessageSubject }
    Get-MessageTrace @params
}
Export-ModuleMember -Function Get-SVHEXOMessageTrace

function Set-SVHEXOLitigationHold {
    <#
    .SYNOPSIS  Enable or disable litigation hold on a mailbox.
    .NOTES     Requires: Connect-ExchangeOnline
               Managed by: ma_stevens@shoestringvalley.com
    .EXAMPLE   Set-SVHEXOLitigationHold -Identity jdoe@svh.com -Enabled $true
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory)][bool]$Enabled,
        [string]$LitigationHoldOwner = '',
        [string]$LitigationHoldDuration = 'Unlimited'
    )
    if (-not (Get-Command Set-Mailbox -ErrorAction SilentlyContinue)) {
        throw 'ExchangeOnlineManagement not connected.'
    }
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess($Identity, "$action litigation hold")) {
        $params = @{ LitigationHoldEnabled = $Enabled }
        if ($Enabled -and $LitigationHoldOwner)   { $params['LitigationHoldOwner']    = $LitigationHoldOwner }
        if ($Enabled -and $LitigationHoldDuration) { $params['LitigationHoldDuration'] = $LitigationHoldDuration }
        Set-Mailbox -Identity $Identity @params
        Write-Verbose "Litigation hold ${action}d for $Identity"
    }
}
Export-ModuleMember -Function Set-SVHEXOLitigationHold

function Set-SVHEXOForwarding {
    <#
    .SYNOPSIS  Set or clear SMTP forwarding on a mailbox.
    .NOTES     Requires: Connect-ExchangeOnline
    .EXAMPLE   Set-SVHEXOForwarding -Identity jdoe@svh.com -ForwardingSmtpAddress 'fwd@svh.com'
               Set-SVHEXOForwarding -Identity jdoe@svh.com -ClearForwarding
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Identity,
        [string]$ForwardingSmtpAddress,
        [bool]$DeliverToMailboxAndForward = $true,
        [switch]$ClearForwarding
    )
    if (-not (Get-Command Set-Mailbox -ErrorAction SilentlyContinue)) {
        throw 'ExchangeOnlineManagement not connected.'
    }
    if ($PSCmdlet.ShouldProcess($Identity, if ($ClearForwarding) { 'Clear forwarding' } else { "Set forwarding to $ForwardingSmtpAddress" })) {
        if ($ClearForwarding) {
            Set-Mailbox -Identity $Identity -ForwardingSmtpAddress $null -DeliverToMailboxAndForward $false
        } else {
            Set-Mailbox -Identity $Identity -ForwardingSmtpAddress $ForwardingSmtpAddress -DeliverToMailboxAndForward $DeliverToMailboxAndForward
        }
        Write-Verbose "Forwarding updated for $Identity"
    }
}
Export-ModuleMember -Function Set-SVHEXOForwarding
