import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOutlookCalendarTools } from "../../tools/outlook-calendar.js";
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

describe("registerOutlookCalendarTools", () => {
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
    registerOutlookCalendarTools(server, true, testUserId);
  });

  describe("calendar_list_events", () => {
    const params = { start: "2024-01-01T00:00:00", end: "2024-01-01T23:59:59" };
    it("returns events on success", async () => {
      const mockResponse = { data: { value: [{ id: "evt1", subject: "Meeting" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_list_events")!(params);
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.events[0].id).toBe("evt1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_list_events")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_get_event", () => {
    it("returns event on success", async () => {
      const mockResponse = { data: { id: "evt1", subject: "Meeting" } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_get_event")!({ event_id: "evt1" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_get_event")!({ event_id: "evt1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_create_event", () => {
    const params = { subject: "New Meeting", start: "2024-01-01T10:00:00", end: "2024-01-01T11:00:00" };
    it("creates event on success", async () => {
      const mockResponse = { data: { id: "evt2", subject: "New Meeting" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_create_event")!(params);
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_create_event")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_update_event", () => {
    it("updates event on success", async () => {
      const mockResponse = { data: { id: "evt1", subject: "Updated Meeting" } };
      mockGraphClient.patch.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_update_event")!({ event_id: "evt1", subject: "Updated" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.patch.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_update_event")!({ event_id: "evt1", subject: "Updated" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_delete_event", () => {
    it("deletes event on success", async () => {
      mockGraphClient.delete.mockResolvedValueOnce({ status: 204 });
      const result = await handlers.get("calendar_delete_event")!({ event_id: "evt1" });
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.delete.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_delete_event")!({ event_id: "evt1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_find_meeting_times", () => {
    const params = { attendees: ["a@b.com"], start: "2024-01-01T08:00:00", end: "2024-01-01T17:00:00" };
    it("finds times on success", async () => {
      const mockResponse = { data: { meetingTimeSuggestions: [{ confidence: 100 }] } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_find_meeting_times")!(params);
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_find_meeting_times")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("calendar_list_rooms", () => {
    it("returns rooms on success", async () => {
      const mockResponse = { data: { value: [{ id: "room1", displayName: "Conf Room 1" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);
      const result = await handlers.get("calendar_list_rooms")!({});
      expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("calendar_list_rooms")!({});
      expect((result as any).isError).toBe(true);
    });
  });
});
