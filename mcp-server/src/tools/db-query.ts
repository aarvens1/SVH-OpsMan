import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { ok, err } from "../utils/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function getDbDir(): string {
  return process.env["DB_DIR"] ?? path.join(repoRoot, "db");
}

async function executeSql(sqlQuery: string): Promise<Record<string, unknown>[]> {
  const dbPath = path.join(getDbDir(), "metrics.db");
  if (!fs.existsSync(dbPath)) {
    throw new Error("Metrics database not found. Run collector gather first.");
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    const rows = db.prepare(sqlQuery).all() as Record<string, unknown>[];
    return rows;
  } finally {
    db.close();
  }
}

export function registerDbQueryTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "db_query_execute_sql",
    {
      description: "Executes a read-only SQL query against the metrics database (db/metrics.db).",
      inputSchema: z.object({
        sqlQuery: z.string().describe("The SQL query to execute. Must be read-only (SELECT statements)."),
      }),
      outputSchema: z.object({
        rows: z.array(z.record(z.any())).describe("The results of the SQL query as an array of objects."),
      }),
    },
    async ({ sqlQuery }: { sqlQuery: string }) => {
      try {
        const rows = await executeSql(sqlQuery);
        return ok({ rows });
      } catch (e) {
        return err(e);
      }
    }
  );
}
