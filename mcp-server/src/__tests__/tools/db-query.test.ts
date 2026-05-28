import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDbQueryTools } from "../../tools/db-query.js";
import Database from "better-sqlite3";
import * as fs from "fs";

vi.mock("fs");
vi.mock("better-sqlite3");

const mockDatabase = Database as vi.Mocked<typeof Database>;

describe("registerDbQueryTools", () => {
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
    registerDbQueryTools(server, true);
  });

  describe("db_query_execute_sql", () => {
    it("returns shaped data on success", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockAll = vi.fn().mockReturnValue([{ col1: "val1" }]);
      const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
      mockDatabase.mockReturnValue({ prepare: mockPrepare, close: vi.fn() } as any);

      const result = await handlers.get("db_query_execute_sql")!({ sqlQuery: "SELECT * FROM test" });

      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.rows[0]).toEqual({ col1: "val1" });
      expect(mockDatabase).toHaveBeenCalledWith(expect.stringContaining("metrics.db"), { readonly: true });
      expect(mockPrepare).toHaveBeenCalledWith("SELECT * FROM test");
    });

    it("returns error if database file does not exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = await handlers.get("db_query_execute_sql")!({ sqlQuery: "SELECT * FROM test" });

      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("Metrics database not found");
    });

    it("returns error on SQL execution failure", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const mockAll = vi.fn().mockImplementation(() => {
        throw new Error("SQL error");
      });
      const mockPrepare = vi.fn().mockReturnValue({ all: mockAll });
      mockDatabase.mockReturnValue({ prepare: mockPrepare, close: vi.fn() } as any);

      const result = await handlers.get("db_query_execute_sql")!({ sqlQuery: "SELECT * FROM test" });

      expect((result as any).isError).toBe(true);
      expect((result as any).content[0].text).toContain("SQL error");
    });
  });
});
