# SVH.AD.psm1 — On-premises Active Directory management via PSRemoting
# Requires: SVH.Core
# Domain: andersen-cost.com (ACCO)
# Domain controllers: use da_stevens@andersen-cost.com (domain admin tier)
#
# All functions use PSRemoting (Invoke-Command) to a DC — the ActiveDirectory
# module does not need to be installed locally, only on the target DC.
#
# From WSL: requires one-time WinRM trust setup — see references/setup-winrm.md
# Get-Credential: da_stevens@andersen-cost.com (prompted)
#
# Example session setup:
#   $c  = Get-Credential da_stevens@andersen-cost.com
#   $dc = 'ACCODC01.andersen-cost.com'

Set-StrictMode -Version Latest

function script:RemoteParams([string]$ComputerName, [System.Management.Automation.PSCredential]$Credential) {
    $p = @{ ComputerName = $ComputerName; ErrorAction = 'Stop' }
    if ($Credential) { $p['Credential'] = $Credential }
    $p
}

# ── VERIFY: Users ─────────────────────────────────────────────────────────────

function Get-SVHADUser {
    <#
    .SYNOPSIS  Look up an AD user by samAccountName, UPN, or display name.
    .EXAMPLE   Get-SVHADUser -DomainController ACCODC01 -Credential $c -Identity jdoe
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($id)
        Get-ADUser -Identity $id -Properties DisplayName, UserPrincipalName, EmailAddress,
            Enabled, LockedOut, PasswordExpired, PasswordLastSet, PasswordNeverExpires,
            LastLogonDate, BadLogonCount, BadPwdCount, MemberOf, Department, Title,
            DistinguishedName -ErrorAction Stop |
            Select-Object SamAccountName, UserPrincipalName, DisplayName, EmailAddress,
                Department, Title, Enabled, LockedOut, PasswordExpired, PasswordLastSet,
                PasswordNeverExpires, LastLogonDate, BadLogonCount,
                @{ N='Groups'; E={ $_.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace 'CN=' } } },
                DistinguishedName
    } -ArgumentList $Identity
}
Export-ModuleMember -Function Get-SVHADUser

function Get-SVHADLockedAccounts {
    <#
    .SYNOPSIS  Find all currently locked-out AD accounts.
    .EXAMPLE   Get-SVHADLockedAccounts -DomainController ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        Search-ADAccount -LockedOut |
            Select-Object SamAccountName, UserPrincipalName, DisplayName,
                LockedOut, LastLogonDate, BadLogonCount, DistinguishedName
    }
}
Export-ModuleMember -Function Get-SVHADLockedAccounts

function Get-SVHADStaleUsers {
    <#
    .SYNOPSIS  Find enabled users who have not logged in within the specified number of days.
    .EXAMPLE   Get-SVHADStaleUsers -DomainController ACCODC01 -Credential $c -DaysInactive 90
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [int]$DaysInactive = 90,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($days)
        $cutoff = (Get-Date).AddDays(-$days)
        Get-ADUser -Filter { Enabled -eq $true -and LastLogonDate -lt $cutoff } `
            -Properties DisplayName, UserPrincipalName, LastLogonDate, Department |
            Select-Object SamAccountName, UserPrincipalName, DisplayName,
                Department, LastLogonDate,
                @{ N='DaysSinceLogon'; E={ if($_.LastLogonDate) { [int]((Get-Date) - $_.LastLogonDate).TotalDays } else { 999 } } } |
            Sort-Object DaysSinceLogon -Descending
    } -ArgumentList $DaysInactive
}
Export-ModuleMember -Function Get-SVHADStaleUsers

function Get-SVHADPasswordExpiry {
    <#
    .SYNOPSIS  Find users whose passwords expire within the specified number of days.
    .EXAMPLE   Get-SVHADPasswordExpiry -DomainController ACCODC01 -Credential $c -DaysAhead 14
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [int]$DaysAhead = 14,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($days)
        $defaultPolicy = Get-ADDefaultDomainPasswordPolicy -ErrorAction Stop
        $maxAge        = $defaultPolicy.MaxPasswordAge.TotalDays
        if ($maxAge -le 0) { Write-Warning 'Domain password policy has no max age set — passwords never expire by default policy.'; return }

        $cutoffFrom = (Get-Date).AddDays(-$maxAge)
        $cutoffTo   = (Get-Date).AddDays(-$maxAge + $days)

        Get-ADUser -Filter { Enabled -eq $true -and PasswordNeverExpires -eq $false -and PasswordLastSet -ge $cutoffFrom } `
            -Properties DisplayName, UserPrincipalName, PasswordLastSet, PasswordNeverExpires, EmailAddress |
            Where-Object { $_.PasswordLastSet -and $_.PasswordLastSet -le $cutoffTo } |
            Select-Object SamAccountName, UserPrincipalName, DisplayName, EmailAddress, PasswordLastSet,
                @{ N='ExpiresOn';     E={ $_.PasswordLastSet.AddDays($maxAge).ToString('yyyy-MM-dd') } },
                @{ N='DaysRemaining'; E={ [int]($_.PasswordLastSet.AddDays($maxAge) - (Get-Date)).TotalDays } } |
            Sort-Object DaysRemaining
    } -ArgumentList $DaysAhead
}
Export-ModuleMember -Function Get-SVHADPasswordExpiry

function Get-SVHADDisabledUsers {
    <#
    .SYNOPSIS  List all disabled user accounts (excluding system/service accounts by OU).
    .EXAMPLE   Get-SVHADDisabledUsers -DomainController ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        Get-ADUser -Filter { Enabled -eq $false } `
            -Properties DisplayName, UserPrincipalName, LastLogonDate, Department, WhenChanged |
            Select-Object SamAccountName, UserPrincipalName, DisplayName, Department, LastLogonDate, WhenChanged |
            Sort-Object WhenChanged -Descending
    }
}
Export-ModuleMember -Function Get-SVHADDisabledUsers

# ── ACT: User Management ──────────────────────────────────────────────────────

function Unlock-SVHADAccount {
    <#
    .SYNOPSIS  Unlock a locked-out AD user account.
    .EXAMPLE   Unlock-SVHADAccount -DomainController ACCODC01 -Credential $c -Identity jdoe
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess($Identity, 'Unlock AD account')) {
        Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
            param($id)
            Unlock-ADAccount -Identity $id -ErrorAction Stop
        } -ArgumentList $Identity
        Write-Verbose "Unlocked AD account: $Identity"
    }
}
Export-ModuleMember -Function Unlock-SVHADAccount

function Set-SVHADUserEnabled {
    <#
    .SYNOPSIS  Enable or disable an AD user account.
    .EXAMPLE   Set-SVHADUserEnabled -DomainController ACCODC01 -Credential $c -Identity jdoe -Enabled $false
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory)][bool]$Enabled,
        [System.Management.Automation.PSCredential]$Credential
    )
    $action = if ($Enabled) { 'Enable' } else { 'Disable' }
    if ($PSCmdlet.ShouldProcess($Identity, "$action AD account")) {
        Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
            param($id, $enabled)
            if ($enabled) { Enable-ADAccount -Identity $id -ErrorAction Stop }
            else          { Disable-ADAccount -Identity $id -ErrorAction Stop }
        } -ArgumentList $Identity, $Enabled
        Write-Verbose "${action}d AD account: $Identity"
    }
}
Export-ModuleMember -Function Set-SVHADUserEnabled

function Reset-SVHADPassword {
    <#
    .SYNOPSIS  Reset an AD user's password and optionally force change at next logon.
    .EXAMPLE   Reset-SVHADPassword -DomainController ACCODC01 -Credential $c -Identity jdoe -NewPassword (Read-Host -AsSecureString)
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [Parameter(Mandatory)][securestring]$NewPassword,
        [bool]$ChangeAtLogon = $true,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess($Identity, 'Reset AD password')) {
        Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
            param($id, $pwd, $changeAtLogon)
            Set-ADAccountPassword -Identity $id -NewPassword $pwd -Reset -ErrorAction Stop
            if ($changeAtLogon) {
                Set-ADUser -Identity $id -ChangePasswordAtLogon $true -ErrorAction Stop
            }
        } -ArgumentList $Identity, $NewPassword, $ChangeAtLogon
        Write-Verbose "Password reset for: $Identity"
    }
}
Export-ModuleMember -Function Reset-SVHADPassword

# ── VERIFY: Groups ────────────────────────────────────────────────────────────

function Get-SVHADGroup {
    <#
    .SYNOPSIS  Look up an AD group and its members.
    .EXAMPLE   Get-SVHADGroup -DomainController ACCODC01 -Credential $c -Identity 'IT-Admins'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($id)
        $group   = Get-ADGroup -Identity $id -Properties Description, ManagedBy, GroupScope, GroupCategory -ErrorAction Stop
        $members = Get-ADGroupMember -Identity $id -Recursive -ErrorAction SilentlyContinue |
                   Select-Object SamAccountName, Name, ObjectClass
        [PSCustomObject]@{
            Name         = $group.Name
            DistinguishedName = $group.DistinguishedName
            GroupScope   = $group.GroupScope
            GroupCategory = $group.GroupCategory
            Description  = $group.Description
            ManagedBy    = $group.ManagedBy
            Members      = $members
            MemberCount  = ($members | Measure-Object).Count
        }
    } -ArgumentList $Identity
}
Export-ModuleMember -Function Get-SVHADGroup

function Get-SVHADUserGroups {
    <#
    .SYNOPSIS  List all AD groups a user is a member of.
    .EXAMPLE   Get-SVHADUserGroups -DomainController ACCODC01 -Credential $c -Identity jdoe
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($id)
        $user = Get-ADUser -Identity $id -Properties MemberOf -ErrorAction Stop
        $user.MemberOf | ForEach-Object {
            $g = Get-ADGroup -Identity $_ -Properties Description -ErrorAction SilentlyContinue
            if ($g) {
                [PSCustomObject]@{
                    Name        = $g.Name
                    GroupScope  = $g.GroupScope
                    Description = $g.Description
                }
            }
        } | Sort-Object Name
    } -ArgumentList $Identity
}
Export-ModuleMember -Function Get-SVHADUserGroups

function Add-SVHADGroupMember {
    <#
    .SYNOPSIS  Add a user to an AD group.
    .EXAMPLE   Add-SVHADGroupMember -DomainController ACCODC01 -Credential $c -GroupName 'IT-Admins' -Identity jdoe
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$GroupName,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess($Identity, "Add to group '$GroupName'")) {
        Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
            param($group, $member)
            Add-ADGroupMember -Identity $group -Members $member -ErrorAction Stop
        } -ArgumentList $GroupName, $Identity
        Write-Verbose "Added $Identity to $GroupName"
    }
}
Export-ModuleMember -Function Add-SVHADGroupMember

function Remove-SVHADGroupMember {
    <#
    .SYNOPSIS  Remove a user from an AD group.
    .EXAMPLE   Remove-SVHADGroupMember -DomainController ACCODC01 -Credential $c -GroupName 'IT-Admins' -Identity jdoe
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$GroupName,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    if ($PSCmdlet.ShouldProcess($Identity, "Remove from group '$GroupName'")) {
        Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
            param($group, $member)
            Remove-ADGroupMember -Identity $group -Members $member -Confirm:$false -ErrorAction Stop
        } -ArgumentList $GroupName, $Identity
        Write-Verbose "Removed $Identity from $GroupName"
    }
}
Export-ModuleMember -Function Remove-SVHADGroupMember

# ── VERIFY: Computers ─────────────────────────────────────────────────────────

function Get-SVHADComputer {
    <#
    .SYNOPSIS  Look up a computer object in AD.
    .EXAMPLE   Get-SVHADComputer -DomainController ACCODC01 -Credential $c -Identity ACCOSERVER01
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [Parameter(Mandatory)][string]$Identity,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($id)
        Get-ADComputer -Identity $id -Properties Description, OperatingSystem, OperatingSystemVersion,
            LastLogonDate, Enabled, IPv4Address, DistinguishedName -ErrorAction Stop |
            Select-Object Name, DNSHostName, OperatingSystem, OperatingSystemVersion,
                Enabled, LastLogonDate, IPv4Address,
                @{ N='DaysSinceLogon'; E={ if($_.LastLogonDate) { [int]((Get-Date) - $_.LastLogonDate).TotalDays } else { 999 } } },
                DistinguishedName
    } -ArgumentList $Identity
}
Export-ModuleMember -Function Get-SVHADComputer

function Get-SVHADStaleComputers {
    <#
    .SYNOPSIS  Find computer objects that have not authenticated in the specified number of days.
    .EXAMPLE   Get-SVHADStaleComputers -DomainController ACCODC01 -Credential $c -DaysInactive 90
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [int]$DaysInactive = 90,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        param($days)
        $cutoff = (Get-Date).AddDays(-$days)
        Get-ADComputer -Filter { Enabled -eq $true -and LastLogonDate -lt $cutoff } `
            -Properties OperatingSystem, LastLogonDate |
            Select-Object Name, DNSHostName, OperatingSystem, LastLogonDate,
                @{ N='DaysSinceLogon'; E={ if($_.LastLogonDate) { [int]((Get-Date) - $_.LastLogonDate).TotalDays } else { 999 } } } |
            Sort-Object DaysSinceLogon -Descending
    } -ArgumentList $DaysInactive
}
Export-ModuleMember -Function Get-SVHADStaleComputers

# ── VERIFY: Domain Health ─────────────────────────────────────────────────────

function Get-SVHADDomainInfo {
    <#
    .SYNOPSIS  Return domain-level information — forest, DFL, PDC, password policy.
    .EXAMPLE   Get-SVHADDomainInfo -DomainController ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        $domain = Get-ADDomain -ErrorAction Stop
        $forest = Get-ADForest -ErrorAction Stop
        $policy = Get-ADDefaultDomainPasswordPolicy -ErrorAction Stop
        [PSCustomObject]@{
            DomainName           = $domain.DNSRoot
            NetBIOSName          = $domain.NetBIOSName
            DomainFunctionalLevel = $domain.DomainMode
            ForestFunctionalLevel = $forest.ForestMode
            PDCEmulator          = $domain.PDCEmulator
            RIDMaster            = $domain.RIDMaster
            InfrastructureMaster = $domain.InfrastructureMaster
            DomainControllers    = $domain.ReplicaDirectoryServers
            PasswordMinLength    = $policy.MinPasswordLength
            PasswordMaxAgeDays   = $policy.MaxPasswordAge.Days
            LockoutThreshold     = $policy.LockoutThreshold
            LockoutDurationMins  = $policy.LockoutDuration.TotalMinutes
        }
    }
}
Export-ModuleMember -Function Get-SVHADDomainInfo

function Get-SVHADReplication {
    <#
    .SYNOPSIS  Check AD replication status across all domain controllers.
    .DESCRIPTION
        Runs repadmin /showrepl and parses failure/consecutive-failure counts.
        Any ConsecutiveFailures > 0 warrants investigation.
    .EXAMPLE   Get-SVHADReplication -DomainController ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        $raw = repadmin /showrepl /csv 2>&1
        if ($LASTEXITCODE -ne 0 -and -not $raw) {
            throw "repadmin failed: $raw"
        }
        # Parse CSV output from repadmin /showrepl /csv
        $csv = $raw | ConvertFrom-Csv
        $csv | Select-Object 'Destination DSA', 'Source DSA', 'Naming Context',
            'Number of Failures', 'Last Failure Time', 'Last Success Time',
            @{ N='ConsecutiveFailures'; E={ [int]$_.'Number of Failures' } }
    }
}
Export-ModuleMember -Function Get-SVHADReplication

function Get-SVHADDCSummary {
    <#
    .SYNOPSIS  Summarize all domain controller roles, OS version, and site membership.
    .EXAMPLE   Get-SVHADDCSummary -DomainController ACCODC01 -Credential $c
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$DomainController,
        [System.Management.Automation.PSCredential]$Credential
    )
    Invoke-Command @(RemoteParams $DomainController $Credential) -ScriptBlock {
        Get-ADDomainController -Filter * -ErrorAction Stop |
            Select-Object Name, IPv4Address, Site, IsGlobalCatalog, IsReadOnly,
                OperatingSystem, OperatingSystemVersion,
                @{ N='Roles'; E={ $_.OperationMasterRoles -join ', ' } }
    }
}
Export-ModuleMember -Function Get-SVHADDCSummary
