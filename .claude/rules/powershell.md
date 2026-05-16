---
paths:
  - "powershell/**"
---

# PowerShell conventions for SVH modules

## Loading

Always load via dot-source from the `powershell/` directory (requires `BW_SESSION`):

```powershell
. ./connect.ps1
```

This loads `SVH.Core` first, which initialises the credential store, then loads all other modules.

## Module coverage and credential tiers

| Module | Coverage | Credential tier |
|--------|----------|----------------|
| SVH.Core | Credential store, OAuth2 cache, HTTP helpers | — |
| SVH.Entra | Users, groups, licenses, MFA, CA policies, Intune | Graph app |
| SVH.Exchange | Mailbox settings, OOO, distribution groups, M365 health, EXO cmdlets | Graph app / EXO module |
| SVH.M365 | Teams, mail, calendar, SharePoint, OneDrive, Planner, To Do | Graph app |
| SVH.Azure | ARM (VMs, VNets, storage, costs, Recovery) + Defender MDE | ARM + MDE app |
| SVH.NinjaOne | RMM: devices, alerts, patches, backups, script execution | NinjaOne API |
| SVH.OnPrem | PSRemoting: disks, services, Hyper-V, failover cluster, S2D, MABS, SQL | sa_stevens |
| SVH.AD | Active Directory: users, groups, computers, domain health, replication | da_stevens |
| SVH.Network | AD DNS, Windows DHCP, cross-platform network validation (.NET) | da_stevens |
| SVH.Wazuh | SIEM: agents, alerts, FIM, rootcheck, vulns | Wazuh JWT |
| SVH.UniFi | Network: APs, switches, clients, firewall rules, WLANs | UniFi controller + cloud |
| SVH.PrinterLogic | Printers, drivers, deployment, quotas | PrinterLogic API |
| SVH.Confluence | KB pages, search, comments | Confluence API |
| SVH.Cross | Cross-system: asset summary, patch surface, backup health, user lockdown | Combines above |

## PSRemoting accounts

| Function group | Account |
|----------------|---------|
| SVH.OnPrem (Hyper-V, failover cluster, S2D, MABS, SQL) | `sa_stevens@andersen-cost.com` |
| SVH.AD (Active Directory, domain health, replication) | `da_stevens@andersen-cost.com` |
| SVH.Network (AD DNS, Windows DHCP) | `da_stevens@andersen-cost.com` |
| Desktop Commander diagnostics (event logs, processes, network) | `ra_stevens@andersen-cost.com` |

PSRemoting functions require a one-time WinRM trust setup from WSL — see `references/setup-winrm.md`.

`ra_stevens` is a constrained service account — `Remote Management Users` + `Event Log Readers` only.
Credentials are stored in BW as `DC_REMOTE_USER` / `DC_REMOTE_PASSWORD` (env vars, not interactive).
Created by `powershell/setup-dc-remote-account.ps1`.

## Adding a new module

1. Create `powershell/modules/SVH.<Service>.psm1`
2. Export public functions with `Export-ModuleMember`
3. Add credentials to the **SVH OpsMan** Bitwarden item
4. Add a `Connect-SVH<Service>` call to `connect.ps1`
5. Document in `powershell/README.md`
