# Credential Reference

All credentials for the SVH OpsMan project are stored as custom fields in a single Bitwarden vault item named **SVH OpsMan**. This document covers how to provision each service integration — app registrations, required permissions, and setup steps.

For the complete list of Bitwarden field names and which credentials are still pending, see [`references/credentials.md`](../../references/credentials.md).

## Microsoft Graph API

One app registration is used for all Microsoft 365 services.

**Bitwarden Fields:**
- `GRAPH_TENANT_ID`
- `GRAPH_CLIENT_ID`
- `GRAPH_CLIENT_SECRET`
- `GRAPH_USER_ID` (The Entra Object ID of the primary user)

### Required Application Permissions

The following **Application** permissions are required under the Microsoft Graph API. Admin consent must be granted for them in Entra ID.

| Permission | Justification |
| :--- | :--- |
| `Tasks.ReadWrite` | Planner |
| `Tasks.ReadWrite.All` | To Do |
| `Group.Read.All` | Planner, Teams |
| `ChannelMessage.Send` | Teams |
| `TeamMember.ReadWrite.All` | Teams |
| `Files.ReadWrite.All` | OneDrive |
| `Sites.Read.All` | SharePoint |
| `Mail.ReadWrite`, `Mail.Send` | Outlook Mail |
| `Calendars.ReadWrite` | Outlook Calendar |
| `MailboxSettings.ReadWrite` | Calendar, Exchange Admin |
| `Place.Read.All` | Calendar rooms |
| `Policy.Read.All` | Entra ID |
| `Application.Read.All`| Entra ID |
| `RoleManagement.Read.Directory` | Entra ID |
| `IdentityRiskyUser.ReadWrite.All` | Entra ID (P2 required) |
| `UserAuthenticationMethod.Read.All`| Entra ID |
| `AuditLog.Read.All` | Entra ID sign-in/audit logs |
| `DeviceManagementManagedDevices.Read.All`| Intune |
| `DeviceManagementConfiguration.Read.All`| Intune |
| `DeviceManagementApps.Read.All` | Intune |
| `ServiceHealth.Read.All`| M365 Service Health |
| `Organization.Read.All`| M365 Service Health |
| `Directory.Read.All` | General |
| `Reports.Read.All` | Exchange Admin message trace |

### Restricting Mail Access

The `Mail.ReadWrite` permission is tenant-wide. To lock it down to a single user's mailbox, create an `ApplicationAccessPolicy` in Exchange Online:

```powershell
New-DistributionGroup -Name "Claude OpsMan Mailbox Access" -Type Security
Add-DistributionGroupMember -Identity "Claude OpsMan Mailbox Access" -Member "<Your UPN>"
New-ApplicationAccessPolicy -AppId "<GRAPH_CLIENT_ID>" `
  -PolicyScopeGroupId "claude-opsman-mailbox" `
  -AccessRight RestrictAccess `
  -Description "Limit Claude OpsMan mail access"
```

## Defender for Endpoint API

A separate app registration is required for Defender.

**Bitwarden Fields:**
- `MDE_TENANT_ID`
- `MDE_CLIENT_ID`
- `MDE_CLIENT_SECRET`

**Required Application Permissions:**
Under **WindowsDefenderATP** API:
- `Machine.Read.All`
- `Alert.Read.All`
- `Ti.Read`
- `Vulnerability.Read.All`
- `Software.Read.All`
- `AdvancedQuery.Read.All`

## Azure Resource Manager

A service principal is used for read-only access to Azure resources.

**Bitwarden Fields:**
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_SUBSCRIPTION_ID`

Create it via the Azure CLI:
```bash
az ad sp create-for-rbac --name "Claude OpsMan ARM" --role Reader --scopes /subscriptions/<id>
az role assignment create --assignee <client-id> --role "Cost Management Reader" --scope /subscriptions/<id>
```

## Other Services

| Service | Credentials Source | Bitwarden Fields |
| :--- | :--- | :--- |
| **UniFi Cloud** | account.ui.com API Keys | `UNIFI_API_KEY` |
| **UniFi Network** | Local API key on UDM | `UNIFI_{SITE}_URL`, `UNIFI_{SITE}_KEY` |
| **NinjaOne** | Admin > Apps > API | `NINJA_CLIENT_ID`, `NINJA_CLIENT_SECRET` |
| **Confluence** | id.atlassian.com API tokens | `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN` |
| **PrinterLogic**| Admin console API token | `PRINTERLOGIC_URL`, `PRINTERLOGIC_API_TOKEN` |
| **Google** | GCP Console OAuth 2.0 Client ID | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_USER_EMAIL` |
