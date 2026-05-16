import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { unifiCloudClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

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
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (raw["sites"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const sites = items.map((s: A) => ({
          id: s["id"] ?? s["siteId"],
          name: s["name"] ?? s["displayName"],
          desc: s["desc"] ?? s["description"],
          hostId: s["hostId"] ?? s["controllerId"],
          state: s["state"],
          timezone: s["timezone"],
          countryCode: s["countryCode"],
        }));
        return ok({ count: sites.length, sites });
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
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (raw["hosts"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const hosts = items.map((h: A) => ({
          id: h["id"] ?? h["hostId"],
          name: h["name"] ?? h["displayName"],
          hardwareId: h["hardwareId"],
          type: h["type"],
          ipAddress: h["ipAddress"] ?? (h["reportedState"] as A | undefined)?.["ip"],
          version: h["version"] ?? (h["reportedState"] as A | undefined)?.["version"],
          state: h["state"],
          isBlocked: h["isBlocked"],
        }));
        return ok({ count: hosts.length, hosts });
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
        const raw = res.data as A;
        const items = ((raw["data"] as A[] | undefined) ?? (raw["devices"] as A[] | undefined) ?? (Array.isArray(raw) ? raw as A[] : []));
        const devices = items.map((d: A) => ({
          id: d["id"] ?? d["deviceId"],
          name: d["name"] ?? d["displayName"],
          mac: d["mac"] ?? d["macAddress"],
          model: d["model"] ?? d["productLine"],
          type: d["type"],
          ip: d["ip"] ?? d["ipAddress"],
          firmwareVersion: d["firmwareVersion"] ?? d["version"],
          state: d["state"],
          hostId: d["hostId"],
          siteId: d["siteId"],
          isAdopted: d["isAdopted"],
        }));
        return ok({ count: devices.length, devices });
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
        const raw = res.data as A;
        const d = (raw["data"] as A | undefined) ?? raw;
        return ok({
          id: d["id"] ?? d["deviceId"],
          name: d["name"] ?? d["displayName"],
          mac: d["mac"] ?? d["macAddress"],
          model: d["model"] ?? d["productLine"],
          type: d["type"],
          ip: d["ip"] ?? d["ipAddress"],
          firmwareVersion: d["firmwareVersion"] ?? d["version"],
          uptime: d["uptime"],
          state: d["state"],
          hostId: d["hostId"],
          siteId: d["siteId"],
          isAdopted: d["isAdopted"],
          lastSeen: d["lastSeen"],
          features: d["features"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );
}
