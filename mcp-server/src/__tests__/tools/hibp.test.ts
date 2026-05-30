import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerHibpTools } from "../../tools/hibp.js";
import axios from "axios";

vi.mock("axios");

const mockAxios = axios as vi.Mocked<typeof axios>;

describe("registerHibpTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, HIBP_API_KEY: "fake-key" };

    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    const mockClient = { get: vi.fn() };
    mockAxios.create.mockReturnValue(mockClient as any);
    mockAxios.isAxiosError.mockImplementation((e: unknown) => (e as any)?.isAxiosError === true);

    registerHibpTools(server, true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("returns cfgErr if token is not set", async () => {
    process.env["HIBP_API_KEY"] = "";
    const handler = handlers.get("hibp_check_account")!;
    const result = await handler({ email: "test@test.com" });
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("not configured");
  });

  describe("hibp_check_account", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: [{ Name: "breach1" }] });

      const result = await handlers.get("hibp_check_account")!({ email: "test@test.com" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.breaches[0]).toHaveProperty("name", "breach1");
    });

    it("returns empty array for 404 not found", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
  
        const result = await handlers.get("hibp_check_account")!({ email: "safe@test.com" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.breaches).toEqual([]);
    });

    it("returns error on other HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("hibp_check_account")!({ email: "test@test.com" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("hibp_check_pastes", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: [{ Id: "paste1" }] });
  
        const result = await handlers.get("hibp_check_pastes")!({ email: "test@test.com" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.pastes[0]).toHaveProperty("id", "paste1");
    });

    it("returns empty array for 404 not found", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
  
        const result = await handlers.get("hibp_check_pastes")!({ email: "safe@test.com" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.pastes).toEqual([]);
    });
  });

  describe("hibp_get_breach", () => {
    it("returns shaped data on success", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockResolvedValueOnce({ data: { Name: "Adobe" } });
  
        const result = await handlers.get("hibp_get_breach")!({ name: "Adobe" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed).toHaveProperty("name", "Adobe");
    });

    it("returns error for 404 not found", async () => {
        const mockGet = vi.mocked(axios.create().get);
        mockGet.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
  
        const result = await handlers.get("hibp_get_breach")!({ name: "nonexistent" });
        expect((result as any).isError).toBe(true);
    });
  });
});
