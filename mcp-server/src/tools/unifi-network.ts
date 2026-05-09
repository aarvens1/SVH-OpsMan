import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { formatError } from "../utils/http.js";

const DISABLED_MSG =
  "UniFi Network Controller not configured: set UNIFI_CONTROLLER_URL, UNIFI_USERNAME, UNIFI_PASSWORD";

function disabled() {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: DISABLED_MSG }],
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerUnifiNetworkTools(server: McpServer, enabled: boolean): void {
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
      if (!enabled) return disabled();
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/health`);
        return ok(res.data);
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
      if (!enabled) return disabled();
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/networks`);
        return ok(res.data);
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
      if (!enabled) return disabled();
      try {
        const res = await createControllerClient().get(
          `/api/v2/sites/${site_id}/firewallrules`
        );
        return ok(res.data);
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
      if (!enabled) return disabled();
      try {
        const res = await createControllerClient().get(`/api/v2/sites/${site_id}/devices`);
        return ok(res.data);
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
      if (!enabled) return disabled();
      try {
        const url = active_only
          ? `/api/v2/sites/${site_id}/clients?active=true`
          : `/api/v2/sites/${site_id}/clients`;
        const res = await createControllerClient().get(url);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
