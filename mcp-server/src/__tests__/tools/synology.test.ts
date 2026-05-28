import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSynologyTools } from "../../tools/synology.js";
import axios from "axios";

vi.mock("axios");

const mockedAxios = vi.mocked(axios, true);

describe("registerSynologyTools", () => {
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

    process.env.SYNOLOGY_HOST = "https://syno.example.com";
    process.env.SYNOLOGY_USER = "user";
    process.env.SYNOLOGY_PASSWORD = "password";

    // Mock successful login
    mockedAxios.get.mockImplementation(async (url: string) => {
        if (url.includes("auth.cgi")) {
            return { data: { data: { sid: "fake-sid" }, success: true } };
        }
        if (url.includes("entry.cgi")) {
            return { data: { data: {}, success: true } };
        }
        return { data: {} };
    });

    registerSynologyTools(server, true);
  });

  afterEach(() => {
    delete process.env.SYNOLOGY_HOST;
    delete process.env.SYNOLOGY_USER;
    delete process.env.SYNOLOGY_PASSWORD;
  });

  describe("synology_m365_backup_status", () => {
    it("returns backup status on success", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { data: { task_list: [{ task_id: 1 }] }, success: true } });
      const result = await handlers.get("synology_m365_backup_status")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.tasks).toHaveLength(1);
    });

    it("returns error on API failure", async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { success: false, error: { code: 500 } } });
      const result = await handlers.get("synology_m365_backup_status")!({});
      expect((result as any).isError).toBe(true);
    });

    it("returns config error if host is not set", async () => {
        delete process.env.SYNOLOGY_HOST;
        const result = await handlers.get("synology_m365_backup_status")!({});
        expect((result as any).isError).toBe(true);
        expect((result as any).content[0].text).toContain("not configured");
    });
  });

  describe("synology_m365_backup_logs", () => {
    it("returns logs on success", async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: { data: { log_list: [{ log_id: 1 }] }, success: true } });
        const result = await handlers.get("synology_m365_backup_logs")!({});
        expect((result as any).isError).toBeUndefined();
    });

    it("returns error on failure", async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: { success: false, error: { code: 500 } } });
        const result = await handlers.get("synology_m365_backup_logs")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("synology_storage_info", () => {
    it("returns storage info on success", async () => {
        mockedAxios.get
            .mockResolvedValueOnce({ data: { data: { storages: [{ id: 'pool1' }] }, success: true } })
            .mockResolvedValueOnce({ data: { data: { volumes: [{ id: 'vol1' }] }, success: true } });
        const result = await handlers.get("synology_storage_info")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.pools[0].id).toBe('pool1');
        expect(parsed.volumes[0].id).toBe('vol1');
    });

    it("returns error on failure", async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: { success: false, error: { code: 500 } } });
        const result = await handlers.get("synology_storage_info")!({});
        expect((result as any).isError).toBe(true);
    });
  });
});
