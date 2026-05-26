import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

function env(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined) {
    throw new Error(`[collector] Required env var ${key} is not set — check BW_SESSION is active`);
  }
  return v;
}

function optionalEnv(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

type ConfigShape = {
  graph: { tenantId: string; clientId: string; clientSecret: string; userId: string };
  ninja: { clientId: string; clientSecret: string };
  wazuh: { url: string; username: string; password: string };
  unifi: { apiKey: string };
  planner: { planId: string };
  paths: { stagingDir: string; dbDir: string };
};

let _config: ConfigShape | undefined;

export function getConfig(): ConfigShape {
  if (!_config) {
    _config = {
      graph: {
        tenantId: env("GRAPH_TENANT_ID"),
        clientId: env("GRAPH_CLIENT_ID"),
        clientSecret: env("GRAPH_CLIENT_SECRET"),
        userId: env("GRAPH_USER_ID"),
      },
      ninja: {
        clientId: env("NINJA_CLIENT_ID"),
        clientSecret: env("NINJA_CLIENT_SECRET"),
      },
      wazuh: {
        url: optionalEnv("WAZUH_URL"),
        username: optionalEnv("WAZUH_USERNAME"),
        password: optionalEnv("WAZUH_PASSWORD"),
      },
      unifi: {
        apiKey: optionalEnv("UNIFI_API_KEY"),
      },
      planner: {
        planId: optionalEnv("PLANNER_PLAN_ID", "-aZEdilGAUqLC8B8GwOLfmQAAh9M"),
      },
      paths: {
        stagingDir: optionalEnv("STAGING_DIR", path.join(repoRoot, "staging")),
        dbDir: optionalEnv("DB_DIR", path.join(repoRoot, "db")),
      },
    };
  }
  return _config;
}

export type Config = ConfigShape;
