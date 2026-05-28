import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNinjaOneTools } from "../../tools/ninjaone.js";
import { ninjaClient } from "../../utils/http.js";

vi.mock("../../auth/ninja.js", () => ({
  getNinjaToken: vi.fn().mockResolvedValue("fake-api-token"),
  getNinjaManagementToken: vi.fn().mockResolvedValue("fake-mgmt-token"),
}));

vi.mock("../../utils/http.js", () => ({
  ninjaClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("registerNinjaOneTools", () => {
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
    registerNinjaOneTools(server, true);
  });

  describe("ninja_list_servers", () => {
    it("returns servers on success", async () => {
      const mockResponse = { data: [{ id: 1, systemName: "server-01" }] };
      (ninjaClient.get as vi.Mock).mockResolvedValue(mockResponse);

      const result = await handlers.get("ninja_list_servers")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe(1);
    });

    it("returns error on failure", async () => {
      (ninjaClient.get as vi.Mock).mockRejectedValue(new Error("API Error"));
      const result = await handlers.get("ninja_list_servers")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_get_server", () => {
    it("returns a single server on success", async () => {
      const mockResponse = { data: { id: 1, systemName: "server-01" } };
      (ninjaClient.get as vi.Mock).mockResolvedValue(mockResponse);

      const result = await handlers.get("ninja_get_server")!({ device_id: 1 });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe(1);
    });

    it("returns error on failure", async () => {
      (ninjaClient.get as vi.Mock).mockRejectedValue(new Error("API Error"));
      const result = await handlers.get("ninja_get_server")!({ device_id: 1 });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_set_maintenance_mode", () => {
    it("enables maintenance mode on success", async () => {
      (ninjaClient.post as vi.Mock).mockResolvedValue({ data: {} });
      const result = await handlers.get("ninja_set_maintenance_mode")!({
        device_id: 1,
        enabled: true,
      });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.maintenance).toBe(true);
      expect(ninjaClient.post).toHaveBeenCalledWith("/device/1/maintenance", expect.any(Object));
    });

    it("disables maintenance mode on success", async () => {
      (ninjaClient.delete as vi.Mock).mockResolvedValue({ data: {} });
      const result = await handlers.get("ninja_set_maintenance_mode")!({
        device_id: 1,
        enabled: false,
      });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.maintenance).toBe(false);
      expect(ninjaClient.delete).toHaveBeenCalledWith("/device/1/maintenance");
    });

    it("returns error on failure", async () => {
      (ninjaClient.post as vi.Mock).mockRejectedValue(new Error("API Error"));
      const result = await handlers.get("ninja_set_maintenance_mode")!({
        device_id: 1,
        enabled: true,
      });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_run_script", () => {
    it("runs a script on success", async () => {
        (ninjaClient.post as vi.Mock).mockResolvedValue({ data: { "jobId": "12345" } });
        const result = await handlers.get("ninja_run_script")!({ device_id: 1, script_id: 100 });
        expect((result as any).isError).toBeUndefined();
        expect(ninjaClient.post).toHaveBeenCalledWith("/device/1/script/run", expect.any(Object));
    });

    it("returns error on failure", async () => {
        (ninjaClient.post as vi.Mock).mockRejectedValue(new Error("API Error"));
        const result = await handlers.get("ninja_run_script")!({ device_id: 1, script_id: 100 });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_reset_alert", () => {
    it("resets an alert on success", async () => {
        (ninjaClient.delete as vi.Mock).mockResolvedValue({ data: {} });
        const result = await handlers.get("ninja_reset_alert")!({ alert_uid: "alert-123" });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.dismissed).toBe(true);
        expect(ninjaClient.delete).toHaveBeenCalledWith("/alert/alert-123");
    });

    it("returns error on failure", async () => {
        (ninjaClient.delete as vi.Mock).mockRejectedValue(new Error("API Error"));
        const result = await handlers.get("ninja_reset_alert")!({ alert_uid: "alert-123" });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_list_alerts", () => {
    it("returns alerts on success", async () => {
      const mockResponse = { data: [{ id: 'alert-1', message: 'CPU high'}] };
      (ninjaClient.get as vi.Mock).mockResolvedValue(mockResponse);

      const result = await handlers.get("ninja_list_alerts")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.alerts[0].id).toBe('alert-1');
    });

    it("returns error on failure", async () => {
      (ninjaClient.get as vi.Mock).mockRejectedValue(new Error("API Error"));
      const result = await handlers.get("ninja_list_alerts")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("ninja_get_device_health", () => {
    it("returns device health on success", async () => {
      const mockResponse = { data: { results: [{ deviceId: 1, healthStatus: 'HEALTHY'}]} };
      (ninjaClient.get as vi.Mock).mockResolvedValue(mockResponse);

      const result = await handlers.get("ninja_get_device_health")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.devices[0].deviceId).toBe(1);
    });

    it("returns error on failure", async () => {
      (ninjaClient.get as vi.Mock).mockRejectedValue(new Error("API Error"));
      const result = await handlers.get("ninja_get_device_health")!({});
      expect((result as any).isError).toBe(true);
    });
  });
});
