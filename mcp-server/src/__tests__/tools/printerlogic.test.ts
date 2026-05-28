import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrinterLogicTools } from "../../tools/printerlogic.js";
import { printerlogicClient } from "../../utils/http.js";

const mockPlClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  printerlogicClient: vi.fn().mockReturnValue(mockPlClient),
}));

describe("registerPrinterLogicTools", () => {
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
    registerPrinterLogicTools(server, true);
  });

  describe("pl_list_printers", () => {
    it("returns printers on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { printers: [{ id: "p1" }] } });
      const result = await handlers.get("pl_list_printers")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_list_printers")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_get_printer", () => {
    it("returns a printer on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { id: "p1" } });
      mockPlClient.get.mockResolvedValueOnce({ data: { deployments: [] } });
      const result = await handlers.get("pl_get_printer")!({ printer_id: "p1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_get_printer")!({ printer_id: "p1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_list_drivers", () => {
    it("returns drivers on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { drivers: [{ id: "d1" }] } });
      const result = await handlers.get("pl_list_drivers")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_list_drivers")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_list_deployment_profiles", () => {
    it("returns profiles on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { profiles: [{ id: "dp1" }] } });
      const result = await handlers.get("pl_list_deployment_profiles")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_list_deployment_profiles")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_get_deployment_status", () => {
    it("returns status on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { installed: 1 } });
      const result = await handlers.get("pl_get_deployment_status")!({ printer_id: "p1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_get_deployment_status")!({ printer_id: "p1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_get_audit_logs", () => {
    it("returns logs on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { logs: [{ id: "log1" }] } });
      const result = await handlers.get("pl_get_audit_logs")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_get_audit_logs")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_get_print_quota", () => {
    it("returns quota on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { limit: 100 } });
      const result = await handlers.get("pl_get_print_quota")!({ user_or_group: "user1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_get_print_quota")!({ user_or_group: "user1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("pl_get_usage_reports", () => {
    it("returns reports on success", async () => {
      mockPlClient.get.mockResolvedValueOnce({ data: { data: [{ user: "user1" }] } });
      const result = await handlers.get("pl_get_usage_reports")!({});
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockPlClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("pl_get_usage_reports")!({});
      expect((result as any).isError).toBe(true);
    });
  });
});
