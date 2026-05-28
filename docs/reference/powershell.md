# PowerShell Modules

The PowerShell module suite in `powershell/` is designed for write operations and interactions with on-premise systems that require direct operator control. While the AI uses read-only MCP tools for investigation, this suite is for the human operator to enact changes.

**Full reference:** [`powershell/README.md`](../../powershell/README.md) — covers every module with example commands, credential tiers, PSRemoting setup, WSL notes, and Windows deployment instructions.

## Quick reference — modules

| Module | Coverage |
| :--- | :--- |
| `SVH.Core` | Credential store, OAuth2 token cache, HTTP helpers, tier account lookup |
| `SVH.Entra` | User/group/device lifecycle, MFA, license management, risky users, TAPs |
| `SVH.M365` | Teams, Mail, Calendar, Planner, To Do, OneDrive, SharePoint |
| `SVH.Exchange` | Mailbox settings, forwarding, litigation hold, message trace |
| `SVH.Azure` | ARM, Defender MDE, and Recovery Services (VMs, storage, NSGs, MDE isolation) |
| `SVH.NinjaOne` | Device discovery, services, disks, patches, backups, event logs |
| `SVH.Wazuh` | Alerts, agents, FIM events, vulnerability detections |
| `SVH.UniFi` | Sites, devices, clients, WLANs, firewall rules |
| `SVH.Confluence` | Pages, search, comments |
| `SVH.PrinterLogic` | Printers, drivers, deployment, quotas |
| `SVH.OnPrem` | PSRemoting for disk, services, Hyper-V, cluster state, MABS, SQL |
| `SVH.AD` | Active Directory management via PSRemoting |
| `SVH.Network` | AD DNS, Windows DHCP, and network validation tools |
| `SVH.Cross` | Cross-system composite functions (e.g., user summaries, backup health) |

One-time PSRemoting setup from WSL: [`docs/setup/winrm.md`](../setup/winrm.md)
