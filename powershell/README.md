# SVH OpsMan — PowerShell Modules

PowerShell Core module suite for SVH IT operations. All modules run from WSL 2 using the same Bitwarden credentials as the MCP server.

## Quick start

**Option A — TUI (recommended for interactive use)**

```bash
# From WSL, in the repo root — requires BW_SESSION and pwsh
export BW_SESSION=$(bw unlock --raw)
./run-tui.sh
```

The TUI starts a persistent pwsh session, loads all modules, and shows a searchable browser for all 237 functions. Fill parameters in a form, preview the generated command, and run it — with a confirmation dialog before any destructive operation. Output stays in the terminal or saves to Obsidian. See `tui/` and `USER_GUIDE.md §9.1` for full docs.

**Option B — raw pwsh session**

```powershell
# 1. Unlock Bitwarden (in WSL bash, not PowerShell)
export BW_SESSION=$(bw unlock --raw)

# 2. Launch PowerShell
pwsh

# 3. Load everything — credentials + all modules
. ./connect.ps1
```

`connect.ps1` populates `$Global:SVHCreds` from the **SVH OpsMan** Bitwarden vault item, then imports all modules into the global scope. BW_SESSION is required — the script throws if it is not set.

---

## Modules

| Module | What it covers | Auth |
|--------|---------------|------|
| `SVH.Core` | Credential store, OAuth2 token cache, HTTP helpers, tier account lookup | — |
| `SVH.Entra` | Users, groups, licenses, MFA, sign-in logs, risky users, CA policies, Intune | Graph app |
| `SVH.Exchange` | Mailbox settings, OOO status, distribution groups, M365 service health, EXO cmdlets | Graph app / EXO module |
| `SVH.M365` | Teams, mail, calendar, SharePoint, OneDrive, Planner, To Do | Graph app |
| `SVH.Azure` | ARM (VMs, VNets, NSGs, storage, costs, Recovery), Defender MDE | ARM + MDE app |
| `SVH.NinjaOne` | RMM: device inventory, alerts, patches, backups, remote script execution | NinjaOne API |
| `SVH.OnPrem` | PSRemoting to on-prem servers: disks, services, Hyper-V, failover cluster, S2D, MABS, SQL | sa_stevens (server tier) |
| `SVH.AD` | Active Directory: users, groups, computers, domain health, replication | da_stevens (domain tier) |
| `SVH.Network` | AD DNS, Windows DHCP, cross-platform network validation | da_stevens (PSRemoting to DNS/DHCP servers) |
| `SVH.Wazuh` | SIEM: agents, alerts, vulnerabilities, FIM, rootcheck | Wazuh JWT |
| `SVH.UniFi` | UniFi network: APs, switches, clients, firewall rules, WLANs | UniFi controller + cloud |
| `SVH.PrinterLogic` | Printers, drivers, deployment profiles, quotas | PrinterLogic API |
| `SVH.Confluence` | KB pages, search, comments | Confluence API |
| `SVH.Cross` | Multi-system: asset summary, patch surface, backup health, user lockdown, WinRM test | Combines above |

---

## Credential tiers

| Tier | Account | Used for |
|------|---------|----------|
| `standard` | `astevens@shoestringvalley.com` | M365 user context (mail, calendar, Teams, Planner) |
| `server` | `sa_stevens@andersen-cost.com` | PSRemoting to on-prem Windows servers |
| `m365` | `ma_stevens@shoestringvalley.com` | Exchange Online admin (EXO module), PIM-eligible GA |
| `app` | `aa_stevens@shoestringvalley.com` | Azure portal, app registrations |
| `domain` | `da_stevens@andersen-cost.com` | Active Directory, DNS/DHCP server admin |

```powershell
Get-SVHTierUsername -Tier server   # → sa_stevens@andersen-cost.com
```

---

## Module reference

### SVH.Core

Internal helpers. Loaded first by `connect.ps1`.

```powershell
Get-SVHCredential 'GRAPH_TENANT_ID'          # read a Bitwarden field
Get-SVHTierUsername -Tier m365               # look up the right admin account
Clear-SVHTokenCache                           # force token refresh on next call
```

### SVH.Entra

Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

```powershell
# Identity
Get-SVHUser -Identity jdoe@shoestringvalley.com
Get-SVHGuestUsers
Get-SVHSignInLogs -Identity jdoe@shoestringvalley.com -Days 7
Get-SVHRiskyUsers
Get-SVHAuditLog -Category UserManagement -Days 1

# MFA and access
Get-SVHUserMFA -Identity jdoe@shoestringvalley.com
Get-SVHMFAGap                                  # users with no MFA method
Get-SVHConditionalAccessPolicies

# Licenses
Get-SVHUserLicenses -Identity jdoe@shoestringvalley.com
Get-SVHLicenseWaste                            # assigned but disabled accounts
Get-SVHTenantSubscriptions

# Groups and roles
Get-SVHGroupMembers -GroupId <id>
Get-SVHDirectoryRoles
Get-SVHDirectoryRoleMembers -RoleId <id>

# Intune
Get-SVHIntuneDevice -Identity jdoe@shoestringvalley.com
Get-SVHStaleIntuneDevices -DaysInactive 60
Get-SVHIntuneDeviceCompliance

# Write (all prompt for confirmation)
Set-SVHUserEnabled -Identity jdoe@shoestringvalley.com -Enabled $false
Reset-SVHUserPassword -Identity jdoe@shoestringvalley.com
New-SVHTemporaryAccessPass -Identity jdoe@shoestringvalley.com
Remove-SVHUserMFAMethod -Identity jdoe@shoestringvalley.com -MethodId <id>
Invoke-SVHDismissRiskyUser -Identity jdoe@shoestringvalley.com
Revoke-SVHUserSessions -Identity jdoe@shoestringvalley.com
Add-SVHGroupMember -GroupId <id> -MemberId <userId>
Remove-SVHGroupMember -GroupId <id> -MemberId <userId>
Set-SVHUserLicense -Identity jdoe@shoestringvalley.com -SkuId <sku> -Action Add
Sync-SVHIntuneDevice -DeviceId <id>
```

### SVH.Exchange

Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

Graph functions work unattended. EXO functions require an interactive `Connect-ExchangeOnline` session.

```powershell
# Graph — mailbox settings
Get-SVHMailboxSettings -Identity jdoe@shoestringvalley.com
Get-SVHMailboxForwarding              # scans all mailboxes for active OOO/auto-reply

# Graph — distribution groups
Get-SVHDistributionGroups
Get-SVHDistributionGroupMembers -GroupId <id>

# Graph — M365 service health
Get-SVHM365ServiceHealth
Get-SVHM365Incidents -Status active
Get-SVHM365MessageCenter
Get-SVHTenantInfo

# Graph — write
Set-SVHMailboxAutoReply -Identity jdoe@shoestringvalley.com -Status disabled

# EXO — requires interactive Connect-ExchangeOnline
Connect-ExchangeOnline -UserPrincipalName (Get-SVHTierUsername -Tier m365) -UseDeviceAuthentication
Get-SVHEXOMailbox -Identity jdoe@shoestringvalley.com
Get-SVHEXOForwarding                  # finds mailboxes with SMTP forwarding set
Get-SVHEXOMessageTrace -SenderAddress vendor@acme.com -RecipientAddress jdoe@svh.com
Set-SVHEXOLitigationHold -Identity jdoe@shoestringvalley.com -Enabled $true
Set-SVHEXOForwarding -Identity jdoe@shoestringvalley.com -ClearForwarding
```

### SVH.M365

Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

```powershell
# Teams
Get-SVHTeams
Get-SVHTeamChannels -TeamId <id>
Get-SVHTeamMessages -TeamId <id> -ChannelId <id>
Send-SVHTeamsMessage -TeamId <id> -ChannelId <id> -Message 'text'   # requires confirmation

# Mail
Search-SVHMail -Query 'from:vendor@acme.com' -Top 20
Get-SVHMailMessage -MessageId <id>
Send-SVHMail -To jdoe@svh.com -Subject 'Subject' -Body 'text'       # requires confirmation

# Calendar
Get-SVHCalendarEvents -Days 7
Get-SVHMeetingRooms
Find-SVHMeetingTime -Attendees @('a@svh.com','b@svh.com') -Duration 60

# SharePoint / OneDrive
Get-SVHSharePointSites
Get-SVHOneDriveItems -DriveId <id>
Search-SVHOneDrive -Query 'quarterly report'

# Planner / To Do
Get-SVHPlannerPlans
Get-SVHPlannerTasks -PlanId <id>
Get-SVHPlannerBuckets -PlanId <id>
New-SVHPlannerTask -PlanId <id> -BucketId <id> -Title 'Task title'  # requires confirmation
Set-SVHPlannerTask -TaskId <id> -PercentComplete 100                 # requires confirmation
Get-SVHTodoLists
Get-SVHTodoTasks -ListId <id>
New-SVHTodoTask -ListId <id> -Title 'Task title'                     # requires confirmation
```

### SVH.Azure

Requires: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SUBSCRIPTION_ID`, `MDE_TENANT_ID`, `MDE_CLIENT_ID`, `MDE_CLIENT_SECRET`

```powershell
# ARM — infrastructure
Get-SVHResourceGroups
Get-SVHVMs
Get-SVHVM -Name myvm
Get-SVHVNets
Get-SVHNSGRules -ResourceGroup rg-name -NSGName nsg-name
Get-SVHOpenInboundPorts                # any NSG with 0.0.0.0/0 inbound
Get-SVHPublicIPs
Get-SVHStorageAccounts
Get-SVHAppServices
Get-SVHActivityLog -Days 1
Get-SVHCostSummary -Days 30
Get-SVHAdvisorRecommendations
Get-SVHRecoveryVaults
Get-SVHRecoveryJobs -VaultName myVault -ResourceGroup rg-name

# ARM — write
Start-SVHVM -Name myvm -ResourceGroup rg-name
Stop-SVHVM -Name myvm -ResourceGroup rg-name
Restart-SVHVM -Name myvm -ResourceGroup rg-name
Set-SVHStoragePublicAccess -StorageAccountName myacct -ResourceGroup rg-name -Allow $false
New-SVHResourceGroup -Name rg-new -Location eastus

# Defender MDE
Get-SVHMDEDevices
Get-SVHMDEAlerts -Status new
Get-SVHMDEDeviceVulns -MachineId <id>
Get-SVHTVMRecommendations
Get-SVHMDEIndicators
Add-SVHMDEIndicator -IndicatorValue '1.2.3.4' -IndicatorType IpAddress -Action Block -Title 'Block C2'
Remove-SVHMDEIndicator -IndicatorId <id>
Invoke-SVHMDEIsolation -MachineId <id> -Comment 'IR: suspected compromise'
Invoke-SVHMDEUnisolation -MachineId <id> -Comment 'Cleared'
Invoke-SVHMDEAVScan -MachineId <id>
```

### SVH.NinjaOne

Requires: `NINJA_CLIENT_ID`, `NINJA_CLIENT_SECRET`

```powershell
Get-SVHNinjaServers                           # filter: org, online-only, on-prem-only
Get-SVHNinjaDevice -DeviceId <id>
Get-SVHNinjaOrgs
Get-SVHNinjaOfflineDevices                    # skips maintenance-mode devices
Get-SVHNinjaDiskAlerts                        # disks > threshold% or failing SMART
Get-SVHNinjaCriticalAlerts
Get-SVHNinjaServices -DeviceId <id>
Get-SVHNinjaProcesses -DeviceId <id>
Get-SVHNinjaVolumes -DeviceId <id>
Get-SVHNinjaEventLog -DeviceId <id> -Hours 24
Get-SVHNinjaAlerts -DeviceId <id>
Get-SVHNinjaPatches -DeviceId <id>
Get-SVHNinjaPatchHistory -DeviceId <id>
Get-SVHNinjaDeviceBackups -DeviceId <id>
Get-SVHNinjaAllBackups
Get-SVHNinjaScripts
Invoke-SVHNinjaScript -DeviceId <id> -ScriptId <id>   # requires confirmation
Restart-SVHNinjaDevice -DeviceId <id>                  # requires confirmation
```

### SVH.OnPrem

Requires: `sa_stevens` credentials (prompted) or `$Cred = Get-Credential`

Uses PSRemoting (WinRM). See `references/setup-winrm.md` for one-time WSL trust setup.

```powershell
$c = Get-Credential sa_stevens@andersen-cost.com

Get-SVHServerDisk -ComputerName ACCOSERVER01 -Credential $c
Get-SVHServerServices -ComputerName ACCOSERVER01 -Credential $c -State Stopped
Get-SVHPendingReboot -ComputerName ACCOSERVER01 -Credential $c
Get-SVHHyperVVMs -ComputerName ACCOHYP01 -Credential $c
Get-SVHClusterState -ClusterName AccoColoHypCon -Credential $c
Get-SVHMABSJobStatus -ComputerName ACCOMABS01 -Credential $c
Get-SVHSQLMemoryConfig -ComputerName ACCOSQL01 -Credential $c
Get-SVHSQLWaitStats -ComputerName ACCOSQL01 -Credential $c -Top 10

# S2D / HCI
Get-SVHS2DHealth -ComputerName ACCOHV01 -Credential $c               # pools, vdisks, pdisks, faults
Get-SVHS2DPhysicalDiskAlerts -ComputerName ACCOHV01 -Credential $c   # non-healthy disks only
```

### SVH.AD

Requires: `da_stevens@andersen-cost.com` credentials (PSRemoting to a domain controller)

```powershell
$c  = Get-Credential da_stevens@andersen-cost.com
$dc = 'ACCODC01.andersen-cost.com'

# User queries
Get-SVHADUser -DomainController $dc -Credential $c -Identity jdoe
Get-SVHADLockedAccounts -DomainController $dc -Credential $c
Get-SVHADStaleUsers -DomainController $dc -Credential $c -DaysInactive 90
Get-SVHADPasswordExpiry -DomainController $dc -Credential $c -DaysAhead 14
Get-SVHADDisabledUsers -DomainController $dc -Credential $c

# User actions (all prompt for confirmation)
Unlock-SVHADAccount -DomainController $dc -Credential $c -Identity jdoe
Set-SVHADUserEnabled -DomainController $dc -Credential $c -Identity jdoe -Enabled $false
Reset-SVHADPassword -DomainController $dc -Credential $c -Identity jdoe -NewPassword (Read-Host -AsSecureString)

# Groups
Get-SVHADGroup -DomainController $dc -Credential $c -Identity 'IT-Admins'
Get-SVHADUserGroups -DomainController $dc -Credential $c -Identity jdoe
Add-SVHADGroupMember -DomainController $dc -Credential $c -GroupName 'IT-Admins' -Identity jdoe
Remove-SVHADGroupMember -DomainController $dc -Credential $c -GroupName 'IT-Admins' -Identity jdoe

# Computers
Get-SVHADComputer -DomainController $dc -Credential $c -Identity ACCOSERVER01
Get-SVHADStaleComputers -DomainController $dc -Credential $c -DaysInactive 90

# Domain health
Get-SVHADDomainInfo -DomainController $dc -Credential $c
Get-SVHADReplication -DomainController $dc -Credential $c
Get-SVHADDCSummary -DomainController $dc -Credential $c
```

### SVH.Network

Requires: `da_stevens` credentials (PSRemoting to DNS/DHCP servers), or pure .NET for validation.

```powershell
$c = Get-Credential da_stevens@andersen-cost.com

# AD DNS management
Get-SVHDnsZones -ComputerName ACCODC01 -Credential $c
Get-SVHDnsRecords -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com
Get-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com -Name server01
Add-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com `
    -Name newserver -Type A -Value '10.1.2.50'
Remove-SVHDnsRecord -ComputerName ACCODC01 -Credential $c -ZoneName andersen-cost.com `
    -Name oldserver -Type A
Get-SVHDnsForwarders -ComputerName ACCODC01 -Credential $c
Get-SVHDnsServerStats -ComputerName ACCODC01 -Credential $c

# Windows DHCP
Get-SVHDhcpScopes -ComputerName ACCODHCP01 -Credential $c
Get-SVHDhcpLeases -ComputerName ACCODHCP01 -Credential $c -ScopeId '10.1.1.0'
Get-SVHDhcpReservations -ComputerName ACCODHCP01 -Credential $c -ScopeId '10.1.1.0'

# Network validation (cross-platform .NET — no PSRemoting required)
Resolve-SVHDns -Name server01.andersen-cost.com               # internal vs external
Test-SVHPort -ComputerName ACCOSERVER01 -Port 443,80,3389     # multi-port TCP test
Test-SVHNetworkPath -Destination 8.8.8.8                      # traceroute via ping TTL sweep
Get-SVHDnsLookup -Name server01 -Server 10.1.1.1              # query specific DNS server
```

### SVH.Wazuh

Requires: `WAZUH_URL`, `WAZUH_USERNAME`, `WAZUH_PASSWORD`

```powershell
Get-SVHWazuhAgents -Status active
Get-SVHWazuhDisconnectedAgents
Get-SVHWazuhAlerts -Hours 24 -MinLevel 10
Get-SVHWazuhHighAlerts -Hours 24
Get-SVHWazuhAuthFailures -Hours 4
Get-SVHWazuhVulns -AgentId <id>
Get-SVHWazuhFIM -AgentId <id> -Path 'C:\Windows\System32'
Get-SVHWazuhRootcheck -AgentId <id>
Restart-SVHWazuhAgent -AgentId <id>                           # requires confirmation
Restart-SVHWazuhAgents                                         # all — requires confirmation
```

### SVH.UniFi

Requires: `UNIFI_CLIENT_ID`, `UNIFI_CLIENT_SECRET` (cloud), `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, `UNIFI_PASSWORD` (controller)

```powershell
# Read
Get-SVHUniFiSites
Get-SVHUniFiDevices -SiteId <id>
Get-SVHUniFiAPHealth -SiteId <id>
Get-SVHUniFiClients -SiteId <id>
Get-SVHUniFiRogueClients -SiteId <id>
Get-SVHUniFiFirewallRules -SiteId <id>
Get-SVHUniFiWLANs -SiteId <id>
Get-SVHUniFiSwitchPorts -SiteId <id> -DeviceMac <mac>

# Write
Block-SVHUniFiClient -SiteId <id> -ClientMac <mac>            # requires confirmation
Unblock-SVHUniFiClient -SiteId <id> -ClientMac <mac>          # requires confirmation
Set-SVHUniFiWLAN -SiteId <id> -WlanId <id> -Enabled $false    # requires confirmation
Restart-SVHUniFiDevice -SiteId <id> -DeviceMac <mac>          # requires confirmation
New-SVHUniFiFirewallRule -SiteId <id> -Name 'Block rogue' -Action drop -SrcAddress '10.x.x.x'
```

### SVH.Cross

Multi-system workflows. Requires the relevant underlying modules to be connected.

```powershell
# Read-only summaries
Get-SVHAssetSummary -ComputerName ACCOSERVER01 -Credential $c
Get-SVHUserSummary -Identity jdoe@shoestringvalley.com
Get-SVHPatchSurface
Get-SVHBackupHealth
Get-SVHComplianceGap
Get-SVHCriticalAlertSummary
Get-SVHEventLogSummary -ComputerName ACCOSERVER01 -Credential $c

# Diagnostics
Test-SVHWinRM -ComputerName ACCOSERVER01          # DNS + TCP 5985/5986 check (cross-platform)

# Write — security response
Invoke-SVHUserLockdown -UserPrincipalName jdoe@shoestringvalley.com   # requires confirmation
# Optionally add -MDEMachineId to isolate the device in the same step
```

---

## Getting the scripts onto a Windows machine

The modules run from WSL by default, but they also work natively from any Windows machine that has PowerShell Core and Bitwarden CLI installed — a jump server, an admin workstation, or a Hyper-V host.

### Prerequisites

Install these once on the Windows machine. Run the winget commands in an elevated PowerShell window.

```powershell
# PowerShell Core (if not already installed — required, replaces Windows PowerShell 5.x)
winget install Microsoft.PowerShell

# Bitwarden CLI (the bw command)
winget install Bitwarden.CLI

# Git (to clone the repo — skip if you're copying files another way)
winget install Git.Git
```

Optional — install only the modules you actually use:

```powershell
# Exchange Online (for EXO functions in SVH.Exchange)
Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force

# Active Directory RSAT (for SVH.AD and SVH.Network DNS/DHCP)
# On a domain controller or member server with RSAT already installed, skip this.
# On a workstation:
Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0
Add-WindowsCapability -Online -Name Rsat.DHCP.Tools~~~~0.0.1.0
Add-WindowsCapability -Online -Name Rsat.DNS.Tools~~~~0.0.1.0
```

> **Note:** SVH.AD and SVH.Network use PSRemoting to a DC — the RSAT tools only need to be installed on the DC itself, not on your workstation. You only need the RSAT modules locally if you want to run AD/DNS cmdlets without PSRemoting.

### Option A — Clone the repo (recommended)

```powershell
# In an elevated PowerShell window on the Windows machine
git clone https://github.com/aarvens1/svh-opsman.git C:\SVH-OpsMan

# Or if already on WSL, clone into a Windows path accessible from WSL:
git clone https://github.com/aarvens1/svh-opsman.git /mnt/c/SVH-OpsMan
```

### Option B — Copy from your WSL environment

```powershell
# From WSL bash — copy the powershell/ folder to a Windows path
cp -r ~/SVH-OpsMan/powershell /mnt/c/SVH-OpsMan/powershell

# Or use robocopy from Windows:
robocopy \\wsl$\Ubuntu\home\user\SVH-OpsMan\powershell C:\SVH-OpsMan\powershell /E
```

### Unlock Bitwarden and load the modules (Windows)

The steps are the same as WSL — the only difference is how you set `BW_SESSION`.

```powershell
# In PowerShell Core (pwsh.exe) on Windows:

# 1. Unlock Bitwarden — sets BW_SESSION for this process
$env:BW_SESSION = bw unlock --raw

# 2. Allow local scripts to run (one-time, per machine)
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# 3. Load everything
cd C:\SVH-OpsMan\powershell
. .\connect.ps1
```

After dot-sourcing, all SVH functions are available in the session exactly as they are from WSL.

### Running on a Windows Server directly

For servers that will run scripts on a schedule or need the modules available without WSL, set up a persistent profile:

```powershell
# Add to $PROFILE (creates file if it doesn't exist)
# Find your profile path: $PROFILE
notepad $PROFILE

# Add these lines to the profile:
$env:BW_SESSION = bw unlock --raw   # prompts on each pwsh launch
. C:\SVH-OpsMan\powershell\connect.ps1
```

> For scheduled/unattended use, store the BW session key in Windows Credential Manager or Task Scheduler environment variables rather than prompting interactively.

---

## WSL notes

### Interactive authentication (EXO, Azure AD)

Modules that wrap Exchange Online Management or MSAL interactive flows can't open a browser in WSL. Use device code flow — PowerShell prints a URL and a code; authenticate in your Windows browser.

```powershell
# Exchange Online
Connect-ExchangeOnline -UserPrincipalName (Get-SVHTierUsername -Tier m365) -UseDeviceAuthentication

# Azure PowerShell (if used standalone)
Connect-AzAccount -UseDeviceAuthentication
```

On Windows natively, interactive auth works normally — a browser window opens automatically.

### PSRemoting from WSL

WinRM from WSL requires initial trust configuration. Run the one-time setup from `references/setup-winrm.md` before using any `SVH.OnPrem`, `SVH.AD`, or `SVH.Network` PSRemoting functions.

Cross-platform cmdlets that **don't work** in pwsh on Linux (they work fine on Windows):
- `Resolve-DnsName` → use `Resolve-SVHDns` from `SVH.Network` (pure .NET, works everywhere)
- `Test-NetConnection` → use `Test-SVHPort` from `SVH.Network` (pure .NET TcpClient)
- `New-NetFirewallRule`, `Get-NetAdapter` → PSRemoting into the target Windows host

### Cluster scripts

`Connect-ClusterReboot.ps1` is the only script you run yourself. It:
1. Prompts for `sa_stevens` credentials
2. Creates a PSSession to the Hyper-V management server
3. Copies `rolling-cluster-reboot.ps1` to `C:\cluster-reboot\` on that server
4. Starts the orchestration as a background job on the server
5. Tails the transcript so you see output in real time
6. Handles interactive prompts (drain confirmations) from your local session

If your connection drops, re-run `Connect-ClusterReboot.ps1` — it reconnects and resumes tailing from where it left off. The orchestration on the server keeps running regardless.

```powershell
# From WSL or Windows PowerShell — prompts for sa_stevens credential
./Connect-ClusterReboot.ps1

# Override defaults
./Connect-ClusterReboot.ps1 -Server 172.18.201.145 -ClusterNames AccoColoHypCon,AccoColoHypVC -TimeoutSeconds 900
```

`rolling-cluster-reboot.ps1` is **not run directly** — it runs on the remote server, launched by `Connect-ClusterReboot.ps1`.

---

## Setup scripts (one-time)

These run as `ma_stevens` (Global Admin) during initial provisioning. Do not run unless re-provisioning the app registrations.

| Script | Step | Purpose |
|--------|------|---------|
| `setup-graph-apps.ps1` | 1 | Creates Graph + MDE app registrations, grants API permissions, sets secrets |
| `setup-exchange-policy.ps1` | 2 | Creates Exchange `ApplicationAccessPolicy` restricting Graph app to `astevens@` mailbox |
| `setup-azure-arm.ps1` | 3 | Creates ARM service principal, assigns Reader roles to the subscription |

---

## Credential reference

All credentials live in the **SVH OpsMan** Bitwarden vault item (custom fields and notes). See `references/credentials.md` for the full field-by-field inventory.

The Bitwarden field name is the key used by `Get-SVHCredential`. Example:

```powershell
Get-SVHCredential 'GRAPH_CLIENT_SECRET'   # reads GRAPH_CLIENT_SECRET from the vault item
```
