import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getNinjaToken, getNinjaManagementToken } from "../auth/ninja.js";
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
        const params: Record<string, string> = {};
        if (filter) params["name"] = filter;
        const res = await ninjaClient(token).get(`/device/${device_id}/windows-services`, {
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
        const params: Record<string, string> = {};
        if (severity) params["severity"] = severity.toUpperCase();
        const res = await ninjaClient(token).get(`/device/${device_id}/os-patches`, { params });
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
        const res = await ninjaClient(token).get(`/device/${device_id}/os-patch-installs`, {
          params: { pageSize: page_size },
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
        "Returns NinjaOne device activity log — agent events, patch installs, alert triggers, script runs, " +
        "and other NinjaOne-recorded activity for a device. " +
        "NOTE: Windows Event Viewer entries (System/Application/Security logs) are not available via the " +
        "NinjaOne API. For Windows Event Log data use Wazuh or Desktop Commander + PSRemoting.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        activity_type: z
          .string()
          .optional()
          .describe("Filter by activity type (e.g. CONDITION, PATCH, SCRIPT, ALERT)"),
        status: z
          .string()
          .optional()
          .describe("Filter by activity status"),
        page_size: z.number().int().min(1).max(500).default(50),
      }),
    },
    async ({ device_id, activity_type, status, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (activity_type) params["activityType"] = activity_type;
        if (status) params["status"] = status;
        const res = await ninjaClient(token).get(`/device/${device_id}/activities`, { params });
        const raw = res.data as Record<string, unknown>;
        const items =
          (raw["activities"] as Record<string, unknown>[] | undefined) ??
          (res.data as Record<string, unknown>[]);
        return ok(items.map((a) => ({
          id: a["id"] ?? a["activityId"],
          type: a["type"] ?? a["activityType"],
          status: a["status"],
          message: a["message"] ?? a["description"],
          created: a["created"] ?? a["timestamp"],
          sourceType: a["sourceType"],
          severity: a["severity"],
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
        const res = await ninjaClient(token).get("/backup/jobs", {
          params: { df: `id = ${device_id}`, pageSize: 50 },
        });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok(results.map((b) => ({
          jobId: b["jobId"],
          deviceId: b["deviceId"],
          planName: b["planName"],
          planType: b["planType"],
          jobStatus: b["jobStatus"],
          jobStartTime: b["jobStartTime"],
          jobEndTime: b["jobEndTime"],
          totalStoredBytes: b["totalStoredBytes"],
          filesUploaded: b["filesUploaded"],
        })));
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
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (after) params["cursor"] = after;
        const res = await ninjaClient(token).get("/backup/jobs", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          backups: results.map((b) => ({
            jobId: b["jobId"],
            deviceId: b["deviceId"],
            organizationId: b["organizationId"],
            planName: b["planName"],
            planType: b["planType"],
            jobStatus: b["jobStatus"],
            jobStartTime: b["jobStartTime"],
            jobEndTime: b["jobEndTime"],
            totalStoredBytes: b["totalStoredBytes"],
            filesUploaded: b["filesUploaded"],
          })),
        });
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status;
        if (status === 404) {
          return err("ninja_list_all_backups: HTTP 404 — /backup/jobs endpoint not found. " +
            "Possible causes: (1) NinjaOne app credential does not have the 'backup' scope granted — " +
            "check the API client in NinjaOne > Administration > Apps; " +
            "(2) backup module not enabled on this NinjaOne instance.");
        }
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

  // ── Fleet queries ─────────────────────────────────────────────────────────

  server.registerTool(
    "ninja_list_alerts",
    {
      description:
        "List all active alerts across every NinjaOne-managed device in one call — no device " +
        "enumeration needed. Use this in briefings instead of ninja_list_device_alerts to surface " +
        "issues on devices not already on the watch list.",
      inputSchema: z.object({
        source_type: z
          .string()
          .optional()
          .describe("Filter by alert source type"),
        org_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific organization ID"),
      }),
    },
    async ({ source_type, org_id }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string> = {};
        if (source_type) params["sourceType"] = source_type;
        // /alerts does not support df org filtering — filter client-side if needed
        const res = await ninjaClient(token).get("/alerts", { params });
        const alerts = (res.data as Record<string, unknown>[]).map((a) => ({
          id: a["id"] ?? a["uid"],
          deviceId: a["deviceId"],
          deviceName: a["deviceName"] ?? a["displayName"],
          organizationId: a["organizationId"],
          severity: a["severity"],
          message: a["message"],
          type: a["type"] ?? a["sourceType"],
          triggered: a["triggered"] ?? a["created"],
          status: a["status"],
        }));
        return ok({ count: alerts.length, alerts });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_list_fleet_volumes",
    {
      description:
        "List disk volumes across all NinjaOne-managed devices in one call — no enumeration needed. " +
        "Use this in briefings instead of per-device ninja_list_volumes to catch disk space issues " +
        "on every device, including those with no alert fired yet.",
      inputSchema: z.object({
        org_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific organization ID"),
        cursor: z
          .string()
          .optional()
          .describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        include_bitlocker: z
          .boolean()
          .default(false)
          .describe("Include BitLocker status for each volume"),
      }),
    },
    async ({ org_id, cursor, page_size, include_bitlocker }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number | boolean> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (include_bitlocker) params["include"] = "bl";
        const res = await ninjaClient(token).get("/queries/volumes", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          volumes: results.map((v) => {
            const cap = v["capacity"] as number | null;
            const free = v["freeSpace"] as number | null;
            return {
              deviceId: v["deviceId"],
              deviceName: v["deviceName"] ?? v["displayName"],
              name: v["name"],
              label: v["label"],
              capacity: cap,
              freeSpace: free,
              percentUsed: cap && free != null
                ? Math.round((1 - free / cap) * 100)
                : null,
              bitlockerStatus: v["bitlockerStatus"],
            };
          }),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_device_health",
    {
      description:
        "Get health status across all NinjaOne-managed devices in one call. " +
        "Returns healthStatus (HEALTHY/WARNING/CRITICAL/UNKNOWN), alert count, patch counts, " +
        "pending reboot reason, and vulnerability counts per device. " +
        "Use for a quick fleet health score before diving into per-device tools.",
      inputSchema: z.object({
        health: z
          .enum(["HEALTHY", "WARNING", "CRITICAL", "UNKNOWN"])
          .optional()
          .describe("Filter to a specific health status — omit to return all"),
        org_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ health, org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (health) params["health"] = health;
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/device-health", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          devices: results.map((d) => ({
            deviceId: d["deviceId"] ?? d["id"],
            healthStatus: d["healthStatus"],
            offline: d["offline"],
            alertCount: d["alertCount"],
            pendingOSPatchesCount: d["pendingOSPatchesCount"],
            failedOSPatchesCount: d["failedOSPatchesCount"],
            pendingRebootReason: d["pendingRebootReason"],
            criticalVulnerabilityCount: d["criticalVulnerabilityCount"],
            highVulnerabilityCount: d["highVulnerabilityCount"],
            activeThreatsCount: d["activeThreatsCount"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Fleet queries — Tier 1 (day-starter / what-changed) ──────────────────

  server.registerTool(
    "ninja_get_logged_on_users",
    {
      description:
        "Last logged-on user report across all managed devices. " +
        "Use in day-starter to answer 'who logged into what server since yesterday'.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/logged-on-users", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          users: results.map((r) => ({
            deviceId: r["deviceId"],
            userName: r["userName"] ?? r["username"],
            domain: r["domain"],
            logonTime: r["logonTime"] ?? r["lastLogonTime"] ?? r["lastLogon"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_os_patch_installs",
    {
      description:
        "OS patch installation history across the fleet. " +
        "Shows which KB patches were installed, when, and their status. " +
        "Use in day-starter to see what patched since yesterday.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        status: z
          .enum(["PENDING", "FAILED", "REJECTED", "INSTALLED", "APPROVED"])
          .optional()
          .describe("Filter by patch status"),
      }),
    },
    async ({ org_id, cursor, page_size, status }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (status) params["status"] = status;
        const res = await ninjaClient(token).get("/queries/os-patch-installs", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          patches: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            kbNumber: r["kbNumber"] ?? r["kb"],
            status: r["status"],
            type: r["type"],
            installedAt: r["installedAt"] ?? r["timestamp"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_software_patch_installs",
    {
      description:
        "Software patch installation history across the fleet. " +
        "Shows which software updates were installed and when. " +
        "Pairs with ninja_get_os_patch_installs for a full picture of what changed since yesterday.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        status: z
          .enum(["PENDING", "FAILED", "REJECTED", "INSTALLED", "APPROVED"])
          .optional()
          .describe("Filter by patch status"),
      }),
    },
    async ({ org_id, cursor, page_size, status }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (status) params["status"] = status;
        const res = await ninjaClient(token).get("/queries/software-patch-installs", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          patches: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            version: r["version"],
            publisher: r["publisher"] ?? r["vendor"],
            status: r["status"],
            installedAt: r["installedAt"] ?? r["timestamp"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_os_patches",
    {
      description:
        "Pending, failed, and rejected OS patches across the fleet. " +
        "Use in patch-campaign and day-starter to see what still needs to be applied.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        status: z
          .enum(["PENDING", "FAILED", "REJECTED", "APPROVED", "MANUAL"])
          .optional()
          .describe("Filter by patch status — omit to return all"),
      }),
    },
    async ({ org_id, cursor, page_size, status }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (status) params["status"] = status;
        const res = await ninjaClient(token).get("/queries/os-patches", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          patches: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            kbNumber: r["kbNumber"] ?? r["kb"],
            status: r["status"],
            severity: r["severity"],
            type: r["type"],
            releaseDate: r["releaseDate"] ?? r["releaseTime"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_software_patches",
    {
      description:
        "Pending, failed, and rejected software patches across the fleet. " +
        "Use in patch-campaign to see which applications have outstanding updates.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        status: z
          .enum(["PENDING", "FAILED", "REJECTED", "APPROVED", "MANUAL"])
          .optional()
          .describe("Filter by patch status — omit to return all"),
      }),
    },
    async ({ org_id, cursor, page_size, status }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (status) params["status"] = status;
        const res = await ninjaClient(token).get("/queries/software-patches", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          patches: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            currentVersion: r["currentVersion"] ?? r["installedVersion"],
            availableVersion: r["availableVersion"] ?? r["patchVersion"],
            publisher: r["publisher"] ?? r["vendor"],
            status: r["status"],
            severity: r["severity"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_windows_services",
    {
      description:
        "Windows service states across the fleet. " +
        "Use to detect stopped critical services or unexpected state changes overnight.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
        state: z
          .enum(["RUNNING", "STOPPED", "PAUSED", "START_PENDING", "STOP_PENDING"])
          .optional()
          .describe("Filter by service state — use STOPPED to find non-running services"),
      }),
    },
    async ({ org_id, cursor, page_size, state }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        if (state) params["state"] = state;
        const res = await ninjaClient(token).get("/queries/windows-services", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          services: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            displayName: r["displayName"],
            state: r["state"],
            startType: r["startType"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Fleet queries — Tier 2 (hardware health) ──────────────────────────────

  server.registerTool(
    "ninja_get_disks",
    {
      description:
        "Physical disk drive report across the fleet. " +
        "Returns model, capacity, media type (SSD/HDD), and health status per disk. " +
        "Use in onprem-health for hardware health checks.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/disks", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          disks: results.map((r) => ({
            deviceId: r["deviceId"],
            index: r["index"],
            model: r["model"],
            serialNumber: r["serialNumber"],
            size: r["size"],
            mediaType: r["mediaType"],
            status: r["status"],
            health: r["health"] ?? r["healthStatus"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_raid_controllers",
    {
      description:
        "RAID controller report across the fleet. " +
        "Use in onprem-health to check RAID controller status on servers.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/raid-controllers", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          controllers: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            model: r["model"],
            status: r["status"],
            batteryStatus: r["batteryStatus"] ?? r["batteryBackedUp"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_raid_drives",
    {
      description:
        "RAID drive report across the fleet. " +
        "Use in onprem-health to check individual RAID member disk states.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/raid-drives", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          drives: results.map((r) => ({
            deviceId: r["deviceId"],
            model: r["model"],
            serialNumber: r["serialNumber"],
            slot: r["slot"] ?? r["slotNumber"],
            capacity: r["capacity"] ?? r["size"],
            status: r["status"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_backup_usage",
    {
      description:
        "Device backup usage report across the fleet. " +
        "Returns backup set size and last backup date per plan per device. " +
        "Use in day-starter and onprem-health for backup coverage overview.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/backup/usage", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          usage: results.map((r) => ({
            deviceId: r["deviceId"],
            planName: r["planName"] ?? r["plan"],
            backupSetSize: r["backupSetSize"] ?? r["size"],
            lastBackupDate: r["lastBackupDate"] ?? r["lastBackup"],
            status: r["status"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Fleet queries — Tier 3 (inventory / audit) ────────────────────────────

  server.registerTool(
    "ninja_get_software",
    {
      description:
        "Software inventory across the fleet. " +
        "Returns installed applications, versions, and publishers per device. " +
        "Use in license-audit and asset-investigation.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/software", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          software: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            version: r["version"],
            publisher: r["publisher"] ?? r["vendor"],
            installDate: r["installDate"] ?? r["installTime"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_operating_systems",
    {
      description:
        "Operating system report across the fleet. " +
        "Returns OS name, version, build number, and architecture per device. " +
        "Use in patch-campaign for EOL tracking and patch planning.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/operating-systems", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          operatingSystems: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            version: r["version"],
            buildNumber: r["buildNumber"] ?? r["build"],
            architecture: r["architecture"],
            lastBoot: r["lastBoot"] ?? r["lastBootTime"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_network_interfaces",
    {
      description:
        "Network interface report across the fleet. " +
        "Returns NIC name, MAC, IP, speed, and connection state per device. " +
        "Use in asset-investigation and network-troubleshooter.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/network-interfaces", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          interfaces: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            macAddress: r["macAddress"] ?? r["macAddr"],
            ipAddress: r["ipAddress"] ?? r["ipAddr"],
            ipAddressV6: r["ipAddressV6"] ?? r["ipv6Address"],
            speed: r["speed"],
            connectionState: r["connectionState"] ?? r["connectionStatus"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_processors",
    {
      description:
        "Processor report across the fleet. " +
        "Returns CPU model, manufacturer, core count, and clock speed per device.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/processors", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          processors: results.map((r) => ({
            deviceId: r["deviceId"],
            name: r["name"],
            manufacturer: r["manufacturer"],
            maxClockSpeed: r["maxClockSpeed"],
            numberOfCores: r["numberOfCores"] ?? r["cores"],
            numberOfLogicalProcessors: r["numberOfLogicalProcessors"] ?? r["logicalProcessors"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_policy_overrides",
    {
      description:
        "Summary of device policy overrides across the fleet. " +
        "Use in posture-check to identify devices deviating from policy.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/policy-overrides", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          overrides: results.map((r) => ({
            deviceId: r["deviceId"],
            policyId: r["policyId"],
            policyName: r["policyName"],
            field: r["field"],
            overriddenValue: r["overriddenValue"] ?? r["value"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_scoped_custom_fields",
    {
      description:
        "Scoped custom field values across the fleet. " +
        "Returns custom field name and value per device. " +
        "Use ninja_get_scoped_custom_fields_detailed for full type and update metadata.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/scoped-custom-fields", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          fields: results.map((r) => ({
            deviceId: r["deviceId"],
            definitionId: r["definitionId"],
            name: r["name"],
            value: r["value"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_get_scoped_custom_fields_detailed",
    {
      description:
        "Detailed scoped custom field report across the fleet. " +
        "Includes field type, updated timestamp, and full metadata per device.",
      inputSchema: z.object({
        org_id: z.number().int().optional().describe("Filter to a specific organization ID"),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
        page_size: z.number().int().min(1).max(1000).default(500),
      }),
    },
    async ({ org_id, cursor, page_size }) => {
      try {
        const token = await getNinjaToken();
        const params: Record<string, string | number> = { pageSize: page_size };
        if (org_id !== undefined) params["df"] = `org = ${org_id}`;
        if (cursor) params["cursor"] = cursor;
        const res = await ninjaClient(token).get("/queries/scoped-custom-fields-detailed", { params });
        const raw = res.data as Record<string, unknown>;
        const results = (raw["results"] as Record<string, unknown>[] | undefined) ?? [];
        return ok({
          count: results.length,
          cursor: (raw["cursor"] as Record<string, unknown> | undefined)?.["name"],
          fields: results.map((r) => ({
            deviceId: r["deviceId"],
            definitionId: r["definitionId"],
            name: r["name"],
            value: r["value"],
            type: r["type"],
            updatedAt: r["updatedAt"] ?? r["updateTime"],
          })),
        });
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

  // ── Write operations (require management scope) ────────────────────────────

  server.registerTool(
    "ninja_set_maintenance_mode",
    {
      description:
        "Enable or disable maintenance mode on a NinjaOne device. " +
        "While in maintenance mode, alerts are suppressed and the device is excluded from health checks.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        enabled: z.boolean().describe("true to enable maintenance mode, false to disable"),
        duration_hours: z
          .number()
          .min(0.25)
          .max(168)
          .default(4)
          .describe("Hours to stay in maintenance mode (only used when enabled=true). Max 168 (7 days)."),
      }),
    },
    async ({ device_id, enabled, duration_hours }) => {
      try {
        const token = await getNinjaManagementToken();
        if (enabled) {
          const end = Math.floor((Date.now() + duration_hours * 3600 * 1000) / 1000);
          await ninjaClient(token).post(`/device/${device_id}/maintenance`, { end });
          return ok({ device_id, maintenance: true, ends_at: new Date(end * 1000).toISOString() });
        } else {
          await ninjaClient(token).delete(`/device/${device_id}/maintenance`);
          return ok({ device_id, maintenance: false });
        }
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_run_script",
    {
      description:
        "Run a stored script on a NinjaOne device. The script must already exist in the NinjaOne script library. " +
        "Returns a job ID — use ninja_get_device_details to check job status.",
      inputSchema: z.object({
        device_id: z.number().int().describe("NinjaOne device ID"),
        script_id: z.number().int().describe("NinjaOne script library ID"),
        run_as: z
          .enum(["SYSTEM", "LOGGED_ON_USER"])
          .default("SYSTEM")
          .describe("Execution context"),
        parameters: z
          .string()
          .optional()
          .describe("Script parameters as a single string (passed to the script as arguments)"),
      }),
    },
    async ({ device_id, script_id, run_as, parameters }) => {
      try {
        const token = await getNinjaManagementToken();
        const body: Record<string, unknown> = { id: script_id, runAs: run_as };
        if (parameters !== undefined) body["parameters"] = parameters;
        const res = await ninjaClient(token).post(`/device/${device_id}/script/run`, body);
        return ok(res.data ?? { device_id, script_id, queued: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ninja_reset_alert",
    {
      description:
        "Acknowledge and dismiss an active NinjaOne alert by its UID. " +
        "Use ninja_get_alerts or ninja_get_fleet_health to find alert UIDs.",
      inputSchema: z.object({
        alert_uid: z.string().describe("Alert UID (string identifier, not the numeric device ID)"),
      }),
    },
    async ({ alert_uid }) => {
      try {
        const token = await getNinjaManagementToken();
        await ninjaClient(token).delete(`/alert/${alert_uid}`);
        return ok({ alert_uid, dismissed: true });
      } catch (e) {
        return err(e);
      }
    }
  );

}
