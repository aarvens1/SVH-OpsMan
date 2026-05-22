import "dotenv/config";
import { config } from "./config.js";
import { dateString, ensureStagingDir } from "./staging.js";
import { writeManifest, manifestSummary } from "./manifest.js";
import { getRunDb, getMetricsDb, closeAll } from "./db/index.js";
import { insertRun } from "./db/runs.js";
import { runWatch } from "./watch/index.js";
import { graphJob } from "./jobs/graph.js";
import { ninjaJob } from "./jobs/ninjaone.js";
import { wazuhJob } from "./jobs/wazuh.js";
import { unifiJob } from "./jobs/unifi.js";
import { plannerJob } from "./jobs/planner.js";
import type { Job } from "./jobs/base.js";
import type { JobResult } from "./types.js";

const ALL_JOBS: Job[] = [graphJob, ninjaJob, wazuhJob, unifiJob, plannerJob];

async function runGather(jobFilter?: string): Promise<void> {
  const start = Date.now();
  const date = dateString();
  const stagingDir = ensureStagingDir(config.paths.stagingDir, date);
  const runDb = getRunDb(config.paths.dbDir);

  const jobs = jobFilter
    ? ALL_JOBS.filter((j) => j.name === jobFilter)
    : ALL_JOBS;

  if (jobFilter && jobs.length === 0) {
    console.error(`[gather] Unknown job: ${jobFilter}. Available: ${ALL_JOBS.map((j) => j.name).join(", ")}`);
    process.exit(1);
  }

  console.error(`[gather] Starting — ${jobs.map((j) => j.name).join(", ")}`);

  const results: JobResult[] = [];

  for (const job of jobs) {
    const jobStart = Date.now();
    try {
      const { files, records } = await job.run(stagingDir);
      results.push({
        job: job.name,
        files,
        status: "ok",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - jobStart,
        records,
      });
      console.error(`[gather] ${job.name} — ok (${records} records, ${Date.now() - jobStart}ms)`);
    } catch (err) {
      results.push({
        job: job.name,
        files: [],
        status: "failed",
        timestamp: new Date().toISOString(),
        duration_ms: Date.now() - jobStart,
        error: err instanceof Error ? err.message : String(err),
      });
      console.error(`[gather] ${job.name} — FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalMs = Date.now() - start;
  const manifest = writeManifest(stagingDir, date, results, totalMs);
  console.error(`[gather] ${manifestSummary(manifest)}`);

  const failed = results.filter((r) => r.status === "failed").length;
  insertRun(runDb, {
    timestamp: new Date().toISOString(),
    type: "gather",
    sources_attempted: jobs.length,
    sources_failed: failed,
    duration_ms: totalMs,
  });

  if (failed > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;

  try {
    switch (command) {
      case "gather": {
        const jobFlag = args.find((a) => a.startsWith("--job="));
        const jobFilter = jobFlag ? jobFlag.slice("--job=".length) : undefined;
        await runGather(jobFilter);
        // Run watch automatically after a successful full gather
        if (!jobFilter) {
          const runDb = getRunDb(config.paths.dbDir);
          const metricsDb = getMetricsDb(config.paths.dbDir);
          await runWatch(config.paths.stagingDir, runDb, metricsDb);
        }
        break;
      }
      case "watch": {
        const runDb = getRunDb(config.paths.dbDir);
        const metricsDb = getMetricsDb(config.paths.dbDir);
        await runWatch(config.paths.stagingDir, runDb, metricsDb);
        break;
      }
      case "health": {
        // Quick connectivity check — try to get a token from each configured service
        console.log("health check not yet implemented");
        break;
      }
      default: {
        console.error("Usage: collector <gather|watch|health> [--job=<name>]");
        console.error(`  gather          Run all collection jobs`);
        console.error(`  gather --job=X  Run a specific job (${ALL_JOBS.map((j) => j.name).join("|")})`);
        console.error(`  watch           Write metrics from latest staging data`);
        console.error(`  health          Check connector status`);
        process.exit(1);
      }
    }
  } finally {
    closeAll();
  }
}

main().catch((err) => {
  console.error("[collector] Fatal:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
