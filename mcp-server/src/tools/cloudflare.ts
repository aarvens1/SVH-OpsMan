import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_CFG_MSG =
  "Cloudflare tools are not configured — set CLOUDFLARE_API_TOKEN in the SVH OpsMan Bitwarden item";

function cfClient() {
  return axios.create({
    baseURL: "https://api.cloudflare.com/client/v4",
    headers: { Authorization: `Bearer ${process.env["CLOUDFLARE_API_TOKEN"] ?? ""}` },
    timeout: 20_000,
  });
}

function cfData<T>(raw: unknown): T[] {
  const r = raw as { result?: T[] };
  return r.result ?? [];
}

export function registerCloudflareTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "cloudflare_list_zones",
    {
      description:
        "List all Cloudflare zones (domains) on the account — name, status, plan, name servers, " +
        "and SSL/TLS mode. Use to discover which domains are managed through Cloudflare.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!process.env["CLOUDFLARE_API_TOKEN"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await cfClient().get("/zones", { params: { per_page: 50 } });
        const zones = cfData<A>(res.data).map((z: A) => ({
          id: z["id"],
          name: z["name"],
          status: z["status"],
          plan: (z["plan"] as A | undefined)?.["name"],
          name_servers: z["name_servers"],
          original_name_servers: z["original_name_servers"],
          ssl_mode: (z["meta"] as A | undefined)?.["ssl_universal_mode"],
          modified_on: z["modified_on"],
        }));
        return ok({ count: zones.length, zones });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "cloudflare_list_dns_records",
    {
      description:
        "List DNS records for a Cloudflare zone — type, name, content, TTL, and proxy status. " +
        "Use cloudflare_list_zones to get the zone ID.",
      inputSchema: z.object({
        zone_id: z.string().describe("Cloudflare zone ID from cloudflare_list_zones"),
        type: z
          .enum(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA"])
          .optional()
          .describe("Filter by record type. Omit to return all types."),
      }),
    },
    async ({ zone_id, type }) => {
      if (!process.env["CLOUDFLARE_API_TOKEN"]) return cfgErr(NO_CFG_MSG);
      try {
        const params: Record<string, unknown> = { per_page: 100 };
        if (type) params["type"] = type;
        const res = await cfClient().get(`/zones/${zone_id}/dns_records`, { params });
        const records = cfData<A>(res.data).map((r: A) => ({
          id: r["id"],
          type: r["type"],
          name: r["name"],
          content: r["content"],
          ttl: r["ttl"],
          proxied: r["proxied"],
          priority: r["priority"],
          modified_on: r["modified_on"],
        }));
        return ok({ zone_id, count: records.length, records });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "cloudflare_get_zone_analytics",
    {
      description:
        "Get traffic analytics for a Cloudflare zone — total requests, cached vs uncached, " +
        "bandwidth, unique visitors, and threat counts over a time range.",
      inputSchema: z.object({
        zone_id: z.string().describe("Cloudflare zone ID from cloudflare_list_zones"),
        since: z
          .string()
          .default("-1440")
          .describe("Start of the time range in minutes relative to now (e.g. -1440 = last 24h, -10080 = last 7d)"),
      }),
    },
    async ({ zone_id, since }) => {
      if (!process.env["CLOUDFLARE_API_TOKEN"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await cfClient().get(`/zones/${zone_id}/analytics/dashboard`, {
          params: { since, until: "0", continuous: false },
        });
        const data = (res.data as A)["result"] as A | undefined;
        const totals = (data?.["totals"] as A) ?? {};
        return ok({
          zone_id,
          period: { since, until: "now" },
          requests: {
            all: (totals["requests"] as A | undefined)?.["all"],
            cached: (totals["requests"] as A | undefined)?.["cached"],
            uncached: (totals["requests"] as A | undefined)?.["uncached"],
          },
          bandwidth: {
            all: (totals["bandwidth"] as A | undefined)?.["all"],
            cached: (totals["bandwidth"] as A | undefined)?.["cached"],
          },
          threats: (totals["threats"] as A | undefined)?.["all"],
          uniques: (totals["uniques"] as A | undefined)?.["all"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "cloudflare_list_firewall_events",
    {
      description:
        "List recent WAF / firewall events for a Cloudflare zone — blocked requests, challenge actions, " +
        "source IPs, rule IDs, and request paths. Useful for detecting attack patterns or investigating blocks.",
      inputSchema: z.object({
        zone_id: z.string().describe("Cloudflare zone ID from cloudflare_list_zones"),
        limit: z.number().int().min(1).max(100).default(25).describe("Number of events to return (max 100)"),
        action: z
          .enum(["block", "challenge", "jschallenge", "managed_challenge", "log", "allow"])
          .optional()
          .describe("Filter by firewall action. Omit for all actions."),
      }),
    },
    async ({ zone_id, limit, action }) => {
      if (!process.env["CLOUDFLARE_API_TOKEN"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await cfClient().get(`/zones/${zone_id}/firewall/events`, {
          params: { per_page: limit },
        });
        let events = cfData<A>(res.data).map((e: A) => ({
          id: e["ray_id"] ?? e["id"],
          action: e["action"],
          rule_id: e["rule_id"],
          source: e["source"],
          occurred_at: e["occurred_at"],
          ip: e["ip"],
          country: e["country"],
          host: e["host"],
          path: e["path"],
          user_agent: e["user_agent"],
        }));
        if (action) events = events.filter((e) => e.action === action);
        return ok({ zone_id, count: events.length, events });
      } catch (e) {
        return err(e);
      }
    }
  );
}
