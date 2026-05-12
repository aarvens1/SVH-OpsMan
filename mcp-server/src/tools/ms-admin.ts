import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

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
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/admin/serviceAnnouncement/healthOverviews");
        return ok(res.data);
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
        return ok(res.data);
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
        return ok(res.data);
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
        return ok(res.data);
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
        return ok(res.data);
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
        return ok(res.data);
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
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
