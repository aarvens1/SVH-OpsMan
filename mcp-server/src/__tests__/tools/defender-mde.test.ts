import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDefenderMdeTools, resetCacheForTesting } from "../../tools/defender-mde.js";

const mockMdeClient = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("../../auth/mde.js", () => ({
  getMdeToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  mdeClient: vi.fn().mockReturnValue(mockMdeClient),
}));

describe("registerDefenderMdeTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCacheForTesting();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    registerDefenderMdeTools(server, true);
  });

  describe("mde_list_devices", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({
        data: { value: [{ id: "dev1", computerDnsName: "host.example.com" }] },
      });

      const result = await handlers.get("mde_list_devices")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.devices[0]).toHaveProperty("computerDnsName", "host.example.com");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_list_devices")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mde_get_device", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({ data: { id: "dev1", computerDnsName: "host.example.com" } });

      const result = await handlers.get("mde_get_device")!({ machine_id: "dev1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("computerDnsName", "host.example.com");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_get_device")!({ machine_id: "dev1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mde_get_device_vulnerabilities", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({ data: { value: [{ id: "CVE-2021-1234", severity: "High" }] } });

      const result = await handlers.get("mde_get_device_vulnerabilities")!({ machine_id: "dev1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.vulnerabilities[0]).toHaveProperty("severity", "High");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_get_device_vulnerabilities")!({ machine_id: "dev1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mde_list_alerts", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({
        data: { value: [{ id: "alert1", title: "Suspicious activity" }] },
      });

      const result = await handlers.get("mde_list_alerts")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.alerts[0]).toHaveProperty("title", "Suspicious activity");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_list_alerts")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mde_list_indicators", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({
        data: { value: [{ id: "ind1", indicatorValue: "1.2.3.4" }] },
      });

      const result = await handlers.get("mde_list_indicators")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.indicators[0]).toHaveProperty("indicatorValue", "1.2.3.4");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_list_indicators")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mde_get_security_recommendations", () => {
    it("returns shaped data on success", async () => {
      mockMdeClient.get.mockResolvedValueOnce({
        data: { value: [{ id: "rec1", recommendationName: "Update software" }] },
      });

      const result = await handlers.get("mde_get_security_recommendations")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.recommendations[0]).toHaveProperty("recommendationName", "Update software");
    });

    it("returns error on HTTP failure", async () => {
      mockMdeClient.get.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("mde_get_security_recommendations")!({});
      expect((result as any).isError).toBe(true);
    });
  });
});
