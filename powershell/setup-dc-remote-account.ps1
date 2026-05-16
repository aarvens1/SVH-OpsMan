<#
.SYNOPSIS
    Create ra_stevens — the read-only PSRemoting account for Desktop Commander.

.DESCRIPTION
    Creates a minimal service account used by Desktop Commander for diagnostic
    PSRemoting queries (Get-WinEvent, Get-Process, Get-Service, Test-NetConnection,
    network adapter/IP/route queries, DHCP lease lookups).

    What the account can do:
      - Connect via WinRM / PSRemoting to domain-joined servers
      - Read Security, System, and Application event logs
      - Query processes, services, disks, network config (non-admin readable)
      - Read DHCP scopes and leases (on DHCP server, via DHCP Users)
      - Connect via WinRM to non-domain servers using local account

    What it cannot do:
      - Modify any AD object, group, or policy
      - Stop, start, or restart services
      - Reboot or shut down servers
      - Access restricted file paths or admin shares
      - Run anything requiring elevation
      - Read DNS zone data (requires DNS Admins — use da_stevens for that)

    Naming: fits the existing *a_stevens convention (sa, da, ma, aa → ra).

.PARAMETER DomainController
    DC to run AD operations against. E.g. ACCODC01.

.PARAMETER ServiceAccountOU
    OU where the account lands. Adjust to match your AD structure.
    Default: OU=Service Accounts,DC=andersen-cost,DC=com

.PARAMETER DomainAdminCredential
    da_stevens domain admin credential. Prompted interactively if not supplied.

.PARAMETER DhcpServer
    Hostname or IP of the Windows DHCP server. When supplied, ra_stevens is added
    to the local DHCP Users group on that server.
    Requires sa_stevens PSRemoting access to the DHCP server.

.PARAMETER TargetServers
    Optional list of domain-joined servers to explicitly configure (local group +
    WinRM session ACL). Use for servers not covered by a GPO Restricted Groups policy.
    Requires sa_stevens PSRemoting access to each server.

.PARAMETER NonDomainServers
    Optional list of non-domain-joined servers (hostname or IP) on which to create
    a matching local ra_stevens account. The same password is used for consistency.
    Requires a local admin credential for each server (-NonDomainAdminCredential).

.PARAMETER NonDomainAdminCredential
    Local administrator credential for the non-domain servers.
    Prompted interactively if -NonDomainServers is supplied and this is omitted.

.EXAMPLE
    # Minimal — AD account + domain groups only
    .\setup-dc-remote-account.ps1 -DomainController ACCODC01

.EXAMPLE
    # AD account + DHCP Users on DHCP server
    .\setup-dc-remote-account.ps1 -DomainController ACCODC01 -DhcpServer ACCODHCP01

.EXAMPLE
    # Full — AD account, DHCP Users, explicit server config, and non-domain servers
    .\setup-dc-remote-account.ps1 -DomainController ACCODC01 `
        -DhcpServer ACCODHCP01 `
        -TargetServers ACCOSERVER01, ACCOSQL01 `
        -NonDomainServers 10.1.1.50, 10.1.1.51

.NOTES
    After running:
      1. Copy the generated password into the SVH OpsMan BW item:
             DC_REMOTE_USER     ra_stevens@andersen-cost.com
             DC_REMOTE_PASSWORD <password printed below>
      2. If you have a GPO "Restricted Groups" or "Group Policy Preferences" for
         Remote Management Users and Event Log Readers, add ACCO\ra_stevens there
         to cover all domain servers automatically. Otherwise use -TargetServers.
      3. Run: export DC_REMOTE_PASSWORD=$(bw get password "DC Remote Account")
         in your WSL session (or add to .bashrc alongside BW_SESSION).
      4. For non-domain servers — add each to WinRM TrustedHosts on your WSL client:
             pwsh -Command "Set-Item WSMan:\localhost\Client\TrustedHosts -Value '10.1.1.50' -Concatenate -Force"
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$DomainController,

    [string]$ServiceAccountOU = 'OU=Service Accounts,DC=andersen-cost,DC=com',

    [System.Management.Automation.PSCredential]$DomainAdminCredential,

    [string]$DhcpServer,

    [string[]]$TargetServers = @(),

    [string[]]$NonDomainServers = @(),

    [System.Management.Automation.PSCredential]$NonDomainAdminCredential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Helpers ────────────────────────────────────────────────────────────────────

function Write-Step  { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

function New-SecurePassword {
    $chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+'
    -join ((1..32) | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Add-LocalGroupMemberSafe {
    param([string]$Server, [System.Management.Automation.PSCredential]$Cred,
          [string]$Group, [string]$WinNTPath)
    Invoke-Command -ComputerName $Server -Credential $Cred -ScriptBlock {
        param($g, $member)
        $grp = [ADSI]"WinNT://./$g,group"
        try {
            $grp.Add($member)
            Write-Output "    + $g"
        } catch {
            if ($_.Exception.Message -like '*already*') {
                Write-Output "    ~ $g (already member)"
            } else { throw }
        }
    } -ArgumentList $Group, $WinNTPath
}

# ── Credentials ────────────────────────────────────────────────────────────────

if (-not $DomainAdminCredential) {
    $DomainAdminCredential = Get-Credential -UserName 'ACCO\da_stevens' `
        -Message 'Domain admin credential (da_stevens) required'
}

$dcSession = @{
    ComputerName = $DomainController
    Credential   = $DomainAdminCredential
}

$plainPassword  = New-SecurePassword
$securePassword = ConvertTo-SecureString $plainPassword -AsPlainText -Force

# ── Step 1: Create the AD account ─────────────────────────────────────────────

Write-Step "Creating ra_stevens AD account"

$accountExists = Invoke-Command @dcSession -ScriptBlock {
    param($OU)
    try { Get-ADUser -Identity 'ra_stevens' -ErrorAction Stop | Out-Null; $true }
    catch { $false }
} -ArgumentList $ServiceAccountOU

if ($accountExists) {
    Write-Warn "ra_stevens already exists — skipping account creation. Password will not be reset."
    Write-Warn "To reset: Set-ADAccountPassword -Identity ra_stevens -NewPassword (Read-Host -AsSecureString)"
} else {
    if ($PSCmdlet.ShouldProcess('ra_stevens@andersen-cost.com', 'Create AD user')) {
        Invoke-Command @dcSession -ScriptBlock {
            param($OU, $pw)
            New-ADUser `
                -Name                 'ra_stevens' `
                -SamAccountName       'ra_stevens' `
                -UserPrincipalName    'ra_stevens@andersen-cost.com' `
                -DisplayName          'Desktop Commander Remote Access' `
                -Description          'Read-only PSRemoting for Desktop Commander diagnostic queries. Managed by SVH OpsMan.' `
                -Path                 $OU `
                -AccountPassword      $pw `
                -PasswordNeverExpires  $true `
                -CannotChangePassword  $true `
                -Enabled               $true
        } -ArgumentList $ServiceAccountOU, $securePassword
        Write-Ok "Account created: ra_stevens@andersen-cost.com"
    }
}

# ── Step 2: Domain group memberships ──────────────────────────────────────────

Write-Step "Adding to domain groups"

$domainGroups = @(
    'Remote Management Users',   # WinRM access without local admin
    'Event Log Readers'          # Read Security, System, Application logs
)

foreach ($group in $domainGroups) {
    $alreadyMember = Invoke-Command @dcSession -ScriptBlock {
        param($g)
        (Get-ADGroupMember -Identity $g -Recursive |
            Where-Object SamAccountName -eq 'ra_stevens').Count -gt 0
    } -ArgumentList $group

    if ($alreadyMember) {
        Write-Ok "Already in: $group"
    } else {
        if ($PSCmdlet.ShouldProcess($group, 'Add ra_stevens')) {
            Invoke-Command @dcSession -ScriptBlock {
                param($g)
                Add-ADGroupMember -Identity $g -Members 'ra_stevens'
            } -ArgumentList $group
            Write-Ok "Added to: $group"
        }
    }
}

# ── Step 3: DHCP Users on DHCP server (optional) ──────────────────────────────

if ($DhcpServer) {
    Write-Step "Adding to DHCP Users on $DhcpServer"

    $serverCred = Get-Credential -UserName 'sa_stevens@andersen-cost.com' `
        -Message "sa_stevens credential for PSRemoting to $DhcpServer"

    try {
        Add-LocalGroupMemberSafe -Server $DhcpServer -Cred $serverCred `
            -Group 'DHCP Users' -WinNTPath 'WinNT://ACCO/ra_stevens,user'
        Write-Ok $DhcpServer
    } catch {
        Write-Fail "${DhcpServer}: $($_.Exception.Message)"
    }
}

# ── Step 4: Per-server WinRM config for domain-joined servers (optional) ───────

if ($TargetServers.Count -gt 0) {
    Write-Step "Configuring domain-joined target servers"

    if (-not (Get-Variable serverCred -ErrorAction SilentlyContinue)) {
        $serverCred = Get-Credential -UserName 'sa_stevens@andersen-cost.com' `
            -Message 'sa_stevens credential for PSRemoting to target servers'
    }

    foreach ($server in $TargetServers) {
        Write-Host "  Configuring $server…" -ForegroundColor DarkGray
        try {
            Invoke-Command -ComputerName $server -Credential $serverCred -ScriptBlock {
                # Local Remote Management Users
                $rmGroup = [ADSI]"WinNT://./Remote Management Users,group"
                try { $rmGroup.Add("WinNT://ACCO/ra_stevens,user"); Write-Output "    + Local Remote Management Users" }
                catch { if ($_.Exception.Message -like '*already*') { Write-Output "    ~ Local Remote Management Users (already member)" } else { throw } }

                # Local Event Log Readers
                $elGroup = [ADSI]"WinNT://./Event Log Readers,group"
                try { $elGroup.Add("WinNT://ACCO/ra_stevens,user"); Write-Output "    + Local Event Log Readers" }
                catch { if ($_.Exception.Message -like '*already*') { Write-Output "    ~ Local Event Log Readers (already member)" } else { throw } }

                # WinRM session ACL
                $sddl = (Get-PSSessionConfiguration -Name 'Microsoft.PowerShell' -ErrorAction SilentlyContinue).SecurityDescriptorSddl
                if ($sddl -and $sddl -notmatch 'ra_stevens') {
                    $sid = (New-Object System.Security.Principal.NTAccount('ACCO\ra_stevens')).Translate(
                        [System.Security.Principal.SecurityIdentifier]).Value
                    Set-PSSessionConfiguration -Name 'Microsoft.PowerShell' `
                        -SecurityDescriptorSddl "$sddl(A;;GA;;;$sid)" -Force -NoServiceRestart
                    Write-Output "    + WinRM session ACL updated"
                } else {
                    Write-Output "    ~ WinRM session ACL (already present or could not read)"
                }
            }
            Write-Ok $server
        } catch {
            Write-Fail "${server}: $($_.Exception.Message)"
        }
    }
}

# ── Step 5: Local account on non-domain servers (optional) ────────────────────

if ($NonDomainServers.Count -gt 0) {
    Write-Step "Creating local ra_stevens on non-domain servers"

    if (-not $NonDomainAdminCredential) {
        $NonDomainAdminCredential = Get-Credential `
            -Message 'Local administrator credential for non-domain servers'
    }

    foreach ($server in $NonDomainServers) {
        Write-Host "  Configuring $server…" -ForegroundColor DarkGray
        try {
            Invoke-Command -ComputerName $server -Credential $NonDomainAdminCredential `
                -Authentication Negotiate -ScriptBlock {
                param($pw, $plainPw)

                $exists = Get-LocalUser -Name 'ra_stevens' -ErrorAction SilentlyContinue
                if ($exists) {
                    Write-Output "    ~ Local user ra_stevens already exists — password updated"
                    Set-LocalUser -Name 'ra_stevens' -Password $pw
                } else {
                    New-LocalUser `
                        -Name                 'ra_stevens' `
                        -Password              $pw `
                        -FullName             'Desktop Commander Remote Access' `
                        -Description          'Read-only PSRemoting for Desktop Commander. Managed by SVH OpsMan.' `
                        -PasswordNeverExpires  $true `
                        -UserMayNotChangePassword $true
                    Write-Output "    + Local user ra_stevens created"
                }

                # Remote Management Users
                try { Add-LocalGroupMember -Group 'Remote Management Users' -Member 'ra_stevens'; Write-Output "    + Remote Management Users" }
                catch { if ($_.Exception.Message -like '*already*') { Write-Output "    ~ Remote Management Users (already member)" } else { throw } }

                # Event Log Readers
                try { Add-LocalGroupMember -Group 'Event Log Readers' -Member 'ra_stevens'; Write-Output "    + Event Log Readers" }
                catch { if ($_.Exception.Message -like '*already*') { Write-Output "    ~ Event Log Readers (already member)" } else { throw } }

                # WinRM session ACL
                $sddl = (Get-PSSessionConfiguration -Name 'Microsoft.PowerShell' -ErrorAction SilentlyContinue).SecurityDescriptorSddl
                if ($sddl) {
                    $sid = (New-Object System.Security.Principal.NTAccount('ra_stevens')).Translate(
                        [System.Security.Principal.SecurityIdentifier]).Value
                    if ($sddl -notmatch $sid) {
                        Set-PSSessionConfiguration -Name 'Microsoft.PowerShell' `
                            -SecurityDescriptorSddl "$sddl(A;;GA;;;$sid)" -Force -NoServiceRestart
                        Write-Output "    + WinRM session ACL updated"
                    } else {
                        Write-Output "    ~ WinRM session ACL (already present)"
                    }
                }
            } -ArgumentList $securePassword, $plainPassword
            Write-Ok $server
        } catch {
            Write-Fail "${server}: $($_.Exception.Message)"
            Write-Warn "  Ensure $server is in WSMan:\localhost\Client\TrustedHosts before re-running."
        }
    }
}

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host "`n$('─' * 60)" -ForegroundColor DarkGray
Write-Host "`nAccount ready: ra_stevens@andersen-cost.com" -ForegroundColor Cyan
Write-Host "Domain groups: Remote Management Users, Event Log Readers" -ForegroundColor Cyan
if ($DhcpServer)               { Write-Host "DHCP server:   $DhcpServer (DHCP Users)" -ForegroundColor Cyan }
if ($TargetServers.Count -gt 0) { Write-Host "Domain servers configured: $($TargetServers -join ', ')" -ForegroundColor Cyan }
if ($NonDomainServers.Count -gt 0) { Write-Host "Non-domain servers: $($NonDomainServers -join ', ')" -ForegroundColor Cyan }

if (-not $accountExists) {
    Write-Host "`nPassword — store in Bitwarden SVH OpsMan item:" -ForegroundColor Yellow
    Write-Host "  DC_REMOTE_USER     ra_stevens@andersen-cost.com" -ForegroundColor White
    Write-Host "  DC_REMOTE_PASSWORD $plainPassword" -ForegroundColor White
    Write-Host "`nClear your terminal history after copying this password." -ForegroundColor DarkGray
}

Write-Host @"

Next steps:
  1. Add DC_REMOTE_USER + DC_REMOTE_PASSWORD to the SVH OpsMan BW item
  2. Domain servers covered by GPO Restricted Groups — add ACCO\ra_stevens there
     to cover all servers automatically. Otherwise use -TargetServers.
  3. For non-domain servers — add each to WinRM TrustedHosts from WSL:
       pwsh -Command "Set-Item WSMan:\localhost\Client\TrustedHosts -Value '10.1.1.50' -Concatenate -Force"
  4. Optionally deny interactive logon via GPO:
       User Rights Assignment → 'Deny log on locally' → add ACCO\ra_stevens
  5. Export for Desktop Commander:
       export DC_REMOTE_PASSWORD=`$(bw get password "DC Remote Account")
"@ -ForegroundColor DarkGray
