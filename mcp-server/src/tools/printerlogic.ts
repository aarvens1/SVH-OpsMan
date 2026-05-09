import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { printerlogicClient, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "PrinterLogic service not configured: set PRINTERLOGIC_URL, PRINTERLOGIC_API_TOKEN";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

// Custom build wrapping the Vasion (formerly PrinterLogic) REST API.
// Read-only: browse, deployment status, audit logs, quotas.

export function registerPrinterLogicTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "pl_list_printers",
    {
      description:
        "List printers in PrinterLogic/Vasion. Returns printer name, IP, location, " +
        "driver name, and active status.",
      inputSchema: z.object({
        search: z.string().optional().describe("Filter by printer name or IP"),
        folder_id: z
          .string()
          .optional()
          .describe("Scope to a specific folder (container) ID"),
        limit: z.number().int().default(100),
        offset: z.number().int().default(0),
      }),
    },
    async ({ search, folder_id, limit, offset }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit, offset };
        if (search) params.search = search;
        if (folder_id) params.folder_id = folder_id;
        const res = await client.get("/api/v1/printers", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_get_printer",
    {
      description: "Get full details for a specific printer — driver, settings, assigned users/groups, and deployment status.",
      inputSchema: z.object({
        printer_id: z.string().describe("Printer ID"),
      }),
    },
    async ({ printer_id }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const [details, deployments] = await Promise.all([
          client.get(`/api/v1/printers/${printer_id}`),
          client.get(`/api/v1/printers/${printer_id}/deployments`),
        ]);
        return ok({ ...details.data, deployments: deployments.data });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_list_drivers",
    {
      description: "List printer drivers available in the PrinterLogic driver library.",
      inputSchema: z.object({
        search: z.string().optional().describe("Filter by driver name or model"),
        os_filter: z
          .string()
          .optional()
          .describe("Filter by OS compatibility (e.g. 'Windows 10', 'Windows Server 2022')"),
        limit: z.number().int().default(50),
      }),
    },
    async ({ search, os_filter, limit }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit };
        if (search) params.search = search;
        if (os_filter) params.os = os_filter;
        const res = await client.get("/api/v1/drivers", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_list_deployment_profiles",
    {
      description:
        "List deployment profiles (rules that assign printers to users or computers).",
      inputSchema: z.object({
        limit: z.number().int().default(50),
      }),
    },
    async ({ limit }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const res = await client.get("/api/v1/profiles", { params: { limit } });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_get_deployment_status",
    {
      description:
        "Get deployment status for a printer — how many endpoints have it installed vs. pending vs. failed.",
      inputSchema: z.object({
        printer_id: z.string().describe("Printer ID"),
      }),
    },
    async ({ printer_id }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const res = await client.get(
          `/api/v1/printers/${printer_id}/deployment-status`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_get_audit_logs",
    {
      description:
        "View PrinterLogic audit logs — printer installs, removals, config changes, admin actions.",
      inputSchema: z.object({
        start_date: z
          .string()
          .optional()
          .describe("Start date in ISO 8601 (e.g. 2025-05-01T00:00:00Z)"),
        end_date: z
          .string()
          .optional()
          .describe("End date in ISO 8601. Defaults to now."),
        event_type: z
          .string()
          .optional()
          .describe("Filter by event type (e.g. 'printer_installed', 'printer_deleted')"),
        user: z.string().optional().describe("Filter by username"),
        limit: z.number().int().default(100),
      }),
    },
    async ({ start_date, end_date, event_type, user, limit }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit };
        if (start_date) params.start_date = start_date;
        if (end_date) params.end_date = end_date;
        if (event_type) params.event_type = event_type;
        if (user) params.user = user;
        const res = await client.get("/api/v1/audit-logs", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_get_print_quota",
    {
      description:
        "View print quota and usage for a user or group — pages remaining, reset date, and historical usage.",
      inputSchema: z.object({
        user_or_group: z.string().describe("Username or group name"),
      }),
    },
    async ({ user_or_group }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const res = await client.get(`/api/v1/quotas/${encodeURIComponent(user_or_group)}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "pl_get_usage_reports",
    {
      description:
        "Get print usage reports — page counts by user, printer, department, or date range.",
      inputSchema: z.object({
        report_type: z
          .enum(["by_user", "by_printer", "by_department"])
          .default("by_user"),
        start_date: z.string().optional().describe("Start date in ISO 8601"),
        end_date: z.string().optional().describe("End date in ISO 8601"),
        limit: z.number().int().default(100),
      }),
    },
    async ({ report_type, start_date, end_date, limit }) => {
      if (!enabled) return disabled();
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit, type: report_type };
        if (start_date) params.start_date = start_date;
        if (end_date) params.end_date = end_date;
        const res = await client.get("/api/v1/reports/usage", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
