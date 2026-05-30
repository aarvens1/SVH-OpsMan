import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFreshServiceTools } from "../../tools/freshservice.js";
import axios from "axios";

vi.mock("axios");

const mockAxios = axios as vi.Mocked<typeof axios>;

describe("registerFreshServiceTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, FRESHSERVICE_DOMAIN: "test", FRESHSERVICE_API_KEY: "fake-key" };

    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    const mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };
    mockAxios.create.mockReturnValue(mockClient as any);

    registerFreshServiceTools(server, true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });


  describe("freshservice_list_tickets", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: { tickets: [{ id: 1, subject: "Test Ticket" }] } });

      const result = await handlers.get("freshservice_list_tickets")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.tickets[0]).toHaveProperty("subject", "Test Ticket");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("freshservice_list_tickets")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_get_ticket", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { ticket: { id: 1, subject: "Test Ticket" } } });

        const result = await handlers.get("freshservice_get_ticket")!({ ticket_id: 1 });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("subject", "Test Ticket");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_get_ticket")!({ ticket_id: 1 });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_create_ticket", () => {
    it("returns shaped data on success", async () => {
        const mockPost = vi.mocked(axios.create().post);
        mockPost.mockResolvedValueOnce({ data: { ticket: { id: 2, subject: "New Ticket" } } });

        const result = await handlers.get("freshservice_create_ticket")!({ subject: "New Ticket", description: "...", email: "t@test.com" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("subject", "New Ticket");
    });

    it("returns error on HTTP failure", async () => {
        const mockPost = vi.mocked(axios.create().post);
        mockPost.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_create_ticket")!({ subject: "New Ticket", description: "...", email: "t@test.com" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_update_ticket", () => {
    it("returns shaped data on success", async () => {
        const mockPut = vi.mocked(axios.create().put);
        mockPut.mockResolvedValueOnce({ data: { ticket: { id: 1, status: 4 } } });

        const result = await handlers.get("freshservice_update_ticket")!({ ticket_id: 1, status: 4 });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("status", 4);
    });

    it("returns error on HTTP failure", async () => {
        const mockPut = vi.mocked(axios.create().put);
        mockPut.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_update_ticket")!({ ticket_id: 1, status: 4 });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_add_note", () => {
    it("returns shaped data on success", async () => {
        const mockPost = vi.mocked(axios.create().post);
        mockPost.mockResolvedValueOnce({ data: { note: { id: 123 } } });

        const result = await handlers.get("freshservice_add_note")!({ ticket_id: 1, body: "a note" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("id", 123);
    });

    it("returns error on HTTP failure", async () => {
        const mockPost = vi.mocked(axios.create().post);
        mockPost.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_add_note")!({ ticket_id: 1, body: "a note" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_list_assets", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { assets: [{ id: 1, display_name: "Laptop" }] } });

        const result = await handlers.get("freshservice_list_assets")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.assets[0]).toHaveProperty("display_name", "Laptop");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_list_assets")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_get_asset", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { asset: { id: 1, display_name: "Laptop-001" } } });

        const result = await handlers.get("freshservice_get_asset")!({ asset_display_id: 1 });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("display_name", "Laptop-001");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));
        
        const result = await handlers.get("freshservice_get_asset")!({ asset_display_id: 1 });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_list_asset_types", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { asset_types: [{ id: 1, name: "Laptop" }] } });

        const result = await handlers.get("freshservice_list_asset_types")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.asset_types[0]).toHaveProperty("name", "Laptop");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_list_asset_types")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("freshservice_list_software", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { applications: [{ id: 1, name: "Zoom" }] } });

        const result = await handlers.get("freshservice_list_software")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.software[0]).toHaveProperty("name", "Zoom");
    });

    it("returns error on HTTP failure", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce(new Error("network error"));

        const result = await handlers.get("freshservice_list_software")!({});
        expect((result as any).isError).toBe(true);
    });
  });
});
