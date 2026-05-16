import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

export function registerUnifiNetworkTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_get_site_health",
    {
      description:
        "Get overall health of a UniFi site: WAN status, number of active clients, alerts, and subsystem states.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID (e.g. 'default')"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/health`);
        const raw = res.data as A;
        // Health endpoint returns an array of subsystem health objects
        const subsystems = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const shaped = subsystems.map((h: A) => ({
          subsystem: h["subsystem"],
          status: h["status"],
          numUser: h["num_user"] ?? h["numUser"],
          numGuest: h["num_guest"] ?? h["numGuest"],
          numAp: h["num_ap"] ?? h["numAp"],
          numSta: h["num_sta"] ?? h["numSta"],
          txBytesR: h["tx_bytes-r"] ?? h["txBytesR"],
          rxBytesR: h["rx_bytes-r"] ?? h["rxBytesR"],
          wan_ip: h["wan_ip"] ?? h["wanIp"],
          gw_mac: h["gw_mac"] ?? h["gwMac"],
        }));
        return ok({ site_id, subsystems: shaped });
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
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/networks`);
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const networks = items.map((n: A) => ({
          id: n["id"] ?? n["_id"],
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
          ipv6_enabled: n["ipv6_enabled"],
          is_nat: n["is_nat"],
        }));
        return ok({ count: networks.length, networks });
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
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(
          `/api/v2/sites/${site_id}/firewallrules`
        );
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const rules = items.map((r: A) => ({
          id: r["id"] ?? r["_id"],
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
        return ok({ count: rules.length, rules });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_controller_devices",
    {
      description:
        "List all managed network devices at a UniFi site (access points, switches, gateways) with status, IP, model, and uptime.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/devices`);
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const devices = items.map((d: A) => ({
          id: d["device_id"] ?? d["_id"] ?? d["id"],
          name: d["name"],
          mac: d["mac"],
          model: d["model"],
          type: d["type"],
          ip: d["ip"],
          state: d["state"],
          uptime: d["uptime"],
          last_seen: d["last_seen"],
          version: d["version"],
          adopted: d["adopted"],
          upgradable: d["upgradable"],
          upgrade_to_firmware: d["upgrade_to_firmware"],
        }));
        return ok({ count: devices.length, devices });
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
        site_id: z.string().describe("The UniFi site ID"),
        active_only: z
          .boolean()
          .default(true)
          .describe("When true, return only currently connected clients"),
      }),
    },
    async ({ site_id, active_only }) => {
      try {
        const url = active_only
          ? `/api/v2/sites/${site_id}/clients?active=true`
          : `/api/v2/sites/${site_id}/clients`;
        const res = await createControllerClient().get(url);
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const clients = items.map((c: A) => ({
          id: c["id"] ?? c["_id"],
          hostname: c["hostname"] ?? c["name"],
          ip: c["ip"],
          mac: c["mac"],
          vlan: c["vlan"],
          network: c["network"],
          ap_mac: c["ap_mac"],
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
        return ok({ count: clients.length, clients });
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
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/wlans`);
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const wlans = items.map((w: A) => ({
          id: w["id"] ?? w["_id"],
          name: w["name"],
          enabled: w["enabled"],
          security: w["security"],
          wpa_mode: w["wpa_mode"],
          wpa_enc: w["wpa_enc"],
          vlan: w["vlan"],
          vlan_enabled: w["vlan_enabled"],
          usergroup_id: w["usergroup_id"],
          networkconf_id: w["networkconf_id"],
          band_steering: w["band_steering"],
          is_guest: w["is_guest"],
          hide_ssid: w["hide_ssid"],
          pmf_mode: w["pmf_mode"],
          minrate_setting_enabled: w["minrate_setting_enabled"],
        }));
        return ok({ count: wlans.length, wlans });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_port_profiles",
    {
      description:
        "List switch port profiles (port configurations) defined at a UniFi site, " +
        "including native VLAN, tagged VLANs, PoE mode, and voice VLAN settings.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const res = await createControllerClient().get(
          `/api/v2/sites/${site_id}/portprofiles`
        );
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const profiles = items.map((p: A) => ({
          id: p["id"] ?? p["_id"],
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
        return ok({ count: profiles.length, portProfiles: profiles });
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
        site_id: z.string().describe("The UniFi site ID"),
        device_mac: z.string().describe("MAC address of the switch (e.g. aa:bb:cc:dd:ee:ff)"),
      }),
    },
    async ({ site_id, device_mac }) => {
      try {
        const res = await createControllerClient().get(
          `/api/v2/sites/${site_id}/devices/${device_mac.toLowerCase().replace(/:/g, "")}`
        );
        const device = res.data as A;
        const ports = device?.["port_table"] ?? device?.["portTable"] ?? [];
        return ok({ device_name: device?.["name"], ports });
      } catch (e) {
        return err(e);
      }
    }
  );
}
