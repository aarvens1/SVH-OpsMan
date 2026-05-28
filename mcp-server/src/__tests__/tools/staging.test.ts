import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStagingTools } from "../../tools/staging.js";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import Database from "better-sqlite3";

vi.mock("fs");
vi.mock("child_process");
vi.mock("better-sqlite3");

const mockedFs = vi.mocked(fs);
const mockedSpawn = vi.mocked(spawn);
const mockedDatabase = vi.mocked(Database);

describe("registerStagingTools", () => {
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
    registerStagingTools(server, true);
  });

  describe("staging_status", () => {
    it("returns fresh status on success", async () => {
      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue(["2024-01-01"] as any);
      mockedFs.readFileSync.mockReturnValue(JSON.stringify({ collected_at: new Date().toISOString(), jobs: [] }));
      const result = await handlers.get("staging_status")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.fresh).toBe(true);
    });
    it("returns error on failure", async () => {
        mockedFs.existsSync.mockImplementation(() => { throw new Error("FS Error")});
        const result = await handlers.get("staging_status")!({});
        expect((result as any).isError).toBe(true);
      });
  });

  describe("staging_read", () => {
    it("reads a file on success", async () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readdirSync.mockReturnValue(["2024-01-01"] as any);
        mockedFs.readFileSync.mockReturnValue(JSON.stringify([{id: 1}]));
        const result = await handlers.get("staging_read")!({ file: 'graph-mail' });
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.data[0].id).toBe(1);
    });
    it("returns error on failure", async () => {
        mockedFs.existsSync.mockReturnValue(false);
        const result = await handlers.get("staging_read")!({ file: 'graph-mail' });
        expect((result as any).isError).toBeUndefined(); // Returns ok({error:...})
        expect((result as any).content[0].text).toContain("No staging data");
    });
  });

  describe("collector_run", () => {
    it("runs collector on success", async () => {
        const mockChild = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn((event, cb) => cb(0)) };
        mockedSpawn.mockReturnValue(mockChild as any);
        const result = await handlers.get("collector_run")!({});
        expect((result as any).isError).toBeUndefined();
        const parsed = JSON.parse((result as any).content[0].text);
        expect(parsed.success).toBe(true);
    });
    it("returns error on failure", async () => {
        mockedSpawn.mockImplementation(() => { throw new Error("Spawn error") });
        const result = await handlers.get("collector_run")!({});
        expect((result as any).isError).toBe(true);
    });
  });

  describe("metrics_disk_trend", () => {
    it("returns trend on success", async () => {
        const mockDb = { prepare: vi.fn().mockReturnThis(), all: vi.fn().mockReturnValue([]), close: vi.fn() };
        mockedDatabase.mockReturnValue(mockDb as any);
        mockedFs.existsSync.mockReturnValue(true);
        const result = await handlers.get("metrics_disk_trend")!({ device_id: 'dev1', days: 7 });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on db failure", async () => {
        mockedDatabase.mockImplementation(() => { throw new Error("DB Error") });
        mockedFs.existsSync.mockReturnValue(true);
        const result = await handlers.get("metrics_disk_trend")!({ device_id: 'dev1', days: 7 });
        expect((result as any).isError).toBe(true);
    });
  });

});
