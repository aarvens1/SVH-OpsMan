import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAzureTools } from "../../tools/azure.js";
import { armClient } from "../../utils/http.js";

vi.mock("../../auth/azure.js", () => ({
  getArmToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  armClient: vi.fn().mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
  }),
}));

describe("registerAzureTools", () => {
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
    registerAzureTools(server, true);
  });

  describe("azure_list_resource_groups", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "rg1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_resource_groups")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "rg1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_resource_groups")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_vms", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "vm1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_vms")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "vm1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_vms")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_get_vm", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { name: "vm1", location: "eastus" },
      });

      const result = await handlers.get("azure_get_vm")!({ resource_group: "rg1", vm_name: "vm1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("name", "vm1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_get_vm")!({ resource_group: "rg1", vm_name: "vm1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_storage_accounts", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "storage1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_storage_accounts")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "storage1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_storage_accounts")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_app_services", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "app1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_app_services")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "app1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_app_services")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_vnets", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "vnet1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_vnets")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "vnet1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_vnets")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_nsgs", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ name: "nsg1", location: "eastus" }] },
      });

      const result = await handlers.get("azure_list_nsgs")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("name", "nsg1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_list_nsgs")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_get_activity_logs", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockResolvedValueOnce({
        data: { value: [{ level: "Informational", caller: "user@domain.com" }] },
      });

      const result = await handlers.get("azure_get_activity_logs")!({ start_time: "2025-01-01T00:00:00Z" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed[0]).toHaveProperty("level", "Informational");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(armClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_get_activity_logs")!({ start_time: "2025-01-01T00:00:00Z" });
      expect((result as any).isError).toBe(true);
    });
  });

    describe("azure_get_cost_summary", () => {
    it("returns shaped data on success", async () => {
      const mockPost = vi.mocked(armClient("")).post;
      mockPost.mockResolvedValueOnce({
        data: { properties: { currency: "USD", rows: [[123.45, "rg1"]] } },
      });

      const result = await handlers.get("azure_get_cost_summary")!({ period: "BillingMonth", group_by: "ResourceGroup" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("currency", "USD");
    });

    it("returns error on HTTP failure", async () => {
      const mockPost = vi.mocked(armClient("")).post;
      mockPost.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("azure_get_cost_summary")!({ period: "BillingMonth", group_by: "ResourceGroup" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("azure_list_advisor_recommendations", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(armClient("")).get;
        mockGet.mockResolvedValueOnce({
            data: { value: [{ properties: { category: "Cost", shortDescription: { problem: "Unused resource" } } }] },
        });

        const result = await handlers.get("azure_list_advisor_recommendations")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed[0]).toHaveProperty("category", "Cost");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(armClient("")).get;
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("azure_list_advisor_recommendations")!({});
        expect((result as any).isError).toBe(true);
    });
  });
});
