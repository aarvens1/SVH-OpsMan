import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUnifiCloudTools } from "../../tools/unifi-cloud";

// Mock unifiCloudClient to avoid hoisting issues with vi.mock
const mockUnifiCloudClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  unifiCloudClient: vi.fn(() => mockUnifiCloudClient),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

// These imports must be after mocks
import { unifiCloudClient } from "../../utils/http.js";

describe("UnifiCloud Tools", () => {
  let server: McpServer;
  let registeredTools: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();
    server = {
      registerTool: (name: string, schema: any, handler: any) => {
        registeredTools.set(name, { name, schema, handler });
      },
    } as any;
    registerUnifiCloudTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerUnifiCloudTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("unifi_list_sites", () => {
    const toolName = "unifi_list_sites";

    it("should list sites on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      const mockSitesData = {
        data: {
          data: [
            {
              id: "site-id-1",
              name: "Site 1",
              desc: "Description for Site 1",
              hostId: "host-id-1",
              state: "active",
              timezone: "UTC",
              countryCode: "US",
            },
          ],
        },
      };
      vi.mocked(mockUnifiCloudClient.get).mockResolvedValue(mockSitesData);

      const result = await handler({});

      expect(unifiCloudClient).toHaveBeenCalled();
      expect(mockUnifiCloudClient.get).toHaveBeenCalledWith("/ea/sites");
      expect(result).toEqual({
        ok: true,
        data: {
          count: 1,
          sites: [
            {
              id: "site-id-1",
              name: "Site 1",
              desc: "Description for Site 1",
              hostId: "host-id-1",
              state: "active",
              timezone: "UTC",
              countryCode: "US",
            },
          ],
        },
      });
    });

    it("should handle errors when listing sites", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("API Error");
      vi.mocked(mockUnifiCloudClient.get).mockRejectedValue(error);

      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("unifi_list_hosts", () => {
    const toolName = "unifi_list_hosts";

    it("should list hosts on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      const mockHostsData = {
        data: {
          data: [
            {
              id: "host-id-1",
              name: "Host 1",
              hardwareId: "hw-id-1",
              type: "console",
              ipAddress: "192.168.1.1",
              version: "1.2.3",
              state: "online",
              isBlocked: false,
            },
          ],
        },
      };
      vi.mocked(mockUnifiCloudClient.get).mockResolvedValue(mockHostsData);

      const result = await handler({});

      expect(unifiCloudClient).toHaveBeenCalled();
      expect(mockUnifiCloudClient.get).toHaveBeenCalledWith("/v1/hosts");
      expect(result).toEqual({
        ok: true,
        data: {
          count: 1,
          hosts: [
            {
              id: "host-id-1",
              name: "Host 1",
              hardwareId: "hw-id-1",
              type: "console",
              ipAddress: "192.168.1.1",
              version: "1.2.3",
              state: "online",
              isBlocked: false,
            },
          ],
        },
      });
    });

    it("should handle errors when listing hosts", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Failed to list hosts");
      vi.mocked(mockUnifiCloudClient.get).mockRejectedValue(error);

      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Failed to list hosts" });
    });
  });

  describe("unifi_list_site_devices", () => {
    const toolName = "unifi_list_site_devices";

    const mockDevicesData = {
      data: {
        data: [
          {
            hostId: "host-id-1",
            hostName: "Host 1",
            devices: [
              {
                id: "device-id-1",
                name: "AP-1",
                mac: "00:11:22:33:44:55",
                model: "UAP-AC-LITE",
                ip: "192.168.1.10",
                version: "6.0.0",
                firmwareStatus: "up-to-date",
                status: "online",
                isConsole: false,
                startupTime: "2023-01-01T00:00:00Z",
              },
            ],
          },
          {
            hostId: "host-id-2",
            hostName: "Host 2",
            devices: [
              {
                id: "device-id-2",
                name: "Switch-1",
                mac: "AA:BB:CC:DD:EE:FF",
                model: "USW-24-POE",
                ip: "192.168.2.10",
                version: "6.1.0",
                firmwareStatus: "up-to-date",
                status: "online",
                isConsole: false,
                startupTime: "2023-02-01T00:00:00Z",
              },
            ],
          },
        ],
      },
    };

    it("should list all devices for all hosts on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(mockUnifiCloudClient.get).mockResolvedValue(mockDevicesData);

      const result = await handler({});

      expect(unifiCloudClient).toHaveBeenCalled();
      expect(mockUnifiCloudClient.get).toHaveBeenCalledWith("/ea/devices");
      expect(result.ok).toBe(true);
      expect(result.data.hosts).toBe(2);
      expect(result.data.totalDevices).toBe(2);
      expect(result.data.data[0].hostId).toBe("host-id-1");
      expect(result.data.data[1].devices[0].name).toBe("Switch-1");
    });
    
    it("should filter devices by host_id on happy path", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(mockUnifiCloudClient.get).mockResolvedValue(mockDevicesData);
  
        const result = await handler({ host_id: "host-id-2" });
  
        expect(mockUnifiCloudClient.get).toHaveBeenCalledWith("/ea/devices");
        expect(result.ok).toBe(true);
        expect(result.data.hosts).toBe(1);
        expect(result.data.totalDevices).toBe(1);
        expect(result.data.data[0].hostId).toBe("host-id-2");
        expect(result.data.data[0].devices[0].name).toBe("Switch-1");
      });

    it("should handle errors when listing devices", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Device list failed");
      vi.mocked(mockUnifiCloudClient.get).mockRejectedValue(error);

      const result = await handler({ host_id: "host-id-1" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Device list failed" });
    });
  });

  describe("unifi_get_device", () => {
    const toolName = "unifi_get_device";

    it("should get device details on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      const mockDeviceData = {
        data: {
            id: "device-id-1",
            name: "AP-1",
            mac: "00:11:22:33:44:55",
            model: "UAP-AC-LITE",
            type: "uap",
            ip: "192.168.1.10",
            firmwareVersion: "6.0.0",
            uptime: 3600,
            state: "online",
            hostId: "host-id-1",
            siteId: "site-id-1",
            isAdopted: true,
            lastSeen: "2023-01-01T01:00:00Z",
            features: ["feature1", "feature2"],
        },
      };
      vi.mocked(mockUnifiCloudClient.get).mockResolvedValue(mockDeviceData);

      const result = await handler({ device_id: "device-id-1" });

      expect(unifiCloudClient).toHaveBeenCalled();
      expect(mockUnifiCloudClient.get).toHaveBeenCalledWith("/v1/devices/device-id-1");
      expect(result).toEqual({
        ok: true,
        data: {
            id: "device-id-1",
            name: "AP-1",
            mac: "00:11:22:33:44:55",
            model: "UAP-AC-LITE",
            type: "uap",
            ip: "192.168.1.10",
            firmwareVersion: "6.0.0",
            uptime: 3600,
            state: "online",
            hostId: "host-id-1",
            siteId: "site-id-1",
            isAdopted: true,
            lastSeen: "2023-01-01T01:00:00Z",
            features: ["feature1", "feature2"],
        },
      });
    });

    it("should handle errors when getting a device", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Device not found");
      vi.mocked(mockUnifiCloudClient.get).mockRejectedValue(error);

      const result = await handler({ device_id: "device-id-1" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Device not found" });
    });
  });
});
