# SVH.Entra.psm1 — Entra ID (Azure AD), Intune, Conditional Access
# Requires: SVH.Core (loaded by connect.ps1 before this module)
# App registration owner: ma_stevens@shoestringvalley.com
# Required permissions: User.Read.All, UserAuthenticationMethod.ReadWrite.All,
#   Policy.Read.All, IdentityRiskyUser.ReadWrite.All, AuditLog.Read.All,
#   Directory.Read.All, DeviceManagementManagedDevices.ReadWrite.All

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
function script:gDel  { param($p)           Invoke-SVHRest -Method DELETE -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } }

# ── VERIFY: Users & Identity ───────────────────────────────────────────────────

function Get-SVHUser {
    <#
    .SYNOPSIS  Get Entra ID user account details.
    .EXAMPLE   Get-SVHUser jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity
    )
    process {
        gGet "/users/$Identity" @{
            '$select' = 'id,displayName,userPrincipalName,accountEnabled,assignedLicenses,lastPasswordChangeDateTime,createdDateTime,signInSessionsValidFromDateTime,jobTitle,department,officeLocation'
        }
    }
}
Export-ModuleMember -Function Get-SVHUser

function Get-SVHGuestUsers {
    <#
    .SYNOPSIS  List all external guest accounts in the tenant.
    .EXAMPLE   Get-SVHGuestUsers | Where-Object signInActivity -eq $null
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 200)
    (gGet '/users' @{
        '$filter' = "userType eq 'Guest'"
        '$select' = 'id,displayName,mail,userPrincipalName,createdDateTime,signInActivity,externalUserState'
        '$top'    = $Top
    }).value
}
Export-ModuleMember -Function Get-SVHGuestUsers

function Get-SVHUserMFA {
    <#
    .SYNOPSIS  List MFA methods registered for a user.
    .EXAMPLE   Get-SVHUserMFA jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity
    )
    process {
        (gGet "/users/$Identity/authentication/methods").value
    }
}
Export-ModuleMember -Function Get-SVHUserMFA

function Get-SVHMFAGap {
    <#
    .SYNOPSIS  Find licensed users with NO MFA method registered.
    .DESCRIPTION
        Compares the user list against authentication methods. Users with only
        the built-in password method have no second factor — they are the gap.
    .EXAMPLE   Get-SVHMFAGap | Export-Csv mfa-gap.csv -NoTypeInformation
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 500)

    Write-Verbose 'Fetching all member users with assigned licenses...'
    $users = (gGet '/users' @{
        '$filter' = "userType eq 'Member' and assignedLicenses/`$count ne 0"
        '$select' = 'id,displayName,userPrincipalName,accountEnabled'
        '$count'  = 'true'
        '$top'    = $Top
    }).value

    Write-Verbose "Checking MFA methods for $($users.Count) users..."
    foreach ($u in $users) {
        $methods = try { (gGet "/users/$($u.id)/authentication/methods").value } catch { @() }
        $mfaCount = ($methods | Where-Object { $_.'@odata.type' -notlike '*password*' }).Count
        if ($mfaCount -eq 0) {
            [PSCustomObject]@{
                DisplayName       = $u.displayName
                UserPrincipalName = $u.userPrincipalName
                AccountEnabled    = $u.accountEnabled
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHMFAGap

function Get-SVHUserLicenses {
    <#
    .SYNOPSIS  Get license assignments for a user.
    .EXAMPLE   Get-SVHUserLicenses jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity
    )
    process { (gGet "/users/$Identity/licenseDetails").value }
}
Export-ModuleMember -Function Get-SVHUserLicenses

function Get-SVHLicenseWaste {
    <#
    .SYNOPSIS  Find licensed users who have not signed in within N days.
    .DESCRIPTION
        Useful for identifying licenses that can be reclaimed.
        Requires AuditLog.Read.All (needed for signInActivity).
    .EXAMPLE   Get-SVHLicenseWaste -InactiveDays 60
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [int]$InactiveDays = 30,
        [int]$Top          = 500
    )
    $cutoff = (Get-Date).AddDays(-$InactiveDays).ToUniversalTime().ToString('o')
    $users  = (gGet '/users' @{
        '$filter' = "userType eq 'Member' and assignedLicenses/`$count ne 0"
        '$select' = 'id,displayName,userPrincipalName,accountEnabled,signInActivity,assignedLicenses'
        '$count'  = 'true'
        '$top'    = $Top
    }).value

    $users | Where-Object {
        -not $_.signInActivity -or
        (-not $_.signInActivity.lastSignInDateTime) -or
        ($_.signInActivity.lastSignInDateTime -lt $cutoff)
    } | ForEach-Object {
        [PSCustomObject]@{
            DisplayName       = $_.displayName
            UserPrincipalName = $_.userPrincipalName
            AccountEnabled    = $_.accountEnabled
            LastSignIn        = $_.signInActivity?.lastSignInDateTime ?? 'Never'
            LicenseCount      = $_.assignedLicenses.Count
        }
    } | Sort-Object LastSignIn
}
Export-ModuleMember -Function Get-SVHLicenseWaste

function Get-SVHTenantSubscriptions {
    <#
    .SYNOPSIS  List all license SKUs — total seats, consumed, and available.
    .EXAMPLE   Get-SVHTenantSubscriptions | Format-Table -AutoSize
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/subscribedSkus').value | ForEach-Object {
        [PSCustomObject]@{
            SKU         = $_.skuPartNumber
            Total       = $_.prepaidUnits.enabled
            Consumed    = $_.consumedUnits
            Available   = $_.prepaidUnits.enabled - $_.consumedUnits
            CapabilityStatus = $_.capabilityStatus
        }
    } | Sort-Object Available
}
Export-ModuleMember -Function Get-SVHTenantSubscriptions

function Get-SVHTenantDomains {
    <#
    .SYNOPSIS  List all domains registered in the tenant.
    .EXAMPLE   Get-SVHTenantDomains
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/domains').value
}
Export-ModuleMember -Function Get-SVHTenantDomains

# ── VERIFY: Sign-in & Audit Logs ───────────────────────────────────────────────

function Get-SVHSignInLogs {
    <#
    .SYNOPSIS  Query Entra ID sign-in logs with flexible filters.
    .EXAMPLE   Get-SVHSignInLogs -Identity jdoe@shoestringvalley.com -Hours 48 -Status failure
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Alias('UPN')][string]$Identity,
        [string]$AppDisplayName,
        [string]$IpAddress,
        [ValidateSet('success','failure','all')][string]$Status = 'all',
        [int]$Hours = 24,
        [int]$Top   = 100
    )
    $since   = (Get-Date).AddHours(-$Hours).ToUniversalTime().ToString('o')
    $filters = @("createdDateTime ge $since")
    if ($Identity)       { $filters += "userPrincipalName eq '$Identity'" }
    if ($AppDisplayName) { $filters += "appDisplayName eq '$AppDisplayName'" }
    if ($IpAddress)      { $filters += "ipAddress eq '$IpAddress'" }
    if ($Status -eq 'success') { $filters += 'status/errorCode eq 0' }
    if ($Status -eq 'failure') { $filters += 'status/errorCode ne 0' }

    (gGet '/auditLogs/signIns' @{
        '$filter'  = $filters -join ' and '
        '$top'     = $Top
        '$orderby' = 'createdDateTime desc'
        '$select'  = 'id,createdDateTime,userDisplayName,userPrincipalName,appDisplayName,ipAddress,location,status,conditionalAccessStatus,mfaDetail,deviceDetail,riskLevelDuringSignIn,clientAppUsed'
    }).value
}
Export-ModuleMember -Function Get-SVHSignInLogs

function Get-SVHAuditLog {
    <#
    .SYNOPSIS  Query Entra directory audit logs — user/group/role/app/policy changes.
    .EXAMPLE   Get-SVHAuditLog -Category RoleManagement -Hours 72
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$Category,
        [string]$InitiatedBy,
        [int]$Hours = 24,
        [int]$Top   = 50
    )
    $since   = (Get-Date).AddHours(-$Hours).ToUniversalTime().ToString('o')
    $filters = @("activityDateTime ge $since")
    if ($Category)    { $filters += "category eq '$Category'" }
    if ($InitiatedBy) { $filters += "initiatedBy/user/userPrincipalName eq '$InitiatedBy'" }

    (gGet '/auditLogs/directoryAudits' @{
        '$filter'  = $filters -join ' and '
        '$top'     = $Top
        '$orderby' = 'activityDateTime desc'
        '$select'  = 'id,activityDateTime,activityDisplayName,category,result,resultReason,initiatedBy,targetResources'
    }).value
}
Export-ModuleMember -Function Get-SVHAuditLog

# ── VERIFY: Risky Users, App Registrations, CA Policies ───────────────────────

function Get-SVHRiskyUsers {
    <#
    .SYNOPSIS  List users flagged by Entra Identity Protection. Requires Entra P2.
    .EXAMPLE   Get-SVHRiskyUsers -RiskLevel high
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('low','medium','high','all')][string]$RiskLevel = 'high',
        [int]$Top = 25
    )
    $params = @{
        '$top'    = $Top
        '$select' = 'id,userDisplayName,userPrincipalName,riskLevel,riskState,riskDetail,riskLastUpdatedDateTime'
    }
    if ($RiskLevel -ne 'all') { $params['$filter'] = "riskLevel eq '$RiskLevel'" }
    (gGet '/identityProtection/riskyUsers' $params).value
}
Export-ModuleMember -Function Get-SVHRiskyUsers

function Get-SVHAppSecrets {
    <#
    .SYNOPSIS  Find app registration secrets and certificates expiring within N days.
    .EXAMPLE   Get-SVHAppSecrets -ExpiringWithinDays 60 | Format-Table -AutoSize
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$ExpiringWithinDays = 30)

    $cutoff = (Get-Date).AddDays($ExpiringWithinDays).ToUniversalTime().ToString('o')
    $now    = (Get-Date).ToUniversalTime().ToString('o')
    $apps   = (gGet '/applications' @{
        '$select' = 'id,displayName,appId,passwordCredentials,keyCredentials'
        '$top'    = 200
    }).value

    foreach ($app in $apps) {
        $creds = @(
            $app.passwordCredentials | ForEach-Object { $_ | Add-Member -Force -NotePropertyName credType -NotePropertyValue 'secret'      -PassThru }
            $app.keyCredentials      | ForEach-Object { $_ | Add-Member -Force -NotePropertyName credType -NotePropertyValue 'certificate' -PassThru }
        )
        foreach ($c in $creds) {
            if ($c.endDateTime -and $c.endDateTime -lt $cutoff) {
                [PSCustomObject]@{
                    AppName    = $app.displayName
                    AppId      = $app.appId
                    CredType   = $c.credType
                    ExpiresAt  = $c.endDateTime
                    Expired    = $c.endDateTime -lt $now
                    Hint       = $c.hint
                }
            }
        }
    } | Sort-Object ExpiresAt
}
Export-ModuleMember -Function Get-SVHAppSecrets

function Get-SVHConditionalAccessPolicies {
    <#
    .SYNOPSIS  List CA policies with their state and conditions.
    .EXAMPLE   Get-SVHConditionalAccessPolicies -State disabled
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([ValidateSet('enabled','disabled','enabledForReportingButNotEnforced','all')][string]$State = 'all')
    $params = @{}
    if ($State -ne 'all') { $params['$filter'] = "state eq '$State'" }
    (gGet '/identity/conditionalAccess/policies' $params).value
}
Export-ModuleMember -Function Get-SVHConditionalAccessPolicies

function Get-SVHDirectoryRoles {
    <#
    .SYNOPSIS  List active directory roles. Optionally filter by name.
    .EXAMPLE   Get-SVHDirectoryRoles -Name 'Global Administrator'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$Name)
    $roles = (gGet '/directoryRoles' @{ '$select' = 'id,displayName,description,roleTemplateId' }).value
    if ($Name) { $roles = $roles | Where-Object { $_.displayName -like "*$Name*" } }
    $roles
}
Export-ModuleMember -Function Get-SVHDirectoryRoles

function Get-SVHDirectoryRoleMembers {
    <#
    .SYNOPSIS  Who holds a given directory role (e.g. Global Administrator).
    .EXAMPLE   Get-SVHDirectoryRoles -Name 'Global Administrator' | Get-SVHDirectoryRoleMembers
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$RoleId
    )
    process {
        (gGet "/directoryRoles/$RoleId/members" @{
            '$select' = 'id,displayName,userPrincipalName,mail'
        }).value
    }
}
Export-ModuleMember -Function Get-SVHDirectoryRoleMembers

function Get-SVHGroupMembers {
    <#
    .SYNOPSIS  List members of an M365 group or security group.
    .EXAMPLE   Get-SVHGroupMembers -GroupId 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    #>
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
Export-ModuleMember -Function Get-SVHGroupMembers

# ── VERIFY: Intune ─────────────────────────────────────────────────────────────

function Get-SVHIntuneDevice {
    <#
    .SYNOPSIS  Query Intune-managed devices with optional OS and compliance filters.
    .EXAMPLE   Get-SVHIntuneDevice -OS Windows -Compliance noncompliant
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
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
        '$select' = 'id,deviceName,operatingSystem,osVersion,complianceState,lastSyncDateTime,userPrincipalName,isEncrypted,managedDeviceOwnerType,enrolledDateTime'
        '$top'    = 200
    }
    if ($filters) { $params['$filter'] = $filters -join ' and ' }
    (gGet '/deviceManagement/managedDevices' $params).value
}
Export-ModuleMember -Function Get-SVHIntuneDevice

function Get-SVHStaleIntuneDevices {
    <#
    .SYNOPSIS  Find Intune-managed devices that haven't synced in N days.
    .EXAMPLE   Get-SVHStaleIntuneDevices -DaysSinceSync 30
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$DaysSinceSync = 14)
    $cutoff = (Get-Date).AddDays(-$DaysSinceSync).ToUniversalTime().ToString('o')
    (gGet '/deviceManagement/managedDevices' @{
        '$filter' = "lastSyncDateTime le $cutoff"
        '$select' = 'id,deviceName,operatingSystem,lastSyncDateTime,userPrincipalName,complianceState'
        '$top'    = 200
    }).value | Sort-Object lastSyncDateTime
}
Export-ModuleMember -Function Get-SVHStaleIntuneDevices

function Get-SVHIntuneDeviceCompliance {
    <#
    .SYNOPSIS  Get compliance policy states for a specific Intune device.
    .EXAMPLE   Get-SVHIntuneDeviceCompliance -DeviceId 'xxx'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$DeviceId
    )
    process {
        (gGet "/deviceManagement/managedDevices/$DeviceId/deviceCompliancePolicyStates").value
    }
}
Export-ModuleMember -Function Get-SVHIntuneDeviceCompliance

function Get-SVHIntuneCompliancePolicies {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/deviceManagement/deviceCompliancePolicies' @{ '$select' = 'id,displayName,@odata.type,lastModifiedDateTime' }).value
}
Export-ModuleMember -Function Get-SVHIntuneCompliancePolicies

function Get-SVHIntuneConfigProfiles {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/deviceManagement/deviceConfigurations' @{ '$select' = 'id,displayName,@odata.type,lastModifiedDateTime' }).value
}
Export-ModuleMember -Function Get-SVHIntuneConfigProfiles

# ── ACT: User Account Management ──────────────────────────────────────────────

function Set-SVHUserEnabled {
    <#
    .SYNOPSIS  Enable or disable an Entra user account.
    .NOTES     Requires User.EnableDisableAccount.All or User.ReadWrite.All.
               Managed by: ma_stevens@shoestringvalley.com
    .EXAMPLE   Set-SVHUserEnabled -Identity jdoe@shoestringvalley.com -Enabled $false -WhatIf
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity,
        [Parameter(Mandatory)][bool]$Enabled
    )
    process {
        $action = if ($Enabled) { 'Enable' } else { 'Disable' }
        if ($PSCmdlet.ShouldProcess($Identity, "$action account")) {
            gPatch "/users/$Identity" @{ accountEnabled = $Enabled }
            Write-Verbose "$action complete for $Identity"
        }
    }
}
Export-ModuleMember -Function Set-SVHUserEnabled

function Reset-SVHUserPassword {
    <#
    .SYNOPSIS  Force a password reset for an Entra user.
    .NOTES     Managed by: ma_stevens@shoestringvalley.com
    .EXAMPLE   Reset-SVHUserPassword -Identity jdoe@shoestringvalley.com -NewPassword 'Temp!2026'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity,
        [Parameter(Mandatory)][string]$NewPassword,
        [bool]$ForceChangeAtNextSignIn = $true
    )
    process {
        if ($PSCmdlet.ShouldProcess($Identity, 'Reset password')) {
            gPatch "/users/$Identity" @{
                passwordProfile = @{
                    password                      = $NewPassword
                    forceChangePasswordNextSignIn = $ForceChangeAtNextSignIn
                }
            }
            Write-Verbose "Password reset for $Identity (force change: $ForceChangeAtNextSignIn)"
        }
    }
}
Export-ModuleMember -Function Reset-SVHUserPassword

function New-SVHTemporaryAccessPass {
    <#
    .SYNOPSIS  Issue a Temporary Access Pass for MFA recovery.
    .NOTES     Managed by: ma_stevens@shoestringvalley.com
    .EXAMPLE   New-SVHTemporaryAccessPass -Identity jdoe@shoestringvalley.com -LifetimeMinutes 60
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity,
        [int]$LifetimeMinutes = 60,
        [bool]$IsUsableOnce   = $true
    )
    process {
        if ($PSCmdlet.ShouldProcess($Identity, "Issue TAP (${LifetimeMinutes}min)")) {
            $r = gPost "/users/$Identity/authentication/temporaryAccessPassMethods" @{
                '@odata.type'     = '#microsoft.graph.temporaryAccessPassAuthenticationMethod'
                lifetimeInMinutes = $LifetimeMinutes
                isUsableOnce      = $IsUsableOnce
            }
            Write-Verbose "TAP created for $Identity, expires in $LifetimeMinutes minutes"
            $r
        }
    }
}
Export-ModuleMember -Function New-SVHTemporaryAccessPass

function Remove-SVHUserMFAMethod {
    <#
    .SYNOPSIS  Remove a specific MFA method from a user.
    .NOTES     Use Get-SVHUserMFA to find method IDs first.
    .EXAMPLE   Get-SVHUserMFA jdoe@svh.com | Where-Object '@odata.type' -like '*phone*' | Remove-SVHUserMFAMethod -Identity jdoe@svh.com
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$MethodId
    )
    process {
        if ($PSCmdlet.ShouldProcess($Identity, "Remove MFA method $MethodId")) {
            gDel "/users/$Identity/authentication/methods/$MethodId"
            Write-Verbose "MFA method $MethodId removed from $Identity"
        }
    }
}
Export-ModuleMember -Function Remove-SVHUserMFAMethod

function Invoke-SVHDismissRiskyUser {
    <#
    .SYNOPSIS  Dismiss Identity Protection risk flag on one or more users.
    .EXAMPLE   Get-SVHRiskyUsers | Invoke-SVHDismissRiskyUser
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string[]]$UserId
    )
    begin { $ids = @() }
    process { $ids += $UserId }
    end {
        if ($PSCmdlet.ShouldProcess("$($ids.Count) user(s)", 'Dismiss Identity Protection risk')) {
            gPost '/identityProtection/riskyUsers/dismiss' @{ userIds = $ids }
            Write-Verbose "Risk dismissed for $($ids.Count) user(s)"
        }
    }
}
Export-ModuleMember -Function Invoke-SVHDismissRiskyUser

function Revoke-SVHUserSessions {
    <#
    .SYNOPSIS  Invalidate all active sign-in sessions for a user.
    .EXAMPLE   Revoke-SVHUserSessions -Identity jdoe@shoestringvalley.com
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN','UserPrincipalName')]
        [string]$Identity
    )
    process {
        if ($PSCmdlet.ShouldProcess($Identity, 'Revoke all sign-in sessions')) {
            gPost "/users/$Identity/revokeSignInSessions" @{}
            Write-Verbose "Sessions revoked for $Identity"
        }
    }
}
Export-ModuleMember -Function Revoke-SVHUserSessions

function Add-SVHGroupMember {
    <#
    .SYNOPSIS  Add a user to an M365 group or security group.
    .EXAMPLE   Add-SVHGroupMember -GroupId 'xxx' -UserObjectId 'yyy'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$GroupId,
        [Parameter(Mandatory)][string]$UserObjectId
    )
    if ($PSCmdlet.ShouldProcess($UserObjectId, "Add to group $GroupId")) {
        gPost "/groups/$GroupId/members/`$ref" @{
            '@odata.id' = "https://graph.microsoft.com/v1.0/directoryObjects/$UserObjectId"
        }
        Write-Verbose "$UserObjectId added to group $GroupId"
    }
}
Export-ModuleMember -Function Add-SVHGroupMember

function Remove-SVHGroupMember {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$GroupId,
        [Parameter(Mandatory)][string]$UserObjectId
    )
    if ($PSCmdlet.ShouldProcess($UserObjectId, "Remove from group $GroupId")) {
        gDel "/groups/$GroupId/members/$UserObjectId/`$ref"
        Write-Verbose "$UserObjectId removed from group $GroupId"
    }
}
Export-ModuleMember -Function Remove-SVHGroupMember

function Set-SVHUserLicense {
    <#
    .SYNOPSIS  Assign or remove license SKUs for a user.
    .EXAMPLE   Set-SVHUserLicense -Identity jdoe@svh.com -AddSkuIds @('sku-id-1')
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$Identity,
        [string[]]$AddSkuIds    = @(),
        [string[]]$RemoveSkuIds = @()
    )
    if ($PSCmdlet.ShouldProcess($Identity, "Update licenses (add: $($AddSkuIds.Count), remove: $($RemoveSkuIds.Count))")) {
        gPost "/users/$Identity/assignLicense" @{
            addLicenses    = $AddSkuIds    | ForEach-Object { @{ skuId = $_ } }
            removeLicenses = $RemoveSkuIds
        }
        Write-Verbose "Licenses updated for $Identity"
    }
}
Export-ModuleMember -Function Set-SVHUserLicense

function Sync-SVHIntuneDevice {
    <#
    .SYNOPSIS  Trigger an Intune sync for a managed device.
    .EXAMPLE   Get-SVHIntuneDevice -OS Windows | Where-Object complianceState -eq 'noncompliant' | Sync-SVHIntuneDevice
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$DeviceId
    )
    process {
        if ($PSCmdlet.ShouldProcess($DeviceId, 'Trigger Intune sync')) {
            gPost "/deviceManagement/managedDevices/$DeviceId/syncDevice" @{}
            Write-Verbose "Intune sync triggered for device $DeviceId"
        }
    }
}
Export-ModuleMember -Function Sync-SVHIntuneDevice
