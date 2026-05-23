import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { ok, err } from "../utils/response.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function getStagingBase(): string {
  return process.env["STAGING_DIR"] ?? path.join(repoRoot, "staging");
}

function getDbDir(): string {
  return process.env["DB_DIR"] ?? path.join(repoRoot, "db");
}

function latestStagingDir(): { dir: string; date: string } | null {
  const base = getStagingBase();
  if (!fs.existsSync(base)) return null;
  const dates = fs
    .readdirSync(base)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  if (!dates[0]) return null;
  return { dir: path.join(base, dates[0]), date: dates[0] };
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

type A = Record<string, unknown>;

const STAGING_FILES = [
  "graph-mail",
  "graph-calendar",
  "graph-audit",
  "graph-alerts",
  "ninja-devices",
  "ninja-alerts",
  "wazuh-alerts",
  "unifi-alerts",
  "planner-tasks",
] as const;

type StagingFile = (typeof STAGING_FILES)[number];

export function registerStagingTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  // ── Status ─────────────────────────────────────────────────────────────────

  server.registerTool(
    "staging_status",
    {
      description:
        "Check whether staging data is fresh. Returns the collection timestamp, age in minutes, " +
        "and per-job status. Always call this before reading staging files or synthesizing a Day Starter.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const latest = latestStagingDir();
        if (!latest) {
          return ok({ fresh: false, message: "No staging data found — run collector_run to collect." });
        }

        const manifestPath = path.join(latest.dir, "manifest.json");
        const manifest = readJson<A>(manifestPath);
        if (!manifest) {
          return ok({ fresh: false, date: latest.date, message: "Manifest missing — staging may be incomplete." });
        }

        const collectedAt = new Date(manifest["collected_at"] as string);
        const ageMinutes = Math.round((Date.now() - collectedAt.getTime()) / 60_000);
        const stale = ageMinutes > 120;

        const jobs = ((manifest["jobs"] as A[]) ?? []).map((j) => ({
          job: j["job"],
          status: j["status"],
          records: j["records"],
          error: j["error"],
          duration_ms: j["duration_ms"],
        }));

        return ok({
          fresh: !stale,
          stale,
          date: latest.date,
          collected_at: manifest["collected_at"],
          age_minutes: ageMinutes,
          duration_ms: manifest["duration_ms"],
          jobs,
          note: stale
            ? "Staging is stale (>2h old). Use collector_run to refresh before synthesizing."
            : undefined,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Read ───────────────────────────────────────────────────────────────────

  server.registerTool(
    "staging_read",
    {
      description:
        "Read a staged data file from the latest collection run. " +
        "Use staging_status first to confirm the data is fresh. " +
        "Files: graph-mail (inbox last 24h), graph-calendar (next 7 days), " +
        "graph-audit (tenant changes last 24h — who changed what), " +
        "graph-alerts (M365 security alerts), ninja-devices (all managed devices), " +
        "ninja-alerts (active NinjaOne alerts, maintenance-mode filtered), " +
        "wazuh-alerts, unifi-alerts, planner-tasks (open IT Sysadmin Tasks).",
      inputSchema: z.object({
        file: z
          .enum(STAGING_FILES)
          .describe("Staging file to read"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max records to return (default: all)"),
      }),
    },
    async ({ file, limit }) => {
      try {
        const latest = latestStagingDir();
        if (!latest) return ok({ error: "No staging data — run collector_run first." });

        const data = readJson<unknown[]>(path.join(latest.dir, `${file}.json`));
        if (data === null) {
          return ok({
            error: `${file}.json not found in staging. Check staging_status for job failures.`,
          });
        }

        const records = Array.isArray(data) ? data : [data];
        const result = limit ? records.slice(0, limit) : records;

        return ok({
          file,
          date: latest.date,
          total: records.length,
          returned: result.length,
          data: result,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Trigger collector ──────────────────────────────────────────────────────

  server.registerTool(
    "collector_run",
    {
      description:
        "Run the data collector to refresh staging. " +
        "Use when staging_status shows stale or missing data. " +
        "Runs all jobs by default; optionally run a single job. " +
        "Blocks until collection completes (typically 30–90s).",
      inputSchema: z.object({
        job: z
          .enum(["graph", "ninjaone", "wazuh", "unifi", "planner"])
          .optional()
          .describe("Run a single job instead of all jobs"),
      }),
    },
    async ({ job }) => {
      try {
        const collectorIndex = path.join(repoRoot, "collector/src/index.ts");
        const args = ["tsx", collectorIndex, "gather"];
        if (job) args.push(`--job=${job}`);

        const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

        const result = await new Promise<{ stdout: string; stderr: string; code: number }>(
          (resolve) => {
            const child = spawn("npx", args, {
              cwd: path.join(repoRoot, "collector"),
              env: { ...process.env },
            });

            let stdout = "";
            let stderr = "";
            let timedOut = false;

            const timeout = setTimeout(() => {
              timedOut = true;
              child.kill("SIGTERM");
            }, TIMEOUT_MS);

            child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
            child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
            child.on("close", (code) => {
              clearTimeout(timeout);
              resolve({ stdout, stderr, code: timedOut ? 124 : (code ?? 1) });
            });
          }
        );

        const logLines = result.stderr
          .split("\n")
          .filter((l) => l.trim())
          .slice(-20);

        if (result.code !== 0) {
          return ok({
            success: false,
            exit_code: result.code,
            log: logLines,
            note: result.code === 124
              ? "Collector timed out after 5 minutes — check if collector/.env is populated."
              : "Collection completed with errors — check staging_status for per-job details.",
          });
        }

        return ok({ success: true, log: logLines });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Metrics queries ────────────────────────────────────────────────────────

  server.registerTool(
    "metrics_disk_trend",
    {
      description:
        "Query disk usage history for a device from the metrics database. " +
        "Use device:volume format (e.g. 'SVH-SQL01:C:'). " +
        "Useful for detecting gradual disk growth before it becomes an incident.",
      inputSchema: z.object({
        device_id: z.string().describe("Device name or device:volume (e.g. SVH-SQL01:C:)"),
        days: z.number().int().min(1).max(90).default(7).describe("Days of history to return"),
      }),
    },
    async ({ device_id, days }) => {
      try {
        const dbPath = path.join(getDbDir(), "metrics.db");
        if (!fs.existsSync(dbPath)) {
          return ok({ error: "Metrics database not found — run collector gather first." });
        }

        const db = new Database(dbPath, { readonly: true });
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        const rows = db
          .prepare(
            "SELECT timestamp, device_id, used_pct FROM disk_usage WHERE device_id LIKE ? AND timestamp > ? ORDER BY timestamp"
          )
          .all(`${device_id}%`, since) as { timestamp: string; device_id: string; used_pct: number }[];

        db.close();

        if (rows.length === 0) {
          return ok({ device_id, days, message: "No data found for this device in the metrics DB." });
        }

        const latest = rows[rows.length - 1];
        const oldest = rows[0];
        const drift =
          latest && oldest ? (latest.used_pct - oldest.used_pct).toFixed(1) : null;

        return ok({
          device_id,
          days,
          points: rows.length,
          latest_used_pct: latest?.used_pct,
          drift_pct: drift !== null ? `${drift}% over ${days} days` : null,
          history: rows,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "metrics_alert_trend",
    {
      description:
        "Query alert count history for a source from the metrics database. " +
        "Sources: ninjaone, wazuh, unifi. " +
        "Useful for detecting alert volume increases that precede incidents.",
      inputSchema: z.object({
        source: z.enum(["ninjaone", "wazuh", "unifi"]).describe("Alert source"),
        days: z.number().int().min(1).max(90).default(7).describe("Days of history"),
      }),
    },
    async ({ source, days }) => {
      try {
        const dbPath = path.join(getDbDir(), "metrics.db");
        if (!fs.existsSync(dbPath)) {
          return ok({ error: "Metrics database not found — run collector gather first." });
        }

        const db = new Database(dbPath, { readonly: true });
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        const rows = db
          .prepare(
            "SELECT timestamp, severity, count FROM alert_counts WHERE source = ? AND timestamp > ? ORDER BY timestamp"
          )
          .all(source, since) as { timestamp: string; severity: string; count: number }[];

        db.close();
        return ok({ source, days, points: rows.length, history: rows });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "metrics_disk_over_threshold",
    {
      description:
        "List devices with disk usage at or above a threshold, based on the most recent metrics reading. " +
        "Use this as the first check in a Day Starter or Posture Watch to surface disk pressure.",
      inputSchema: z.object({
        threshold_pct: z
          .number()
          .min(1)
          .max(100)
          .default(80)
          .describe("Alert threshold percentage (default 80)"),
      }),
    },
    async ({ threshold_pct }) => {
      try {
        const dbPath = path.join(getDbDir(), "metrics.db");
        if (!fs.existsSync(dbPath)) {
          return ok({ error: "Metrics database not found — run collector gather first." });
        }

        const db = new Database(dbPath, { readonly: true });
        const rows = db
          .prepare(
            `SELECT d1.device_id, d1.used_pct, d1.timestamp
             FROM disk_usage d1
             INNER JOIN (
               SELECT device_id, MAX(timestamp) as latest
               FROM disk_usage GROUP BY device_id
             ) d2 ON d1.device_id = d2.device_id AND d1.timestamp = d2.latest
             WHERE d1.used_pct >= ?
             ORDER BY d1.used_pct DESC`
          )
          .all(threshold_pct) as { device_id: string; used_pct: number; timestamp: string }[];

        db.close();
        return ok({ threshold_pct, count: rows.length, devices: rows });
      } catch (e) {
        return err(e);
      }
    }
  );
}
