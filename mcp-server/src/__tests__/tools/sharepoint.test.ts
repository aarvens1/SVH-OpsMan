import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSharePointTools } from "../../tools/sharepoint.js";
import { graphClient } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

const mockGraphClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerSharePointTools", () => {
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
    registerSharePointTools(server, true);
  });

  describe("sp_search_sites", () => {
    it("returns sites on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "site1" }] } });
      const result = await handlers.get("sp_search_sites")!({ query: "test" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_search_sites")!({ query: "test" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_get_site", () => {
    it("returns a site on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { id: "site1" } });
      const result = await handlers.get("sp_get_site")!({ site_id: "site1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_get_site")!({ site_id: "site1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_list_site_lists", () => {
    it("returns lists on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "list1" }] } });
      const result = await handlers.get("sp_list_site_lists")!({ site_id: "site1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_list_site_lists")!({ site_id: "site1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_get_list_items", () => {
    it("returns list items on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "item1" }] } });
      const result = await handlers.get("sp_get_list_items")!({ site_id: "site1", list_id: "list1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_get_list_items")!({ site_id: "site1", list_id: "list1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_list_site_pages", () => {
    it("returns pages on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "page1" }] } });
      const result = await handlers.get("sp_list_site_pages")!({ site_id: "site1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_list_site_pages")!({ site_id: "site1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_get_site_permissions", () => {
    it("returns permissions on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "perm1" }] } });
      const result = await handlers.get("sp_get_site_permissions")!({ site_id: "site1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_get_site_permissions")!({ site_id: "site1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("sp_list_content_types", () => {
    it("returns content types on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "ct1" }] } });
      const result = await handlers.get("sp_list_content_types")!({ site_id: "site1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("sp_list_content_types")!({ site_id: "site1" });
      expect((result as any).isError).toBe(true);
    });
  });
});
