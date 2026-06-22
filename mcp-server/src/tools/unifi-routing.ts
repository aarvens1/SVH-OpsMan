import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

const CONTROLLER_PARAM = z
  .string()
  .describe(
    "Site controller code: svh, pdx, boi, eug, sea, fgt. Warehouse variants: boi_wh, eug_wh, sea_wh. " +
    "Add more by setting UNIFI_{SITE}_URL and UNIFI_{SITE}_KEY in the SVH OpsMan Bitwarden item."
  );

const SITE_PARAM = z
  .string()
  .default("default")
  .describe("UniFi site name (e.g. 'default'). Use 'default' for single-site UDMs.");

function classicData(raw: unknown): A[] {
  const r = raw as A;
  return (r["data"] as A[] | undefined) ?? (Array.isArray(raw) ? (raw as A[]) : []);
}

export function registerUnifiRoutingTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  // ── Static Routes ──────────────────────────────────────────────────────────

  server.registerTool(
    "unifi_list_static_routes",
    {
      description: "List static routes configured on a UniFi site.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/routing`);
        const routes = classicData(res.data).map((r: A) => ({
          id: r["_id"] ?? r["id"],
          name: r["name"],
          enabled: r["enabled"],
          network: r["network"],
          gateway_type: r["gateway_type"],
          nh_ip: r["nh_ip"],
          distance: r["distance"],
        }));
        return ok({ controller, count: routes.length, routes });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_static_route",
    {
      description:
        "Create a static route on a UniFi site. network is the destination CIDR (e.g. '10.0.50.0/24'), nh_ip is the next-hop gateway IP.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("Route name (e.g. 'PDX-Lab-Network')"),
        network: z.string().describe("Destination CIDR (e.g. '10.0.50.0/24')"),
        nh_ip: z.string().describe("Next-hop gateway IP (e.g. '192.168.1.1')"),
        distance: z.number().int().default(1).describe("Administrative distance (lower = preferred)"),
        enabled: z.boolean().default(true).describe("Whether the route is active"),
      }),
    },
    async ({ controller, site_id, name, network, nh_ip, distance, enabled }) => {
      try {
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/routing`, {
          name,
          network,
          gateway_type: "inet",
          nh_ip,
          distance,
          enabled,
        });
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], name, network, nh_ip });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_static_route",
    {
      description: "Delete a static route. Use unifi_list_static_routes to get route_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        route_id: z.string().describe("Route ID from unifi_list_static_routes"),
      }),
    },
    async ({ controller, site_id, route_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/routing/${route_id}`);
        return ok({ controller, site_id, route_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Local DNS Records ──────────────────────────────────────────────────────

  server.registerTool(
    "unifi_list_dns_records",
    {
      description:
        "List local DNS override records on a UniFi site (hostnames resolved by the UDM's built-in DNS).",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/dnsentry`);
        const records = classicData(res.data).map((r: A) => ({
          id: r["_id"] ?? r["id"],
          key: r["key"],
          record_type: r["record_type"],
          value: r["value"],
        }));
        return ok({ controller, count: records.length, records });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_dns_record",
    {
      description:
        "Create a local DNS override record on a UniFi site. The UDM's built-in DNS resolver will return this record. " +
        "record_type: 'A' for IPv4, 'AAAA' for IPv6, 'CNAME' for alias.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        hostname: z.string().describe("Hostname to resolve (e.g. 'printer.local')"),
        value: z.string().describe("IP address or target hostname"),
        record_type: z.enum(["A", "AAAA", "CNAME"]).default("A").describe("DNS record type"),
      }),
    },
    async ({ controller, site_id, hostname, value, record_type }) => {
      try {
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/dnsentry`, {
          key: hostname,
          value,
          record_type,
          enabled: true,
        });
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], hostname, value, record_type });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_dns_record",
    {
      description: "Delete a local DNS override record. Use unifi_list_dns_records to get record_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        record_id: z.string().describe("DNS record ID from unifi_list_dns_records"),
      }),
    },
    async ({ controller, site_id, record_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/dnsentry/${record_id}`);
        return ok({ controller, site_id, record_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── VPN Tunnels ───────────────────────────────────────────────────────────

  server.registerTool(
    "unifi_list_vpn_tunnels",
    {
      description: "List IPSec site-to-site VPN tunnels on a UniFi site.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/ipsec`);
        const tunnels = classicData(res.data).map((t: A) => ({
          id: t["_id"] ?? t["id"],
          name: t["name"],
          enabled: t["enabled"],
          local_ip: t["l_ip"],
          remote_ip: t["r_ip"],
          peer_ip: t["peer_ip"],
        }));
        return ok({ controller, count: tunnels.length, tunnels });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_toggle_vpn_tunnel",
    {
      description:
        "Enable or disable an IPSec VPN tunnel without removing its configuration. " +
        "Use unifi_list_vpn_tunnels to get tunnel_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        tunnel_id: z.string().describe("VPN tunnel ID from unifi_list_vpn_tunnels"),
        enabled: z.boolean().describe("true to bring the tunnel up, false to take it down"),
      }),
    },
    async ({ controller, site_id, tunnel_id, enabled }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/ipsec/${tunnel_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`VPN tunnel ${tunnel_id} not found`));
        const updated = { ...existing, enabled };
        await client.put(`/api/s/${site_id}/rest/ipsec/${tunnel_id}`, updated);
        return ok({ controller, site_id, tunnel_id, enabled, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
