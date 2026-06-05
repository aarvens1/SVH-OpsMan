import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

// All tools use the classic UniFi Network API: /proxy/network/api/s/{site_name}/...
// site_id is the UniFi site name (e.g. "default") — not a UUID.

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

export function registerUnifiNetworkTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_get_site_health",
    {
      description:
        "Get overall health of a UniFi site: WAN status, number of active clients, alerts, and subsystem states.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/stat/health`);
        const subsystems = classicData(res.data).map((h: A) => ({
          subsystem: h["subsystem"],
          status: h["status"],
          numUser: h["num_user"],
          numGuest: h["num_guest"],
          numAp: h["num_ap"],
          numSta: h["num_sta"],
          txBytesR: h["tx_bytes-r"],
          rxBytesR: h["rx_bytes-r"],
          wan_ip: h["wan_ip"],
          gw_mac: h["gw_mac"],
        }));
        return ok({ controller, site_id, subsystems });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_networks",
    {
      description:
        "List all networks (VLANs) configured at a UniFi site, including subnet, VLAN ID, and DHCP settings.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/networkconf`);
        const networks = classicData(res.data).map((n: A) => ({
          id: n["_id"] ?? n["id"],
          name: n["name"],
          purpose: n["purpose"],
          vlan_enabled: n["vlan_enabled"],
          vlan: n["vlan"],
          ip_subnet: n["ip_subnet"],
          dhcpd_enabled: n["dhcpd_enabled"],
          dhcpd_start: n["dhcpd_start"],
          dhcpd_stop: n["dhcpd_stop"],
          dhcpd_dns_1: n["dhcpd_dns_1"],
          domain_name: n["domain_name"],
          is_nat: n["is_nat"],
        }));
        return ok({ controller, count: networks.length, networks });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_firewall_rules",
    {
      description: "List all firewall rules configured on a UniFi site.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/firewallrule`);
        const rules = classicData(res.data).map((r: A) => ({
          id: r["_id"] ?? r["id"],
          name: r["name"],
          action: r["action"],
          enabled: r["enabled"],
          ruleset: r["ruleset"],
          rule_index: r["rule_index"],
          protocol: r["protocol"],
          src_firewallgroup_ids: r["src_firewallgroup_ids"],
          dst_firewallgroup_ids: r["dst_firewallgroup_ids"],
          src_address: r["src_address"],
          dst_address: r["dst_address"],
          src_networkconf_id: r["src_networkconf_id"],
          dst_networkconf_id: r["dst_networkconf_id"],
          dst_port: r["dst_port"],
          src_port: r["src_port"],
          logging: r["logging"],
        }));
        return ok({ controller, count: rules.length, rules });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_controller_devices",
    {
      description:
        "List all managed network devices at a UniFi site (access points, switches, gateways) with status, IP, model, firmware, and uptime.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/stat/device`);
        const devices = classicData(res.data).map((d: A) => ({
          id: d["_id"] ?? d["id"],
          name: d["name"],
          mac: d["mac"],
          model: d["model"],
          type: d["type"],
          ip: d["ip"],
          state: d["state"] === 1 ? "ONLINE" : d["state"] === 0 ? "OFFLINE" : d["state"],
          uptime: d["uptime"],
          last_seen: d["last_seen"],
          version: d["version"],
          adopted: d["adopted"],
          upgradable: d["upgradable"],
          upgrade_to_firmware: d["upgrade_to_firmware"],
        }));
        return ok({ controller, count: devices.length, devices });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_clients",
    {
      description:
        "List clients connected to a UniFi site, including hostname, IP, MAC, VLAN, and signal strength.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        active_only: z
          .boolean()
          .default(true)
          .describe("When true (default), return only currently connected clients (stat/sta). When false, return all known clients including recently disconnected (stat/alluser)."),
      }),
    },
    async ({ controller, site_id, active_only }) => {
      try {
        const endpoint = active_only ? `/api/s/${site_id}/stat/sta` : `/api/s/${site_id}/stat/alluser`;
        const res = await createControllerClient(controller).get(endpoint);
        const clients = classicData(res.data).map((c: A) => ({
          id: c["_id"] ?? c["id"],
          hostname: c["hostname"] ?? c["name"],
          ip: c["ip"],
          mac: c["mac"],
          vlan: c["vlan"],
          network: c["network"],
          ap_mac: c["ap_mac"],
          sw_mac: c["sw_mac"],
          essid: c["essid"],
          signal: c["signal"],
          rssi: c["rssi"],
          tx_rate: c["tx_rate"],
          rx_rate: c["rx_rate"],
          uptime: c["uptime"],
          last_seen: c["last_seen"],
          is_wired: c["is_wired"],
          is_guest: c["is_guest"],
          oui: c["oui"],
        }));
        return ok({ controller, count: clients.length, clients });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_wlans",
    {
      description:
        "List all wireless networks (SSIDs) configured at a UniFi site — " +
        "SSID name, security type, VLAN, band steering, and enabled/disabled state.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/wlanconf`);
        const wlans = classicData(res.data).map((w: A) => ({
          id: w["_id"] ?? w["id"],
          name: w["name"],
          enabled: w["enabled"],
          security: w["security"],
          wpa_mode: w["wpa_mode"],
          wpa_enc: w["wpa_enc"],
          vlan: w["vlan"],
          vlan_enabled: w["vlan_enabled"],
          networkconf_id: w["networkconf_id"],
          band_steering: w["band_steering"],
          is_guest: w["is_guest"],
          hide_ssid: w["hide_ssid"],
          pmf_mode: w["pmf_mode"],
          usergroup_id: w["usergroup_id"],
        }));
        return ok({ controller, count: wlans.length, wlans });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_port_profiles",
    {
      description:
        "List switch port profiles defined at a UniFi site, " +
        "including native VLAN, tagged VLANs, PoE mode, and voice VLAN settings.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/portconf`);
        const profiles = classicData(res.data).map((p: A) => ({
          id: p["_id"] ?? p["id"],
          name: p["name"],
          native_networkconf_id: p["native_networkconf_id"],
          tagged_networkconf_ids: p["tagged_networkconf_ids"],
          poe_mode: p["poe_mode"],
          voice_networkconf_id: p["voice_networkconf_id"],
          op_mode: p["op_mode"],
          forward: p["forward"],
          stormctrl_enabled: p["stormctrl_enabled"],
          speed: p["speed"],
          full_duplex: p["full_duplex"],
          port_security_enabled: p["port_security_enabled"],
          stp_port_mode: p["stp_port_mode"],
        }));
        return ok({ controller, count: profiles.length, portProfiles: profiles });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_get_switch_ports",
    {
      description:
        "Get the current state of all ports on a specific switch — " +
        "link state, speed, PoE wattage, STP state, traffic counters, and assigned profile.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        device_mac: z.string().describe("MAC address of the switch (e.g. aa:bb:cc:dd:ee:ff)"),
      }),
    },
    async ({ controller, site_id, device_mac }) => {
      try {
        const mac = device_mac.toLowerCase().replace(/[^0-9a-f]/g, "");
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/stat/device/${mac}`);
        const items = classicData(res.data);
        const device = items[0] as A | undefined;
        if (!device) return err(new Error(`Device ${device_mac} not found`));
        const ports = (device["port_table"] as A[] | undefined) ?? [];
        return ok({ controller, device_name: device["name"], mac: device["mac"], ports });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Write operations ───────────────────────────────────────────────────────

  server.registerTool(
    "unifi_restart_device",
    {
      description:
        "Restart a UniFi network device (access point, switch, or gateway) by MAC address. " +
        "The device will be offline for 30–90 seconds during reboot.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        device_mac: z.string().describe("MAC address of the device to restart (e.g. aa:bb:cc:dd:ee:ff)"),
      }),
    },
    async ({ controller, site_id, device_mac }) => {
      try {
        const raw = device_mac.toLowerCase().replace(/[^0-9a-f]/g, "");
        const mac = raw.match(/.{2}/g)?.join(":") ?? raw;
        await createControllerClient(controller).post(`/api/s/${site_id}/cmd/devmgr`, {
          cmd: "restart",
          mac,
        });
        return ok({ controller, site_id, mac, restarted: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_set_wlan_state",
    {
      description:
        "Enable or disable a wireless network (SSID) on a UniFi site. " +
        "Use unifi_list_wlans to get the wlan_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        wlan_id: z.string().describe("WLAN config ID from unifi_list_wlans"),
        enabled: z.boolean().describe("true to enable the SSID, false to disable"),
      }),
    },
    async ({ controller, site_id, wlan_id, enabled }) => {
      try {
        await createControllerClient(controller).put(
          `/api/s/${site_id}/rest/wlanconf/${wlan_id}`,
          { enabled }
        );
        return ok({ controller, site_id, wlan_id, enabled });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_set_client_block",
    {
      description:
        "Block or unblock a wireless client by MAC address. " +
        "Blocked clients are prevented from associating with any SSID on the site. " +
        "Use unifi_list_clients to find the client MAC.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        client_mac: z.string().describe("Client MAC address (e.g. aa:bb:cc:dd:ee:ff)"),
        blocked: z.boolean().describe("true to block the client, false to unblock"),
      }),
    },
    async ({ controller, site_id, client_mac, blocked }) => {
      try {
        const mac = client_mac.toLowerCase().replace(/[-:]/g, ":").trim();
        const cmd = blocked ? "block-sta" : "unblock-sta";
        await createControllerClient(controller).post(`/api/s/${site_id}/cmd/stamgr`, {
          cmd,
          mac,
        });
        return ok({ controller, site_id, mac, blocked });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_set_port_enabled",
    {
      description:
        "Enable or disable a specific port on a UniFi switch by port index. " +
        "Disabling sets the port override op_mode to 'disabled'; enabling removes the override to restore the assigned profile. " +
        "Use unifi_get_switch_ports to find port indices.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        device_mac: z.string().describe("MAC address of the switch"),
        port_idx: z.number().int().min(1).describe("Port index (1-based) from unifi_get_switch_ports"),
        enabled: z.boolean().describe("true to enable the port, false to disable"),
      }),
    },
    async ({ controller, site_id, device_mac, port_idx, enabled }) => {
      try {
        const client = createControllerClient(controller);
        const mac = device_mac.toLowerCase().replace(/[-:]/g, ":").trim();

        const res = await client.get(`/api/s/${site_id}/stat/device/${mac.replace(/:/g, "")}`);
        const items = classicData(res.data);
        const device = items[0] as A | undefined;
        if (!device) return err(new Error(`Device ${device_mac} not found`));

        const deviceId = device["_id"] as string | undefined;
        if (!deviceId) return err(new Error("Could not resolve device ID"));

        const overrides = [...((device["port_overrides"] as A[] | undefined) ?? [])];
        const existing = overrides.findIndex((o) => (o["port_idx"] as number) === port_idx);

        if (enabled) {
          if (existing >= 0) {
            const { op_mode: _dropped, ...rest } = overrides[existing] as Record<string, unknown>;
            if (Object.keys(rest).length > 1) {
              // Keep the entry but remove op_mode: "disabled"
              overrides[existing] = rest;
            } else {
              // Entry only had port_idx + op_mode — remove entirely to restore assigned profile
              overrides.splice(existing, 1);
            }
          }
        } else {
          if (existing >= 0) {
            overrides[existing] = { ...overrides[existing], op_mode: "disabled" };
          } else {
            overrides.push({ port_idx, op_mode: "disabled" });
          }
        }

        await client.put(`/api/s/${site_id}/rest/device/${deviceId}`, {
          port_overrides: overrides,
        });

        return ok({ controller, site_id, device_mac: mac, port_idx, enabled });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_network",
    {
      description:
        "Create a new VLAN / network on a UniFi site using the classic Network API. " +
        "Sets subnet, DHCP range, IGMP snooping, and IPv6 state explicitly — never relies on defaults. " +
        "Use unifi_list_networks first to confirm the VLAN ID is not already in use.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("Network name (e.g. 'PDX-Printers')"),
        vlan: z.number().int().min(1).max(4094).describe("VLAN ID (e.g. 13)"),
        ip_subnet: z.string().describe("CIDR subnet (e.g. '172.18.13.0/24')"),
        dhcpd_start: z.string().describe("First DHCP address (e.g. '172.18.13.100')"),
        dhcpd_stop: z.string().describe("Last DHCP address (e.g. '172.18.13.200')"),
        purpose: z.string().default("corporate").describe("Network purpose — 'corporate' for all standard VLANs, 'guest' only for Guest network"),
        igmp_snooping: z.boolean().default(false).describe("Enable IGMP snooping — use true for IoT VLANs only"),
      }),
    },
    async ({ controller, site_id, name, vlan, ip_subnet, dhcpd_start, dhcpd_stop, purpose, igmp_snooping }) => {
      try {
        const payload = {
          name,
          purpose,
          vlan_enabled: true,
          vlan,
          ip_subnet,
          dhcpd_enabled: true,
          dhcpd_start,
          dhcpd_stop,
          dhcpd_dns_enabled: false,
          igmp_snooping,
          ipv6_interface_type: "none",
          auto_scale_enabled: false,
        };
        const res = await createControllerClient(controller).post(
          `/api/s/${site_id}/rest/networkconf`,
          payload
        );
        const created = classicData(res.data)[0] ?? {};
        return ok({
          controller,
          site_id,
          id: created["_id"],
          name: created["name"],
          vlan: created["vlan"],
          ip_subnet: created["ip_subnet"],
          dhcpd_start: created["dhcpd_start"],
          dhcpd_stop: created["dhcpd_stop"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_rename_network",
    {
      description:
        "Rename an existing UniFi network (label change only — no IP, subnet, or VLAN ID changes). " +
        "Use unifi_list_networks to get the network_id. Safe to run on live networks — only the display name changes.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        network_id: z.string().describe("Network config ID from unifi_list_networks (the 'id' field)"),
        new_name: z.string().describe("New display name for the network"),
      }),
    },
    async ({ controller, site_id, network_id, new_name }) => {
      try {
        await createControllerClient(controller).put(
          `/api/s/${site_id}/rest/networkconf/${network_id}`,
          { name: new_name }
        );
        return ok({ controller, site_id, network_id, new_name, renamed: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
