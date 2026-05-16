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
