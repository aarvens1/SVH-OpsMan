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

export function registerUnifiWlanTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_list_ap_groups",
    {
      description:
        "List AP groups configured at a UniFi site. AP group IDs are required when creating or updating WLANs " +
        "to control which access points broadcast an SSID.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/apgroups`);
        const ap_groups = classicData(res.data).map((g: A) => ({
          id: g["_id"] ?? g["id"],
          name: g["name"],
          device_macs: (g["device_macs"] as string[] | undefined) ?? [],
        }));
        return ok({ controller, count: ap_groups.length, ap_groups });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_update_wlan",
    {
      description:
        "Update settings on an existing WLAN (SSID). Only provided fields are changed; all other settings are preserved. " +
        "Use unifi_list_wlans to get wlan_id, unifi_list_ap_groups for ap_group_ids.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        wlan_id: z.string().describe("WLAN config ID from unifi_list_wlans (the 'id' field)"),
        name: z.string().optional().describe("New SSID name"),
        enabled: z.boolean().optional().describe("Enable or disable the SSID"),
        passphrase: z.string().optional().describe("New WPA passphrase"),
        security: z.enum(["open", "wpa2", "wpa3", "wpapsk"]).optional().describe("Security mode"),
        vlan: z.number().int().min(1).max(4094).optional().describe("VLAN ID to assign to this SSID"),
        vlan_enabled: z.boolean().optional().describe("Enable VLAN tagging for this SSID"),
        band: z.enum(["2g", "5g", "both"]).optional().describe("Radio band to broadcast on"),
        ap_group_ids: z.array(z.string()).optional().describe("AP group IDs that should broadcast this SSID"),
      }),
    },
    async ({ controller, site_id, wlan_id, name, enabled, passphrase, security, vlan, vlan_enabled, band, ap_group_ids }) => {
      try {
        if (
          name === undefined && enabled === undefined && passphrase === undefined &&
          security === undefined && vlan === undefined && vlan_enabled === undefined &&
          band === undefined && ap_group_ids === undefined
        ) {
          return err(new Error("At least one field must be provided"));
        }
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/wlanconf/${wlan_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`WLAN ${wlan_id} not found`));
        const changes: A = {};
        if (name !== undefined) changes["name"] = name;
        if (enabled !== undefined) changes["enabled"] = enabled;
        if (passphrase !== undefined) changes["x_passphrase"] = passphrase;
        if (security !== undefined) changes["security"] = security;
        if (vlan !== undefined) changes["vlan"] = vlan;
        if (vlan_enabled !== undefined) changes["vlan_enabled"] = vlan_enabled;
        if (band !== undefined) changes["band"] = band;
        if (ap_group_ids !== undefined) changes["ap_group_ids"] = ap_group_ids;
        const updated = { ...existing, ...changes };
        await client.put(`/api/s/${site_id}/rest/wlanconf/${wlan_id}`, updated);
        const appliedKeys = Object.keys(changes).map((k) => k === "x_passphrase" ? "passphrase" : k);
        return ok({ controller, site_id, wlan_id, applied: appliedKeys, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_wlan",
    {
      description:
        "Create a new wireless network (SSID) on a UniFi site. " +
        "Use unifi_list_networks to get network_id, unifi_list_ap_groups for ap_group_ids.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("SSID name (the network name clients see)"),
        security: z.enum(["open", "wpa2", "wpa3", "wpapsk"]).describe("Security mode"),
        passphrase: z.string().optional().describe("WPA passphrase (required when security is not 'open')"),
        network_id: z.string().optional().describe("Network config ID to bind this SSID to (from unifi_list_networks)"),
        vlan: z.number().int().min(1).max(4094).optional().describe("VLAN ID"),
        vlan_enabled: z.boolean().default(false).describe("Enable VLAN tagging"),
        band: z.enum(["2g", "5g", "both"]).default("both").describe("Radio band to broadcast on"),
        ap_group_ids: z.array(z.string()).optional().describe("AP group IDs that should broadcast this SSID"),
      }),
    },
    async ({ controller, site_id, name, security, passphrase, network_id, vlan, vlan_enabled, band, ap_group_ids }) => {
      try {
        const payload: A = { name, security, vlan_enabled, band };
        if (passphrase) payload["x_passphrase"] = passphrase;
        if (network_id) payload["networkconf_id"] = network_id;
        if (vlan !== undefined) payload["vlan"] = vlan;
        if (ap_group_ids) payload["ap_group_ids"] = ap_group_ids;
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/wlanconf`, payload);
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], name: created["name"] });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_wlan",
    {
      description:
        "Delete a wireless network (SSID) from a UniFi site. This immediately stops the SSID from broadcasting. " +
        "Use unifi_list_wlans to get wlan_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        wlan_id: z.string().describe("WLAN config ID from unifi_list_wlans (the 'id' field)"),
      }),
    },
    async ({ controller, site_id, wlan_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/wlanconf/${wlan_id}`);
        return ok({ controller, site_id, wlan_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
