import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTeamsTools } from "../../tools/teams.js";
import { graphClient } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

const mockGraphClient = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerTeamsTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const testUserId = "test-user-id";

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });
    registerTeamsTools(server, true, testUserId);
  });

  describe("teams_list_teams", () => {
    it("returns teams on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "team1" }] } });
      const result = await handlers.get("teams_list_teams")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_list_teams")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_list_channels", () => {
    it("returns channels on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "channel1" }] } });
      const result = await handlers.get("teams_list_channels")!({ team_id: "team1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_list_channels")!({ team_id: "team1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_send_message", () => {
    it("sends a message on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ data: { id: "msg1" } });
      const result = await handlers.get("teams_send_message")!({ team_id: "team1", channel_id: "channel1", content: "Hello" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_send_message")!({ team_id: "team1", channel_id: "channel1", content: "Hello" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_list_messages", () => {
    it("returns messages on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "msg1" }] } });
      const result = await handlers.get("teams_list_messages")!({ team_id: "team1", channel_id: "channel1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_list_messages")!({ team_id: "team1", channel_id: "channel1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_create_channel", () => {
    it("creates a channel on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ data: { id: "newChannel" } });
      const result = await handlers.get("teams_create_channel")!({ team_id: "team1", display_name: "New Channel" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_create_channel")!({ team_id: "team1", display_name: "New Channel" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_list_my_chats", () => {
    it("returns chats on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "chat1" }] } });
      const result = await handlers.get("teams_list_my_chats")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("teams_list_my_chats")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_get_chat_messages", () => {
    it("returns chat messages on success", async () => {
        mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: 'msg1' }] } });
        const result = await handlers.get("teams_get_chat_messages")!({ chat_id: 'chat1' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("teams_get_chat_messages")!({ chat_id: 'chat1' });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("teams_add_member", () => {
    it("adds a member on success", async () => {
        mockGraphClient.post.mockResolvedValueOnce({ data: { id: 'member1' } });
        const result = await handlers.get("teams_add_member")!({ team_id: 'team1', user_id: 'user1' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("teams_add_member")!({ team_id: 'team1', user_id: 'user1' });
        expect((result as any).isError).toBe(true);
    });
  });
});
