import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import https from "https";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_CFG_MSG =
  "Synology tools are not configured — set SYNOLOGY_HOST, SYNOLOGY_USER, and SYNOLOGY_PASSWORD in the SVH OpsMan Bitwarden item";

const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

interface SidCache {
  sid: string;
  expires_at: number;
}

let sidCache: SidCache | null = null;

async function getSynologySid(): Promise<string> {
  if (sidCache && Date.now() < sidCache.expires_at) return sidCache.sid;

  const host = process.env["SYNOLOGY_HOST"] ?? "";
  const user = process.env["SYNOLOGY_USER"] ?? "";
  const pass = process.env["SYNOLOGY_PASSWORD"] ?? "";

  const res = await axios.get<A>(`${host}/webapi/auth.cgi`, {
    params: { api: "SYNO.API.Auth", version: 6, method: "login", account: user, passwd: pass, format: "sid" },
    timeout: 15_000,
    httpsAgent: HTTPS_AGENT,
  });

  const data = res.data["data"] as A | undefined;
  const sid = data?.["sid"] as string | undefined;
  if (!sid) throw new Error(`Synology login failed: code=${(res.data["error"] as A | undefined)?.["code"]}`);

  sidCache = { sid, expires_at: Date.now() + 25 * 60 * 1000 };
  return sid;
}

async function dsm(
  host: string,
  api: string,
  version: number,
  method: string,
  extra: Record<string, unknown> = {}
): Promise<A> {
  const sid = await getSynologySid();
  const res = await axios.get<A>(`${host}/webapi/entry.cgi`, {
    params: { api, version, method, _sid: sid, ...extra },
    timeout: 30_000,
    httpsAgent: HTTPS_AGENT,
  });
  if (res.data["success"] === false) {
    throw new Error(`DSM API error code ${(res.data["error"] as A | undefined)?.["code"]}`);
  }
  return (res.data["data"] as A) ?? {};
}

export function registerSynologyTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "synology_m365_backup_status",
    {
      description:
        "Get the status of all Active Backup for Microsoft 365 tasks on the Synology NAS. " +
        "Returns each task name, last run time, last run result, and backup scope.",
      inputSchema: z.object({}),
    },
    async () => {
      const host = process.env["SYNOLOGY_HOST"] ?? "";
      if (!host) return cfgErr(NO_CFG_MSG);
      try {
        const data = await dsm(host, "SYNO.ActiveBackup365.Task", 1, "list");
        const tasks = (data["task_list"] as A[] | undefined) ?? [];
        return ok({
          count: tasks.length,
          tasks: tasks.map((t) => ({
            task_id: t["task_id"],
            task_name: t["task_name"],
            enabled: t["enabled"],
            status: t["status"],
            last_bkp_time: t["last_bkp_time"],
            last_bkp_result: t["last_bkp_result"],
            backup_scope: t["backup_scope"],
            total_size_byte: t["total_size_byte"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "synology_m365_backup_logs",
    {
      description:
        "List recent Active Backup for Microsoft 365 job logs from the Synology NAS. " +
        "Use this to check for backup failures and confirm last successful run times.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Number of log entries to return, newest first"),
        task_id: z
          .number()
          .int()
          .optional()
          .describe("Filter to a specific task ID. Omit for all tasks."),
      }),
    },
    async ({ limit, task_id }) => {
      const host = process.env["SYNOLOGY_HOST"] ?? "";
      if (!host) return cfgErr(NO_CFG_MSG);
      try {
        const extra: Record<string, unknown> = {
          limit,
          offset: 0,
          sort_by: "time",
          sort_direction: "DESC",
        };
        if (task_id !== undefined) extra["task_id"] = task_id;
        const data = await dsm(host, "SYNO.ActiveBackup365.Log", 1, "list", extra);
        const logs = (data["log_list"] as A[] | undefined) ?? [];
        return ok({
          count: logs.length,
          logs: logs.map((l) => ({
            log_id: l["log_id"],
            task_id: l["task_id"],
            task_name: l["task_name"],
            time: l["time"],
            result: l["result"],
            type: l["type"],
            detail: l["detail"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "synology_storage_info",
    {
      description:
        "Get storage pool and volume status from the Synology NAS — health, capacity, and used/free space.",
      inputSchema: z.object({}),
    },
    async () => {
      const host = process.env["SYNOLOGY_HOST"] ?? "";
      if (!host) return cfgErr(NO_CFG_MSG);
      try {
        const [poolData, volData] = await Promise.all([
          dsm(host, "SYNO.Storage.CGI.Storage", 1, "list", { limit: 50, offset: 0 }),
          dsm(host, "SYNO.Storage.CGI.Volume", 1, "list", { limit: 50, offset: 0 }),
        ]);
        const pools = (poolData["storages"] as A[] | undefined) ?? [];
        const volumes = (volData["volumes"] as A[] | undefined) ?? [];
        return ok({
          pools: pools.map((p) => ({
            id: p["id"],
            name: p["name"],
            status: p["status"],
            raid_type: p["raid_type"],
            size_total: p["size_total"],
            size_used: p["size_used"],
          })),
          volumes: volumes.map((v) => ({
            id: v["id"],
            name: v["vol_path"] ?? v["id"],
            status: v["status"],
            size_total: v["size_total"],
            size_used: v["size_used"],
            fs_type: v["fs_type"],
          })),
        });
      } catch (e) {
        return err(e);
      }
    }
  );
}
