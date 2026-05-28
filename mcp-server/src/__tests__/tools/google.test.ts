import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGoogleTools } from "../../tools/google.js";
import axios from "axios";

vi.mock("../../auth/google.js", () => ({
  getGoogleToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("axios");

const mockAxios = axios as vi.Mocked<typeof axios>;

describe("registerGoogleTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const mockClient = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    mockAxios.create.mockReturnValue(mockClient as any);

    // a userId is required for google tools
    registerGoogleTools(server, true, "test@google.com");
  });

  describe("gmail_list_recent", () => {
    it("returns shaped data on success", async () => {
      mockClient.get
        .mockResolvedValueOnce({ data: { messages: [{ id: "msg1" }] } })
        .mockResolvedValueOnce({
          data: {
            id: "msg1",
            payload: { headers: [{ name: "Subject", value: "Test" }] },
          },
        });

      const result = await handlers.get("gmail_list_recent")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.messages[0]).toHaveProperty("subject", "Test");
    });

    it("returns error on HTTP failure", async () => {
      mockClient.get.mockRejectedValueOnce(new Error("network error"));
      const result = await handlers.get("gmail_list_recent")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("gmail_search", () => {
    it("returns shaped data on success", async () => {
        mockClient.get
        .mockResolvedValueOnce({ data: { messages: [{ id: "msg1" }] } })
        .mockResolvedValueOnce({
          data: {
            id: "msg1",
            payload: { headers: [{ name: "Subject", value: "Found" }] },
          },
        });

      const result = await handlers.get("gmail_search")!({ query: "test" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.messages[0]).toHaveProperty("subject", "Found");
    });
  });

  describe("gcal_list_events", () => {
    it("returns shaped data on success", async () => {
        mockClient.get.mockResolvedValueOnce({ data: { items: [{ id: "evt1", summary: "Meeting" }] } });
        const result = await handlers.get("gcal_list_events")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.events[0]).toHaveProperty("summary", "Meeting");
    });
  });
  
  describe("gdrive_list_files", () => {
    it("returns shaped data on success", async () => {
        mockClient.get.mockResolvedValueOnce({ data: { files: [{ id: "file1", name: "My Doc" }] } });
        const result = await handlers.get("gdrive_list_files")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.files[0]).toHaveProperty("name", "My Doc");
    });
  });

  describe("gtasks_list_tasks", () => {
    it("returns shaped data on success", async () => {
        mockClient.get.mockResolvedValueOnce({ data: { items: [{ id: "task1", title: "My Task" }] } });
        const result = await handlers.get("gtasks_list_tasks")!({ task_list_id: '1' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.tasks[0]).toHaveProperty("title", "My Task");
    });
  });

  // Test one write operation for each service
  describe("gmail_send", () => {
    it("returns shaped data on success", async () => {
        mockClient.post.mockResolvedValueOnce({ data: { id: "sent_msg1" } });
        const result = await handlers.get("gmail_send")!({ to: 'a@b.com', subject: 's', body: 'b' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("id", "sent_msg1");
    });
  });

  describe("gcal_create_event", () => {
    it("returns shaped data on success", async () => {
        mockClient.post.mockResolvedValueOnce({ data: { id: "evt2", summary: "New Event" } });
        const result = await handlers.get("gcal_create_event")!({ summary: 'New', start: '2025-01-01T10:00:00Z', end: '2025-01-01T11:00:00Z' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("summary", "New Event");
    });
  });

  describe("gdrive_create_folder", () => {
    it("returns shaped data on success", async () => {
        mockClient.post.mockResolvedValueOnce({ data: { id: "folder1", name: "New Folder" } });
        const result = await handlers.get("gdrive_create_folder")!({ name: 'New Folder' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("name", "New Folder");
    });
  });

  describe("gtasks_create_task", () => {
    it("returns shaped data on success", async () => {
        mockClient.post.mockResolvedValueOnce({ data: { id: "task2", title: "New Task" } });
        const result = await handlers.get("gtasks_create_task")!({ task_list_id: '1', title: 'New Task' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("title", "New Task");
    });
  });
});
