export const RUN_LOG_SCHEMA = `
CREATE TABLE IF NOT EXISTS runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp         TEXT NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('gather', 'watch')),
  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_failed    INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  note_path         TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_timestamp ON runs (timestamp);
`;

export const METRICS_SCHEMA = `
CREATE TABLE IF NOT EXISTS device_metrics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp  TEXT NOT NULL,
  device_id  TEXT NOT NULL,
  metric     TEXT NOT NULL,
  value      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dm_device_metric ON device_metrics (device_id, metric, timestamp);

CREATE TABLE IF NOT EXISTS alert_counts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  source    TEXT NOT NULL,
  severity  TEXT NOT NULL,
  count     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ac_source ON alert_counts (source, timestamp);

CREATE TABLE IF NOT EXISTS compliance (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  device_id TEXT NOT NULL,
  status    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comp_device ON compliance (device_id, timestamp);

CREATE TABLE IF NOT EXISTS disk_usage (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  device_id TEXT NOT NULL,
  used_pct  REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_disk_device ON disk_usage (device_id, timestamp);

CREATE TABLE IF NOT EXISTS auth_failures (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  source    TEXT NOT NULL,
  count     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_source ON auth_failures (source, timestamp);

CREATE TABLE IF NOT EXISTS patch_lag (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp    TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  days_overdue INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patch_device ON patch_lag (device_id, timestamp);
`;
