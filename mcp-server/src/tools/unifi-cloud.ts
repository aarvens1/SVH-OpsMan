import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { unifiCloudClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

export function registerUnifiCloudTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_list_sites",
    {
      description:
        "List all UniFi sites across all accounts visible to this API key, including UniFi Fabric sites.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const res = await unifiCloudClient().get("/v1/sites");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_hosts",
    {
      description:
        "List all UniFi hosts (consoles/controllers) associated with this account. Each host runs the UniFi Network application and may manage one or more sites.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const res = await unifiCloudClient().get("/v1/hosts");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_list_devices",
    {
      description:
        "List all UniFi devices (access points, switches, gateways) across all managed sites. Optionally filter by host ID or site ID.",
      inputSchema: z.object({
        host_id: z.string().optional().describe("Filter to devices on this host/console"),
        site_id: z.string().optional().describe("Filter to devices at this site"),
      }),
    },
    async ({ host_id, site_id }) => {
      try {
        const params = new URLSearchParams();
        if (host_id) params.set("hostId", host_id);
        if (site_id) params.set("siteId", site_id);
        const query = params.toString() ? `?${params}` : "";
        const res = await unifiCloudClient().get(`/v1/devices${query}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_get_device",
    {
      description:
        "Get detailed information about a specific UniFi device: model, firmware version, uptime, IP address, and connection status.",
      inputSchema: z.object({
        device_id: z.string().describe("The device ID"),
      }),
    },
    async ({ device_id }) => {
      try {
        const res = await unifiCloudClient().get(`/v1/devices/${device_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
