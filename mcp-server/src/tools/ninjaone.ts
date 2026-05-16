import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getNinjaToken } from "../auth/ninja.js";
import { ninjaClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

// TTL cache for ninja_list_servers
const responseCache = new Map<string, { data: unknown; expires_at: number }>();
function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expires_at) return entry.data;
  return null;
}
function setCached(key: string, data: unknown, ttlMs = 60_000): void {
  responseCache.set(key, { data, expires_at: Date.now() + ttlMs });
}

export function registerNinjaOneTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

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
      try {
        const cacheKey = `ninja_list_servers:${os_filter}:${org_id ?? ""}:${page_size}:${after ?? ""}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const token = await getNinjaToken();
        const classes = os_filter.split(",").map((t) => t.trim()).join(",");
        const dfParts: string[] = [`class in (${classes})`];
        if (org_id !== undefined) dfParts.push(`org = ${org_id}`);
        const params: Record<string, string | number> = {
          pageSize: page_size,
          df: dfParts.join(" and "),
        };
        if (after) params["after"] = after;
        const res = await ninjaClient(token).get("/devices", { params });
        const shaped = (res.data as Record<string, unknown>[]).map((d) => ({
          id: d["id"],
          displayName: d["displayName"] ?? d["systemName"],
          dnsName: d["dnsName"],
          ipAddresses: d["ipAddresses"],
          nodeClass: d["nodeClass"],
          offline: d["offline"],
          lastContact: d["lastContact"],
          osName: d["osName"],
        }));
        setCached(cacheKey, shaped);
        return ok(shaped);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}`);
        const d = res.data as Record<string, unknown>;
        return ok({
          id: d["id"],
          displayName: d["displayName"] ?? d["systemName"],
          systemName: d["systemName"],
          dnsName: d["dnsName"],
          ipAddresses: d["ipAddresses"],
          publicIP: d["publicIP"],
          nodeClass: d["nodeClass"],
          offline: d["offline"],
          lastContact: d["lastContact"],
          osName: d["osName"],
          osVersion: d["osVersion"],
          processorType: d["processorType"],
          totalPhysicalMemory: d["totalPhysicalMemory"],
          lastLoggedInUser: d["lastLoggedInUser"],
          agentVersion: d["agentVersion"],
        });
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
      try {
        const token = await getNinjaToken();
        const params = filter ? { filter: `name:${filter}` } : {};
        const res = await ninjaClient(token).get(`/device/${device_id}/windows/services`, {
          params,
        });
        return ok((res.data as Record<string, unknown>[]).map((s) => ({
          name: s["name"],
          displayName: s["displayName"],
          state: s["state"],
          startType: s["startType"],
        })));
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
      try {
        const token = await getNinjaToken();
        const params = filter ? { filter: `name:${filter}` } : {};
        const res = await ninjaClient(token).get(`/device/${device_id}/processes`, { params });
        return ok((res.data as Record<string, unknown>[]).map((p) => ({
          pid: p["pid"],
          name: p["name"],
          cpuUsage: p["cpuUsage"],
          memUsage: p["memUsage"],
          userName: p["userName"],
        })));
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(
          `/device/${device_id}/script/result/${result_id}`
        );
        const d = res.data as Record<string, unknown>;
        return ok({
          id: d["id"],
          deviceId: d["deviceId"],
          scriptId: d["scriptId"],
          status: d["status"],
          exitCode: d["exitCode"],
          output: d["output"],
          startTime: d["startTime"],
          endTime: d["endTime"],
          duration: d["duration"],
        });
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
      try {
        const token = await getNinjaToken();
        const params: Record<string, string> = { status: "PENDING" };
        if (severity) params["severity"] = severity.toUpperCase();
        const res = await ninjaClient(token).get(`/device/${device_id}/patches`, { params });
        const patches = (res.data as Record<string, unknown>[]).map((p) => ({
          id: p["id"],
          name: p["name"],
          kbNumber: p["kbNumber"],
          severity: p["severity"],
          status: p["status"],
          rebootRequired: p["rebootRequired"],
          installedAt: p["installedAt"],
          publishedDate: p["publishedDate"],
          type: p["type"],
        }));
        return ok(patches);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/patches`, {
          params: { status: "INSTALLED", pageSize: page_size },
        });
        const patches = (res.data as Record<string, unknown>[]).map((p) => ({
          id: p["id"],
          name: p["name"],
          kbNumber: p["kbNumber"],
          severity: p["severity"],
          status: p["status"],
          rebootRequired: p["rebootRequired"],
          installedAt: p["installedAt"],
          publishedDate: p["publishedDate"],
          type: p["type"],
        }));
        return ok(patches);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/volumes`);
        const volumes = (res.data as Record<string, unknown>[]).map((v) => ({
          name: v["name"],
          label: v["label"],
          deviceType: v["deviceType"],
          fileSystem: v["fileSystem"],
          capacity: v["capacity"],
          freeSpace: v["freeSpace"],
          percentUsed: v["capacity"] != null && v["freeSpace"] != null
            ? Math.round((1 - (v["freeSpace"] as number) / (v["capacity"] as number)) * 100)
            : null,
        }));
        return ok(volumes);
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
        return ok((res.data as Record<string, unknown>[]).map((e) => ({
          eventId: e["eventId"],
          level: e["level"],
          source: e["source"],
          message: e["message"],
          created: e["created"],
          computer: e["computer"],
        })));
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/alerts`);
        const alerts = (res.data as Record<string, unknown>[]).map((a) => ({
          id: a["id"],
          deviceId: a["deviceId"],
          severity: a["severity"],
          message: a["message"],
          type: a["type"],
          triggered: a["triggered"],
          status: a["status"],
          sourceConfigUid: a["sourceConfigUid"],
        }));
        return ok(alerts);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/backup`);
        const backups = (res.data as Record<string, unknown>[]).map((b) => ({
          deviceId: b["deviceId"],
          planName: b["planName"],
          jobName: b["jobName"],
          status: b["status"],
          lastRun: b["lastRun"],
          nextRun: b["nextRun"],
          backupSize: b["backupSize"],
          errorMessage: b["errorMessage"],
        }));
        return ok(backups);
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
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["organizationId"] = org_id;
        if (after) params["after"] = after;
        const res = await ninjaClient(token).get("/devices/backup", { params });
        return ok((res.data as Record<string, unknown>[]).map((b) => ({
          deviceId: b["deviceId"],
          deviceName: b["deviceName"],
          planName: b["planName"],
          jobName: b["jobName"],
          status: b["status"],
          lastRun: b["lastRun"],
          nextRun: b["nextRun"],
        })));
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
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (after) params["after"] = after;
        if (lang) params["lang"] = lang;
        const res = await ninjaClient(token).get("/scripting/scripts", { params });
        const scripts = (res.data as Record<string, unknown>[]).map((s) => ({
          id: s["id"],
          name: s["name"],
          description: s["description"],
          language: s["language"],
          scope: s["scope"],
          category: s["category"],
        }));
        return ok(scripts);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/scripting/script/${script_id}`);
        const s = res.data as Record<string, unknown>;
        return ok({
          id: s["id"],
          name: s["name"],
          description: s["description"],
          language: s["language"],
          scope: s["scope"],
          category: s["category"],
          content: s["content"],
          parameters: s["parameters"],
        });
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/device/${device_id}/custom-fields`);
        // Custom fields come back as a flat key-value object — pass through as-is (already shaped)
        return ok(res.data as Record<string, unknown>);
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
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/organization/${org_id}/custom-fields`);
        // Custom fields come back as a flat key-value object — pass through as-is (already shaped)
        return ok(res.data as Record<string, unknown>);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Organizations ──────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_organizations",
    {
      description:
        "List all organizations (clients) in NinjaOne with their ID, name, description, and node count.",
      inputSchema: z.object({
        page_size: z.number().int().default(50),
        after: z
          .number()
          .int()
          .optional()
          .describe("Pagination cursor — last org ID from previous page"),
      }),
    },
    async ({ page_size, after }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, number> = { pageSize: page_size };
        if (after) params["after"] = after;
        const res = await ninjaClient(token).get("/organizations", { params });
        const orgs = (res.data as Record<string, unknown>[]).map((o) => ({
          id: o["id"],
          name: o["name"],
          description: o["description"],
          nodeApprovalMode: o["nodeApprovalMode"],
          tags: o["tags"],
          fields: o["fields"],
        }));
        return ok(orgs);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_organization",
    {
      description: "Get details for a specific NinjaOne organization — settings, policies, and locations.",
      inputSchema: z.object({
        org_id: z.number().int().describe("NinjaOne organization ID"),
      }),
    },
    async ({ org_id }) => {
      try {
        const token = await getNinjaToken();
        const res = await ninjaClient(token).get(`/organization/${org_id}`);
        const o = res.data as Record<string, unknown>;
        return ok({
          id: o["id"],
          name: o["name"],
          description: o["description"],
          nodeApprovalMode: o["nodeApprovalMode"],
          tags: o["tags"],
          fields: o["fields"],
          locations: o["locations"],
          policies: o["policies"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

}
