# SVH OpsMan — IT Operations MCP Server

Stop switching between tabs. Ask Claude in plain English and it will query or act on your IT systems directly.

```
"Find all app registrations with secrets expiring in the next 30 days."
"Search Todoist for any open tasks tagged with infrastructure."
"Show me the M365 service health and list any active incidents."
"Check disk space and pending patches across all NinjaOne servers."
```

---

## Table of contents

- [What's included](#whats-included)
- [How it works](#how-it-works)
- [Before you start](#before-you-start)
- [Setup](#setup)
  - [Step 1 — Get your API credentials](#step-1--get-your-api-credentials)
  - [Step 2 — Add credentials to Bitwarden Secrets Manager](#step-2--add-credentials-to-bitwarden-secrets-manager)
  - [Step 3 — Build the Docker image](#step-3--build-the-docker-image)
  - [Step 4 — Connect to Claude](#step-4--connect-to-claude)
- [External MCP servers](#external-mcp-servers)
- [Using it](#using-it)
- [Tool reference](#tool-reference)
- [Development](#development)
- [Self-hosted Bitwarden](#self-hosted-bitwarden)
- [Troubleshooting](#troubleshooting)

---

## What's included

> **Read-only** integrations are marked with 🔒. They will never modify, create, or delete anything.

| System | What Claude can do |
|--------|--------------------|
| **Microsoft Planner** | Create and update plans, tasks, checklists, and notes |
| **Entra ID (Azure AD)** | Audit MFA methods, Conditional Access, app registrations, expiring secrets, role members, risky users; dismiss risky users |
| **OneDrive** | Browse files, search, create folders, generate sharing links |
| **Microsoft Teams** | List teams/channels, send messages, create channels, add members |
| **MS Intune** 🔒 | List managed devices, compliance states, device configurations, and deployed apps |
| **MS Admin** 🔒 | M365 service health, active incidents, message center notifications, tenant info, domains, license subscriptions |
| **Microsoft Defender for Endpoint** 🔒 | List devices, vulnerabilities, alerts, and IOC indicators; TVM recommendations |
| **Todoist** | List projects and tasks; create, update, close, and delete tasks |
| **Brave Search** | Web search and news search |
| **UniFi Cloud** 🔒 | View sites and devices across all locations |
| **UniFi Network Controller** 🔒 | View VLANs, firewall rules, devices, and connected clients |
| **NinjaOne RMM** 🔒 | View servers — services, processes, patches, event logs, scripts, alerts, and backups |
| **Confluence** | Search pages, read and edit content, manage comments |

All services are independent. Connect only the ones you use.

---

## How it works

```
Claude  →  MCP Server (Docker)  →  Bitwarden Secrets Manager  →  Your services
```

1. You store every credential in **Bitwarden Secrets Manager** — nothing sensitive goes in config files or the Docker image.
2. The MCP server runs in a **Docker container** and fetches credentials from Bitwarden on startup.
3. Claude calls the server's tools just like any other MCP integration — you just talk to it naturally.

This means you only ever hand Claude one thing: a Bitwarden machine account token.

---

## Before you start

You'll need:

1. **Docker** installed on the machine running Claude
2. **Bitwarden Secrets Manager** account — free tier works fine ([bitwarden.com/products/secrets-manager](https://bitwarden.com/products/secrets-manager/))
3. **API credentials** for each service you want to connect (details in Step 1)

> **Tip:** Each service is optional. If you only use NinjaOne and Todoist, only set up those two.

---

## Setup

### Step 1 — Get your API credentials

You only need to do this once per service. Skip any you don't use.

---

#### Microsoft Graph (Planner, Entra ID, OneDrive, Teams, Intune, MS Admin)

All of these services share a single app registration.

1. Go to [Entra ID](https://entra.microsoft.com) → **App registrations** → **New registration**
2. Give it a name (e.g. `Claude IT Ops`) and register
3. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
4. Add these permissions:

   | Permission | Used by |
   |-----------|----------------|
   | `Tasks.ReadWrite` | Planner |
   | `Group.Read.All` | Planner, Teams |
   | `ChannelMessage.Send` | Teams |
   | `Files.ReadWrite.All` | OneDrive |
   | `Policy.Read.All` | Entra ID |
   | `Application.Read.All` | Entra ID |
   | `RoleManagement.Read.Directory` | Entra ID |
   | `IdentityRiskyUser.ReadWrite.All` | Entra ID (requires P2) |
   | `UserAuthenticationMethod.Read.All` | Entra ID |
   | `DeviceManagementManagedDevices.Read.All` | Intune |
   | `DeviceManagementConfiguration.Read.All` | Intune |
   | `DeviceManagementApps.Read.All` | Intune |
   | `ServiceHealth.Read.All` | MS Admin |
   | `Organization.Read.All` | MS Admin |
   | `Directory.Read.All` | MS Admin |

5. Click **Grant admin consent**
6. Go to **Certificates & secrets** → **New client secret** → copy the value immediately (shown only once)
7. Note your **Tenant ID**, **Client ID**, and **Client secret value**

---

#### Microsoft Defender for Endpoint

MDE requires a **separate** app registration with different permissions.

1. Create a new app registration in Entra ID (e.g. `Claude MDE`)
2. Go to **API permissions** → **Add a permission** → **APIs my organization uses** → search for **WindowsDefenderATP**
3. Add **Application permissions**: `Machine.Read.All`, `Alert.Read.All`, `Ti.Read`, `Vulnerability.Read.All`
4. Grant admin consent
5. Create a client secret and note your **Tenant ID**, **Client ID**, and **Client secret**

> MDE is **read-only** — this integration can view devices, alerts, vulnerabilities, and IOCs but cannot isolate machines, trigger scans, or create indicators.

---

#### UniFi Cloud

1. Log in to [account.ui.com](https://account.ui.com)
2. Go to **API Keys** → create a new key
3. Copy the key value

---

#### UniFi Network Controller

For direct access to your UDM Pro, CloudKey, or self-hosted controller. You just need a local admin account.

You'll need:
- The controller's URL (e.g. `https://192.168.1.1`)
- An admin username and password

> The Network Controller integration is **read-only** — it can view networks, firewall rules, devices, and clients but cannot create rules, restart devices, or block clients.

---

#### NinjaOne

1. In NinjaOne, go to **Administration → Apps → API**
2. Create a new API application — choose **Client Credentials** as the grant type
3. Copy the **Client ID** and **Client Secret**

> NinjaOne is **read-only** — this integration can view servers, services, processes, patches, event logs, alerts, and backups but cannot run scripts, manage services, approve patches, or set maintenance windows.

---

#### Confluence

1. Log in to [id.atlassian.com](https://id.atlassian.com)
2. Go to **Security** → **API tokens** → **Create API token**
3. Copy the token value
4. Note your Confluence **domain** (the part before `.atlassian.net` in your URL)

---

#### Todoist

1. Log in to Todoist and go to **Settings → Integrations → Developer**
2. Copy your **API token**

---

#### Brave Search

1. Go to [api.search.brave.com](https://api.search.brave.com) and sign up
2. Create a subscription (free tier: 2,000 queries/month)
3. Copy your **API key**

---

### Step 2 — Add credentials to Bitwarden Secrets Manager

In [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/), create a **machine account** and generate an access token for it. This token is the only thing you'll need to give Claude later.

Then create a secret for each credential below. The **Key** must match exactly — the server uses these names to find the right values.

**Microsoft Graph (Planner, Entra ID, OneDrive, Teams, Intune, MS Admin)**

| Key | Value |
|-----|-------|
| `GRAPH_TENANT_ID` | Your Azure tenant ID |
| `GRAPH_CLIENT_ID` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | App registration client secret |

**Microsoft Defender for Endpoint**

| Key | Value |
|-----|-------|
| `MDE_TENANT_ID` | Your Azure tenant ID |
| `MDE_CLIENT_ID` | MDE app registration client ID |
| `MDE_CLIENT_SECRET` | MDE app registration client secret |

**UniFi Cloud**

| Key | Value |
|-----|-------|
| `UNIFI_API_KEY` | Your UniFi Cloud API key |

**UniFi Network Controller**

| Key | Value |
|-----|-------|
| `UNIFI_CONTROLLER_URL` | e.g. `https://192.168.1.1` |
| `UNIFI_USERNAME` | Controller admin username |
| `UNIFI_PASSWORD` | Controller admin password |

**NinjaOne**

| Key | Value |
|-----|-------|
| `NINJA_CLIENT_ID` | NinjaOne API client ID |
| `NINJA_CLIENT_SECRET` | NinjaOne API client secret |

**Confluence**

| Key | Value |
|-----|-------|
| `CONFLUENCE_DOMAIN` | Your org subdomain (e.g. `mycompany` for `mycompany.atlassian.net`) |
| `CONFLUENCE_EMAIL` | The email address associated with the API token |
| `CONFLUENCE_API_TOKEN` | The API token |

**Todoist**

| Key | Value |
|-----|-------|
| `TODOIST_API_TOKEN` | Your Todoist personal API token |

**Brave Search**

| Key | Value |
|-----|-------|
| `BRAVE_SEARCH_API_KEY` | Your Brave Search API key |

Make sure the machine account has access to all the secrets you created.

---

### Step 3 — Build the Docker image

```bash
cd mcp-server
docker build -t it-ops-mcp .
```

This only needs to be done once, or again after pulling updates.

---

### Step 4 — Connect to Claude

Pick whichever client you use:

**Claude Desktop**

Open the config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add this block (replace the token with your Bitwarden machine account access token):

```json
{
  "mcpServers": {
    "it-ops": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "BWS_ACCESS_TOKEN=your-access-token-here",
        "it-ops-mcp"
      ]
    }
  }
}
```

**Claude Code**

```bash
claude mcp add it-ops -- docker run -i --rm -e BWS_ACCESS_TOKEN=your-access-token-here it-ops-mcp
```

Restart Claude. On startup, the server will log which services loaded successfully and warn about any with missing credentials.

---

## External MCP servers

The following tools are separate MCP servers that run alongside this one. They're not bundled into the Docker image — add them to your Claude config individually.

### Desktop Commander

Gives Claude terminal access and the ability to run commands on your local machine.

```json
{
  "mcpServers": {
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@wonderwhy-er/desktop-commander"]
    }
  }
}
```

### Filesystem

Gives Claude read/write access to specific local directories you allow.

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

### Obsidian

Requires the **Local REST API** community plugin installed and enabled in Obsidian.

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["-y", "mcp-obsidian", "http://127.0.0.1:27123"],
      "env": {
        "OBSIDIAN_API_KEY": "your-local-rest-api-key"
      }
    }
  }
}
```

### Excalidraw

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "npx",
      "args": ["-y", "excalidraw-mcp"]
    }
  }
}
```

> For Claude Desktop, add each block inside the `"mcpServers"` object alongside `"it-ops"`. For Claude Code, use `claude mcp add <name> -- npx ...`.

---

## Using it

Once connected, just talk to Claude naturally. It knows which tools are available and will pick the right ones.

A few things worth knowing:

- **You don't need IDs.** For Planner tasks, Todoist projects, NinjaOne servers, and UniFi sites — Claude can search by name or description. Just say "the production database server" and it'll find it.
- **Some integrations are intentionally read-only.** NinjaOne, UniFi Network Controller, and Defender for Endpoint will only query — they cannot make changes. This is by design.
- **Mix and match tools freely.** Claude can pull info from multiple services in one go — e.g. checking NinjaOne for disk alerts and creating a Todoist task about it in the same response.

---

## Tool reference

A complete list of every tool Claude can use, grouped by service.

### Planner

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

| Tool | What it does |
|------|-------------|
| `planner_list_plans` | List all plans in a Microsoft 365 group |
| `planner_get_plan` | Get details of a specific plan |
| `planner_create_plan` | Create a new plan |
| `planner_list_buckets` | List the columns/buckets in a plan |
| `planner_create_bucket` | Add a new column to a plan |
| `planner_list_tasks` | List tasks in a plan or a specific bucket |
| `planner_get_task` | Get a task's details |
| `planner_create_task` | Create a task, optionally with assignee, due date, and checklist |
| `planner_update_task` | Update title, due date, progress, or move to another bucket |
| `planner_delete_task` | Delete a task |
| `planner_get_task_details` | Get the full notes and checklist for a task |
| `planner_update_task_notes` | Edit the notes/description on a task |
| `planner_update_checklist_item` | Add, tick off, rename, or remove a checklist item |

> Planner doesn't have a native comments feature — the **notes field** on each task is the place for running commentary.

---

### Entra ID

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

| Tool | What it does |
|------|-------------|
| `entra_get_user_mfa_methods` | List all MFA methods registered for a user |
| `entra_list_conditional_access_policies` | List Conditional Access policies and their state |
| `entra_list_app_registrations` | List app registrations with credential expiry dates |
| `entra_list_expiring_secrets` | Find secrets and certificates expiring within N days |
| `entra_list_directory_roles` | List active directory roles (Global Admin, etc.) |
| `entra_get_role_members` | See who is assigned to a specific role |
| `entra_list_risky_users` | List users flagged by Identity Protection |
| `entra_dismiss_risky_user` | Mark users as safe after investigation |

---

### OneDrive

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

| Tool | What it does |
|------|-------------|
| `onedrive_get_user_drive` | Get a user's drive ID and quota |
| `onedrive_list_items` | List files and folders in a location |
| `onedrive_get_item` | Get metadata for a specific file or folder |
| `onedrive_search_files` | Search a drive by filename or content keyword |
| `onedrive_create_folder` | Create a new folder |
| `onedrive_create_sharing_link` | Generate a shareable link (view, edit, or embed) |

---

### Teams

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`

| Tool | What it does |
|------|-------------|
| `teams_list_teams` | List all Teams in the tenant |
| `teams_list_channels` | List channels in a Team |
| `teams_send_message` | Post a message to a channel |
| `teams_list_messages` | Read recent messages in a channel |
| `teams_create_channel` | Create a new channel |
| `teams_add_member` | Add a user to a Team as member or owner |

---

### MS Intune 🔒

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
>
> Read-only. Requires `DeviceManagementManagedDevices.Read.All`, `DeviceManagementConfiguration.Read.All`, `DeviceManagementApps.Read.All`.

| Tool | What it does |
|------|-------------|
| `intune_list_devices` | List enrolled devices — filter by OS or compliance state |
| `intune_get_device` | Get full hardware, OS, encryption, and sync details for a device |
| `intune_get_device_compliance` | See which compliance policies pass or fail on a device |
| `intune_list_compliance_policies` | List all compliance policies and their platforms |
| `intune_list_device_configurations` | List device config profiles (Wi-Fi, VPN, restrictions, etc.) |
| `intune_list_apps` | List managed apps deployed via Intune |

---

### MS Admin 🔒

> Needs: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
>
> Read-only. Requires `ServiceHealth.Read.All`, `Organization.Read.All`, `Directory.Read.All`.

| Tool | What it does |
|------|-------------|
| `admin_get_service_health` | Health overview for all M365 services (Exchange, Teams, SharePoint, etc.) |
| `admin_list_service_incidents` | Active and recent incidents and advisories |
| `admin_list_message_center` | Upcoming changes and required admin actions from the M365 Message Center |
| `admin_get_tenant_info` | Tenant display name, verified domains, country, and technical contacts |
| `admin_list_domains` | All domains registered to the tenant with verification status |
| `admin_list_subscriptions` | License subscriptions — total seats, consumed, and remaining |
| `admin_get_user_licenses` | Licenses assigned to a specific user |

---

### Defender for Endpoint 🔒

> Needs: `MDE_TENANT_ID`, `MDE_CLIENT_ID`, `MDE_CLIENT_SECRET`
>
> Read-only. Requires a separate app registration with WindowsDefenderATP permissions.

| Tool | What it does |
|------|-------------|
| `mde_list_devices` | List enrolled devices — filter by health status or risk score |
| `mde_get_device` | Get full details for a specific device |
| `mde_get_device_vulnerabilities` | List CVEs on a device with severity and remediation info |
| `mde_list_alerts` | List alerts — filter by severity and status |
| `mde_list_indicators` | List custom IOCs (blocked IPs, domains, hashes) |
| `mde_get_security_recommendations` | List TVM remediation priorities by exposure impact |

---

### Todoist

> Needs: `TODOIST_API_TOKEN`

| Tool | What it does |
|------|-------------|
| `todoist_list_projects` | List all projects with IDs, names, and hierarchy |
| `todoist_list_sections` | List sections within a project |
| `todoist_list_tasks` | List tasks — filter by project, section, label, or filter query |
| `todoist_get_task` | Get full details of a specific task |
| `todoist_create_task` | Create a task with optional due date, priority, and labels |
| `todoist_update_task` | Update a task's content, due date, priority, or labels |
| `todoist_close_task` | Mark a task as complete |
| `todoist_delete_task` | Permanently delete a task |

> Filter query examples: `'today'`, `'overdue'`, `'p1'`, `'overdue & p1'`.

---

### Brave Search

> Needs: `BRAVE_SEARCH_API_KEY`

| Tool | What it does |
|------|-------------|
| `brave_web_search` | Search the web — returns titles, URLs, and descriptions |
| `brave_news_search` | Search for recent news — filter by freshness (day/week/month/year) |

---

### UniFi Cloud 🔒

> Needs: `UNIFI_API_KEY`

| Tool | What it does |
|------|-------------|
| `unifi_list_sites` | List all your UniFi sites |
| `unifi_get_site` | Get details and a device summary for a site |
| `unifi_list_site_devices` | List every device at a site (APs, switches, gateways, Fabric) |
| `unifi_get_site_device` | Get full details on a specific device |

---

### UniFi Network Controller 🔒

> Needs: `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, `UNIFI_PASSWORD`
>
> Read-only. Works with UDM Pro, CloudKey Gen2+, and self-hosted Network Application.

| Tool | What it does |
|------|-------------|
| `unifi_get_site_health` | Check WAN status, client counts, and any active alerts |
| `unifi_list_networks` | List all VLANs and networks |
| `unifi_list_firewall_rules` | List firewall rules |
| `unifi_list_controller_devices` | List APs, switches, and gateways with their status |
| `unifi_list_clients` | List connected clients with IP, hostname, and signal |

---

### NinjaOne RMM 🔒

> Needs: `NINJA_CLIENT_ID`, `NINJA_CLIENT_SECRET`
>
> Read-only. Filtered to servers (Windows Server and Linux) by default.

**Finding servers**

| Tool | What it does |
|------|-------------|
| `ninja_list_servers` | List your servers — filter by org, paginate with cursor |
| `ninja_get_server` | Get OS, hardware specs, IP, agent version, and uptime |

**Windows Services**

| Tool | What it does |
|------|-------------|
| `ninja_list_services` | List services and whether they're running |

**Processes**

| Tool | What it does |
|------|-------------|
| `ninja_list_processes` | See what's running and how much CPU/memory it's using |

**Scripts**

| Tool | What it does |
|------|-------------|
| `ninja_list_scripts` | List scripts in the NinjaOne script library |
| `ninja_get_script` | Get the full content of a script |
| `ninja_get_script_result` | Get the output and exit code of a previously run script |

**Patch management**

| Tool | What it does |
|------|-------------|
| `ninja_list_pending_patches` | See what patches are waiting to be installed |
| `ninja_get_patch_history` | See what's already been installed |

**Storage**

| Tool | What it does |
|------|-------------|
| `ninja_list_volumes` | Check disk space on all drives |

**Event logs**

| Tool | What it does |
|------|-------------|
| `ninja_get_event_logs` | Search System, Security, or Application logs — filter by level, source, or event ID |

**Alerts**

| Tool | What it does |
|------|-------------|
| `ninja_list_device_alerts` | See active alerts on a server |

**Backups**

| Tool | What it does |
|------|-------------|
| `ninja_list_device_backups` | List backup jobs for a specific server |
| `ninja_list_all_backups` | Fleet-wide backup health overview |

**Custom fields**

| Tool | What it does |
|------|-------------|
| `ninja_get_device_custom_fields` | Read custom field values on a device |
| `ninja_get_org_custom_fields` | Read custom field values on an organization |

---

### Confluence

> Needs: `CONFLUENCE_DOMAIN`, `CONFLUENCE_EMAIL`, `CONFLUENCE_API_TOKEN`

| Tool | What it does |
|------|-------------|
| `confluence_list_spaces` | List all Confluence spaces |
| `confluence_search_pages` | Search pages using CQL |
| `confluence_get_page` | Get the full content of a page |
| `confluence_get_page_children` | List child pages under a parent |
| `confluence_create_page` | Create a new page in a space |
| `confluence_update_page` | Edit a page's title or content |
| `confluence_get_page_comments` | List comments on a page |
| `confluence_add_page_comment` | Add a comment to a page |

---

## Development

To run the server locally without Docker (e.g. to test changes):

```bash
cd mcp-server
cp .env.example .env
# Edit .env and fill in credentials directly — this skips Bitwarden
npm install
npm run dev
```

To browse all available tools interactively:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

Other useful commands:

```bash
npm run typecheck   # check for type errors without building
npm run build       # compile TypeScript to dist/
npm start           # run the compiled server
```

---

## Self-hosted Bitwarden

If you run your own Bitwarden instance rather than the cloud service, add two more secrets pointing to it:

| Key | Value |
|-----|-------|
| `BWS_API_URL` | e.g. `https://bitwarden.yourcompany.com/api` |
| `BWS_IDENTITY_URL` | e.g. `https://bitwarden.yourcompany.com/identity` |

---

## Troubleshooting

**A service isn't working and Claude says it's not configured**

The server logs a warning at startup for any service with missing credentials. Check that the secret keys in Bitwarden match exactly — they're case-sensitive. You can also test credentials by running locally with a `.env` file before involving Bitwarden.

**Planner update fails with "412 Precondition Failed"**

This happens when the task or task details have been modified since you last fetched them. Ask Claude to re-fetch the task and try the update again — it will get a fresh copy with the right version tag.

**UniFi controller keeps asking to log in again**

The controller session lasts about an hour and refreshes automatically. If it's happening repeatedly, double-check the controller URL, username, and password in Bitwarden.

**MDE tools fail with "403 Forbidden"**

Make sure you're using the correct (separate) MDE app registration, not the Graph one. The permissions for WindowsDefenderATP must be set on that specific registration and admin consent must be granted.

**Docker image doesn't work on this machine's architecture**

Build the image directly on the machine where it will run rather than copying an image across. The Bitwarden native addon installs the correct binary for the platform automatically during the build.
