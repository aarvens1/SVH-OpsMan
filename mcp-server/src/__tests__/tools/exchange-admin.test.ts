import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerExchangeAdminTools } from "../../tools/exchange-admin.js";
import { graphClient, GRAPH_SCOPE } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  }),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerExchangeAdminTools", () => {
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
    registerExchangeAdminTools(server, true);
  });

  describe("exo_get_mailbox", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { id: "1", displayName: "Test User" } });
      mockGet.mockResolvedValueOnce({ data: { timeZone: "UTC" } });

      const result = await handlers.get("exo_get_mailbox")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("displayName", "Test User");
      expect(parsed.mailboxSettings).toHaveProperty("timeZone", "UTC");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("exo_get_mailbox")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("exo_list_distribution_groups", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "All Hands" }] } });

      const result = await handlers.get("exo_list_distribution_groups")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.groups[0]).toHaveProperty("displayName", "All Hands");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("exo_list_distribution_groups")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("exo_list_group_members", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "Test User" }] } });

      const result = await handlers.get("exo_list_group_members")!({ group_id: "group1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.members[0]).toHaveProperty("displayName", "Test User");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("exo_list_group_members")!({ group_id: "group1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("exo_list_accepted_domains", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "example.com", isDefault: true }] } });

      const result = await handlers.get("exo_list_accepted_domains")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.domains[0]).toHaveProperty("id", "example.com");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("exo_list_accepted_domains")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("exo_message_trace", () => {
    it("returns powershell command", async () => {
      const result = await handlers.get("exo_message_trace")!({ 
          start_date: "2025-01-01T00:00:00Z", 
          end_date: "2025-01-01T01:00:00Z" 
      });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("note");
      expect(parsed).toHaveProperty("powershell");
      expect(parsed.powershell).toContain("Get-MessageTrace");
    });
  });

  describe("exo_get_mailbox_auto_reply", () => {
    it("returns shaped data on get success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { automaticRepliesSetting: { status: "disabled" } } });

      const result = await handlers.get("exo_get_mailbox_auto_reply")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.automaticRepliesSetting).toHaveProperty("status", "disabled");
    });
    
    it("returns shaped data on set success", async () => {
      const mockPatch = vi.mocked(graphClient("").patch);
      mockPatch.mockResolvedValueOnce({ data: { automaticRepliesSetting: { status: "alwaysEnabled" } } });

      const result = await handlers.get("exo_get_mailbox_auto_reply")!({ user_id: "user@test.com", set_status: "AlwaysEnabled" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.automaticRepliesSetting).toHaveProperty("status", "alwaysEnabled");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("exo_get_mailbox_auto_reply")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBe(true);
    });
  });
});
