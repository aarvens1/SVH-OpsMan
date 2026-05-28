import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerUnifiCloudTools } from "../../tools/unifi-cloud.js";
import { unifiCloudClient } from "../../utils/http.js";

const mockUnifiClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  unifiCloudClient: vi.fn().mockReturnValue(mockUnifiClient),
}));

describe("registerUnifiCloudTools", () => {
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
    registerUnifiCloudTools(server, true);
  });

  describe("unifi_list_sites", () => {
    it("returns sites on success", async () => {
      mockUnifiClient.get.mockResolvedValueOnce({ data: { data: [{ id: "site1" }] } });
      const result = await handlers.get("unifi_list_sites")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockUnifiClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("unifi_list_sites")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_list_hosts", () => {
    it("returns hosts on success", async () => {
      mockUnifiClient.get.mockResolvedValueOnce({ data: { data: [{ id: "host1" }] } });
      const result = await handlers.get("unifi_list_hosts")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockUnifiClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("unifi_list_hosts")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_list_site_devices", () => {
    it("returns devices on success", async () => {
      mockUnifiClient.get.mockResolvedValueOnce({ data: { data: [{ hostId: "host1", devices: [{id: "dev1"}] }] } });
      const result = await handlers.get("unifi_list_site_devices")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockUnifiClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("unifi_list_site_devices")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("unifi_get_device", () => {
    it("returns a device on success", async () => {
      mockUnifiClient.get.mockResolvedValueOnce({ data: { data: { id: "dev1" } } });
      const result = await handlers.get("unifi_get_device")!({ device_id: "dev1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockUnifiClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("unifi_get_device")!({ device_id: "dev1" });
      expect((result as any).isError).toBe(true);
    });
  });
});
