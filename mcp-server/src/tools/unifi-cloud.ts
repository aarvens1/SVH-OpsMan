import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { unifiCloudClient, formatError } from "../utils/http.js";

const DISABLED_MSG = "UniFi Cloud service not configured: set UNIFI_API_KEY";

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

export function registerUnifiCloudTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "unifi_list_sites",
    {
      description:
        "List all UniFi sites across all accounts visible to this API key, including UniFi Fabric sites.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!enabled) return disabled();
      try {
        const res = await unifiCloudClient().get("/api/v2/sites");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_get_site",
    {
      description: "Get details of a specific UniFi site including location, type, and device counts.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      if (!enabled) return disabled();
      try {
        const res = await unifiCloudClient().get(`/api/v2/sites/${site_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_site_devices",
    {
      description:
        "List all devices at a UniFi site (access points, switches, gateways, Fabric devices) with their model, MAC, and status.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID"),
      }),
    },
    async ({ site_id }) => {
      if (!enabled) return disabled();
      try {
        const res = await unifiCloudClient().get(`/api/v2/sites/${site_id}/devices`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_get_site_device",
    {
      description:
        "Get detailed information about a specific UniFi device: model, firmware version, uptime, IP address, and connection status.",
      inputSchema: z.object({
        site_id: z.string().describe("The UniFi site ID"),
        device_id: z.string().describe("The device ID"),
      }),
    },
    async ({ site_id, device_id }) => {
      if (!enabled) return disabled();
      try {
        const res = await unifiCloudClient().get(`/api/v2/sites/${site_id}/devices/${device_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
