# SVH.Graph.psm1 — Microsoft Graph: Entra, M365, Intune, Teams, Outlook, Planner, EXO

$script:GraphToken       = $null
$script:GraphTokenExpiry = [DateTime]::MinValue

function script:Get-GraphToken {
    if ($script:GraphToken -and (Get-Date) -lt $script:GraphTokenExpiry) {
        return $script:GraphToken
    }
    $c = $Global:SVHCreds
    $body = @{
        grant_type    = 'client_credentials'
        client_id     = $c['GRAPH_CLIENT_ID']
        client_secret = $c['GRAPH_CLIENT_SECRET']
        scope         = 'https://graph.microsoft.com/.default'
    }
    $r = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$($c['GRAPH_TENANT_ID'])/oauth2/v2.0/token" `
        -Body $body -ContentType 'application/x-www-form-urlencoded'
    $script:GraphToken       = $r.access_token
    $script:GraphTokenExpiry = (Get-Date).AddSeconds($r.expires_in - 60)
    return $script:GraphToken
}

function script:gHeader { @{ Authorization = "Bearer $(Get-GraphToken)" } }

function script:gGet($path, $params = @{}) {
    $uri = "https://graph.microsoft.com/v1.0$path"
    Invoke-RestMethod -Method Get -Uri $uri -Headers (gHeader) -Body $params
}

function script:gPost($path, $body) {
    Invoke-RestMethod -Method Post `
        -Uri "https://graph.microsoft.com/v1.0$path" `
        -Headers (gHeader) -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

function script:gPatch($path, $body) {
    Invoke-RestMethod -Method Patch `
        -Uri "https://graph.microsoft.com/v1.0$path" `
        -Headers (gHeader) -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

function script:gDelete($path) {
    Invoke-RestMethod -Method Delete `
        -Uri "https://graph.microsoft.com/v1.0$path" `
        -Headers (gHeader)
}

# ── VERIFY: Entra / Identity ───────────────────────────────────────────────────

function Get-SVHUser {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName" @{
        '$select' = 'id,displayName,userPrincipalName,accountEnabled,assignedLicenses,lastPasswordChangeDateTime,createdDateTime,signInSessionsValidFromDateTime'
    }
}
Export-ModuleMember -Function Get-SVHUser

function Get-SVHUserMFA {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName/authentication/methods"
}
Export-ModuleMember -Function Get-SVHUserMFA

function Get-SVHUserLicenses {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName/licenseDetails"
}
Export-ModuleMember -Function Get-SVHUserLicenses

function Get-SVHTenantSubscriptions {
    gGet '/subscribedSkus'
}
Export-ModuleMember -Function Get-SVHTenantSubscriptions

function Get-SVHTenantDomains {
    gGet '/domains'
}
Export-ModuleMember -Function Get-SVHTenantDomains

function Get-SVHSignInLogs {
    param(
        [string]$UserPrincipalName,
        [string]$AppDisplayName,
        [string]$IpAddress,
        [ValidateSet('success','failure','all')][string]$Status = 'all',
        [int]$Hours = 24,
        [int]$Top = 100
    )
    $since   = (Get-Date).AddHours(-$Hours).ToUniversalTime().ToString('o')
    $filters = @("createdDateTime ge $since")
    if ($UserPrincipalName) { $filters += "userPrincipalName eq '$UserPrincipalName'" }
    if ($AppDisplayName)    { $filters += "appDisplayName eq '$AppDisplayName'" }
    if ($IpAddress)         { $filters += "ipAddress eq '$IpAddress'" }
    if ($Status -eq 'success') { $filters += 'status/errorCode eq 0' }
    if ($Status -eq 'failure') { $filters += 'status/errorCode ne 0' }

    gGet '/auditLogs/signIns' @{
        '$filter'  = $filters -join ' and '
        '$top'     = $Top
        '$orderby' = 'createdDateTime desc'
        '$select'  = 'id,createdDateTime,userDisplayName,userPrincipalName,appDisplayName,ipAddress,location,status,conditionalAccessStatus,mfaDetail,deviceDetail,riskLevelDuringSignIn'
    }
}
Export-ModuleMember -Function Get-SVHSignInLogs

function Get-SVHAuditLog {
    param(
        [string]$Category,
        [string]$InitiatedBy,
        [int]$Hours = 24,
        [int]$Top = 50
    )
    $since   = (Get-Date).AddHours(-$Hours).ToUniversalTime().ToString('o')
    $filters = @("activityDateTime ge $since")
    if ($Category)    { $filters += "category eq '$Category'" }
    if ($InitiatedBy) { $filters += "initiatedBy/user/userPrincipalName eq '$InitiatedBy'" }

    gGet '/auditLogs/directoryAudits' @{
        '$filter'  = $filters -join ' and '
        '$top'     = $Top
        '$orderby' = 'activityDateTime desc'
        '$select'  = 'id,activityDateTime,activityDisplayName,category,result,resultReason,initiatedBy,targetResources'
    }
}
Export-ModuleMember -Function Get-SVHAuditLog

function Get-SVHRiskyUsers {
    param(
        [ValidateSet('low','medium','high','all')][string]$RiskLevel = 'high',
        [int]$Top = 25
    )
    $params = @{
        '$top'    = $Top
        '$select' = 'id,userDisplayName,userPrincipalName,riskLevel,riskState,riskDetail,riskLastUpdatedDateTime'
    }
    if ($RiskLevel -ne 'all') { $params['$filter'] = "riskLevel eq '$RiskLevel'" }
    gGet '/identityProtection/riskyUsers' $params
}
Export-ModuleMember -Function Get-SVHRiskyUsers

function Get-SVHAppSecrets {
    param([int]$ExpiringWithinDays = 30)
    $cutoff = (Get-Date).AddDays($ExpiringWithinDays).ToUniversalTime().ToString('o')
    $now    = (Get-Date).ToUniversalTime().ToString('o')

    $apps = (gGet '/applications' @{
        '$select' = 'id,displayName,appId,passwordCredentials,keyCredentials'
        '$top'    = 200
    }).value

    $expiring = foreach ($app in $apps) {
        $creds = @(
            $app.passwordCredentials | ForEach-Object { $_ | Add-Member -NotePropertyName credType -NotePropertyValue 'secret' -PassThru }
            $app.keyCredentials      | ForEach-Object { $_ | Add-Member -NotePropertyName credType -NotePropertyValue 'certificate' -PassThru }
        )
        foreach ($cred in $creds) {
            if ($cred.endDateTime -and $cred.endDateTime -lt $cutoff) {
                [PSCustomObject]@{
                    AppDisplayName = $app.displayName
                    AppId          = $app.appId
                    CredType       = $cred.credType
                    ExpiresAt      = $cred.endDateTime
                    Expired        = $cred.endDateTime -lt $now
                    Hint           = $cred.hint
                }
            }
        }
    }
    $expiring | Sort-Object ExpiresAt
}
Export-ModuleMember -Function Get-SVHAppSecrets

function Get-SVHConditionalAccessPolicies {
    param([ValidateSet('enabled','disabled','enabledForReportingButNotEnforced','all')][string]$State = 'all')
    $params = @{}
    if ($State -ne 'all') { $params['$filter'] = "state eq '$State'" }
    gGet '/identity/conditionalAccess/policies' $params
}
Export-ModuleMember -Function Get-SVHConditionalAccessPolicies

function Get-SVHGroupMembers {
    param([Parameter(Mandatory)][string]$GroupId)
    gGet "/groups/$GroupId/members" @{ '$select' = 'id,displayName,userPrincipalName,mail' }
}
Export-ModuleMember -Function Get-SVHGroupMembers

function Get-SVHDirectoryRole {
    param([string]$RoleName)
    $roles = (gGet '/directoryRoles' @{ '$select' = 'id,displayName,description,roleTemplateId' }).value
    if ($RoleName) { $roles = $roles | Where-Object { $_.displayName -like "*$RoleName*" } }
    $roles
}
Export-ModuleMember -Function Get-SVHDirectoryRole

function Get-SVHDirectoryRoleMembers {
    param([Parameter(Mandatory)][string]$RoleId)
    gGet "/directoryRoles/$RoleId/members" @{
        '$select' = 'id,displayName,userPrincipalName,mail'
    }
}
Export-ModuleMember -Function Get-SVHDirectoryRoleMembers

# ── VERIFY: Intune ─────────────────────────────────────────────────────────────

function Get-SVHIntuneDevice {
    param(
        [string]$DeviceId,
        [ValidateSet('Windows','iOS','Android','macOS','all')][string]$OS = 'all',
        [ValidateSet('compliant','noncompliant','all')][string]$Compliance = 'all'
    )
    if ($DeviceId) { return gGet "/deviceManagement/managedDevices/$DeviceId" }

    $filters = @()
    if ($OS -ne 'all')         { $filters += "operatingSystem eq '$OS'" }
    if ($Compliance -ne 'all') { $filters += "complianceState eq '$Compliance'" }

    $params = @{
        '$select' = 'id,deviceName,operatingSystem,osVersion,complianceState,lastSyncDateTime,userPrincipalName,isEncrypted,managedDeviceOwnerType'
        '$top'    = 200
    }
    if ($filters) { $params['$filter'] = $filters -join ' and ' }
    gGet '/deviceManagement/managedDevices' $params
}
Export-ModuleMember -Function Get-SVHIntuneDevice

function Get-SVHIntuneDeviceCompliance {
    param([Parameter(Mandatory)][string]$DeviceId)
    gGet "/deviceManagement/managedDevices/$DeviceId/deviceCompliancePolicyStates"
}
Export-ModuleMember -Function Get-SVHIntuneDeviceCompliance

function Get-SVHIntuneCompliancePolicies {
    gGet '/deviceManagement/deviceCompliancePolicies' @{ '$select' = 'id,displayName,@odata.type' }
}
Export-ModuleMember -Function Get-SVHIntuneCompliancePolicies

function Get-SVHIntuneConfigProfiles {
    gGet '/deviceManagement/deviceConfigurations' @{ '$select' = 'id,displayName,@odata.type,lastModifiedDateTime' }
}
Export-ModuleMember -Function Get-SVHIntuneConfigProfiles

# ── VERIFY: Teams ──────────────────────────────────────────────────────────────

function Get-SVHTeams {
    gGet '/groups' @{
        '$filter' = "resourceProvisioningOptions/Any(x:x eq 'Team')"
        '$select' = 'id,displayName,description,visibility,mailAddress'
        '$top'    = 100
    }
}
Export-ModuleMember -Function Get-SVHTeams

function Get-SVHTeamChannels {
    param([Parameter(Mandatory)][string]$TeamId)
    gGet "/teams/$TeamId/channels"
}
Export-ModuleMember -Function Get-SVHTeamChannels

function Get-SVHTeamMessages {
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$ChannelId,
        [int]$Top = 20
    )
    gGet "/teams/$TeamId/channels/$ChannelId/messages" @{ '$top' = $Top }
}
Export-ModuleMember -Function Get-SVHTeamMessages

# ── VERIFY: Exchange (via Graph) ───────────────────────────────────────────────

function Get-SVHMailboxSettings {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName/mailboxSettings"
}
Export-ModuleMember -Function Get-SVHMailboxSettings

function Get-SVHMailFolders {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName/mailFolders"
}
Export-ModuleMember -Function Get-SVHMailFolders

function Search-SVHMail {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [string]$Query,
        [int]$Top = 25
    )
    gGet "/users/$UserPrincipalName/messages" @{
        '$search' = "`"$Query`""
        '$top'    = $Top
        '$select' = 'id,subject,from,receivedDateTime,hasAttachments,importance'
    }
}
Export-ModuleMember -Function Search-SVHMail

# ── VERIFY: MS Admin / Service Health ─────────────────────────────────────────

function Get-SVHM365ServiceHealth {
    gGet '/admin/serviceAnnouncement/healthOverviews'
}
Export-ModuleMember -Function Get-SVHM365ServiceHealth

function Get-SVHM365Incidents {
    param([ValidateSet('active','resolved','all')][string]$Status = 'active')
    $params = @{}
    if ($Status -ne 'all') { $params['$filter'] = "status eq '$Status'" }
    gGet '/admin/serviceAnnouncement/issues' $params
}
Export-ModuleMember -Function Get-SVHM365Incidents

function Get-SVHM365MessageCenter {
    gGet '/admin/serviceAnnouncement/messages' @{ '$top' = 50 }
}
Export-ModuleMember -Function Get-SVHM365MessageCenter

# ── VERIFY: SharePoint ─────────────────────────────────────────────────────────

function Get-SVHSharePointSites {
    param([string]$Search = '*')
    gGet '/sites' @{ 'search' = $Search }
}
Export-ModuleMember -Function Get-SVHSharePointSites

function Get-SVHSharePointSiteLists {
    param([Parameter(Mandatory)][string]$SiteId)
    gGet "/sites/$SiteId/lists" @{ '$select' = 'id,displayName,description,webUrl,listInfo' }
}
Export-ModuleMember -Function Get-SVHSharePointSiteLists

# ── ACT: User account management ──────────────────────────────────────────────

function Set-SVHUserEnabled {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][bool]$Enabled
    )
    gPatch "/users/$UserPrincipalName" @{ accountEnabled = $Enabled }
    Write-Host "[svh] $UserPrincipalName accountEnabled set to $Enabled" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHUserEnabled

function Reset-SVHUserPassword {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$NewPassword,
        [bool]$ForceChangeAtNextSignIn = $true
    )
    gPatch "/users/$UserPrincipalName" @{
        passwordProfile = @{
            password                      = $NewPassword
            forceChangePasswordNextSignIn = $ForceChangeAtNextSignIn
        }
    }
    Write-Host "[svh] Password reset for $UserPrincipalName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Reset-SVHUserPassword

function New-SVHTemporaryAccessPass {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [int]$LifetimeMinutes = 60,
        [bool]$IsUsableOnce = $true
    )
    $body = @{
        '@odata.type'    = '#microsoft.graph.temporaryAccessPassAuthenticationMethod'
        lifetimeInMinutes = $LifetimeMinutes
        isUsableOnce     = $IsUsableOnce
    }
    $result = gPost "/users/$UserPrincipalName/authentication/temporaryAccessPassMethods" $body
    Write-Host "[svh] TAP created for $UserPrincipalName — expires in $LifetimeMinutes min" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function New-SVHTemporaryAccessPass

function Remove-SVHUserMFAMethod {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$MethodId
    )
    gDelete "/users/$UserPrincipalName/authentication/methods/$MethodId"
    Write-Host "[svh] MFA method $MethodId removed from $UserPrincipalName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Remove-SVHUserMFAMethod

function Dismiss-SVHRiskyUser {
    param([Parameter(Mandatory)][string[]]$UserIds)
    gPost '/identityProtection/riskyUsers/dismiss' @{ userIds = $UserIds }
    Write-Host "[svh] Risk dismissed for $($UserIds.Count) user(s)" -ForegroundColor Yellow
}
Export-ModuleMember -Function Dismiss-SVHRiskyUser

function Add-SVHGroupMember {
    param(
        [Parameter(Mandatory)][string]$GroupId,
        [Parameter(Mandatory)][string]$UserObjectId
    )
    gPost "/groups/$GroupId/members/`$ref" @{
        '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$UserObjectId"
    }
    Write-Host "[svh] Added $UserObjectId to group $GroupId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Add-SVHGroupMember

function Remove-SVHGroupMember {
    param(
        [Parameter(Mandatory)][string]$GroupId,
        [Parameter(Mandatory)][string]$UserObjectId
    )
    gDelete "/groups/$GroupId/members/$UserObjectId/`$ref"
    Write-Host "[svh] Removed $UserObjectId from group $GroupId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Remove-SVHGroupMember

function Revoke-SVHUserSessions {
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gPost "/users/$UserPrincipalName/revokeSignInSessions" @{}
    Write-Host "[svh] Sign-in sessions revoked for $UserPrincipalName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Revoke-SVHUserSessions

function Set-SVHUserLicense {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [string[]]$AddSkuIds   = @(),
        [string[]]$RemoveSkuIds = @()
    )
    $body = @{
        addLicenses    = $AddSkuIds    | ForEach-Object { @{ skuId = $_ } }
        removeLicenses = $RemoveSkuIds
    }
    gPost "/users/$UserPrincipalName/assignLicense" $body
    Write-Host "[svh] License updated for $UserPrincipalName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHUserLicense

# ── ACT: Teams ────────────────────────────────────────────────────────────────

function Send-SVHTeamsMessage {
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$ChannelId,
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('text','html')][string]$ContentType = 'text'
    )
    gPost "/teams/$TeamId/channels/$ChannelId/messages" @{
        body = @{ contentType = $ContentType; content = $Message }
    }
    Write-Host "[svh] Message sent to channel $ChannelId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Send-SVHTeamsMessage

function New-SVHTeamsChannel {
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$DisplayName,
        [string]$Description = ''
    )
    gPost "/teams/$TeamId/channels" @{
        displayName = $DisplayName
        description = $Description
        membershipType = 'standard'
    }
}
Export-ModuleMember -Function New-SVHTeamsChannel

function Add-SVHTeamMember {
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$UserObjectId,
        [ValidateSet('member','owner')][string]$Role = 'member'
    )
    $body = @{
        '@odata.type'     = '#microsoft.graph.aadUserConversationMember'
        'user@odata.bind' = "https://graph.microsoft.com/v1.0/users('$UserObjectId')"
        roles             = if ($Role -eq 'owner') { @('owner') } else { @() }
    }
    gPost "/teams/$TeamId/members" $body
    Write-Host "[svh] $UserObjectId added to team $TeamId as $Role" -ForegroundColor Yellow
}
Export-ModuleMember -Function Add-SVHTeamMember

# ── ACT: Mailbox ──────────────────────────────────────────────────────────────

function Set-SVHMailboxAutoReply {
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [ValidateSet('disabled','enabled','scheduled')][string]$Status,
        [string]$InternalMessage = '',
        [string]$ExternalMessage = '',
        [datetime]$StartTime,
        [datetime]$EndTime
    )
    $settings = @{ automaticRepliesSetting = @{ status = $Status } }
    if ($InternalMessage) { $settings.automaticRepliesSetting['internalReplyMessage'] = $InternalMessage }
    if ($ExternalMessage) { $settings.automaticRepliesSetting['externalReplyMessage'] = $ExternalMessage }
    if ($Status -eq 'scheduled' -and $StartTime -and $EndTime) {
        $settings.automaticRepliesSetting['scheduledStartDateTime'] = @{
            dateTime = $StartTime.ToUniversalTime().ToString('o')
            timeZone = 'UTC'
        }
        $settings.automaticRepliesSetting['scheduledEndDateTime'] = @{
            dateTime = $EndTime.ToUniversalTime().ToString('o')
            timeZone = 'UTC'
        }
    }
    gPatch "/users/$UserPrincipalName/mailboxSettings" $settings
    Write-Host "[svh] Auto-reply set to '$Status' for $UserPrincipalName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHMailboxAutoReply

function Send-SVHMail {
    param(
        [Parameter(Mandatory)][string]$From,
        [Parameter(Mandatory)][string[]]$To,
        [Parameter(Mandatory)][string]$Subject,
        [Parameter(Mandatory)][string]$Body,
        [ValidateSet('text','html')][string]$ContentType = 'text',
        [bool]$SaveToSentItems = $true
    )
    $message = @{
        subject      = $Subject
        body         = @{ contentType = $ContentType; content = $Body }
        toRecipients = $To | ForEach-Object { @{ emailAddress = @{ address = $_ } } }
    }
    gPost "/users/$From/sendMail" @{
        message         = $message
        saveToSentItems = $SaveToSentItems
    }
    Write-Host "[svh] Email sent from $From to $($To -join ', ')" -ForegroundColor Yellow
}
Export-ModuleMember -Function Send-SVHMail

# ── ACT: Intune ───────────────────────────────────────────────────────────────

function Sync-SVHIntuneDevice {
    param([Parameter(Mandatory)][string]$DeviceId)
    gPost "/deviceManagement/managedDevices/$DeviceId/syncDevice" @{}
    Write-Host "[svh] Intune sync triggered for device $DeviceId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Sync-SVHIntuneDevice
