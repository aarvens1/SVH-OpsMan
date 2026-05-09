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

  // ── Scripting (read-only) ──────────────────────────────────────────────────

  server.registerTool(
    "ninja_get_script_result",
    {
      description:
        "Get the output, exit code, and status of a previously queued script execution on a NinjaOne device.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        result_id: z.number().int().describe("Script result ID"),
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

  // ── Script Library (read-only) ─────────────────────────────────────────────

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

  // ── Custom Fields (read-only) ──────────────────────────────────────────────

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
}
