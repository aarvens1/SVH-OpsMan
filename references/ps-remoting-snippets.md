# PowerShell Remoting Snippets

Recipes for Desktop Commander → PS Remoting → `Get-WinEvent` deep-dives. Run via `Invoke-Command` after narrowing the suspect window in Wazuh.

---

## Setup

```powershell
# One-time: trust the remote host (run on MCP host in WSL if using PSRemoting over WinRM)
# See setup-winrm.md for full trust setup

$cred = Get-Credential   # or use stored cred from Bitwarden
Enter-PSSession -ComputerName SERVERNAME -Credential $cred
```

---

## Get-WinEvent Recipes

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

---

## Group and Count Events (Finding Patterns)

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

---

## Check Cluster State (Without Remoting)

```powershell
# From a cluster node — no remoting needed
Get-ClusterNode | Select-Object Name, State, NodeHighestVersion
Get-ClusterSharedVolume | Select-Object Name, State, OwnerNode
Get-ClusterResource | Where-Object State -ne Online
Get-VM | Select-Object Name, State, ComputerName
```
