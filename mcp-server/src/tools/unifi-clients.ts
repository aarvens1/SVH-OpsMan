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

export function registerUnifiClientsTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_create_static_ip",
    {
      description:
        "Pin a client MAC to a fixed IP on a specific network via DHCP reservation. " +
        "Use unifi_list_clients to get the client_id. Use unifi_list_networks to get the network_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        client_id: z.string().describe("Client ID from unifi_list_clients (the 'id' field)"),
        fixed_ip: z.string().describe("The IP address to reserve for this client (e.g. '192.168.1.50')"),
        network_id: z.string().optional().describe("Network config ID to bind the reservation to (from unifi_list_networks)"),
      }),
    },
    async ({ controller, site_id, client_id, fixed_ip, network_id }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/user/${client_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`Client ${client_id} not found`));
        const changes: A = { use_fixedip: true, fixed_ip };
        if (network_id) changes["network_id"] = network_id;
        const updated = { ...existing, ...changes };
        await client.put(`/api/s/${site_id}/rest/user/${client_id}`, updated);
        return ok({ controller, site_id, client_id, fixed_ip, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_static_ip",
    {
      description:
        "Remove a DHCP reservation (static IP) from a client. " +
        "The client will be assigned a dynamic IP on its next DHCP request.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        client_id: z.string().describe("Client ID from unifi_list_clients (the 'id' field)"),
      }),
    },
    async ({ controller, site_id, client_id }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/user/${client_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`Client ${client_id} not found`));
        const updated = { ...existing, use_fixedip: false };
        await client.put(`/api/s/${site_id}/rest/user/${client_id}`, updated);
        return ok({ controller, site_id, client_id, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_kick_client",
    {
      description:
        "Force-disconnect a wireless client so it immediately re-authenticates and picks up new network settings. " +
        "Use unifi_list_clients to find the mac.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        client_mac: z.string().describe("Client MAC address (e.g. 'aa:bb:cc:dd:ee:ff')"),
      }),
    },
    async ({ controller, site_id, client_mac }) => {
      try {
        const mac = client_mac.toLowerCase().replace(/[-]/g, ":").trim();
        await createControllerClient(controller).post(`/api/s/${site_id}/cmd/stamgr`, {
          cmd: "kick-sta",
          mac,
        });
        return ok({ controller, site_id, mac, kicked: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_set_port_profile",
    {
      description:
        "Assign a port profile to a specific switch port, changing its VLAN assignment. " +
        "Use unifi_get_switch_ports to find port indices, unifi_list_port_profiles for profile IDs.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        device_mac: z.string().describe("MAC address of the switch (e.g. 'aa:bb:cc:dd:ee:ff')"),
        port_idx: z.number().int().min(1).describe("Port index (1-based) from unifi_get_switch_ports"),
        port_profile_id: z.string().describe("Port profile ID from unifi_list_port_profiles"),
      }),
    },
    async ({ controller, site_id, device_mac, port_idx, port_profile_id }) => {
      try {
        const client = createControllerClient(controller);
        const mac = device_mac.toLowerCase().replace(/[:-]/g, "");
        const res = await client.get(`/api/s/${site_id}/stat/device/${mac}`);
        const items = classicData(res.data);
        const device = items[0] as A | undefined;
        if (!device) return err(new Error(`Device ${device_mac} not found`));
        const deviceId = device["_id"] as string | undefined;
        if (!deviceId) return err(new Error("Could not resolve device ID"));
        const overrides = [...((device["port_overrides"] as A[] | undefined) ?? [])];
        const existing = overrides.findIndex((o) => (o["port_idx"] as number) === port_idx);
        if (existing >= 0) {
          overrides[existing] = { ...overrides[existing], portconf_id: port_profile_id };
        } else {
          overrides.push({ port_idx, portconf_id: port_profile_id });
        }
        await client.put(`/api/s/${site_id}/rest/device/${deviceId}`, { port_overrides: overrides });
        return ok({ controller, site_id, device_mac, port_idx, port_profile_id, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
