import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWazuhTools, resetCachesForTesting } from "../../tools/wazuh.js";
import axios from "axios";

const mockWazuhClient = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  wazuhClient: vi.fn().mockReturnValue(mockWazuhClient),
}));

// Also need to mock the JWT retrieval
vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);


describe("registerWazuhTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetCachesForTesting();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    process.env.WAZUH_URL = "https://wazuh.example.com";
    process.env.WAZUH_USERNAME = "user";
    process.env.WAZUH_PASSWORD = "password";

    mockedAxios.post.mockResolvedValue({ data: { data: { token: "fake-jwt" } } });

    registerWazuhTools(server, true);
  });

  afterEach(() => {
    delete process.env.WAZUH_URL;
    delete process.env.WAZUH_USERNAME;
    delete process.env.WAZUH_PASSWORD;
  });

  describe("wazuh_list_agents", () => {
    it("returns agents on success", async () => {
      mockWazuhClient.get.mockResolvedValueOnce({ data: { data: { affected_items: [{ id: "001" }] } } });
      const result = await handlers.get("wazuh_list_agents")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockWazuhClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("wazuh_list_agents")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("wazuh_search_alerts", () => {
    it("returns alerts on success", async () => {
        mockWazuhClient.get.mockResolvedValueOnce({ data: { data: { affected_items: [{ id: 'alert1' }] } } });
        const result = await handlers.get("wazuh_search_alerts")!({ min_level: 5 });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockWazuhClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("wazuh_search_alerts")!({ min_level: 5 });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("wazuh_get_agent_vulnerabilities", () => {
    it("returns vulnerabilities on success", async () => {
        mockWazuhClient.get.mockResolvedValueOnce({ data: { data: { affected_items: [{ cve: 'CVE-2024-1234' }] } } });
        const result = await handlers.get("wazuh_get_agent_vulnerabilities")!({ agent_id: '001' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockWazuhClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("wazuh_get_agent_vulnerabilities")!({ agent_id: '001' });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("wazuh_get_fim_events", () => {
    it("returns FIM events on success", async () => {
        mockWazuhClient.get.mockResolvedValueOnce({ data: { data: { affected_items: [{ file: '/etc/passwd' }] } } });
        const result = await handlers.get("wazuh_get_fim_events")!({ agent_id: '001' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockWazuhClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("wazuh_get_fim_events")!({ agent_id: '001' });
        expect((result as any).isError).toBe(true);
    });
  });
});
