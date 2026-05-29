import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerOutlookMailTools } from "../../tools/outlook-mail.js";
import { getGraphToken } from "../../auth/graph.js";

// Mock graphClient to avoid hoisting issues with vi.mock
const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn(() => mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn(),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
  cfgErr: (msg: string) => ({ ok: false, error: { message: msg, code: "config_error" } }),
}));

// These imports must be after mocks
import { graphClient } from "../../utils/http.js";

const TEST_USER_ID = "test-user@example.com";

describe("Outlook Mail Tools", () => {
  let server: McpServer;
  let registeredTools: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();
    server = {
      registerTool: (name: string, schema: any, handler: any) => {
        registeredTools.set(name, { name, schema, handler });
      },
    } as any;
    registerOutlookMailTools(server, true, TEST_USER_ID);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerOutlookMailTools(mockServer as any, false, TEST_USER_ID);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  it("should return config error if user ID is not set", async () => {
    registeredTools.clear();
    registerOutlookMailTools(server, true, undefined);
    for (const [name, tool] of registeredTools.entries()) {
      const result = await tool.handler({});
      expect(result.ok, `Tool ${name} should fail without userId`).toBe(false);
      expect(result.error.code).toBe("config_error");
    }
  });

  describe("mail_search", () => {
    const toolName = "mail_search";

    it("should search mail on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          value: [
            {
              id: "msg1",
              subject: "Test Subject",
              from: { emailAddress: { address: "from@example.com" } },
              receivedDateTime: "2023-01-01T00:00:00Z",
              hasAttachments: false,
              bodyPreview: "This is a test preview.",
              importance: "normal",
              isRead: true,
            },
          ],
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ query: "test", top: 1 });

      expect(getGraphToken).toHaveBeenCalledWith("https://graph.microsoft.com/.default");
      expect(graphClient).toHaveBeenCalledWith("fake-token");
      expect(mockGraphClient.get).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/messages`, {
        params: {
          $search: '"test"',
          $top: 1,
          $select: "id,subject,from,receivedDateTime,hasAttachments,bodyPreview,importance,isRead",
        },
      });
      expect(result).toEqual({
        ok: true,
        data: {
          count: 1,
          messages: [
            {
              id: "msg1",
              subject: "Test Subject",
              from: { address: "from@example.com" },
              receivedDateTime: "2023-01-01T00:00:00Z",
              isRead: true,
              hasAttachments: false,
              importance: "normal",
              bodyPreview: "This is a test preview.",
            },
          ],
        },
      });
    });

    it("should handle errors when searching mail", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("API Error");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ query: "test", top: 1 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("mail_get_message", () => {
    const toolName = "mail_get_message";

    it("should get a message on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockMsg = {
        data: {
          id: "msg1",
          subject: "Full Message",
          from: { emailAddress: { address: "from@example.com" } },
          toRecipients: [{ emailAddress: { address: "to@example.com" } }],
          body: { contentType: "html", content: "<p>Hello</p>" },
        },
      };
      const mockAttachments = {
        data: {
          value: [{ id: "att1", name: "file.txt", size: 123 }],
        },
      };
      vi.mocked(mockGraphClient.get)
        .mockResolvedValueOnce(mockMsg)
        .mockResolvedValueOnce(mockAttachments);

      const result = await handler({ message_id: "msg1" });

      expect(mockGraphClient.get).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/messages/msg1`);
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        `/users/${TEST_USER_ID}/messages/msg1/attachments?$select=id,name,contentType,size`
      );
      expect(result).toEqual({
        ok: true,
        data: {
          id: "msg1",
          subject: "Full Message",
          from: { address: "from@example.com" },
          to: ["to@example.com"],
          cc: undefined,
          receivedDateTime: undefined,
          sentDateTime: undefined,
          hasAttachments: undefined,
          importance: undefined,
          isRead: undefined,
          body: "<p>Hello</p>",
          bodyContentType: "html",
          attachments: [{ id: "att1", name: "file.txt", size: 123 }],
        },
      });
    });

    it("should handle errors when getting a message", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Message not found");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ message_id: "msg1" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Message not found" });
    });
  });

  describe("mail_send", () => {
    const toolName = "mail_send";

    it("should send an email on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      vi.mocked(mockGraphClient.post).mockResolvedValue({ status: 202 });

      const result = await handler({
        to: ["recipient@example.com"],
        subject: "Sending a test",
        body: "Test body",
        body_type: "text",
        save_to_sent: true,
      });

      expect(mockGraphClient.post).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/sendMail`, {
        message: {
          subject: "Sending a test",
          importance: "normal",
          body: { contentType: "text", content: "Test body" },
          toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
        },
        saveToSentItems: true,
      });
      expect(result).toEqual({
        ok: true,
        data: { sent: true, to: ["recipient@example.com"], subject: "Sending a test" },
      });
    });

    it("should handle errors when sending an email", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Send failed");
      vi.mocked(mockGraphClient.post).mockRejectedValue(error);

      const result = await handler({
        to: ["recipient@example.com"],
        subject: "Sending a test",
        body: "Test body",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Send failed" });
    });
  });

  describe("mail_draft", () => {
    const toolName = "mail_draft";

    it("should create a draft on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = { data: { id: "draft1", subject: "Draft Subject" } };
      vi.mocked(mockGraphClient.post).mockResolvedValue(mockResponse);

      const result = await handler({
        to: ["recipient@example.com"],
        subject: "Draft Subject",
        body: "Draft body",
      });

      expect(mockGraphClient.post).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/messages`, {
        subject: "Draft Subject",
        importance: "normal",
        body: { contentType: "text", content: "Draft body" },
        toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
      });
      expect(result).toEqual({
        ok: true,
        data: { id: "draft1", subject: "Draft Subject", created: true },
      });
    });

    it("should handle errors when creating a draft", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Draft creation failed");
      vi.mocked(mockGraphClient.post).mockRejectedValue(error);

      const result = await handler({
        to: ["recipient@example.com"],
        subject: "Draft Subject",
        body: "Draft body",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Draft creation failed" });
    });
  });

  describe("mail_list_folders", () => {
    const toolName = "mail_list_folders";

    it("should list folders on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          value: [{ id: "inbox-id", displayName: "Inbox", totalItemCount: 10, unreadItemCount: 2 }],
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ include_hidden_folders: false });

      expect(mockGraphClient.get).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/mailFolders`, {
        params: { $top: 100, includeHiddenFolders: false },
      });
      expect(result).toEqual({
        ok: true,
        data: {
          count: 1,
          folders: [
            {
              id: "inbox-id",
              displayName: "Inbox",
              totalItemCount: 10,
              unreadItemCount: 2,
              parentFolderId: undefined,
            },
          ],
        },
      });
    });

    it("should handle errors when listing folders", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Could not list folders");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({});

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Could not list folders" });
    });
  });

  describe("mail_move_message", () => {
    const toolName = "mail_move_message";

    it("should move a message on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = { data: { id: "moved-msg-id" } };
      vi.mocked(mockGraphClient.post).mockResolvedValue(mockResponse);

      const result = await handler({ message_id: "msg1", destination_folder_id: "sentItems" });

      expect(mockGraphClient.post).toHaveBeenCalledWith(`/users/${TEST_USER_ID}/messages/msg1/move`, {
        destinationId: "sentItems",
      });
      expect(result).toEqual({
        ok: true,
        data: { id: "moved-msg-id", moved: true, destination: "sentItems" },
      });
    });

    it("should handle errors when moving a message", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Move failed");
      vi.mocked(mockGraphClient.post).mockRejectedValue(error);

      const result = await handler({ message_id: "msg1", destination_folder_id: "sentItems" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Move failed" });
    });
  });
});
