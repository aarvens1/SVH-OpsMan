import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getNinjaToken } from "../auth/ninja.js";
import { ninjaClient, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "NinjaOne service not configured: set NINJA_CLIENT_ID and NINJA_CLIENT_SECRET";

function disabled() {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: DISABLED_MSG }],
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerNinjaOneTools(server: McpServer, enabled: boolean): void {
  // ── Device discovery ───────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_servers",
    {
      description:
        "List servers managed by NinjaOne, filtered to server OS types by default. " +
        "Returns node name, OS, IP, uptime, and online status.",
      inputSchema: z.object({
        os_filter: z
          .string()
          .default("WINDOWS_SERVER,LINUX_SERVER")
          .describe("Comma-separated NinjaOne OS type filter (e.g. WINDOWS_SERVER,LINUX_SERVER)"),
        org_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific organization ID"),
        page_size: z.number().int().min(1).max(200).default(50),
        after: z
          .string()
          .optional()
          .describe("Cursor from previous response for pagination"),
      }),
    },
    async ({ os_filter, org_id, page_size, after }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = {
          pageSize: page_size,
          filter: os_filter
            .split(",")
            .map((t) => `osType:${t.trim()}`)
            .join(","),
        };
        if (org_id !== undefined) params["organizationId"] = org_id;
        if (after) params["after"] = after;
        const res = await ninjaClient(token).get("/devices", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_server",
    {
      description:
        "Get detailed information about a specific NinjaOne-managed server: hardware specs, OS version, IP, agent version, and uptime.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Windows Services ───────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_services",
    {
      description:
        "List Windows services on a NinjaOne-managed server with their state (Running/Stopped) and startup type.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        filter: z
          .string()
          .optional()
          .describe("Optional service name filter (partial match)"),
      }),
    },
    async ({ device_id, filter }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params = filter ? { filter: `name:${filter}` } : {};
        const res = await ninjaClient(token).get(`/device/${device_id}/windows/services`, {
          params,
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_manage_service",
    {
      description: "Start, stop, or restart a Windows service on a NinjaOne-managed server.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        service_name: z
          .string()
          .describe("Windows service name (not display name, e.g. 'MSSQLSERVER')"),
        action: z
          .enum(["start", "stop", "restart"])
          .describe("Action to perform on the service"),
      }),
    },
    async ({ device_id, service_name, action }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).post(
          `/device/${device_id}/windows/services/${service_name}/${action}`
        );
        return ok(res.data ?? { success: true, service: service_name, action });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Processes ──────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_processes",
    {
      description: "List running processes on a NinjaOne-managed server with CPU and memory usage.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        filter: z
          .string()
          .optional()
          .describe("Filter by process name (partial match)"),
      }),
    },
    async ({ device_id, filter }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params = filter ? { filter: `name:${filter}` } : {};
        const res = await ninjaClient(token).get(`/device/${device_id}/processes`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_terminate_process",
    {
      description: "Terminate (kill) a running process on a NinjaOne-managed server by process ID.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        process_id: z.number().int().describe("PID of the process to terminate"),
      }),
    },
    async ({ device_id, process_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).delete(`/device/${device_id}/processes/${process_id}`);
        return ok(res.data ?? { success: true, terminated_pid: process_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Scripting ──────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_run_script",
    {
      description:
        "Execute a PowerShell or Bash script on a NinjaOne-managed server. " +
        "Returns a result_id — use ninja_get_script_result to fetch output once complete.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        script_type: z
          .enum(["POWERSHELL", "CMD", "BASH"])
          .describe("Script interpreter"),
        script_body: z
          .string()
          .describe("The script content to execute"),
        script_id: z
          .number()
          .int()
          .optional()
          .describe("Optional: use a pre-saved NinjaOne script by its ID instead of script_body"),
      }),
    },
    async ({ device_id, script_type, script_body, script_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const body: Record<string, unknown> = { scriptType: script_type };
        if (script_id !== undefined) {
          body["scriptId"] = script_id;
        } else {
          body["scriptBody"] = script_body;
        }
        const res = await ninjaClient(token).post(`/device/${device_id}/script/run`, body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_script_result",
    {
      description:
        "Get the output, exit code, and status of a previously queued script execution on a NinjaOne device.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        result_id: z.number().int().describe("Script result ID returned by ninja_run_script"),
      }),
    },
    async ({ device_id, result_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(
          `/device/${device_id}/script/result/${result_id}`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Patching ───────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_pending_patches",
    {
      description:
        "List available (not yet installed) patches for a NinjaOne-managed server, with KB article, severity, and reboot requirement.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        severity: z
          .enum(["critical", "important", "moderate", "low", "unspecified"])
          .optional()
          .describe("Filter by patch severity"),
      }),
    },
    async ({ device_id, severity }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params: Record<string, string> = { status: "PENDING" };
        if (severity) params["severity"] = severity.toUpperCase();
        const res = await ninjaClient(token).get(`/device/${device_id}/patches`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_approve_patches",
    {
      description:
        "Approve one or more patches for installation on a NinjaOne-managed server. Optionally schedule the installation.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        patch_ids: z
          .array(z.string())
          .min(1)
          .describe("Array of patch IDs to approve"),
        schedule_after: z
          .string()
          .optional()
          .describe("Schedule installation after this ISO 8601 timestamp"),
      }),
    },
    async ({ device_id, patch_ids, schedule_after }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const body: Record<string, unknown> = { patchIds: patch_ids };
        if (schedule_after) body["scheduleAfter"] = schedule_after;
        const res = await ninjaClient(token).post(`/device/${device_id}/patches/approve`, body);
        return ok(res.data ?? { success: true, approved: patch_ids.length });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_patch_history",
    {
      description: "Get the list of patches that have already been installed on a NinjaOne-managed server.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        page_size: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ device_id, page_size }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/patches`, {
          params: { status: "INSTALLED", pageSize: page_size },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Disk & Storage ─────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_volumes",
    {
      description:
        "List disk volumes on a NinjaOne-managed server with total size, free space, and percent used.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/volumes`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Event Logs ─────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_get_event_logs",
    {
      description:
        "Query Windows Event Log entries on a NinjaOne-managed server. " +
        "Supports System, Security, and Application logs with filtering by level and source.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        log_name: z
          .enum(["System", "Security", "Application"])
          .default("System")
          .describe("Windows Event Log channel"),
        level: z
          .enum(["Error", "Warning", "Information", "Critical"])
          .optional()
          .describe("Filter by event severity level"),
        source: z.string().optional().describe("Filter by event source (e.g. MSSQLSERVER)"),
        event_id: z.number().int().optional().describe("Filter by specific event ID"),
        page_size: z.number().int().min(1).max(500).default(50),
      }),
    },
    async ({ device_id, log_name, level, source, event_id, page_size }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const filters: string[] = [];
        if (level) filters.push(`level:${level}`);
        if (source) filters.push(`source:${source}`);
        if (event_id) filters.push(`eventId:${event_id}`);
        const params: Record<string, string | number> = {
          logName: log_name,
          pageSize: page_size,
        };
        if (filters.length) params["filter"] = filters.join(",");
        const res = await ninjaClient(token).get(`/device/${device_id}/windows/eventlogs`, {
          params,
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Alerts ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_device_alerts",
    {
      description:
        "List active alerts for a specific NinjaOne-managed server, with severity and description.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/alerts`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_acknowledge_alert",
    {
      description: "Acknowledge or clear (resolve) an alert in NinjaOne, optionally with a note.",
      inputSchema: z.object({
        alert_id: z.string().describe("NinjaOne alert ID (uid)"),
        action: z
          .enum(["acknowledge", "clear"])
          .describe("acknowledge = mark as seen; clear = resolve/close the alert"),
        note: z.string().optional().describe("Optional note to attach when acknowledging"),
      }),
    },
    async ({ alert_id, action, note }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        if (action === "clear") {
          const res = await ninjaClient(token).delete(`/alert/${alert_id}`);
          return ok(res.data ?? { success: true, alert_id, action: "cleared" });
        }
        const body: Record<string, unknown> = {};
        if (note) body["note"] = note;
        const res = await ninjaClient(token).put(`/alert/${alert_id}/acknowledge`, body);
        return ok(res.data ?? { success: true, alert_id, action: "acknowledged" });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Maintenance Mode ───────────────────────────────────────────────────────

  server.registerTool(
    "ninja_set_maintenance_mode",
    {
      description:
        "Put a NinjaOne-managed server into maintenance mode to suppress alerts and monitoring during planned work.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        duration_seconds: z
          .number()
          .int()
          .min(300)
          .max(86400)
          .describe("Maintenance window duration in seconds (min 5 min, max 24 h)"),
        reason: z.string().optional().describe("Reason for maintenance (shown in audit log)"),
      }),
    },
    async ({ device_id, duration_seconds, reason }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const body: Record<string, unknown> = { enabled: true, duration: duration_seconds };
        if (reason) body["reason"] = reason;
        const res = await ninjaClient(token).put(`/device/${device_id}/maintenance`, body);
        return ok(res.data ?? { success: true, device_id, maintenance: true, duration_seconds });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_exit_maintenance_mode",
    {
      description: "Remove a NinjaOne-managed server from maintenance mode and resume normal monitoring.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).delete(`/device/${device_id}/maintenance`);
        return ok(res.data ?? { success: true, device_id, maintenance: false });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Backups ────────────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_device_backups",
    {
      description:
        "List backup jobs configured for a NinjaOne-managed device, including job name, plan, last run status, and next scheduled run.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/backup`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_list_all_backups",
    {
      description:
        "List backup job status across all NinjaOne-managed devices. " +
        "Useful for getting a fleet-wide view of backup health.",
      inputSchema: z.object({
        org_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific organization ID"),
        page_size: z.number().int().min(1).max(200).default(50),
        after: z
          .string()
          .optional()
          .describe("Cursor from previous response for pagination"),
      }),
    },
    async ({ org_id, page_size, after }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["organizationId"] = org_id;
        if (after) params["after"] = after;
        const res = await ninjaClient(token).get("/devices/backup", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Script Library ─────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_scripts",
    {
      description:
        "List scripts in the NinjaOne script library. Returns script ID, name, language, scope, and category.",
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(200).default(50),
        after: z
          .string()
          .optional()
          .describe("Cursor from previous response for pagination"),
        lang: z
          .enum(["POWERSHELL", "CMD", "BASH", "PYTHON"])
          .optional()
          .describe("Filter by script language"),
      }),
    },
    async ({ page_size, after, lang }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (after) params["after"] = after;
        if (lang) params["lang"] = lang;
        const res = await ninjaClient(token).get("/scripting/scripts", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_script",
    {
      description: "Get the full content and metadata of a script in the NinjaOne script library.",
      inputSchema: z.object({
        script_id: z.number().int().describe("NinjaOne script library ID"),
      }),
    },
    async ({ script_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/scripting/script/${script_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_create_script",
    {
      description:
        "Create a new script in the NinjaOne script library. " +
        "Returns the new script's ID which can be used with ninja_run_script.",
      inputSchema: z.object({
        name: z.string().describe("Display name for the script"),
        language: z
          .enum(["POWERSHELL", "CMD", "BASH", "PYTHON"])
          .describe("Script language/interpreter"),
        script_body: z.string().describe("The full script content"),
        description: z
          .string()
          .optional()
          .describe("Optional description shown in the NinjaOne UI"),
        category_id: z
          .number()
          .int()
          .optional()
          .describe("Script category ID to organize the script"),
      }),
    },
    async ({ name, language, script_body, description, category_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const body: Record<string, unknown> = { name, language, scriptBody: script_body };
        if (description) body["description"] = description;
        if (category_id !== undefined) body["categoryId"] = category_id;
        const res = await ninjaClient(token).post("/scripting/scripts", body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_update_script",
    {
      description:
        "Update an existing script in the NinjaOne script library. " +
        "Only fields provided will be changed.",
      inputSchema: z.object({
        script_id: z.number().int().describe("NinjaOne script library ID"),
        name: z.string().optional().describe("New display name"),
        script_body: z.string().optional().describe("New script content"),
        description: z.string().optional().describe("New description"),
        category_id: z.number().int().optional().describe("New category ID"),
      }),
    },
    async ({ script_id, name, script_body, description, category_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const body: Record<string, unknown> = {};
        if (name !== undefined) body["name"] = name;
        if (script_body !== undefined) body["scriptBody"] = script_body;
        if (description !== undefined) body["description"] = description;
        if (category_id !== undefined) body["categoryId"] = category_id;
        const res = await ninjaClient(token).put(`/scripting/script/${script_id}`, body);
        return ok(res.data ?? { success: true, script_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_delete_script",
    {
      description: "Permanently delete a script from the NinjaOne script library.",
      inputSchema: z.object({
        script_id: z.number().int().describe("NinjaOne script library ID to delete"),
      }),
    },
    async ({ script_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        await ninjaClient(token).delete(`/scripting/script/${script_id}`);
        return ok({ success: true, deleted_script_id: script_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Custom Fields ──────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_get_device_custom_fields",
    {
      description:
        "Get the values of all custom fields configured for a specific NinjaOne-managed device.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/custom-fields`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_set_device_custom_fields",
    {
      description:
        "Set one or more custom field values on a NinjaOne-managed device. " +
        "Provide a key/value map where each key is the custom field name and the value is what to set. " +
        "Only the fields included in the map are modified; others are left unchanged.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        fields: z
          .record(z.string(), z.unknown())
          .describe("Map of custom field names to their new values"),
      }),
    },
    async ({ device_id, fields }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).patch(`/device/${device_id}/custom-fields`, fields);
        return ok(res.data ?? { success: true, device_id, updated_fields: Object.keys(fields) });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_org_custom_fields",
    {
      description:
        "Get the values of all custom fields configured for a NinjaOne organization.",
      inputSchema: z.object({
        org_id: z.number().int().describe("NinjaOne organization ID"),
      }),
    },
    async ({ org_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/organization/${org_id}/custom-fields`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_set_org_custom_fields",
    {
      description:
        "Set one or more custom field values on a NinjaOne organization. " +
        "Provide a key/value map where each key is the custom field name and the value is what to set.",
      inputSchema: z.object({
        org_id: z.number().int().describe("NinjaOne organization ID"),
        fields: z
          .record(z.string(), z.unknown())
          .describe("Map of custom field names to their new values"),
      }),
    },
    async ({ org_id, fields }) => {
      if (!enabled) return disabled();
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).patch(`/organization/${org_id}/custom-fields`, fields);
        return ok(res.data ?? { success: true, org_id, updated_fields: Object.keys(fields) });
      } catch (e) {
        return err(e);
      }
    }
  );
}
