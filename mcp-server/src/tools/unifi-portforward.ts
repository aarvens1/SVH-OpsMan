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

export function registerUnifiPortForwardTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_list_port_forwards",
    {
      description: "List all port forwarding rules on a UniFi site.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/portforward`);
        const port_forwards = classicData(res.data).map((p: A) => ({
          id: p["_id"] ?? p["id"],
          name: p["name"],
          enabled: p["enabled"],
          fwd_ip: p["fwd"],
          fwd_port: p["fwd_port"],
          dst_port: p["dst_port"],
          protocol: p["proto"],
          src: p["src"],
        }));
        return ok({ controller, count: port_forwards.length, port_forwards });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_port_forward",
    {
      description:
        "Create a port forwarding rule. fwd_ip is the internal server IP, dst_port is the external port, fwd_port is the internal port.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("Rule name (e.g. 'Web Server 80')"),
        fwd_ip: z.string().describe("Internal server IP to forward to (e.g. '192.168.1.100')"),
        fwd_port: z.string().describe("Internal port on the server (e.g. '80')"),
        dst_port: z.string().describe("External port exposed on the WAN (e.g. '8080')"),
        protocol: z.enum(["tcp", "udp", "tcp_udp"]).default("tcp").describe("Protocol to forward"),
        src: z.string().optional().describe("Source IP filter — omit or set to 'any' to allow all sources"),
        enabled: z.boolean().default(true).describe("Whether the rule is active"),
      }),
    },
    async ({ controller, site_id, name, fwd_ip, fwd_port, dst_port, protocol, src, enabled }) => {
      try {
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/portforward`, {
          name,
          fwd: fwd_ip,
          fwd_port,
          dst_port,
          proto: protocol,
          src: src ?? "any",
          enabled,
        });
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], name, fwd_ip, dst_port, fwd_port });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_toggle_port_forward",
    {
      description:
        "Enable or disable a port forwarding rule without deleting it. Use unifi_list_port_forwards to get rule_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        rule_id: z.string().describe("Port forward rule ID from unifi_list_port_forwards"),
        enabled: z.boolean().describe("true to enable the rule, false to disable"),
      }),
    },
    async ({ controller, site_id, rule_id, enabled }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/portforward/${rule_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`Port forward rule ${rule_id} not found`));
        const updated = { ...existing, enabled };
        await client.put(`/api/s/${site_id}/rest/portforward/${rule_id}`, updated);
        return ok({ controller, site_id, rule_id, enabled, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_port_forward",
    {
      description:
        "Delete a port forwarding rule. Use unifi_list_port_forwards to get rule_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        rule_id: z.string().describe("Port forward rule ID from unifi_list_port_forwards"),
      }),
    },
    async ({ controller, site_id, rule_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/portforward/${rule_id}`);
        return ok({ controller, site_id, rule_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
