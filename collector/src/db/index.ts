import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { RUN_LOG_SCHEMA, METRICS_SCHEMA } from "./schema.js";

let runDb: Database.Database | null = null;
let metricsDb: Database.Database | null = null;

export function getRunDb(dbDir: string): Database.Database {
  if (runDb) return runDb;
  fs.mkdirSync(dbDir, { recursive: true });
  runDb = new Database(path.join(dbDir, "runs.db"));
  runDb.pragma("journal_mode = WAL");
  runDb.exec(RUN_LOG_SCHEMA);
  return runDb;
}

export function getMetricsDb(dbDir: string): Database.Database {
  if (metricsDb) return metricsDb;
  fs.mkdirSync(dbDir, { recursive: true });
  metricsDb = new Database(path.join(dbDir, "metrics.db"));
  metricsDb.pragma("journal_mode = WAL");
  metricsDb.exec(METRICS_SCHEMA);
  return metricsDb;
}

export function closeAll(): void {
  runDb?.close();
  metricsDb?.close();
  runDb = null;
  metricsDb = null;
}
