# WinRM Setup — MCP Host to Windows Targets

One-time setup to allow Desktop Commander (running in WSL) to reach Windows servers via PS Remoting.

---

## Architecture

```
WSL (MCP host)
  └── Desktop Commander
        └── pwsh / powershell.exe → WinRM → Windows Server
```

PowerShell 7 (`pwsh`) is recommended over Windows PowerShell 5.1 for cross-platform remoting.

---

## Step 1 — Install PowerShell 7 in WSL

```bash
# Ubuntu/Debian in WSL
wget -q "https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/packages-microsoft-prod.deb"
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo apt-get install -y powershell
```

Verify: `pwsh --version`

---

## Step 2 — Enable WinRM on Each Target Server

Run on each Windows Server (elevated PowerShell):

```powershell
# Enable WinRM with default settings
Enable-PSRemoting -Force

# Allow connections from specific subnets (adjust to your management VLAN)
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.10.*" -Force

# Verify WinRM listener is running
Get-WSManInstance -ResourceURI winrm/config/listener -SelectorSet @{Address='*'; Transport='HTTP'}
```

For HTTPS (recommended for production):
```powershell
# Requires a machine certificate in the local store
New-Item -Path WSMan:\localhost\Listener -Transport HTTPS -Address * -CertificateThumbprint <thumbprint> -Force
```

---

## Step 3 — Configure WSL to Trust Target Hosts

In WSL, create or update `~/.config/powershell/Microsoft.PowerShell_profile.ps1`:

```powershell
# Trust all hosts in the management subnet
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.10.*" -Force
```

Or set per-session in `pwsh`:

```powershell
Set-Item WSMan:\localhost\Client\TrustedHosts -Value "192.168.10.0/24" -Force
```

---

## Step 4 — Test Connectivity

```bash
# From WSL
pwsh -Command "Invoke-Command -ComputerName SERVERNAME -Credential (Get-Credential) -ScriptBlock { hostname }"
```

---

## Step 5 — Store Credentials Securely

Rather than entering credentials interactively, retrieve them from Bitwarden via the Bitwarden MCP and pass them to Desktop Commander:

```powershell
# Example pattern inside a Desktop Commander session
$securePass = ConvertTo-SecureString "PASSWORD_FROM_BITWARDEN" -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential("DOMAIN\svcaccount", $securePass)
Invoke-Command -ComputerName SERVERNAME -Credential $cred -ScriptBlock { Get-WinEvent ... }
```

---

## Service Account Recommendations

- Create a dedicated AD service account (`svc-mcp-remoting` or similar)
- Add to **Remote Management Users** local group on each target (least privilege)
- For Security event log access, also add to **Event Log Readers**
- For cluster commands, the account needs **Read** on the cluster object in AD

---

## Firewall Rules

WinRM uses:
- **HTTP:** TCP 5985
- **HTTPS:** TCP 5986

Open from the MCP host IP to all managed servers on the management VLAN. Block from all other sources.

---

## Troubleshooting

**Connection refused:**
- `Test-NetConnection SERVERNAME -Port 5985` from WSL — if fails, WinRM not listening or firewall blocking
- Check Windows Firewall: `Get-NetFirewallRule -DisplayName "*WinRM*"` on target

**Access denied:**
- Verify service account is in Remote Management Users on the target
- Check if CredSSP is required (double-hop scenarios) — avoid CredSSP if possible; use `-Authentication Kerberos` instead

**Kerberos auth fails from WSL:**
- WSL is not domain-joined, so Kerberos won't work natively
- Use `-Authentication Negotiate` or `-Authentication Basic` with HTTPS
- Or use a local admin account with `-Authentication Basic` over HTTPS only

---

## Investigation Recipes

`Get-WinEvent` patterns for deep-dives during incident response. Run via `Invoke-Command` after narrowing the suspect window in Wazuh.

### All Critical/Error Events in a Time Window
```powershell
Invoke-Command -ComputerName SERVERNAME -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'System', 'Application'
        Level     = 1, 2   # 1=Critical, 2=Error
        StartTime = [datetime]'2025-05-09 08:00:00'
        EndTime   = [datetime]'2025-05-09 10:00:00'
    } | Select-Object TimeCreated, Id, ProviderName, LevelDisplayName, Message |
      Sort-Object TimeCreated
}
```

### FailoverClustering Channel
```powershell
Invoke-Command -ComputerName CLUSTERNODE -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-FailoverClustering/Operational'
        StartTime = [datetime]'2025-05-09 06:00:00'
    } | Select-Object TimeCreated, Id, Message | Sort-Object TimeCreated
}
```

### Hyper-V VMMS Events
```powershell
Invoke-Command -ComputerName HVHOST -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'Microsoft-Windows-Hyper-V-VMMS-Admin'
        StartTime = [datetime]'2025-05-09 06:00:00'
    } | Select-Object TimeCreated, Id, Message
}
```

### Security Events — Failed Logons
```powershell
Invoke-Command -ComputerName DC01 -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'Security'
        Id        = 4625, 4740, 4771, 4776
        StartTime = [datetime]'2025-05-09 00:00:00'
    } | Select-Object TimeCreated, Id, @{N='User'; E={$_.Properties[5].Value}},
                                        @{N='IP';   E={$_.Properties[19].Value}},
                                        Message |
      Sort-Object TimeCreated
}
```

### Successful Logons After Failures (Correlation)
```powershell
Invoke-Command -ComputerName DC01 -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'Security'
        Id        = 4624
        StartTime = [datetime]'2025-05-09 00:00:00'
    } | Where-Object {
        $_.Properties[8].Value -in @(10, 3)  # LogonType 10=RemoteInteractive, 3=Network
    } | Select-Object TimeCreated, @{N='User'; E={$_.Properties[5].Value}},
                                    @{N='IP';  E={$_.Properties[18].Value}}
}
```

### Service State Changes (Service Control Manager)
```powershell
Invoke-Command -ComputerName SERVERNAME -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName      = 'System'
        ProviderName = 'Service Control Manager'
        Id           = 7036, 7034, 7031
        StartTime    = [datetime]'2025-05-09 06:00:00'
    } | Select-Object TimeCreated, Id, Message | Sort-Object TimeCreated
}
```

### Windows Update / BITS Events
```powershell
Invoke-Command -ComputerName SERVERNAME -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName = 'System', 'Microsoft-Windows-WindowsUpdateClient/Operational'
        Id      = 20, 21, 25, 43, 16
        StartTime = [datetime]'2025-05-01 00:00:00'
    } | Select-Object TimeCreated, Id, Message | Sort-Object TimeCreated
}
```

### Disk / Storage Errors
```powershell
Invoke-Command -ComputerName SERVERNAME -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName = 'System'
        Id      = 7, 11, 51, 157, 129, 9   # disk errors
        StartTime = [datetime]'2025-05-09 00:00:00'
    } | Select-Object TimeCreated, Id, Message | Sort-Object TimeCreated
}
```

### Group and Count Events (Finding Patterns)
```powershell
Invoke-Command -ComputerName SERVERNAME -ScriptBlock {
    Get-WinEvent -FilterHashtable @{
        LogName   = 'System', 'Application'
        Level     = 1, 2
        StartTime = [datetime]'2025-05-09 00:00:00'
    }
} | Group-Object {"{0} — {1}" -f $_.ProviderName, $_.Id} |
    Sort-Object Count -Descending |
    Select-Object Count, Name -First 20
```

### Check Cluster State (Without Remoting)
```powershell
# From a cluster node — no remoting needed
Get-ClusterNode | Select-Object Name, State, NodeHighestVersion
Get-ClusterSharedVolume | Select-Object Name, State, OwnerNode
Get-ClusterResource | Where-Object State -ne Online
Get-VM | Select-Object Name, State, ComputerName
```
