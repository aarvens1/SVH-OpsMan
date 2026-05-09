# SVH OpsMan — Custom MCP Server

TypeScript MCP server covering the **Custom** integrations listed in the root README. Runs in WSL via Node.js — no Docker.

---

## Quick start

```bash
npm install
cp .env.example .env   # fill in credentials for the services you use
npm run dev            # run from source with tsx (development)
# or
npm run build && npm start   # run compiled output (production)
```

The server prints which service groups loaded on startup:

```
[svh-opsman] Starting — 7/12 service groups configured
[svh-opsman] Ready — listening on stdio
```

Services with missing credentials log a warning and their tools return a clear error message — they won't crash the server.

---

## Dev commands

```bash
npm run dev        # run src/index.ts via tsx (hot-reload friendly, restart manually)
npm run build      # compile TypeScript → dist/
npm start          # run dist/index.js
npm run typecheck  # type-check without building
```

To browse all tools interactively:

```bash
npm run build
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## Adding a new tool

1. Create `src/tools/your-service.ts` — export `registerYourServiceTools(server, enabled)`.
2. Follow the existing pattern: `disabled()` / `ok()` / `err()` helpers, `server.registerTool(name, {description, inputSchema}, handler)`.
3. If the service needs a new auth client, add it to `src/auth/` and a client factory to `src/utils/http.ts`.
4. Add the service check and registration call to `src/index.ts`.
5. Add env var examples to `.env.example`.

---

## Tool reference

Grouped by service. All tools return JSON unless noted.

### Planner
`planner_list_plans` · `planner_get_plan` · `planner_create_plan` · `planner_list_buckets` · `planner_create_bucket` · `planner_list_tasks` · `planner_get_task` · `planner_create_task` · `planner_update_task` · `planner_delete_task` · `planner_get_task_details` · `planner_update_task_notes` · `planner_update_checklist_item`

### Microsoft To Do
`todo_list_task_lists` · `todo_list_tasks` · `todo_get_task` · `todo_create_task` · `todo_update_task` · `todo_add_checklist_item`

### Entra ID
`entra_get_user_mfa_methods` · `entra_list_conditional_access_policies` · `entra_list_app_registrations` · `entra_list_expiring_secrets` · `entra_list_directory_roles` · `entra_get_role_members` · `entra_list_risky_users` · `entra_dismiss_risky_user` · `entra_get_sign_in_logs` · `entra_get_audit_logs`

### OneDrive / SharePoint Files
`onedrive_get_user_drive` · `onedrive_list_items` · `onedrive_get_item` · `onedrive_search_files` · `onedrive_create_folder` · `onedrive_create_sharing_link`

### SharePoint Sites 🔒
`sp_search_sites` · `sp_get_site` · `sp_list_site_lists` · `sp_get_list_items` · `sp_list_site_pages` · `sp_get_site_permissions` · `sp_list_content_types`

### Teams
`teams_list_teams` · `teams_list_channels` · `teams_send_message` · `teams_list_messages` · `teams_create_channel` · `teams_add_member`

### Outlook Mail
`mail_search` · `mail_get_message` · `mail_send` · `mail_draft` · `mail_list_folders` · `mail_move_message`

### Outlook Calendar
`calendar_list_events` · `calendar_get_event` · `calendar_create_event` · `calendar_update_event` · `calendar_delete_event` · `calendar_find_meeting_times` · `calendar_list_rooms`

### Exchange Admin 🔒
`exo_get_mailbox` · `exo_list_distribution_groups` · `exo_list_group_members` · `exo_list_accepted_domains` · `exo_message_trace` · `exo_get_mailbox_auto_reply`

> Full mail flow rule and transport connector management requires Exchange Online PowerShell. Use Desktop Commander: `Connect-ExchangeOnline; Get-TransportRule`.

### MS Intune 🔒
`intune_list_devices` · `intune_get_device` · `intune_get_device_compliance` · `intune_list_compliance_policies` · `intune_list_device_configurations` · `intune_list_apps`

### MS Admin 🔒
`admin_get_service_health` · `admin_list_service_incidents` · `admin_list_message_center` · `admin_get_tenant_info` · `admin_list_domains` · `admin_list_subscriptions` · `admin_get_user_licenses`

### Defender for Endpoint 🔒
`mde_list_devices` · `mde_get_device` · `mde_get_device_vulnerabilities` · `mde_list_alerts` · `mde_list_indicators` · `mde_get_security_recommendations`

### Azure 🔒
`azure_list_resource_groups` · `azure_list_vms` · `azure_get_vm` · `azure_list_storage_accounts` · `azure_list_app_services` · `azure_list_vnets` · `azure_list_nsgs` · `azure_get_activity_logs` · `azure_get_cost_summary` · `azure_list_advisor_recommendations`

### UniFi Cloud 🔒
`unifi_list_sites` · `unifi_get_site` · `unifi_list_site_devices` · `unifi_get_site_device`

### UniFi Network Controller 🔒
`unifi_get_site_health` · `unifi_list_networks` · `unifi_list_firewall_rules` · `unifi_list_controller_devices` · `unifi_list_clients` · `unifi_list_wlans` · `unifi_list_port_profiles` · `unifi_get_switch_ports`

### NinjaOne 🔒
`ninja_list_servers` · `ninja_get_server` · `ninja_list_services` · `ninja_list_processes` · `ninja_list_scripts` · `ninja_get_script` · `ninja_get_script_result` · `ninja_list_pending_patches` · `ninja_get_patch_history` · `ninja_list_volumes` · `ninja_get_event_logs` · `ninja_list_device_alerts` · `ninja_list_device_backups` · `ninja_list_all_backups` · `ninja_get_device_custom_fields` · `ninja_get_org_custom_fields` · `ninja_list_organizations` · `ninja_get_organization`

### Wazuh 🔒
`wazuh_list_agents` · `wazuh_search_alerts` · `wazuh_get_agent_vulnerabilities` · `wazuh_get_fim_events` · `wazuh_get_rootcheck` · `wazuh_search_rules` · `wazuh_search_decoders`

### Confluence
`confluence_list_spaces` · `confluence_search_pages` · `confluence_get_page` · `confluence_get_page_children` · `confluence_create_page` · `confluence_update_page` · `confluence_get_page_comments` · `confluence_add_page_comment`

### Todoist
`todoist_list_projects` · `todoist_list_sections` · `todoist_list_tasks` · `todoist_get_task` · `todoist_create_task` · `todoist_update_task` · `todoist_close_task` · `todoist_delete_task`

### PrinterLogic 🔒
`pl_list_printers` · `pl_get_printer` · `pl_list_drivers` · `pl_list_deployment_profiles` · `pl_get_deployment_status` · `pl_get_audit_logs` · `pl_get_print_quota` · `pl_get_usage_reports`

### Threat Intel 🔒
`ti_lookup_cve` · `ti_cisa_kev` · `ti_vt_lookup_ip` · `ti_vt_lookup_domain` · `ti_vt_lookup_hash` · `ti_vt_lookup_url` · `ti_shodan_lookup_ip` · `ti_abuseipdb_check` · `ti_urlscan_search` · `ti_greynoise_lookup` · `ti_mitre_lookup`

---

## Common issues

**Service shows as not configured / tools return errors**
Check that the env var names in `.env` match exactly (they're case-sensitive). Run `npm run dev` and look at the startup warnings.

**Planner update fails with 412 Precondition Failed**
Re-fetch the task before updating — Planner requires the current ETag. Ask Claude to retry from a fresh fetch.

**UniFi controller session expires**
Sessions refresh automatically but last ~1 hour. If you see repeated auth errors, check that `UNIFI_CONTROLLER_URL`, `UNIFI_USERNAME`, and `UNIFI_PASSWORD` are correct and the controller is reachable from WSL.

**Wazuh TLS errors**
The Wazuh client skips certificate verification by default (on-prem installations use self-signed certs). If you're seeing connection refused, check that `WAZUH_URL` uses `https://` and the port (default 55000) is reachable.
