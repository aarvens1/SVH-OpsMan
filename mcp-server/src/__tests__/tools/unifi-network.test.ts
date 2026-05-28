import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiNetworkTools } from "../../tools/unifi-network.js";
import { createControllerClient } from "../../auth/unifi.js";

const mockControllerClient = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
};

vi.mock("../../auth/unifi.js", () => ({
  createControllerClient: vi.fn().mockReturnValue(mockControllerClient),
}));

describe("registerUnifiNetworkTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });
    registerUnifiNetworkTools(server, true);
  });

  const defaultParams = { controller: "svh", site_id: "default" };

  describe("unifi_get_site_health", () => {
    it("returns health on success", async () => {
      mockControllerClient.get.mockResolvedValueOnce({ data: { data: [{ subsystem: "www" }] } });
      const result = await handlers.get("unifi_get_site_health")!(defaultParams);
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockControllerClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("unifi_get_site_health")!(defaultParams);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_list_networks", () => {
    it("returns networks on success", async () => {
        mockControllerClient.get.mockResolvedValueOnce({ data: { data: [{ id: 'net1' }] } });
        const result = await handlers.get("unifi_list_networks")!(defaultParams);
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockControllerClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("unifi_list_networks")!(defaultParams);
        expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_list_firewall_rules", () => {
    it("returns rules on success", async () => {
        mockControllerClient.get.mockResolvedValueOnce({ data: { data: [{ id: 'rule1' }] } });
        const result = await handlers.get("unifi_list_firewall_rules")!(defaultParams);
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockControllerClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("unifi_list_firewall_rules")!(defaultParams);
        expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_list_controller_devices", () => {
    it("returns devices on success", async () => {
        mockControllerClient.get.mockResolvedValueOnce({ data: { data: [{ id: 'dev1' }] } });
        const result = await handlers.get("unifi_list_controller_devices")!(defaultParams);
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockControllerClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("unifi_list_controller_devices")!(defaultParams);
        expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_restart_device", () => {
    it("restarts device on success", async () => {
        mockControllerClient.post.mockResolvedValueOnce({ data: {} });
        const result = await handlers.get("unifi_restart_device")!({ ...defaultParams, device_mac: 'aa:bb:cc:dd:ee:ff' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockControllerClient.post.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("unifi_restart_device")!({ ...defaultParams, device_mac: 'aa:bb:cc:dd:ee:ff' });
        expect((result as any).isError).toBe(true);
    });
  });

});
