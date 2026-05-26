import type Database from "better-sqlite3";
import type {
  AlertCountRow,
  AuthFailureRow,
  ComplianceRow,
  DeviceMetricRow,
  DiskUsageRow,
  PatchLagRow,
} from "../types.js";

export function insertDeviceMetrics(db: Database.Database, rows: DeviceMetricRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO device_metrics (timestamp, device_id, metric, value) VALUES (@timestamp, @device_id, @metric, @value)"
  );
  const insert = db.transaction((items: DeviceMetricRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

export function insertDiskUsage(db: Database.Database, rows: DiskUsageRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO disk_usage (timestamp, device_id, used_pct) VALUES (@timestamp, @device_id, @used_pct)"
  );
  const insert = db.transaction((items: DiskUsageRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

export function insertAlertCounts(db: Database.Database, rows: AlertCountRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO alert_counts (timestamp, source, severity, count) VALUES (@timestamp, @source, @severity, @count)"
  );
  const insert = db.transaction((items: AlertCountRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

export function insertComplianceRows(db: Database.Database, rows: ComplianceRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO compliance (timestamp, device_id, status) VALUES (@timestamp, @device_id, @status)"
  );
  const insert = db.transaction((items: ComplianceRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

export function insertAuthFailures(db: Database.Database, rows: AuthFailureRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO auth_failures (timestamp, source, count) VALUES (@timestamp, @source, @count)"
  );
  const insert = db.transaction((items: AuthFailureRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

export function insertPatchLag(db: Database.Database, rows: PatchLagRow[]): void {
  const stmt = db.prepare(
    "INSERT INTO patch_lag (timestamp, device_id, days_overdue) VALUES (@timestamp, @device_id, @days_overdue)"
  );
  const insert = db.transaction((items: PatchLagRow[]) => {
    for (const row of items) stmt.run(row);
  });
  insert(rows);
}

// Query helpers used by the Watch phase and MCP server

export function getDiskTrend(
  db: Database.Database,
  deviceId: string,
  days = 7
): { timestamp: string; used_pct: number }[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return db
    .prepare("SELECT timestamp, used_pct FROM disk_usage WHERE device_id = ? AND timestamp > ? ORDER BY timestamp")
    .all(deviceId, since) as { timestamp: string; used_pct: number }[];
}

export function getAlertCountTrend(
  db: Database.Database,
  source: string,
  days = 7
): { timestamp: string; severity: string; count: number }[] {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return db
    .prepare(
      "SELECT timestamp, severity, count FROM alert_counts WHERE source = ? AND timestamp > ? ORDER BY timestamp"
    )
    .all(source, since) as { timestamp: string; severity: string; count: number }[];
}

export function getDevicesExceedingDiskThreshold(
  db: Database.Database,
  thresholdPct: number
): { device_id: string; used_pct: number; timestamp: string }[] {
  return db
    .prepare(
      `SELECT d1.device_id, d1.used_pct, d1.timestamp
       FROM disk_usage d1
       INNER JOIN (
         SELECT device_id, MAX(timestamp) as latest
         FROM disk_usage
         GROUP BY device_id
       ) d2 ON d1.device_id = d2.device_id AND d1.timestamp = d2.latest
       WHERE d1.used_pct >= ?
       ORDER BY d1.used_pct DESC`
    )
    .all(thresholdPct) as { device_id: string; used_pct: number; timestamp: string }[];
}
