import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMdeToken } from "../auth/mde.js";
import { mdeClient, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Defender for Endpoint not configured: set MDE_TENANT_ID, MDE_CLIENT_ID, MDE_CLIENT_SECRET. " +
  "This requires a SEPARATE app registration with WindowsDefenderATP application permissions.";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerDefenderMdeTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "mde_list_devices",
    {
      description:
        "List all devices enrolled in Microsoft Defender for Endpoint. " +
        "Returns hostname, OS, health status, risk score, exposure score, last seen date, and IP addresses.",
      inputSchema: z.object({
        health_status: z
          .enum(["Active", "Inactive", "ImpairedCommunication", "NoSensorData", "all"])
          .default("all")
          .describe("Filter by device health status"),
        risk_score: z
          .enum(["None", "Low", "Medium", "High", "all"])
          .default("all")
          .describe("Filter by risk score"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ health_status, risk_score, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const filters: string[] = [];
        if (health_status !== "all") filters.push(`healthStatus eq '${health_status}'`);
        if (risk_score !== "all") filters.push(`riskScore eq '${risk_score}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/machines", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_get_device",
    {
      description:
        "Get full details for a specific Defender-enrolled device: OS version, IP addresses, " +
        "last seen, risk score, exposure score, tags, and group membership.",
      inputSchema: z.object({
        machine_id: z.string().describe("MDE machine ID (from mde_list_devices)"),
      }),
    },
    async ({ machine_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).get(`/machines/${machine_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_get_device_vulnerabilities",
    {
      description:
        "List CVEs (vulnerabilities) found on a specific Defender-enrolled device, " +
        "with severity, CVSS score, and remediation recommendations.",
      inputSchema: z.object({
        machine_id: z.string().describe("MDE machine ID"),
        severity: z
          .enum(["Low", "Medium", "High", "Critical", "all"])
          .default("all")
          .describe("Filter by CVE severity"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ machine_id, severity, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const params: Record<string, string | number> = { $top: top };
        if (severity !== "all") params["$filter"] = `severity eq '${severity}'`;
        const res = await mdeClient(token).get(
          `/machines/${machine_id}/vulnerabilities`,
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_run_av_scan",
    {
      description:
        "Trigger an antivirus scan on a Defender-enrolled device. " +
        "Quick scan checks common malware locations; Full scan checks the entire disk (slower).",
      inputSchema: z.object({
        machine_id: z.string().describe("MDE machine ID"),
        scan_type: z
          .enum(["Quick", "Full"])
          .default("Quick")
          .describe("'Quick' is fast and covers common threat locations; 'Full' scans the entire disk"),
        comment: z
          .string()
          .default("Scan triggered via it-ops-mcp-server")
          .describe("Reason for the scan (recorded in audit log)"),
      }),
    },
    async ({ machine_id, scan_type, comment }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).post(
          `/machines/${machine_id}/runAntiVirusScan`,
          { scanType: scan_type, comment }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_isolate_device",
    {
      description:
        "Isolate a device from the network to contain a potential breach. " +
        "The device loses all connectivity except to Defender for Endpoint. " +
        "Use mde_unisolate_device to restore access after investigation.",
      inputSchema: z.object({
        machine_id: z.string().describe("MDE machine ID"),
        isolation_type: z
          .enum(["Full", "Selective"])
          .default("Full")
          .describe(
            "'Full' blocks all traffic; 'Selective' allows Outlook and Teams through for communication"
          ),
        comment: z.string().describe("Reason for isolation (required, recorded in audit log)"),
      }),
    },
    async ({ machine_id, isolation_type, comment }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).post(`/machines/${machine_id}/isolate`, {
          isolationType: isolation_type,
          comment,
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_unisolate_device",
    {
      description:
        "Remove a device from network isolation in Defender for Endpoint, restoring full connectivity.",
      inputSchema: z.object({
        machine_id: z.string().describe("MDE machine ID"),
        comment: z.string().describe("Reason for releasing isolation (recorded in audit log)"),
      }),
    },
    async ({ machine_id, comment }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).post(`/machines/${machine_id}/unisolate`, { comment });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_list_alerts",
    {
      description:
        "List Defender for Endpoint alerts with severity, status, affected device, and assigned investigator.",
      inputSchema: z.object({
        severity: z
          .enum(["Informational", "Low", "Medium", "High", "all"])
          .default("all"),
        status: z
          .enum(["New", "InProgress", "Resolved", "all"])
          .default("all"),
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ severity, status, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const filters: string[] = [];
        if (severity !== "all") filters.push(`severity eq '${severity}'`);
        if (status !== "all") filters.push(`status eq '${status}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/alerts", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_list_indicators",
    {
      description:
        "List custom threat indicators (IOCs) configured in Defender for Endpoint: " +
        "blocked/allowed IP addresses, domains, URLs, and file hashes.",
      inputSchema: z.object({
        indicator_type: z
          .enum(["FileSha256", "FileSha1", "FileMd5", "IpAddress", "DomainName", "Url", "all"])
          .default("all"),
        action: z
          .enum(["Alert", "Block", "Allowed", "all"])
          .default("all"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ indicator_type, action, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const filters: string[] = [];
        if (indicator_type !== "all") filters.push(`indicatorType eq '${indicator_type}'`);
        if (action !== "all") filters.push(`action eq '${action}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/indicators", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_create_indicator",
    {
      description:
        "Create a custom threat indicator (IOC) in Defender for Endpoint to block or alert on " +
        "a specific IP address, domain, URL, or file hash across all enrolled devices.",
      inputSchema: z.object({
        indicator_value: z
          .string()
          .describe("The value to block/allow: IP address, domain, URL, or file hash"),
        indicator_type: z
          .enum(["FileSha256", "FileSha1", "FileMd5", "IpAddress", "DomainName", "Url"])
          .describe("Type of indicator"),
        action: z
          .enum(["Alert", "AlertAndBlock", "Block", "Allowed", "Audit"])
          .describe(
            "'AlertAndBlock' generates an alert and blocks the IOC; 'Block' silently blocks; 'Allowed' whitelists"
          ),
        title: z.string().describe("Short name for this indicator"),
        description: z.string().describe("Why this indicator is being created"),
        severity: z
          .enum(["Informational", "Low", "Medium", "High"])
          .default("Medium"),
        expiry_time: z
          .string()
          .optional()
          .describe("Optional expiry in ISO 8601 format — omit for permanent"),
      }),
    },
    async ({ indicator_value, indicator_type, action, title, description, severity, expiry_time }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const body: Record<string, unknown> = {
          indicatorValue: indicator_value,
          indicatorType: indicator_type,
          action,
          title,
          description,
          severity,
        };
        if (expiry_time) body["expirationTime"] = expiry_time;
        const res = await mdeClient(token).post("/indicators", body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mde_get_security_recommendations",
    {
      description:
        "List Defender TVM (Threat & Vulnerability Management) security recommendations " +
        "for the organization, ordered by exposure impact. Shows what to fix first to reduce attack surface.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).get("/recommendations", {
          params: { $top: top, $orderby: "exposureLevel desc" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
