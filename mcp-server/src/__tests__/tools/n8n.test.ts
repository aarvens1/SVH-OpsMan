import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerN8nTools } from "../../tools/n8n.js";
import axios from "axios";

vi.mock("axios");

const mockedAxios = vi.mocked(axios, true);
const mockN8nClient = { get: vi.fn() };

describe("registerN8nTools", () => {
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

    process.env.N8N_URL = "https://n8n.example.com";
    process.env.N8N_API_KEY = "fake-api-key";

    // Mock the client factory inside the module
    mockedAxios.create.mockReturnValue(mockN8nClient as any);

    registerN8nTools(server, true);
  });

  afterEach(() => {
    delete process.env.N8N_URL;
    delete process.env.N8N_API_KEY;
  });

  describe("n8n_list_workflows", () => {
    it("returns workflows on success", async () => {
      const mockResponse = { data: { data: [{ id: "1", name: "My Workflow" }] } };
      mockN8nClient.get.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("n8n_list_workflows")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.workflows).toHaveLength(1);
      expect(parsed.workflows[0].name).toBe("My Workflow");
    });

    it("returns error on failure", async () => {
      mockN8nClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("n8n_list_workflows")!({});
      expect((result as any).isError).toBe(true);
    });

    it("returns config error if env vars are not set", async () => {
      delete process.env.N8N_URL;
      const result = await handlers.get("n8n_list_workflows")!({});
      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("not configured");
    });
  });

  describe("n8n_list_executions", () => {
    it("returns executions on success", async () => {
      const mockResponse = { data: { data: [{ id: "exec1", status: "success" }] } };
      mockN8nClient.get.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("n8n_list_executions")!({ limit: 10 });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.executions).toHaveLength(1);
      expect(parsed.executions[0].status).toBe("success");
    });

    it("returns error on failure", async () => {
      mockN8nClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("n8n_list_executions")!({ limit: 10 });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("n8n_get_execution", () => {
    it("returns execution details on success", async () => {
      const mockResponse = { data: { id: "exec1", status: "success" } };
      mockN8nClient.get.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("n8n_get_execution")!({ execution_id: "exec1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("exec1");
    });

    it("returns error on failure", async () => {
      mockN8nClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("n8n_get_execution")!({ execution_id: "exec1" });
      expect((result as any).isError).toBe(true);
    });

    it("returns a specific error for 404", async () => {
      const axiosError = new Error("Not Found") as any;
      axiosError.isAxiosError = true;
      axiosError.response = { status: 404 };
      mockedAxios.isAxiosError.mockReturnValue(true);
      mockN8nClient.get.mockRejectedValueOnce(axiosError);

      const result = await handlers.get("n8n_get_execution")!({ execution_id: "exec1" });
      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("not found");
    });
  });
});
