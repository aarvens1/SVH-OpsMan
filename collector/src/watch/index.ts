import type Database from "better-sqlite3";
import { latestStagingDir, readStagingFile } from "../staging.js";
import {
  insertDiskUsage,
  insertAlertCounts,
  insertComplianceRows,
} from "../db/metrics.js";
import { insertRun } from "../db/runs.js";
import type { DiskUsageRow, AlertCountRow, ComplianceRow } from "../types.js";

type A = Record<string, unknown>;

function nowIso(): string {
  return new Date().toISOString();
}

function extractDiskUsage(devices: A[]): DiskUsageRow[] {
  const rows: DiskUsageRow[] = [];
  const ts = nowIso();

  for (const d of devices) {
    const deviceId = String(d["displayName"] ?? d["id"]);
    const volumes = d["volumes"];
    if (!Array.isArray(volumes)) continue;

    for (const v of volumes as A[]) {
      const total = Number(v["totalSpace"] ?? v["capacity"] ?? 0);
      const free = Number(v["freeSpace"] ?? v["available"] ?? 0);
      if (total > 0) {
        const usedPct = ((total - free) / total) * 100;
        rows.push({ timestamp: ts, device_id: `${deviceId}:${String(v["name"] ?? v["letter"] ?? "")}`, used_pct: usedPct });
      }
    }
  }

  return rows;
}

function extractAlertCounts(
  ninjaAlerts: A[],
  wazuhAlerts: A[],
  unifiAlerts: A[]
): AlertCountRow[] {
  const ts = nowIso();
  const rows: AlertCountRow[] = [];

  // NinjaOne
  const ninjaBySeverity = new Map<string, number>();
  for (const a of ninjaAlerts) {
    const sev = String(a["severity"] ?? "UNKNOWN").toUpperCase();
    ninjaBySeverity.set(sev, (ninjaBySeverity.get(sev) ?? 0) + 1);
  }
  for (const [severity, count] of ninjaBySeverity) {
    rows.push({ timestamp: ts, source: "ninjaone", severity, count });
  }

  // Wazuh
  const wazuhBySeverity = new Map<string, number>();
  for (const a of wazuhAlerts) {
    const level = Number(a["rule.level"] ?? a["level"] ?? 0);
    const severity = level >= 12 ? "CRITICAL" : level >= 7 ? "HIGH" : level >= 4 ? "MEDIUM" : "LOW";
    wazuhBySeverity.set(severity, (wazuhBySeverity.get(severity) ?? 0) + 1);
  }
  for (const [severity, count] of wazuhBySeverity) {
    rows.push({ timestamp: ts, source: "wazuh", severity, count });
  }

  // UniFi
  const unifiCount = unifiAlerts.length;
  if (unifiCount > 0) {
    rows.push({ timestamp: ts, source: "unifi", severity: "UNKNOWN", count: unifiCount });
  }

  return rows;
}

function extractCompliance(devices: A[]): ComplianceRow[] {
  const ts = nowIso();
  return devices
    .filter((d) => d["complianceStatus"] !== undefined)
    .map((d) => ({
      timestamp: ts,
      device_id: String(d["displayName"] ?? d["id"]),
      status: String(d["complianceStatus"]),
    }));
}

export async function runWatch(
  stagingBaseDir: string,
  runDb: Database.Database,
  metricsDb: Database.Database
): Promise<void> {
  const start = Date.now();
  const dir = latestStagingDir(stagingBaseDir);

  if (!dir) {
    console.error("[watch] No staging data found — run 'gather' first");
    return;
  }

  console.error(`[watch] Processing staging dir: ${dir}`);

  const devicesRaw = readStagingFile<A[]>(dir, "ninja-devices.json");
  const ninjaAlertsRaw = readStagingFile<A[]>(dir, "ninja-alerts.json");
  const wazuhData = readStagingFile<{ alerts?: A[] }>(dir, "wazuh-alerts.json");
  const unifiData = readStagingFile<{ alerts?: A[] }>(dir, "unifi-alerts.json");

  const sourcesAttempted = 4;
  const sourcesFailed = [devicesRaw, ninjaAlertsRaw, wazuhData, unifiData].filter((r) => r === null).length;

  const devices = devicesRaw ?? [];
  const ninjaAlerts = ninjaAlertsRaw ?? [];
  const wazuhAlerts = wazuhData?.alerts ?? [];
  const unifiAlerts = unifiData?.alerts ?? [];

  const diskRows = extractDiskUsage(devices);
  const alertRows = extractAlertCounts(ninjaAlerts, wazuhAlerts, unifiAlerts);
  const complianceRows = extractCompliance(devices);

  if (diskRows.length > 0) insertDiskUsage(metricsDb, diskRows);
  if (alertRows.length > 0) insertAlertCounts(metricsDb, alertRows);
  if (complianceRows.length > 0) insertComplianceRows(metricsDb, complianceRows);

  const duration = Date.now() - start;
  insertRun(runDb, {
    timestamp: new Date().toISOString(),
    type: "watch",
    sources_attempted: sourcesAttempted,
    sources_failed: sourcesFailed,
    duration_ms: duration,
  });

  console.error(
    `[watch] Done — disk:${diskRows.length} alerts:${alertRows.length} compliance:${complianceRows.length} sources:${sourcesAttempted - sourcesFailed}/${sourcesAttempted} (${duration}ms)`
  );
}
