import path from "path";
import { writeStagingFile, readStagingFile } from "./staging.js";
import type { JobResult, Manifest } from "./types.js";

const MANIFEST_FILE = "manifest.json";

export function writeManifest(stagingDir: string, date: string, jobs: JobResult[], totalMs: number): Manifest {
  const manifest: Manifest = {
    date,
    collected_at: new Date().toISOString(),
    duration_ms: totalMs,
    jobs,
  };
  writeStagingFile(stagingDir, MANIFEST_FILE, manifest);
  return manifest;
}

export function readManifest(stagingDir: string): Manifest | null {
  return readStagingFile<Manifest>(stagingDir, MANIFEST_FILE);
}

export function manifestSummary(manifest: Manifest): string {
  const ok = manifest.jobs.filter((j) => j.status === "ok").length;
  const failed = manifest.jobs.filter((j) => j.status === "failed").length;
  const total = manifest.jobs.length;
  return `${ok}/${total} jobs ok${failed > 0 ? `, ${failed} failed` : ""} — collected ${manifest.collected_at}`;
}
