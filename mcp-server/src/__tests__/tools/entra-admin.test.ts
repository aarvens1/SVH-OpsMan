import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEntraAdminTools } from "../../tools/entra-admin.js";
import { graphClient, GRAPH_SCOPE } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
  }),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerEntraAdminTools", () => {
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
    registerEntraAdminTools(server, true);
  });

  describe("entra_get_user_mfa_methods", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "FIDO2" }] } });

      const result = await handlers.get("entra_get_user_mfa_methods")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.methods[0]).toHaveProperty("displayName", "FIDO2");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_get_user_mfa_methods")!({ user_id: "user@test.com" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_list_conditional_access_policies", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "Block Legacy Auth" }] } });

      const result = await handlers.get("entra_list_conditional_access_policies")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.policies[0]).toHaveProperty("displayName", "Block Legacy Auth");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_list_conditional_access_policies")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_list_app_registrations", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "My App" }] } });

      const result = await handlers.get("entra_list_app_registrations")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.applications[0]).toHaveProperty("displayName", "My App");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_list_app_registrations")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_list_expiring_secrets", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
      mockGet.mockResolvedValue({ data: { value: [
        { displayName: "App1", appId: "1", passwordCredentials: [{ endDateTime: future, hint: "hint1" }], keyCredentials: [] }
      ]}});

      const result = await handlers.get("entra_list_expiring_secrets")!({ days: 30 });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.expiring[0]).toHaveProperty("appDisplayName", "App1");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_list_expiring_secrets")!({ days: 30 });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_list_directory_roles", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "Global Administrator" }] } });

      const result = await handlers.get("entra_list_directory_roles")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.roles[0]).toHaveProperty("displayName", "Global Administrator");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("entra_list_directory_roles")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_get_role_members", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", displayName: "Admin User" }] } });

      const result = await handlers.get("entra_get_role_members")!({ role_id: "role1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.members[0]).toHaveProperty("displayName", "Admin User");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("entra_get_role_members")!({ role_id: "role1" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_list_risky_users", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", userDisplayName: "Risky User" }] } });

      const result = await handlers.get("entra_list_risky_users")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.riskyUsers[0]).toHaveProperty("userDisplayName", "Risky User");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(graphClient("").get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("entra_list_risky_users")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_dismiss_risky_user", () => {
    it("returns shaped data on success", async () => {
      const mockPost = vi.mocked(graphClient("").post);
      mockPost.mockResolvedValueOnce({ data: {} });

      const result = await handlers.get("entra_dismiss_risky_user")!({ user_ids: ["user1"] });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("success", true);
    });

    it("returns error on HTTP failure", async () => {
        const mockPost = vi.mocked(graphClient("").post);
        mockPost.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("entra_dismiss_risky_user")!({ user_ids: ["user1"] });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_get_sign_in_logs", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", userDisplayName: "Test User" }] } });

      const result = await handlers.get("entra_get_sign_in_logs")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.signIns[0]).toHaveProperty("userDisplayName", "Test User");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_get_sign_in_logs")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("entra_get_audit_logs", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "1", activityDisplayName: "Update user" }] } });

      const result = await handlers.get("entra_get_audit_logs")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.auditLogs[0]).toHaveProperty("activityDisplayName", "Update user");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("").get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("entra_get_audit_logs")!({});
      expect((result as any).isError).toBe(true);
    });
  });
});
