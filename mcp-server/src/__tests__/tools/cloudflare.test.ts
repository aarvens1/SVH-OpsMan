import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCloudflareTools } from "../../tools/cloudflare.js";
import axios from "axios";

vi.mock("axios");

const mockAxios = axios as vi.Mocked<typeof axios>;

describe("registerCloudflareTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, CLOUDFLARE_API_TOKEN: "fake-token" };

    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });

    const mockGet = vi.fn();
    mockAxios.create.mockReturnValue({ get: mockGet } as any);

    // Reregister tools to pickup mocked env and axios
    const { registerCloudflareTools } = require("../../tools/cloudflare.js");
    registerCloudflareTools(server, true);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("returns cfgErr if token is not set", async () => {
    process.env["CLOUDFLARE_API_TOKEN"] = "";
    // Need to re-register to pick up the changed env var
    const { registerCloudflareTools: register } = require("../../tools/cloudflare.js");
    register(server, true);
    const handler = handlers.get("cloudflare_list_zones")!;
    const result = await handler({});
    expect((result as any).isError).toBe(true);
    expect((result as any).content[0].text).toContain("not configured");
  });

  describe("cloudflare_list_zones", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: { result: [{ id: "zone1", name: "example.com" }] } });

      const result = await handlers.get("cloudflare_list_zones")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.zones[0]).toHaveProperty("name", "example.com");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("cloudflare_list_zones")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("cloudflare_list_dns_records", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: { result: [{ id: "rec1", name: "sub.example.com" }] } });

      const result = await handlers.get("cloudflare_list_dns_records")!({ zone_id: "zone1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.records[0]).toHaveProperty("name", "sub.example.com");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("cloudflare_list_dns_records")!({ zone_id: "zone1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("cloudflare_get_zone_analytics", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: { result: { totals: { requests: { all: 100 } } } } });

      const result = await handlers.get("cloudflare_get_zone_analytics")!({ zone_id: "zone1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.requests).toHaveProperty("all", 100);
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("cloudflare_get_zone_analytics")!({ zone_id: "zone1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("cloudflare_list_firewall_events", () => {
    it("returns shaped data on success", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockResolvedValueOnce({ data: { result: [{ ray_id: "abc", action: "block" }] } });

      const result = await handlers.get("cloudflare_list_firewall_events")!({ zone_id: "zone1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.events[0]).toHaveProperty("action", "block");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(axios.create().get);
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("cloudflare_list_firewall_events")!({ zone_id: "zone1" });
      expect((result as any).isError).toBe(true);
    });
  });
});
