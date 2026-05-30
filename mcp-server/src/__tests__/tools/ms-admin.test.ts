import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMsAdminTools, resetCacheForTesting } from "../../tools/ms-admin.js";
import { graphClient, GRAPH_SCOPE } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  graphClient: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerMsAdminTools", () => {
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

    registerMsAdminTools(server, true);
  });

  describe("admin_get_service_health", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({
        data: { value: [{ id: "service1", service: "Exchange", status: "serviceOperational" }] },
      });

      const result = await handlers.get("admin_get_service_health")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.services[0]).toHaveProperty("displayName", "Exchange");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockRejectedValueOnce(new Error("network error"));
        const result = await handlers.get("admin_get_service_health")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("admin_list_service_incidents", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({
        data: { value: [{ id: "inc1", title: "Outage" }] },
      });

      const result = await handlers.get("admin_list_service_incidents")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.incidents[0]).toHaveProperty("title", "Outage");
    });
  });

  describe("admin_list_message_center", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockResolvedValueOnce({
          data: { value: [{ id: "msg1", title: "New Feature" }] },
        });
  
        const result = await handlers.get("admin_list_message_center")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.messages[0]).toHaveProperty("title", "New Feature");
      });
  });

  describe("admin_get_tenant_info", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockResolvedValueOnce({
          data: { value: [{ id: "tenant1", displayName: "My Org" }] },
        });
  
        const result = await handlers.get("admin_get_tenant_info")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("displayName", "My Org");
      });
  });

  describe("admin_list_domains", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockResolvedValueOnce({
          data: { value: [{ id: "domain1", isDefault: true }] },
        });
  
        const result = await handlers.get("admin_list_domains")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.domains[0]).toHaveProperty("isDefault", true);
      });
  });

  describe("admin_list_subscriptions", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockResolvedValueOnce({
          data: { value: [{ skuId: "sku1", skuPartNumber: "E3" }] },
        });
  
        const result = await handlers.get("admin_list_subscriptions")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.subscriptions[0]).toHaveProperty("skuPartNumber", "E3");
      });
  });

  describe("admin_get_user_licenses", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockResolvedValueOnce({
          data: { value: [{ skuId: "sku1", skuPartNumber: "E3" }] },
        });
  
        const result = await handlers.get("admin_get_user_licenses")!({ user_id: "user@test.com" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.licenses[0]).toHaveProperty("skuPartNumber", "E3");
      });
  });
});
