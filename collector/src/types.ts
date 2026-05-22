export type JobStatus = "ok" | "failed" | "skipped";

export interface JobResult {
  job: string;
  files: string[];
  status: JobStatus;
  timestamp: string;
  duration_ms: number;
  records?: number;
  error?: string;
}

export interface Manifest {
  date: string;
  collected_at: string;
  duration_ms: number;
  jobs: JobResult[];
}

export interface Job {
  readonly name: string;
  run(stagingDir: string): Promise<{ files: string[]; records: number }>;
}

export interface RunLogEntry {
  timestamp: string;
  type: "gather" | "watch";
  sources_attempted: number;
  sources_failed: number;
  duration_ms: number;
  note_path?: string;
}

// Metrics written to the time-series DB after each gather run

export interface DeviceMetricRow {
  timestamp: string;
  device_id: string;
  metric: string;
  value: number;
}

export interface AlertCountRow {
  timestamp: string;
  source: string;
  severity: string;
  count: number;
}

export interface DiskUsageRow {
  timestamp: string;
  device_id: string;
  used_pct: number;
}

export interface ComplianceRow {
  timestamp: string;
  device_id: string;
  status: string;
}

export interface PatchLagRow {
  timestamp: string;
  device_id: string;
  days_overdue: number;
}

export interface AuthFailureRow {
  timestamp: string;
  source: string;
  count: number;
}
