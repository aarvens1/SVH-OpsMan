import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIntuneTools } from "../../tools/intune.js";
import { graphClient, GRAPH_SCOPE } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerIntuneTools", () => {
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
    registerIntuneTools(server, true);
  });

  describe("intune_list_devices", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({
        data: { value: [{ id: "dev1", deviceName: "test-device" }] },
      });

      const result = await handlers.get("intune_list_devices")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.devices[0]).toHaveProperty("deviceName", "test-device");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));
      const result = await handlers.get("intune_list_devices")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("intune_get_device", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { id: "dev1", deviceName: "test-device" } });

      const result = await handlers.get("intune_get_device")!({ device_id: "dev1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("deviceName", "test-device");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockRejectedValueOnce(new Error("network error"));
        const result = await handlers.get("intune_get_device")!({ device_id: "dev1" });
        expect((result as any).isError).toBe(true);
    });
  });
  
  describe("intune_get_device_compliance", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "policy1", displayName: "Test Policy", state: "compliant" }] } });

      const result = await handlers.get("intune_get_device_compliance")!({ device_id: "dev1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.policyStates[0]).toHaveProperty("state", "compliant");
    });
  });

  describe("intune_list_compliance_policies", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "policy1", displayName: "Test Policy" }] } });

      const result = await handlers.get("intune_list_compliance_policies")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.policies[0]).toHaveProperty("displayName", "Test Policy");
    });
  });

  describe("intune_list_device_configurations", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "cfg1", displayName: "WiFi Profile" }] } });

      const result = await handlers.get("intune_list_device_configurations")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.configurations[0]).toHaveProperty("displayName", "WiFi Profile");
    });
  });

  describe("intune_list_apps", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "app1", displayName: "Company Portal" }] } });

      const result = await handlers.get("intune_list_apps")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.apps[0]).toHaveProperty("displayName", "Company Portal");
    });
  });
});
