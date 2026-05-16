import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

// TTL cache for admin_get_service_health
const responseCache = new Map<string, { data: unknown; expires_at: number }>();
function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expires_at) return entry.data;
  return null;
}
function setCached(key: string, data: unknown, ttlMs = 60_000): void {
  responseCache.set(key, { data, expires_at: Date.now() + ttlMs });
}

export function registerMsAdminTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  // ── Service Health ─────────────────────────────────────────────────────────

  server.registerTool(
    "admin_get_service_health",
    {
      description:
        "Get the current health status of all Microsoft 365 services (Exchange, Teams, SharePoint, etc.). " +
        "Shows which services are healthy, degraded, or experiencing an outage.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const cacheKey = "admin_get_service_health";
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/admin/serviceAnnouncement/healthOverviews");
        const services = ((res.data as A)["value"] as A[] ?? []).map((s: A) => ({
          id: s["id"],
          displayName: s["service"] ?? s["displayName"],
          status: s["status"],
          statusDisplayName: s["statusDisplayName"],
        }));
        const shaped = { count: services.length, services };
        setCached(cacheKey, shaped);
        return ok(shaped);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "admin_list_service_incidents",
    {
      description:
        "List active and recent Microsoft 365 service incidents and advisories, including affected services, " +
        "impact descriptions, and resolution status.",
      inputSchema: z.object({
        status: z
          .enum(["active", "resolved", "all"])
          .default("active")
          .describe("Filter by incident status"),
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ status, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = { $top: top };
        if (status !== "all") params["$filter"] = `status eq '${status}'`;
        const res = await graphClient(token).get("/admin/serviceAnnouncement/issues", { params });
        const issues = ((res.data as A)["value"] as A[] ?? []).map((i: A) => ({
          id: i["id"],
          title: i["title"],
          service: i["service"],
          status: i["status"],
          classification: i["classification"],
          impactDescription: i["impactDescription"],
          startDateTime: i["startDateTime"],
          endDateTime: i["endDateTime"],
          lastModifiedDateTime: i["lastModifiedDateTime"],
          feature: i["feature"],
          featureGroup: i["featureGroup"],
          isResolved: i["isResolved"],
          details: i["details"],
        }));
        return ok({ count: issues.length, incidents: issues });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "admin_list_message_center",
    {
      description:
        "List Microsoft 365 Message Center notifications — upcoming changes, new features, " +
        "and required admin actions across M365 services.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/admin/serviceAnnouncement/messages", {
          params: { $top: top, $orderby: "lastModifiedDateTime desc" },
        });
        const messages = ((res.data as A)["value"] as A[] ?? []).map((m: A) => ({
          id: m["id"],
          title: m["title"],
          category: m["category"],
          severity: m["severity"],
          services: m["services"],
          actionType: m["actionType"],
          messageType: m["messageType"],
          startDateTime: m["startDateTime"],
          endDateTime: m["endDateTime"],
          lastModifiedDateTime: m["lastModifiedDateTime"],
          isMajorChange: m["isMajorChange"],
          tags: m["tags"],
          body: (m["body"] as A | undefined)?.["content"],
        }));
        return ok({ count: messages.length, messages });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Organization ───────────────────────────────────────────────────────────

  server.registerTool(
    "admin_get_tenant_info",
    {
      description:
        "Get Microsoft 365 tenant details: display name, verified domains, country, technical contact, and provisioned SKUs.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/organization", {
          params: {
            $select:
              "id,displayName,verifiedDomains,country,countryLetterCode,technicalNotificationMails,createdDateTime",
          },
        });
        const orgs = ((res.data as A)["value"] as A[] ?? []).map((o: A) => ({
          id: o["id"],
          displayName: o["displayName"],
          verifiedDomains: o["verifiedDomains"],
          country: o["country"],
          countryLetterCode: o["countryLetterCode"],
          technicalNotificationMails: o["technicalNotificationMails"],
          createdDateTime: o["createdDateTime"],
        }));
        return ok(orgs.length === 1 ? orgs[0] : orgs);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "admin_list_domains",
    {
      description:
        "List all domains registered to the Microsoft 365 tenant, with verification status and capabilities (email, OfficeCommunicationsOnline, etc.).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/domains");
        const domains = ((res.data as A)["value"] as A[] ?? []).map((d: A) => ({
          id: d["id"],
          authenticationType: d["authenticationType"],
          availabilityStatus: d["availabilityStatus"],
          isAdminManaged: d["isAdminManaged"],
          isDefault: d["isDefault"],
          isInitial: d["isInitial"],
          isRoot: d["isRoot"],
          isVerified: d["isVerified"],
          supportedServices: d["supportedServices"],
          state: d["state"],
        }));
        return ok({ count: domains.length, domains });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Licensing ──────────────────────────────────────────────────────────────

  server.registerTool(
    "admin_list_subscriptions",
    {
      description:
        "List all Microsoft 365 license subscriptions for the tenant: SKU name, total seats, consumed seats, and remaining.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/subscribedSkus", {
          params: { $select: "skuId,skuPartNumber,prepaidUnits,consumedUnits,servicePlans" },
        });
        const skus = ((res.data as A)["value"] as A[] ?? []).map((s: A) => ({
          skuId: s["skuId"],
          skuPartNumber: s["skuPartNumber"],
          consumedUnits: s["consumedUnits"],
          prepaidUnits: s["prepaidUnits"],
          remainingUnits: ((s["prepaidUnits"] as A | undefined)?.["enabled"] as number ?? 0) - (s["consumedUnits"] as number ?? 0),
          servicePlans: (s["servicePlans"] as A[] | undefined)?.map((p: A) => ({
            servicePlanName: p["servicePlanName"],
            provisioningStatus: p["provisioningStatus"],
            appliesTo: p["appliesTo"],
          })),
        }));
        return ok({ count: skus.length, subscriptions: skus });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "admin_get_user_licenses",
    {
      description: "Get the Microsoft 365 licenses currently assigned to a specific user.",
      inputSchema: z.object({
        user_id: z.string().describe("User object ID or UPN (e.g. user@company.com)"),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${user_id}/licenseDetails`);
        const licenses = ((res.data as A)["value"] as A[] ?? []).map((l: A) => ({
          id: l["id"],
          skuId: l["skuId"],
          skuPartNumber: l["skuPartNumber"],
          servicePlans: (l["servicePlans"] as A[] | undefined)?.map((p: A) => ({
            servicePlanId: p["servicePlanId"],
            servicePlanName: p["servicePlanName"],
            provisioningStatus: p["provisioningStatus"],
            appliesTo: p["appliesTo"],
          })),
        }));
        return ok({ count: licenses.length, licenses });
      } catch (e) {
        return err(e);
      }
    }
  );
}
