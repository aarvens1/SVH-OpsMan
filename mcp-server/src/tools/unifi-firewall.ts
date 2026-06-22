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

export function registerUnifiFirewallTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_list_firewall_groups",
    {
      description:
        "List firewall groups (named sets of IPs, networks, or ports) used to build firewall rules. " +
        "Groups are referenced by ID in firewall rule source/destination fields.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
      }),
    },
    async ({ controller, site_id }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/rest/firewallgroup`);
        const groups = classicData(res.data).map((g: A) => ({
          id: g["_id"] ?? g["id"],
          name: g["name"],
          group_type: g["group_type"],
          group_members: (g["group_members"] as string[] | undefined) ?? [],
        }));
        return ok({ controller, count: groups.length, groups });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_firewall_group",
    {
      description:
        "Create a named firewall group (IP set, network set, or port set) for use in firewall rules. " +
        "group_type: 'address-group' for IPs/CIDRs, 'port-group' for port numbers/ranges, 'ipv6-address-group' for IPv6.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("Group name (e.g. 'IoT-Devices', 'Blocked-IPs')"),
        group_type: z.enum(["address-group", "port-group", "ipv6-address-group"]).describe("Type of members in this group"),
        group_members: z.array(z.string()).describe("IPs, CIDRs, or port strings to include in the group"),
      }),
    },
    async ({ controller, site_id, name, group_type, group_members }) => {
      try {
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/firewallgroup`, {
          name,
          group_type,
          group_members,
        });
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], name, group_type, member_count: group_members.length });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_update_firewall_group",
    {
      description:
        "Replace the member list of an existing firewall group (IPs, CIDRs, or ports). " +
        "This is a full replacement — include all desired members in the new list. " +
        "Use unifi_list_firewall_groups to get group_id and current members.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        group_id: z.string().describe("Firewall group ID from unifi_list_firewall_groups"),
        group_members: z.array(z.string()).describe("Complete new member list (replaces existing members)"),
      }),
    },
    async ({ controller, site_id, group_id, group_members }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/firewallgroup/${group_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`Firewall group ${group_id} not found`));
        const updated = { ...existing, group_members };
        await client.put(`/api/s/${site_id}/rest/firewallgroup/${group_id}`, updated);
        return ok({ controller, site_id, group_id, member_count: group_members.length, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_firewall_group",
    {
      description:
        "Delete a firewall group. Check that no active firewall rules reference this group before deleting. " +
        "Use unifi_list_firewall_rules to verify.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        group_id: z.string().describe("Firewall group ID from unifi_list_firewall_groups"),
      }),
    },
    async ({ controller, site_id, group_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/firewallgroup/${group_id}`);
        return ok({ controller, site_id, group_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_toggle_firewall_rule",
    {
      description:
        "Enable or disable an existing firewall rule without deleting it. " +
        "Use unifi_list_firewall_rules to get rule_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        rule_id: z.string().describe("Firewall rule ID from unifi_list_firewall_rules"),
        enabled: z.boolean().describe("true to enable the rule, false to disable"),
      }),
    },
    async ({ controller, site_id, rule_id, enabled }) => {
      try {
        const client = createControllerClient(controller);
        const res = await client.get(`/api/s/${site_id}/rest/firewallrule/${rule_id}`);
        const existing = classicData(res.data)[0];
        if (!existing) return err(new Error(`Firewall rule ${rule_id} not found`));
        const updated = { ...existing, enabled };
        await client.put(`/api/s/${site_id}/rest/firewallrule/${rule_id}`, updated);
        return ok({ controller, site_id, rule_id, enabled, success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_create_firewall_rule",
    {
      description:
        "Create a new firewall rule on a UniFi site. Use unifi_list_firewall_groups for group IDs. " +
        "Ruleset: 'WAN_IN' (inbound from WAN), 'WAN_OUT', 'LAN_IN' (inter-VLAN from LAN), 'LAN_OUT', 'GUEST_IN', 'GUEST_OUT'.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        name: z.string().describe("Rule name (e.g. 'Block-IoT-Egress')"),
        action: z.enum(["accept", "drop", "reject"]).describe("Rule action"),
        ruleset: z.enum([
          "WAN_IN", "WAN_OUT", "WAN_LOCAL",
          "LAN_IN", "LAN_OUT", "LAN_LOCAL",
          "GUEST_IN", "GUEST_OUT", "GUEST_LOCAL",
        ]).describe("Ruleset (chain) this rule belongs to"),
        rule_index: z.number().int().default(2000).describe("Rule order — lower numbers run first"),
        enabled: z.boolean().default(true).describe("Whether the rule is active"),
        protocol: z.enum(["all", "tcp", "udp", "tcp_udp", "icmp"]).default("all").describe("Protocol to match"),
        src_address: z.string().optional().describe("Source IP or CIDR to match"),
        dst_address: z.string().optional().describe("Destination IP or CIDR to match"),
        src_firewallgroup_ids: z.array(z.string()).optional().describe("Source firewall group IDs"),
        dst_firewallgroup_ids: z.array(z.string()).optional().describe("Destination firewall group IDs"),
        src_networkconf_id: z.string().optional().describe("Source network config ID"),
        dst_networkconf_id: z.string().optional().describe("Destination network config ID"),
      }),
    },
    async ({ controller, site_id, name, action, ruleset, rule_index, enabled, protocol,
             src_address, dst_address, src_firewallgroup_ids, dst_firewallgroup_ids,
             src_networkconf_id, dst_networkconf_id }) => {
      try {
        const payload: A = {
          name,
          action,
          ruleset,
          rule_index,
          enabled,
          protocol,
          src_address: src_address ?? "",
          dst_address: dst_address ?? "",
          src_mac_address: "",
        };
        if (src_firewallgroup_ids) payload["src_firewallgroup_ids"] = src_firewallgroup_ids;
        if (dst_firewallgroup_ids) payload["dst_firewallgroup_ids"] = dst_firewallgroup_ids;
        if (src_networkconf_id) payload["src_networkconf_id"] = src_networkconf_id;
        if (dst_networkconf_id) payload["dst_networkconf_id"] = dst_networkconf_id;
        const res = await createControllerClient(controller).post(`/api/s/${site_id}/rest/firewallrule`, payload);
        const created = classicData(res.data)[0] ?? {};
        return ok({ controller, site_id, id: created["_id"], name, action, ruleset, rule_index });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_delete_firewall_rule",
    {
      description:
        "Permanently delete a firewall rule. Use unifi_toggle_firewall_rule to disable without deleting. " +
        "Use unifi_list_firewall_rules to get rule_id.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        rule_id: z.string().describe("Firewall rule ID from unifi_list_firewall_rules"),
      }),
    },
    async ({ controller, site_id, rule_id }) => {
      try {
        await createControllerClient(controller).delete(`/api/s/${site_id}/rest/firewallrule/${rule_id}`);
        return ok({ controller, site_id, rule_id, deleted: true });
      } catch (e) {
        return err(e);
      }
    }
  );
}
