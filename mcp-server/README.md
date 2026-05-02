# IT Operations MCP Server

A TypeScript/Node.js [Model Context Protocol](https://modelcontextprotocol.io) server that exposes IT operations tooling as Claude tools. Runs locally via stdio and connects to Claude Code or Claude Desktop.

**43 tools across 4 services:**

| Service | Tools | What you can do |
|---------|-------|-----------------|
| Microsoft Graph — Planner | 13 | Manage plans, buckets, tasks, notes, and checklists |
| UniFi Cloud (api.ui.com) | 4 | Browse sites and device inventory across all locations |
| UniFi Network Controller | 9 | Configure VLANs, firewall rules, devices, and clients |
| NinjaOne RMM | 17 | Manage servers: services, processes, patches, event logs, scripts, alerts, maintenance mode |

---

## How it works

```
Claude ──stdio──▶ Docker container
                      │
                      ├─ startup: fetch credentials from Bitwarden Secrets Manager
                      │
                      ├─ Microsoft Graph  (OAuth2 client credentials, token cached)
                      ├─ UniFi Cloud      (API key)
                      ├─ UniFi Controller (Bearer token, auto-refreshed on 401)
                      └─ NinjaOne RMM     (OAuth2 client credentials, token cached)
```

Credentials are never baked into the image. The container receives a single `BWS_ACCESS_TOKEN` at runtime and fetches everything else from Bitwarden Secrets Manager on startup.

---

## Prerequisites

- Docker
- A [Bitwarden Secrets Manager](https://bitwarden.com/products/secrets-manager/) account with a machine account and access token
- API credentials for whichever services you want to enable (each service is independently optional)

---

## 1. Configure Bitwarden Secrets Manager

Create secrets in Bitwarden Secrets Manager. Each secret's **Key** must exactly match the environment variable name below, and the **Value** is the credential.

### Microsoft Graph / Planner

Create an App Registration in [Entra ID](https://entra.microsoft.com) with the following **application** permissions (not delegated):

| Permission | Purpose |
|-----------|---------|
| `Tasks.ReadWrite` | Read and write Planner tasks |
| `Group.Read.All` | List groups to find plan owners |
| `AuditLog.Read.All` | Read sign-in logs (if using Entra tools) |

Grant admin consent, then create a client secret.

| Bitwarden key | Value |
|---------------|-------|
| `GRAPH_TENANT_ID` | Your Azure AD tenant ID |
| `GRAPH_CLIENT_ID` | App registration client (application) ID |
| `GRAPH_CLIENT_SECRET` | App registration client secret value |

### UniFi Cloud (Site Manager)

Generate an API key at [account.ui.com](https://account.ui.com) → API Keys.

| Bitwarden key | Value |
|---------------|-------|
| `UNIFI_API_KEY` | Your UniFi Cloud API key |

### UniFi Network Controller

For direct controller access (UDM Pro, CloudKey Gen2+, or self-hosted Network Application). Requires a local admin account on the controller.

| Bitwarden key | Value |
|---------------|-------|
| `UNIFI_CONTROLLER_URL` | Base URL of your controller (e.g. `https://192.168.1.1`) |
| `UNIFI_USERNAME` | Controller admin username |
| `UNIFI_PASSWORD` | Controller admin password |

> The controller uses a self-signed certificate by default. TLS verification is disabled for controller connections.

### NinjaOne RMM

In NinjaOne: **Administration → Apps → API** → create a new API application with **Client Credentials** grant type.

| Bitwarden key | Value |
|---------------|-------|
| `NINJA_CLIENT_ID` | NinjaOne API client ID |
| `NINJA_CLIENT_SECRET` | NinjaOne API client secret |

---

## 2. Build the Docker image

```bash
cd mcp-server
docker build -t it-ops-mcp .
```

---

## 3. Connect to Claude

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "it-ops": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "BWS_ACCESS_TOKEN=<your-access-token>",
        "it-ops-mcp"
      ]
    }
  }
}
```

### Claude Code

```bash
claude mcp add it-ops -- docker run -i --rm -e BWS_ACCESS_TOKEN=<your-access-token> it-ops-mcp
```

Restart Claude after updating the config. On startup the server logs which services are configured.

---

## Local development (without Docker)

```bash
cd mcp-server
cp .env.example .env
# Fill in credentials directly in .env — dotenv loads them as a fallback
# when BWS_ACCESS_TOKEN is not set

npm install
npm run dev       # run via tsx (no compile step)
npm run typecheck # type-check only
npm run build     # compile to dist/
npm start         # run compiled output
```

To inspect available tools without Claude:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## Self-hosted Bitwarden

If you run your own Bitwarden instance, add these two additional secrets (or set them in `.env` locally):

| Key | Value |
|-----|-------|
| `BWS_API_URL` | e.g. `https://bitwarden.yourcompany.com/api` |
| `BWS_IDENTITY_URL` | e.g. `https://bitwarden.yourcompany.com/identity` |

---

## Tool reference

### Microsoft Graph — Planner

> Requires: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`
>
> **Note:** All PATCH and DELETE operations require an `etag` — fetch it from the corresponding GET tool's `@odata.etag` field. Planner has no native comments; the `description` field on task details is the notes area.

| Tool | Description |
|------|-------------|
| `planner_list_plans` | List all Planner plans belonging to an M365 group |
| `planner_get_plan` | Get details of a specific plan |
| `planner_create_plan` | Create a new plan in an M365 group |
| `planner_list_buckets` | List all buckets (columns) in a plan |
| `planner_create_bucket` | Create a new bucket in a plan |
| `planner_list_tasks` | List tasks in a plan, optionally filtered to a bucket |
| `planner_get_task` | Get a task's fields and the `@odata.etag` needed for updates |
| `planner_create_task` | Create a task with optional assignee, due date, and initial checklist items |
| `planner_update_task` | Update title, due date, percent complete, or bucket |
| `planner_delete_task` | Delete a task |
| `planner_get_task_details` | Get the notes/description and full checklist for a task |
| `planner_update_task_notes` | Update the notes/description field |
| `planner_update_checklist_item` | Add, check/uncheck, rename, or remove a checklist item |

**Checklist workflow:**

```
planner_get_task_details(task_id)          → get etag + current checklist
planner_update_checklist_item(task_id, etag, title="Deploy config")   → adds item
planner_update_checklist_item(task_id, etag, item_id=..., is_checked=true) → checks it off
planner_update_checklist_item(task_id, etag, item_id=..., delete=true)    → removes it
```

---

### UniFi Cloud

> Requires: `UNIFI_API_KEY`
>
> Covers all sites and devices visible to the API key, including UniFi Fabric devices.

| Tool | Description |
|------|-------------|
| `unifi_list_sites` | List all sites across all accounts |
| `unifi_get_site` | Get site details and device summary |
| `unifi_list_site_devices` | List all devices at a site with model, MAC, and status |
| `unifi_get_site_device` | Get full details for a specific device |

---

### UniFi Network Controller

> Requires: `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, `UNIFI_PASSWORD`
>
> Works with UniFi Dream Machine, CloudKey Gen2+, and self-hosted Network Application. The controller session token is cached for 1 hour and automatically refreshed on 401.

| Tool | Description |
|------|-------------|
| `unifi_get_site_health` | WAN status, client counts, and subsystem health for a site |
| `unifi_list_networks` | List VLANs and networks with subnet and DHCP settings |
| `unifi_create_network` | Create a new VLAN/network with optional DHCP |
| `unifi_list_firewall_rules` | List all firewall rules on a site |
| `unifi_create_firewall_rule` | Create a firewall rule (accept/drop/reject) |
| `unifi_list_controller_devices` | List managed APs, switches, and gateways with status |
| `unifi_restart_device` | Reboot a network device |
| `unifi_list_clients` | List connected clients with IP, hostname, and signal |
| `unifi_block_client` | Block or unblock a client by MAC address |

---

### NinjaOne RMM

> Requires: `NINJA_CLIENT_ID`, `NINJA_CLIENT_SECRET`
>
> Scoped to server management. Device listing defaults to `WINDOWS_SERVER,LINUX_SERVER` OS types. NinjaOne device IDs are integers returned by `ninja_list_servers`.

**Servers**

| Tool | Description |
|------|-------------|
| `ninja_list_servers` | List servers with optional org filter and cursor pagination |
| `ninja_get_server` | Get hardware specs, OS version, IP, agent version, and uptime |

**Windows Services**

| Tool | Description |
|------|-------------|
| `ninja_list_services` | List services with state and startup type |
| `ninja_manage_service` | Start, stop, or restart a service by name |

**Processes**

| Tool | Description |
|------|-------------|
| `ninja_list_processes` | List running processes with CPU and memory usage |
| `ninja_terminate_process` | Kill a process by PID |

**Scripting**

| Tool | Description |
|------|-------------|
| `ninja_run_script` | Run a PowerShell, CMD, or Bash script; returns a `result_id` |
| `ninja_get_script_result` | Fetch output and exit code of a queued script |

**Patch Management**

| Tool | Description |
|------|-------------|
| `ninja_list_pending_patches` | List available patches with KB article and severity |
| `ninja_approve_patches` | Approve patches for installation, optionally scheduled |
| `ninja_get_patch_history` | List previously installed patches |

**Storage**

| Tool | Description |
|------|-------------|
| `ninja_list_volumes` | List disk volumes with size, free space, and percent used |

**Event Logs**

| Tool | Description |
|------|-------------|
| `ninja_get_event_logs` | Query System, Security, or Application log with level/source/event ID filter |

**Alerts**

| Tool | Description |
|------|-------------|
| `ninja_list_device_alerts` | List active alerts for a server |
| `ninja_acknowledge_alert` | Acknowledge or clear an alert with an optional note |

**Maintenance Mode**

| Tool | Description |
|------|-------------|
| `ninja_set_maintenance_mode` | Suppress monitoring for a planned window (5 min – 24 h) |
| `ninja_exit_maintenance_mode` | Resume normal monitoring immediately |

---

## Project structure

```
mcp-server/
├── src/
│   ├── index.ts              # Entry point: secret loading, service checks, tool registration
│   ├── secrets.ts            # Bitwarden Secrets Manager integration
│   ├── auth/
│   │   ├── graph.ts          # OAuth2 token cache for Microsoft Graph
│   │   ├── ninja.ts          # OAuth2 token cache for NinjaOne
│   │   └── unifi.ts          # Session token manager for UniFi controller
│   ├── tools/
│   │   ├── planner.ts        # 13 Planner tools
│   │   ├── unifi-cloud.ts    # 4 UniFi Cloud tools
│   │   ├── unifi-network.ts  # 9 UniFi Network Controller tools
│   │   └── ninjaone.ts       # 17 NinjaOne tools
│   └── utils/
│       └── http.ts           # Axios client factories and error formatter
├── Dockerfile
├── .dockerignore
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Troubleshooting

**Service shows as not configured on startup**
All startup warnings go to stderr. Check that the Bitwarden secret keys match exactly (case-sensitive). Run locally with the individual env vars set to verify the credentials work before troubleshooting Bitwarden.

**Planner PATCH returns 412 Precondition Failed**
The `etag` is stale. Re-fetch the resource with the corresponding GET tool and use the fresh `@odata.etag` value.

**UniFi controller returns 401 after working**
The session token expired and auto-refresh failed. Verify `UNIFI_USERNAME` and `UNIFI_PASSWORD` are correct. The controller token has a 1-hour TTL and is automatically re-fetched on the next request.

**NinjaOne script result shows status PENDING**
Scripts are queued asynchronously. Call `ninja_get_script_result` again after a few seconds. Large scripts on slow agents may take longer.

**Docker image pulls wrong architecture**
The `@bitwarden/sdk-napi` native addon is installed from npm in the runtime stage, so it targets the container's architecture automatically. Rebuild the image on the target host rather than cross-building.
