import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOutlookMailTools } from "../../tools/outlook-mail.js";
import { graphClient } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerOutlookMailTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const testUserId = "test-user@example.com";

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });
    registerOutlookMailTools(server, true, testUserId);
  });

  describe("mail_search", () => {
    it("returns messages on success", async () => {
      const mockResponse = { data: { value: [{ id: "msg1", subject: "Hello" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("mail_search")!({ query: "Hello" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_search")!({ query: "Hello" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mail_get_message", () => {
    it("returns a message on success", async () => {
      const mockMsg = { data: { id: "msg1", subject: "Hello" } };
      const mockAttachments = { data: { value: [] } };
      mockGraphClient.get.mockResolvedValueOnce(mockMsg);
      mockGraphClient.get.mockResolvedValueOnce(mockAttachments);
      const result = await handlers.get("mail_get_message")!({ message_id: "msg1" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_get_message")!({ message_id: "msg1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mail_send", () => {
    const params = { to: ["a@b.com"], subject: "Hi", body: "Test" };
    it("sends mail on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ status: 202 });
      const result = await handlers.get("mail_send")!(params);
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_send")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mail_draft", () => {
    const params = { to: ["a@b.com"], subject: "Draft", body: "Test" };
    it("creates draft on success", async () => {
      const mockResponse = { data: { id: "draft1", subject: "Draft" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("mail_draft")!(params);
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_draft")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mail_list_folders", () => {
    it("returns folders on success", async () => {
      const mockResponse = { data: { value: [{ id: "inbox", displayName: "Inbox" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("mail_list_folders")!({});
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_list_folders")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("mail_move_message", () => {
    it("moves message on success", async () => {
      const mockResponse = { data: { id: "msg1" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("mail_move_message")!({ message_id: "msg1", destination_folder_id: "archive" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("mail_move_message")!({ message_id: "msg1", destination_folder_id: "archive" });
      expect((result as any).isError).toBe(true);
    });
  });
});
