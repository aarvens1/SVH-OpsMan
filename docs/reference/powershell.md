# PowerShell Modules Guide

The PowerShell module suite in `powershell/` is designed for write operations and interactions with on-premise systems that require direct operator control. While the AI uses read-only MCP tools for investigation, this suite is for the human operator to enact changes.

## Loading the Modules

From a Windows Terminal session, navigate to the `powershell` directory and dot-source the `connect.ps1` script. This requires an active Bitwarden session in your environment.

```powershell
# In a shell where BW_SESSION is set
cd C:\path	o\SVH-OpsMan\powershell
. ./connect.ps1
```

This loads `SVH.Core` first to handle credentials and token caching, then loads all other `SVH.*` modules.

## Module Overview

| Module | Coverage |
| :--- | :--- |
| `SVH.Core` | Handles token caching, REST wrappers, credential access, and domain constants. |
| `SVH.Entra` | User/group/device lifecycle, MFA, license management, risky users, TAPs. |
| `SVH.M365` | Teams, Mail, Calendar, Planner, To Do, OneDrive, SharePoint. |
| `SVH.Exchange` | Mailbox settings, forwarding, litigation hold, message trace. |
| `SVH.Azure` | ARM, Defender MDE, and Recovery Services (VMs, storage, NSGs, MDE isolation). |
| `SVH.NinjaOne`| Device discovery, services, disks, patches, backups, event logs. |
| `SVH.Wazuh` | Alerts, agents, FIM events, vulnerability detections. |
| `SVH.UniFi` | Sites, devices, clients, WLANs, firewall rules. |
| `SVH.Confluence`| Pages, search, comments. |
| `SVH.PrinterLogic`| Printers, drivers, deployment, quotas. |
| `SVH.OnPrem` | PSRemoting for disk, services, Hyper-V, cluster state, MABS, SQL. |
| `SVH.AD` | Active Directory management via PSRemoting. |
| `SVH.Network`| AD DNS, Windows DHCP, and network validation tools. |
| `SVH.Cross` | Cross-system composite functions (e.g., user summaries, backup health). |

## Credential Tiers & PSRemoting

The modules use a tiered credential system to ensure actions are performed with the appropriate level of privilege, especially for PSRemoting to on-premise servers.

### Credential Tiers

| Tier | Account | Auth Method | PSCredential | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `standard` | `astevens@...`| Passkey (Interactive)| ✗ | General M365 tasks. |
| `server` | `sa_stevens@...`| Password | ✓ | PSRemoting, Kerberos. |
| `m365` | `ma_stevens@...`| Passkey (Interactive)| ✗ | M365 admin operations. |
| `app` | `aa_stevens@...`| Passkey (Interactive)| ✗ | App registration management. |
| `domain` | `ACCO\da_stevens`| Password | ✓ | Active Directory domain ops. |
| `ra` | `ra_stevens@...`| Password (in BW) | ✓ | Desktop Commander read-only PSRemoting. |

### PSRemoting Quick Reference

PSRemoting is used extensively to manage on-premise servers from WSL. The account required depends on the task.

| Task | Account | Auth from WSL |
| :--- | :--- | :--- |
| Disk, services, event logs, processes | `ra_stevens` | **Non-interactive** (uses `DC_REMOTE_PASSWORD` from Bitwarden) |
| Hyper-V, failover cluster, S2D, MABS | `sa_stevens` | **Interactive** (`Get-Credential`) |
| Active Directory, DNS, DHCP | `da_stevens` | **Interactive** (`Get-Credential`) |

The `ra` (remote access) account is designed for read-only, automated queries by the AI. The `sa` (server admin) and `da` (domain admin) accounts require interactive password entry for high-privilege operations.

### One-Time PSRemoting Setup

To enable PSRemoting from WSL to your Windows servers, you must perform a one-time configuration. See the guide at `references/setup-winrm.md`.

## PowerShell TUI

For an interactive, form-based way to use these modules, run the Textual User Interface (TUI):

```bash
# From the repo root in WSL, with BW_SESSION active
tui/run-tui.sh
```
This provides a searchable list of all functions, with forms for parameters and a confirmation step for any destructive action. It is the safest way to execute write operations.
