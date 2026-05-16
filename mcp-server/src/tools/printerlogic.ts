import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { printerlogicClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

// Custom build wrapping the Vasion (formerly PrinterLogic) REST API.
// Read-only: browse, deployment status, audit logs, quotas.

export function registerPrinterLogicTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

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
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit, offset };
        if (search) params.search = search;
        if (folder_id) params.folder_id = folder_id;
        const res = await client.get("/api/v1/printers", { params });
        const raw = res.data as A;
        const items = ((raw["printers"] as A[] | undefined) ?? (raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const printers = items.map((p: A) => ({
          id: p["id"],
          name: p["name"],
          ip_address: p["ip_address"] ?? p["ipAddress"],
          location: p["location"],
          driver_name: p["driver_name"] ?? p["driverName"],
          status: p["status"],
          active: p["active"] ?? p["enabled"],
          folder_id: p["folder_id"] ?? p["folderId"],
          model: p["model"],
        }));
        return ok({ total: raw["total"] ?? raw["count"], count: printers.length, printers });
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
      try {
        const client = printerlogicClient();
        const [details, deployments] = await Promise.all([
          client.get(`/api/v1/printers/${printer_id}`),
          client.get(`/api/v1/printers/${printer_id}/deployments`),
        ]);
        const d = details.data as A;
        const dep = deployments.data as A;
        return ok({
          id: d["id"],
          name: d["name"],
          ip_address: d["ip_address"] ?? d["ipAddress"],
          location: d["location"],
          driver_name: d["driver_name"] ?? d["driverName"],
          driver_id: d["driver_id"] ?? d["driverId"],
          status: d["status"],
          active: d["active"] ?? d["enabled"],
          folder_id: d["folder_id"] ?? d["folderId"],
          model: d["model"],
          port: d["port"],
          protocol: d["protocol"],
          settings: d["settings"],
          deployments: (dep["deployments"] as A[] | undefined) ?? (dep["data"] as A[] | undefined) ?? (Array.isArray(dep) ? dep : []),
        });
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
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit };
        if (search) params.search = search;
        if (os_filter) params.os = os_filter;
        const res = await client.get("/api/v1/drivers", { params });
        const raw = res.data as A;
        const items = ((raw["drivers"] as A[] | undefined) ?? (raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const drivers = items.map((d: A) => ({
          id: d["id"],
          name: d["name"],
          version: d["version"],
          manufacturer: d["manufacturer"],
          os_compatibility: d["os_compatibility"] ?? d["osCompatibility"],
          inf_file: d["inf_file"] ?? d["infFile"],
          created: d["created"] ?? d["createdAt"],
        }));
        return ok({ count: drivers.length, drivers });
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
      try {
        const client = printerlogicClient();
        const res = await client.get("/api/v1/profiles", { params: { limit } });
        const raw = res.data as A;
        const items = ((raw["profiles"] as A[] | undefined) ?? (raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const profiles = items.map((p: A) => ({
          id: p["id"],
          name: p["name"],
          description: p["description"],
          enabled: p["enabled"] ?? p["active"],
          type: p["type"],
          target_count: p["target_count"] ?? p["targetCount"],
        }));
        return ok({ count: profiles.length, profiles });
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
      try {
        const client = printerlogicClient();
        const res = await client.get(
          `/api/v1/printers/${printer_id}/deployment-status`
        );
        const raw = res.data as A;
        return ok({
          printer_id,
          installed: raw["installed"] ?? raw["success"],
          pending: raw["pending"],
          failed: raw["failed"] ?? raw["error"],
          total: raw["total"],
          last_updated: raw["last_updated"] ?? raw["lastUpdated"],
          details: (raw["details"] as A[] | undefined) ?? [],
        });
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
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit };
        if (start_date) params.start_date = start_date;
        if (end_date) params.end_date = end_date;
        if (event_type) params.event_type = event_type;
        if (user) params.user = user;
        const res = await client.get("/api/v1/audit-logs", { params });
        const raw = res.data as A;
        const items = ((raw["logs"] as A[] | undefined) ?? (raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const logs = items.map((l: A) => ({
          id: l["id"],
          event_type: l["event_type"] ?? l["eventType"],
          user: l["user"] ?? l["username"],
          printer_name: l["printer_name"] ?? l["printerName"],
          printer_id: l["printer_id"] ?? l["printerId"],
          timestamp: l["timestamp"] ?? l["created_at"] ?? l["createdAt"],
          details: l["details"],
          ip_address: l["ip_address"] ?? l["ipAddress"],
        }));
        return ok({ total: raw["total"] ?? raw["count"], count: logs.length, logs });
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
      try {
        const client = printerlogicClient();
        const res = await client.get(`/api/v1/quotas/${encodeURIComponent(user_or_group)}`);
        const raw = res.data as A;
        return ok({
          user_or_group,
          quota_limit: raw["quota_limit"] ?? raw["limit"],
          pages_used: raw["pages_used"] ?? raw["used"],
          pages_remaining: raw["pages_remaining"] ?? raw["remaining"],
          reset_date: raw["reset_date"] ?? raw["resetDate"],
          reset_period: raw["reset_period"] ?? raw["resetPeriod"],
          enabled: raw["enabled"],
        });
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
      try {
        const client = printerlogicClient();
        const params: Record<string, string | number> = { limit, type: report_type };
        if (start_date) params.start_date = start_date;
        if (end_date) params.end_date = end_date;
        const res = await client.get("/api/v1/reports/usage", { params });
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const rows = items.map((r: A) => ({
          name: r["name"] ?? r["user"] ?? r["printer"] ?? r["department"],
          pages_printed: r["pages_printed"] ?? r["pagesPrinted"] ?? r["count"],
          color_pages: r["color_pages"] ?? r["colorPages"],
          mono_pages: r["mono_pages"] ?? r["monoPages"],
          duplex_pages: r["duplex_pages"] ?? r["duplexPages"],
          period_start: r["period_start"] ?? r["periodStart"],
          period_end: r["period_end"] ?? r["periodEnd"],
        }));
        return ok({ report_type, count: rows.length, rows });
      } catch (e) {
        return err(e);
      }
    }
  );
}
