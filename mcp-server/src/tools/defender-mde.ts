import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMdeToken } from "../auth/mde.js";
import { mdeClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

// TTL cache for mde_list_devices
const responseCache = new Map<string, { data: unknown; expires_at: number }>();
function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expires_at) return entry.data;
  return null;
}
function setCached(key: string, data: unknown, ttlMs = 60_000): void {
  responseCache.set(key, { data, expires_at: Date.now() + ttlMs });
}

export function registerDefenderMdeTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

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
      try {
        const cacheKey = `mde_list_devices:${health_status}:${risk_score}:${top}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const token = await getMdeToken();
        const filters: string[] = [];
        if (health_status !== "all") filters.push(`healthStatus eq '${health_status}'`);
        if (risk_score !== "all") filters.push(`riskScore eq '${risk_score}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/machines", { params });
        const devices = ((res.data as A)["value"] as A[] ?? []).map((d: A) => ({
          id: d["id"],
          computerDnsName: d["computerDnsName"],
          osPlatform: d["osPlatform"],
          osVersion: d["osVersion"],
          healthStatus: d["healthStatus"],
          riskScore: d["riskScore"],
          exposureLevel: d["exposureLevel"],
          lastSeen: d["lastSeen"],
          firstSeen: d["firstSeen"],
          ipAddresses: (d["ipAddresses"] as A[] | undefined)?.map((ip: A) => ({
            ipAddress: ip["ipAddress"],
            macAddress: ip["macAddress"],
            type: ip["type"],
          })),
          onboardingStatus: d["onboardingStatus"],
          aadDeviceId: d["aadDeviceId"],
          defenderAvStatus: d["defenderAvStatus"],
          groupName: d["rbacGroupName"],
          tags: d["machineTags"],
        }));
        const shaped = { count: devices.length, devices };
        setCached(cacheKey, shaped);
        return ok(shaped);
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
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).get(`/machines/${machine_id}`);
        const d = res.data as A;
        return ok({
          id: d["id"],
          computerDnsName: d["computerDnsName"],
          osPlatform: d["osPlatform"],
          osVersion: d["osVersion"],
          osProcessor: d["osProcessor"],
          healthStatus: d["healthStatus"],
          riskScore: d["riskScore"],
          exposureLevel: d["exposureLevel"],
          lastSeen: d["lastSeen"],
          firstSeen: d["firstSeen"],
          ipAddresses: d["ipAddresses"],
          onboardingStatus: d["onboardingStatus"],
          aadDeviceId: d["aadDeviceId"],
          defenderAvStatus: d["defenderAvStatus"],
          groupName: d["rbacGroupName"],
          tags: d["machineTags"],
          agentVersion: d["agentVersion"],
        });
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
      try {
        const token = await getMdeToken();
        const params: Record<string, string | number> = { $top: top };
        if (severity !== "all") params["$filter"] = `severity eq '${severity}'`;
        const res = await mdeClient(token).get(
          `/machines/${machine_id}/vulnerabilities`,
          { params }
        );
        const vulns = ((res.data as A)["value"] as A[] ?? []).map((v: A) => ({
          id: v["id"],
          name: v["name"],
          description: v["description"],
          severity: v["severity"],
          cvssV3: v["cvssV3"],
          exposedMachines: v["exposedMachines"],
          publishedOn: v["publishedOn"],
          updatedOn: v["updatedOn"],
          publicExploit: v["publicExploit"],
          exploitInKit: v["exploitInKit"],
          exploitTypes: v["exploitTypes"],
          exploitUris: v["exploitUris"],
        }));
        return ok({ count: vulns.length, vulnerabilities: vulns });
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
      try {
        const token = await getMdeToken();
        const filters: string[] = [];
        if (severity !== "all") filters.push(`severity eq '${severity}'`);
        if (status !== "all") filters.push(`status eq '${status}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/alerts", { params });
        const alerts = ((res.data as A)["value"] as A[] ?? []).map((a: A) => ({
          id: a["id"],
          title: a["title"],
          description: a["description"],
          severity: a["severity"],
          status: a["status"],
          category: a["category"],
          detectionSource: a["detectionSource"],
          threatName: a["threatName"],
          threatFamilyName: a["threatFamilyName"],
          alertCreationTime: a["alertCreationTime"],
          lastEventTime: a["lastEventTime"],
          machineId: a["machineId"],
          computerDnsName: a["computerDnsName"],
          assignedTo: a["assignedTo"],
          determination: a["determination"],
          investigationState: a["investigationState"],
          mitreTechniques: a["mitreTechniques"],
        }));
        return ok({ count: alerts.length, alerts });
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
      try {
        const token = await getMdeToken();
        const filters: string[] = [];
        if (indicator_type !== "all") filters.push(`indicatorType eq '${indicator_type}'`);
        if (action !== "all") filters.push(`action eq '${action}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await mdeClient(token).get("/indicators", { params });
        const indicators = ((res.data as A)["value"] as A[] ?? []).map((i: A) => ({
          id: i["id"],
          indicatorValue: i["indicatorValue"],
          indicatorType: i["indicatorType"],
          action: i["action"],
          title: i["title"],
          description: i["description"],
          severity: i["severity"],
          createdBy: i["createdBy"],
          creationTimeDateTimeUtc: i["creationTimeDateTimeUtc"],
          expirationTime: i["expirationTime"],
          application: i["application"],
        }));
        return ok({ count: indicators.length, indicators });
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
      try {
        const token = await getMdeToken();
        const res = await mdeClient(token).get("/recommendations", {
          params: { $top: top, $orderby: "exposureLevel desc" },
        });
        const recs = ((res.data as A)["value"] as A[] ?? []).map((r: A) => ({
          id: r["id"],
          productName: r["productName"],
          recommendationName: r["recommendationName"],
          weaknesses: r["weaknesses"],
          vendor: r["vendor"],
          recommendedProgram: r["recommendedProgram"],
          recommendedVersion: r["recommendedVersion"],
          recommendedVendor: r["recommendedVendor"],
          status: r["status"],
          severity: r["severity"],
          exposureLevel: r["exposureLevel"],
          configScoreImpact: r["configScoreImpact"],
          exposureImpact: r["exposureImpact"],
          remediationType: r["remediationType"],
          publicExploit: r["publicExploit"],
          activeAlert: r["activeAlert"],
          associatedThreats: r["associatedThreats"],
          exposedMachinesCount: r["exposedMachinesCount"],
        }));
        return ok({ count: recs.length, recommendations: recs });
      } catch (e) {
        return err(e);
      }
    }
  );
}
