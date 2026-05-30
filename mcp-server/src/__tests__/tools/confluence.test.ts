import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConfluenceTools } from "../../tools/confluence.js";
import { confluenceClient, confluenceSearchClient } from "../../utils/http.js";

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  confluenceClient: vi.fn().mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  }),
  confluenceSearchClient: vi.fn().mockReturnValue({
    get: vi.fn(),
  }),
}));

describe("registerConfluenceTools", () => {
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
    registerConfluenceTools(server, true);
  });

  describe("confluence_list_spaces", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(confluenceClient().get);
      mockGet.mockResolvedValueOnce({ data: { results: [{ id: "space1", name: "My Space" }] } });

      const result = await handlers.get("confluence_list_spaces")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.spaces[0]).toHaveProperty("name", "My Space");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(confluenceClient().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_list_spaces")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_search_pages", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(confluenceSearchClient().get);
      mockGet.mockResolvedValueOnce({ data: { results: [{ content: { id: "page1", title: "Test Page" } }] } });

      const result = await handlers.get("confluence_search_pages")!({ cql: "title ~ test" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.pages[0]).toHaveProperty("title", "Test Page");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(confluenceSearchClient().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_search_pages")!({ cql: "title ~ test" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_get_page", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(confluenceClient().get);
      mockGet.mockResolvedValueOnce({ data: { id: "page1", title: "Test Page" } });

      const result = await handlers.get("confluence_get_page")!({ page_id: "page1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("title", "Test Page");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(confluenceClient().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_get_page")!({ page_id: "page1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_get_page_children", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(confluenceClient().get);
        mockGet.mockResolvedValueOnce({ data: { results: [{ id: "child1", title: "Child Page" }] } });

        const result = await handlers.get("confluence_get_page_children")!({ page_id: "page1" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.children[0]).toHaveProperty("title", "Child Page");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(confluenceClient().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("confluence_get_page_children")!({ page_id: "page1" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_create_page", () => {
    it("returns shaped data on success", async () => {
      const mockPost = vi.mocked(confluenceClient().post);
      mockPost.mockResolvedValueOnce({ data: { id: "page2", title: "New Page" } });

      const result = await handlers.get("confluence_create_page")!({ space_id: "space1", title: "New Page", body: "<p>test</p>" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("title", "New Page");
    });

    it("returns error on HTTP failure", async () => {
      const mockPost = vi.mocked(confluenceClient().post);
      mockPost.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_create_page")!({ space_id: "space1", title: "New Page", body: "<p>test</p>" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_update_page", () => {
    it("returns shaped data on success", async () => {
      const mockPut = vi.mocked(confluenceClient().put);
      mockPut.mockResolvedValueOnce({ data: { id: "page1", title: "Updated Title" } });

      const result = await handlers.get("confluence_update_page")!({ page_id: "page1", version_number: 1, title: "Updated Title" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("title", "Updated Title");
    });

    it("returns error on HTTP failure", async () => {
      const mockPut = vi.mocked(confluenceClient().put);
      mockPut.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_update_page")!({ page_id: "page1", version_number: 1, title: "Updated Title" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_get_page_comments", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(confluenceClient().get);
        mockGet.mockResolvedValueOnce({ data: { results: [{ id: "comment1", body: { storage: { value: "a comment" } } }] } });

        const result = await handlers.get("confluence_get_page_comments")!({ page_id: "page1" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.comments[0]).toHaveProperty("id", "comment1");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(confluenceClient().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("confluence_get_page_comments")!({ page_id: "page1" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("confluence_add_page_comment", () => {
    it("returns shaped data on success", async () => {
      const mockPost = vi.mocked(confluenceClient().post);
      mockPost.mockResolvedValueOnce({ data: { id: "comment2" } });

      const result = await handlers.get("confluence_add_page_comment")!({ page_id: "page1", body: "<p>new comment</p>" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("id", "comment2");
    });

    it("returns error on HTTP failure", async () => {
      const mockPost = vi.mocked(confluenceClient().post);
      mockPost.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("confluence_add_page_comment")!({ page_id: "page1", body: "<p>new comment</p>" });
      expect((result as any).isError).toBe(true);
    });
  });
});
