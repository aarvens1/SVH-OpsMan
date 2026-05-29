import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUnifiNetworkTools } from "../../tools/unifi-network.js";
import { createControllerClient } from "../../auth/unifi.js";

const mockUnifiClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
};

vi.mock("../../auth/unifi.js", () => ({
    createControllerClient: vi.fn(() => mockUnifiClient),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

describe("UniFi Network Tools", () => {
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
    registerUnifiNetworkTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerUnifiNetworkTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("unifi_get_site_health", () => {
    const toolName = "unifi_get_site_health";

    it("should get site health on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      const mockResponse = {
        data: {
          data: [{ subsystem: "www", status: "ok" }],
        },
      };
      vi.mocked(mockUnifiClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ controller: "svh", site_id: "default" });

      expect(createControllerClient).toHaveBeenCalledWith("svh");
      expect(mockUnifiClient.get).toHaveBeenCalledWith("/api/s/default/stat/health");
      expect(result).toEqual({
        ok: true,
        data: {
            controller: "svh",
            site_id: "default",
            subsystems: [{ subsystem: "www", status: "ok" }],
        },
      });
    });

    it("should handle errors when getting site health", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("API Error");
      vi.mocked(mockUnifiClient.get).mockRejectedValue(error);

      const result = await handler({ controller: "svh", site_id: "default" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("unifi_list_networks", () => {
    const toolName = "unifi_list_networks";

    it("should list networks on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: {
          data: [{ _id: "net1", name: "LAN" }],
        },
      };
      vi.mocked(mockUnifiClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ controller: "svh", site_id: "default" });

      expect(mockUnifiClient.get).toHaveBeenCalledWith("/api/s/default/rest/networkconf");
      expect(result).toEqual({
        ok: true,
        data: {
            controller: "svh",
            count: 1,
            networks: [{ id: "net1", name: "LAN" }],
        },
      });
    });

    it("should handle errors when listing networks", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        const error = new Error("API Error");
        vi.mocked(mockUnifiClient.get).mockRejectedValue(error);
  
        const result = await handler({ controller: "svh", site_id: "default" });
  
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: "API Error" });
    });
  });
});