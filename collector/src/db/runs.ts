import type Database from "better-sqlite3";
import type { RunLogEntry } from "../types.js";

export function insertRun(db: Database.Database, entry: RunLogEntry): number {
  const stmt = db.prepare(`
    INSERT INTO runs (timestamp, type, sources_attempted, sources_failed, duration_ms, note_path)
    VALUES (@timestamp, @type, @sources_attempted, @sources_failed, @duration_ms, @note_path)
  `);
  const result = stmt.run(entry);
  return result.lastInsertRowid as number;
}

export function getRecentRuns(db: Database.Database, limit = 20): RunLogEntry[] {
  return db
    .prepare("SELECT * FROM runs ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as RunLogEntry[];
}

export function getLastSuccessfulGather(db: Database.Database): RunLogEntry | null {
  return (
    (db
      .prepare("SELECT * FROM runs WHERE type = 'gather' AND sources_failed = 0 ORDER BY timestamp DESC LIMIT 1")
      .get() as RunLogEntry | undefined) ?? null
  );
}

export function getRunStats(db: Database.Database, type: "gather" | "watch", days = 7): {
  total: number;
  failed: number;
  avg_duration_ms: number;
} {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN sources_failed > 0 THEN 1 ELSE 0 END) as failed,
         AVG(duration_ms) as avg_duration_ms
       FROM runs
       WHERE type = ? AND timestamp > ?`
    )
    .get(type, since) as { total: number; failed: number; avg_duration_ms: number };
  return row;
}
