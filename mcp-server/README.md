# IT Operations MCP Server

This gives Claude direct access to your IT operations stack. Instead of switching between tabs and portals, you can ask Claude in plain English and it will query or act on your systems directly.

**Example things you can ask:**

> *"Check if the SQL Server service is running on PROD-DB-01 and restart it if not."*

> *"Create a Planner task in the Infrastructure board, add a checklist for the deployment steps, and assign it to me."*

> *"List any critical alerts on our servers and put anything with high disk usage into maintenance mode while I investigate."*

> *"Show me what clients are connected to the guest VLAN and block the unknown MAC addresses."*

---

## What's included

| System | What Claude can do |
|--------|--------------------|
| **Microsoft Planner** | Create and update plans, tasks, checklists, and notes |
| **UniFi (Cloud)** | View sites and devices across all locations |
| **UniFi (Controller)** | Manage VLANs, firewall rules, devices, and connected clients |
| **NinjaOne RMM** | Manage servers — services, processes, patches, event logs, scripts, alerts, and maintenance windows |

All four are independent. You can connect only the ones you use.

---

## Before you start

You'll need:

1. **Docker** installed on the machine running Claude
2. **Bitwarden Secrets Manager** — this is where your credentials live. The server fetches them on startup so nothing sensitive is ever stored in the image or config files.
3. **API credentials** for each service you want to connect (details below)

---

## Setup

### Step 1 — Get your API credentials

You only need to do this once per service. Skip any you don't use.

---

#### Microsoft Planner

Planner is accessed through Microsoft's Graph API, which requires an App Registration in your Azure tenant.

1. Go to [Entra ID](https://entra.microsoft.com) → **App registrations** → **New registration**
2. Give it a name (e.g. `Claude IT Ops`) and register
3. Go to **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**
4. Add these three permissions:

   | Permission | Why it's needed |
   |-----------|----------------|
   | `Tasks.ReadWrite` | Read and write Planner tasks |
   | `Group.Read.All` | Look up which groups own which plans |
   | `AuditLog.Read.All` | Read sign-in logs |

5. Click **Grant admin consent**
6. Go to **Certificates & secrets** → **New client secret** → copy the value immediately (it's only shown once)
7. Note down your **Tenant ID**, **Client ID**, and the **Client secret value**

---

#### UniFi Cloud

1. Log in to [account.ui.com](https://account.ui.com)
2. Go to **API Keys** → create a new key
3. Copy the key value

---

#### UniFi Network Controller

This is for direct access to your UDM Pro, CloudKey, or self-hosted controller — for things like managing VLANs and firewall rules. You just need a local admin account on the controller.

You'll need:
- The controller's URL (e.g. `https://192.168.1.1`)
- An admin username and password

---

#### NinjaOne

1. In NinjaOne, go to **Administration → Apps → API**
2. Create a new API application — choose **Client Credentials** as the grant type
3. Copy the **Client ID** and **Client Secret**

---

### Step 2 — Add credentials to Bitwarden Secrets Manager

In [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/), create a **machine account** and generate an access token for it. This token is the only thing you'll need to give Claude later.

Then create a secret for each credential. The **Key** must match exactly as shown — the server uses these names to find the right values.

**Microsoft Planner**

| Key | Value |
|-----|-------|
| `GRAPH_TENANT_ID` | Your Azure tenant ID |
| `GRAPH_CLIENT_ID` | App registration client ID |
| `GRAPH_CLIENT_SECRET` | App registration client secret |

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

Make sure the machine account has access to all the secrets you created.

---

### Step 3 — Build the Docker image

```bash
cd mcp-server
docker build -t it-ops-mcp .
```

This only needs to be done once (or again after pulling updates).

---

### Step 4 — Connect to Claude

Pick whichever you use:

**Claude Desktop**

Open the config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add this (replace the token with your Bitwarden machine account access token):

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

Restart Claude. When the server starts it will log which services loaded successfully and warn about any that are missing credentials.

---

## Using it

Once connected, just talk to Claude naturally. It knows which tools are available and will pick the right ones. A few tips:

- For **Planner tasks**, you don't need to know task IDs — Claude can search by plan name, group, or description and find the right one.
- For **NinjaOne**, if you say "the production database server" Claude will search for it rather than asking for an ID.
- For **UniFi**, you can refer to sites and devices by name.
- If you ask Claude to do something that modifies a system (restart a service, block a client, create a firewall rule), it will tell you what it's about to do before acting.

---

## Development

If you want to run the server locally without Docker (e.g. to test changes):

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

If you run your own Bitwarden instance rather than the cloud service, add two more secrets pointing to your instance:

| Key | Value |
|-----|-------|
| `BWS_API_URL` | e.g. `https://bitwarden.yourcompany.com/api` |
| `BWS_IDENTITY_URL` | e.g. `https://bitwarden.yourcompany.com/identity` |

---

## Tool reference

A complete list of what Claude can do with each service.

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

### UniFi Cloud

> Needs: `UNIFI_API_KEY`

| Tool | What it does |
|------|-------------|
| `unifi_list_sites` | List all your UniFi sites |
| `unifi_get_site` | Get details and a device summary for a site |
| `unifi_list_site_devices` | List every device at a site (APs, switches, gateways, Fabric) |
| `unifi_get_site_device` | Get full details on a specific device |

---

### UniFi Network Controller

> Needs: `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, `UNIFI_PASSWORD`
>
> Works with UDM Pro, CloudKey Gen2+, and self-hosted Network Application.

| Tool | What it does |
|------|-------------|
| `unifi_get_site_health` | Check WAN status, client counts, and any active alerts |
| `unifi_list_networks` | List all VLANs and networks |
| `unifi_create_network` | Create a new VLAN |
| `unifi_list_firewall_rules` | List firewall rules |
| `unifi_create_firewall_rule` | Create a new firewall rule |
| `unifi_list_controller_devices` | List APs, switches, and gateways with their status |
| `unifi_restart_device` | Reboot a network device |
| `unifi_list_clients` | List connected clients with IP, hostname, and signal |
| `unifi_block_client` | Block or unblock a device by MAC address |

---

### NinjaOne RMM

> Needs: `NINJA_CLIENT_ID`, `NINJA_CLIENT_SECRET`
>
> Filtered to servers (Windows Server and Linux) by default.

**Finding servers**
| Tool | What it does |
|------|-------------|
| `ninja_list_servers` | List your servers — filter by org, paginate with cursor |
| `ninja_get_server` | Get OS, hardware specs, IP, agent version, and uptime |

**Windows Services**
| Tool | What it does |
|------|-------------|
| `ninja_list_services` | List services and whether they're running |
| `ninja_manage_service` | Start, stop, or restart a service |

**Processes**
| Tool | What it does |
|------|-------------|
| `ninja_list_processes` | See what's running and how much CPU/memory it's using |
| `ninja_terminate_process` | Kill a process by PID |

**Running scripts**
| Tool | What it does |
|------|-------------|
| `ninja_run_script` | Run a PowerShell, CMD, or Bash script on a server |
| `ninja_get_script_result` | Get the output and exit code once it's finished |

> Scripts run asynchronously. After `ninja_run_script` returns a `result_id`, call `ninja_get_script_result` a few seconds later to get the output.

**Patch management**
| Tool | What it does |
|------|-------------|
| `ninja_list_pending_patches` | See what patches are waiting to be installed |
| `ninja_approve_patches` | Approve patches to install now or on a schedule |
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
| `ninja_acknowledge_alert` | Acknowledge or clear an alert, with an optional note |

**Maintenance windows**
| Tool | What it does |
|------|-------------|
| `ninja_set_maintenance_mode` | Pause monitoring for a server during planned work (5 min up to 24 h) |
| `ninja_exit_maintenance_mode` | Resume monitoring early |

---

## Troubleshooting

**A service isn't working and Claude says it's not configured**
The server logs a warning at startup for any service with missing credentials. Check that the secret keys in Bitwarden match exactly — they're case-sensitive. You can also test credentials by running locally with a `.env` file before involving Bitwarden.

**Planner update fails with "412 Precondition Failed"**
This happens when the task or task details have been modified since you last fetched them. Ask Claude to re-fetch the task and try the update again — it will get a fresh version.

**UniFi controller keeps asking to log in again**
The controller session lasts about an hour and refreshes automatically. If it's happening repeatedly, double-check the controller URL, username, and password in Bitwarden.

**NinjaOne script says PENDING and never finishes**
Scripts run in the background on the remote agent. It usually takes a few seconds, but can take longer on slower machines or with complex scripts. Ask Claude to check the result again.

**Docker image doesn't work on this machine's architecture**
Build the image directly on the machine where it will run rather than copying an image from another machine. The Bitwarden native addon installs the right binary for the platform automatically during the build.
