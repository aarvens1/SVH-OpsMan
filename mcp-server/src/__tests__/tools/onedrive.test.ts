import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOneDriveTools } from "../../tools/onedrive.js";
import { graphClient } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerOneDriveTools", () => {
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
    registerOneDriveTools(server, true);
  });

  describe("onedrive_get_user_drive", () => {
    it("returns drive on success", async () => {
      const mockResponse = { data: { id: "drive1", name: "My Drive" } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_get_user_drive")!({ user_id: "user1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("drive1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_get_user_drive")!({ user_id: "user1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_list_items", () => {
    it("returns items on success", async () => {
      const mockResponse = { data: { value: [{ id: "item1", name: "file.txt" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_list_items")!({ drive_id: "drive1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.items[0].id).toBe("item1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_list_items")!({ drive_id: "drive1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_get_item", () => {
    it("returns item on success", async () => {
      const mockResponse = { data: { id: "item1", name: "file.txt" } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_get_item")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("item1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_get_item")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_search_files", () => {
    it("returns search results on success", async () => {
      const mockResponse = { data: { value: [{ id: "item1", name: "file.txt" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_search_files")!({ drive_id: "drive1", query: "file" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.items[0].id).toBe("item1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_search_files")!({ drive_id: "drive1", query: "file" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_create_folder", () => {
    it("returns created folder on success", async () => {
      const mockResponse = { data: { id: "folder1", name: "New Folder" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_create_folder")!({ drive_id: "drive1", folder_name: "New Folder" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("folder1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_create_folder")!({ drive_id: "drive1", folder_name: "New Folder" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_move_item", () => {
    it("moves item on success", async () => {
      const mockResponse = { data: { id: "item1", name: "moved.txt" } };
      mockGraphClient.patch.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_move_item")!({ drive_id: "drive1", item_id: "item1", new_parent_id: "folder2" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.patch.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_move_item")!({ drive_id: "drive1", item_id: "item1", new_parent_id: "folder2" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_delete_item", () => {
    it("deletes item on success", async () => {
      mockGraphClient.delete.mockResolvedValueOnce({ status: 204 });
      const result = await handlers.get("onedrive_delete_item")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.deleted).toBe(true);
    });

    it("returns error on failure", async () => {
      mockGraphClient.delete.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_delete_item")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("onedrive_create_sharing_link", () => {
    it("creates link on success", async () => {
      const mockResponse = { data: { id: "link1", link: { webUrl: "http://share.link" } } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("onedrive_create_sharing_link")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.webUrl).toBe("http://share.link");
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("onedrive_create_sharing_link")!({ drive_id: "drive1", item_id: "item1" });
      expect((result as any).isError).toBe(true);
    });
  });
});
