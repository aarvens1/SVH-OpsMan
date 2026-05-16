<#
.SYNOPSIS
    Create ra_stevens — the read-only PSRemoting account for Desktop Commander.

.DESCRIPTION
    Creates a minimal AD service account used by Desktop Commander for diagnostic
    PSRemoting queries (Get-WinEvent, Get-Process, Get-Service, Test-NetConnection).

    What the account can do:
      - Connect via WinRM / PSRemoting
      - Read Security, System, and Application event logs
      - Query processes, services, and network config (these are non-admin readable)

    What it cannot do:
      - Modify any AD object, group, or policy
      - Stop, start, or restart services
      - Reboot or shut down servers
      - Access restricted file paths or admin shares
      - Run anything requiring elevation

    Naming: fits the existing *a_stevens convention (sa, da, ma, aa → ra).

.PARAMETER DomainController
    DC to run AD operations against. E.g. ACCODC01.

.PARAMETER ServiceAccountOU
    OU where the account lands. Adjust to match your AD structure.
    Default: OU=Service Accounts,DC=andersen-cost,DC=com

.PARAMETER DomainAdminCredential
    da_stevens domain admin credential. Prompted interactively if not supplied.

.PARAMETER TargetServers
    Optional list of servers to explicitly configure (local group + WinRM session ACL).
    Use this for servers not covered by a GPO Restricted Groups policy.
    Requires sa_stevens PSRemoting access to each server.

.EXAMPLE
    # Basic — create account, add to domain groups
    .\setup-dc-remote-account.ps1 -DomainController ACCODC01

.EXAMPLE
    # Also configure specific servers that aren't covered by GPO
    .\setup-dc-remote-account.ps1 -DomainController ACCODC01 -TargetServers ACCOSERVER01, ACCOSQL01

.NOTES
    After running:
      1. Copy the generated password into the SVH OpsMan BW item:
             DC_REMOTE_USER     ra_stevens@andersen-cost.com
             DC_REMOTE_PASSWORD <password printed below>
      2. If you have a GPO "Restricted Groups" or "Group Policy Preferences" for
         Remote Management Users and Event Log Readers, add ACCO\ra_stevens there
         to cover all servers automatically. Otherwise use -TargetServers to configure
         each server explicitly.
      3. Run: export DC_REMOTE_PASSWORD=$(bw get password "DC Remote Account")
         in your WSL session (or add to .bashrc alongside BW_SESSION).
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string]$DomainController,

    [string]$ServiceAccountOU = 'OU=Service Accounts,DC=andersen-cost,DC=com',

    [System.Management.Automation.PSCredential]$DomainAdminCredential,

    [string[]]$TargetServers = @()
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

# ── Credential ─────────────────────────────────────────────────────────────────

if (-not $DomainAdminCredential) {
    $DomainAdminCredential = Get-Credential -UserName 'ACCO\da_stevens' `
        -Message 'Domain admin credential (da_stevens) required to create AD account'
}

$dcSession = @{
    ComputerName = $DomainController
    Credential   = $DomainAdminCredential
}

# ── Step 1: Create the AD account ─────────────────────────────────────────────

Write-Step "Creating ra_stevens AD account"

$plainPassword = New-SecurePassword
$securePassword = ConvertTo-SecureString $plainPassword -AsPlainText -Force

$accountExists = Invoke-Command @dcSession -ScriptBlock {
    param($OU)
    try {
        Get-ADUser -Identity 'ra_stevens' -ErrorAction Stop | Out-Null
        $true
    } catch { $false }
} -ArgumentList $ServiceAccountOU

if ($accountExists) {
    Write-Warn "ra_stevens already exists — skipping account creation. Password will not be reset."
    Write-Warn "To reset the password manually: Set-ADAccountPassword -Identity ra_stevens -NewPassword (Read-Host -AsSecureString)"
} else {
    if ($PSCmdlet.ShouldProcess('ra_stevens@andersen-cost.com', 'Create AD user')) {
        Invoke-Command @dcSession -ScriptBlock {
            param($OU, $pw)

            $params = @{
                Name                  = 'ra_stevens'
                SamAccountName        = 'ra_stevens'
                UserPrincipalName     = 'ra_stevens@andersen-cost.com'
                DisplayName           = 'Desktop Commander Remote Access'
                Description           = 'Read-only PSRemoting for Desktop Commander diagnostic queries. Managed by SVH OpsMan.'
                Path                  = $OU
                AccountPassword       = $pw
                PasswordNeverExpires  = $true
                CannotChangePassword  = $true
                Enabled               = $true
            }
            New-ADUser @params
        } -ArgumentList $ServiceAccountOU, $securePassword

        Write-Ok "Account created: ra_stevens@andersen-cost.com"
    }
}

# ── Step 2: Domain group memberships ──────────────────────────────────────────

Write-Step "Adding to domain groups"

$groups = @(
    'Remote Management Users',   # WinRM access without local admin
    'Event Log Readers'          # Read Security, System, Application logs
)

foreach ($group in $groups) {
    $alreadyMember = Invoke-Command @dcSession -ScriptBlock {
        param($g)
        (Get-ADGroupMember -Identity $g -Recursive | Where-Object SamAccountName -eq 'ra_stevens').Count -gt 0
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

# ── Step 3: Per-server configuration (optional) ───────────────────────────────

if ($TargetServers.Count -gt 0) {
    Write-Step "Configuring target servers"

    $serverCred = Get-Credential -UserName 'sa_stevens@andersen-cost.com' `
        -Message 'sa_stevens credential for PSRemoting to target servers'

    foreach ($server in $TargetServers) {
        Write-Host "  Configuring $server…" -ForegroundColor DarkGray

        try {
            Invoke-Command -ComputerName $server -Credential $serverCred -ScriptBlock {
                # Add to local Remote Management Users (WinRM)
                $rmGroup = [ADSI]"WinNT://./Remote Management Users,group"
                try {
                    $rmGroup.Add("WinNT://ACCO/ra_stevens,user")
                    Write-Output "    + Local Remote Management Users"
                } catch {
                    if ($_.Exception.Message -like '*already*') {
                        Write-Output "    ~ Local Remote Management Users (already member)"
                    } else { throw }
                }

                # Add to local Event Log Readers
                $elGroup = [ADSI]"WinNT://./Event Log Readers,group"
                try {
                    $elGroup.Add("WinNT://ACCO/ra_stevens,user")
                    Write-Output "    + Local Event Log Readers"
                } catch {
                    if ($_.Exception.Message -like '*already*') {
                        Write-Output "    ~ Local Event Log Readers (already member)"
                    } else { throw }
                }

                # Grant explicit WinRM session access (belt-and-suspenders)
                $sddl = (Get-PSSessionConfiguration -Name 'Microsoft.PowerShell' -ErrorAction SilentlyContinue).SecurityDescriptorSddl
                if ($sddl -and $sddl -notmatch 'ra_stevens') {
                    # Append Allow-FullControl for ra_stevens via SID lookup
                    $sid = (New-Object System.Security.Principal.NTAccount('ACCO\ra_stevens')).Translate(
                        [System.Security.Principal.SecurityIdentifier]).Value
                    $newSddl = $sddl + "(A;;GA;;;$sid)"
                    Set-PSSessionConfiguration -Name 'Microsoft.PowerShell' `
                        -SecurityDescriptorSddl $newSddl -Force -NoServiceRestart
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

# ── Summary ────────────────────────────────────────────────────────────────────

Write-Host "`n$('─' * 60)" -ForegroundColor DarkGray
Write-Host "`nAccount ready: ra_stevens@andersen-cost.com" -ForegroundColor Cyan
Write-Host "Domain groups: Remote Management Users, Event Log Readers" -ForegroundColor Cyan

if (-not $accountExists) {
    Write-Host "`nPassword (store in Bitwarden SVH OpsMan item):" -ForegroundColor Yellow
    Write-Host "  DC_REMOTE_USER     ra_stevens@andersen-cost.com" -ForegroundColor White
    Write-Host "  DC_REMOTE_PASSWORD $plainPassword" -ForegroundColor White
    Write-Host "`nClear your terminal history after copying this password." -ForegroundColor DarkGray
}

Write-Host @"

Next steps:
  1. Add DC_REMOTE_USER + DC_REMOTE_PASSWORD to the SVH OpsMan BW item
  2. If servers are covered by GPO Restricted Groups — you're done.
     If not, re-run with -TargetServers ACCOSERVER01, ACCOSQL01, ...
  3. Optionally deny interactive logon via GPO:
       User Rights Assignment → "Deny log on locally" → add ACCO\ra_stevens
  4. Test from WSL:
       pwsh -Command "Invoke-Command -ComputerName ACCOSERVER01 -Credential `$cred -ScriptBlock { hostname }"
"@ -ForegroundColor DarkGray
