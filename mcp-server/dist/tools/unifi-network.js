import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { formatError } from "../utils/http.js";
const DISABLED_MSG = "UniFi Network Controller not configured: set UNIFI_CONTROLLER_URL, UNIFI_USERNAME, UNIFI_PASSWORD";
function disabled() {
    return {
        isError: true,
        content: [{ type: "text", text: DISABLED_MSG }],
    };
}
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    return { isError: true, content: [{ type: "text", text: formatError(e) }] };
}
export function registerUnifiNetworkTools(server, enabled) {
    server.registerTool("unifi_get_site_health", {
        description: "Get overall health of a UniFi site: WAN status, number of active clients, alerts, and subsystem states.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID (e.g. 'default')"),
        }),
    }, async ({ site_id }) => {
        if (!enabled)
            return disabled();
        try {
            const res = await createControllerClient().get(`/api/v2/sites/${site_id}/health`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_list_networks", {
        description: "List all networks (VLANs) configured at a UniFi site, including subnet, VLAN ID, and DHCP settings.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
        }),
    }, async ({ site_id }) => {
        if (!enabled)
            return disabled();
        try {
            const res = await createControllerClient().get(`/api/v2/sites/${site_id}/networks`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_create_network", {
        description: "Create a new VLAN/network on a UniFi site.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
            name: z.string().describe("Network display name"),
            vlan: z.number().int().min(1).max(4094).describe("VLAN ID"),
            subnet: z
                .string()
                .describe("Gateway IP with prefix (e.g. 192.168.100.1/24)"),
            dhcp_enabled: z.boolean().default(true).describe("Enable DHCP server for this network"),
            dhcp_start: z
                .string()
                .optional()
                .describe("DHCP pool start address (e.g. 192.168.100.2)"),
            dhcp_stop: z
                .string()
                .optional()
                .describe("DHCP pool end address (e.g. 192.168.100.254)"),
        }),
    }, async ({ site_id, name, vlan, subnet, dhcp_enabled, dhcp_start, dhcp_stop }) => {
        if (!enabled)
            return disabled();
        try {
            const [ip, prefix] = subnet.split("/");
            const prefixLen = parseInt(prefix ?? "24", 10);
            const netmaskBits = ~(~0 << (32 - prefixLen)) >>> 0;
            const parts = [24, 16, 8, 0].map((s) => (netmaskBits >> s) & 0xff);
            const netmask = parts.join(".");
            const body = {
                name,
                networktype: "vlan",
                vlan,
                ip_subnet: subnet,
                ipv4_address: ip,
                ipv4_netmask: netmask,
                dhcpd_enabled: dhcp_enabled,
            };
            if (dhcp_start)
                body["dhcpd_start"] = dhcp_start;
            if (dhcp_stop)
                body["dhcpd_stop"] = dhcp_stop;
            const res = await createControllerClient().post(`/api/v2/sites/${site_id}/networks`, body);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_list_firewall_rules", {
        description: "List all firewall rules configured on a UniFi site.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
        }),
    }, async ({ site_id }) => {
        if (!enabled)
            return disabled();
        try {
            const res = await createControllerClient().get(`/api/v2/sites/${site_id}/firewallrules`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_create_firewall_rule", {
        description: "Create a new firewall rule on a UniFi site.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
            name: z.string().describe("Rule name"),
            action: z.enum(["accept", "drop", "reject"]).describe("Rule action"),
            direction: z
                .enum(["in", "out", "local"])
                .describe("Traffic direction relative to the interface"),
            protocol: z
                .enum(["tcp", "udp", "tcp_udp", "all"])
                .default("tcp_udp")
                .describe("Protocol to match"),
            enabled: z.boolean().default(true),
            src_address: z.string().optional().describe("Source IP or CIDR (omit for any)"),
            dst_address: z.string().optional().describe("Destination IP or CIDR (omit for any)"),
            dst_port: z.string().optional().describe("Destination port or range (e.g. '22' or '8000:8080')"),
        }),
    }, async ({ site_id, name, action, direction, protocol, enabled: ruleEnabled, src_address, dst_address, dst_port }) => {
        if (!enabled)
            return disabled();
        try {
            const body = {
                name,
                action,
                direction,
                protocol,
                enabled: ruleEnabled,
            };
            if (src_address)
                body["src_address"] = src_address;
            if (dst_address)
                body["dst_address"] = dst_address;
            if (dst_port)
                body["dst_port"] = dst_port;
            const res = await createControllerClient().post(`/api/v2/sites/${site_id}/firewallrules`, body);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_list_controller_devices", {
        description: "List all managed network devices at a UniFi site (access points, switches, gateways) with status, IP, model, and uptime.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
        }),
    }, async ({ site_id }) => {
        if (!enabled)
            return disabled();
        try {
            const res = await createControllerClient().get(`/api/v2/sites/${site_id}/devices`);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_restart_device", {
        description: "Restart (reboot) a UniFi network device.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
            device_id: z.string().describe("The device ID"),
        }),
    }, async ({ site_id, device_id }) => {
        if (!enabled)
            return disabled();
        try {
            const res = await createControllerClient().post(`/api/v2/sites/${site_id}/devices/${device_id}/restart`, { reboot_type: "soft" });
            return ok(res.data ?? { success: true, device_id });
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_list_clients", {
        description: "List clients connected to a UniFi site, including hostname, IP, MAC, VLAN, and signal strength.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
            active_only: z
                .boolean()
                .default(true)
                .describe("When true, return only currently connected clients"),
        }),
    }, async ({ site_id, active_only }) => {
        if (!enabled)
            return disabled();
        try {
            const url = active_only
                ? `/api/v2/sites/${site_id}/clients?active=true`
                : `/api/v2/sites/${site_id}/clients`;
            const res = await createControllerClient().get(url);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("unifi_block_client", {
        description: "Block or unblock a client by MAC address on a UniFi site.",
        inputSchema: z.object({
            site_id: z.string().describe("The UniFi site ID"),
            mac: z
                .string()
                .describe("Client MAC address (e.g. aa:bb:cc:dd:ee:ff)"),
            block: z.boolean().describe("true to block the client, false to unblock"),
        }),
    }, async ({ site_id, mac, block }) => {
        if (!enabled)
            return disabled();
        try {
            const action = block ? "block" : "unblock";
            const res = await createControllerClient().post(`/api/v2/sites/${site_id}/clients/${mac}/${action}`, { mac });
            return ok(res.data ?? { success: true, mac, blocked: block });
        }
        catch (e) {
            return err(e);
        }
    });
}
//# sourceMappingURL=unifi-network.js.map