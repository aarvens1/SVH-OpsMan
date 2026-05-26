import fs from "fs";
import path from "path";

export function dateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getStagingDir(baseDir: string, date: string): string {
  return path.join(baseDir, date);
}

export function ensureStagingDir(baseDir: string, date: string): string {
  const dir = getStagingDir(baseDir, date);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeStagingFile(dir: string, filename: string, data: unknown): void {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function readStagingFile<T = unknown>(dir: string, filename: string): T | null {
  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function latestStagingDir(baseDir: string): string | null {
  if (!fs.existsSync(baseDir)) return null;
  const dates = fs
    .readdirSync(baseDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  return dates[0] ? path.join(baseDir, dates[0]) : null;
}

export function purgeStagingDir(baseDir: string, date: string): void {
  const dir = getStagingDir(baseDir, date);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
