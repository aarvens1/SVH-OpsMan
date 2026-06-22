import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createControllerClient } from "../auth/unifi.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

const CONTROLLER_PARAM = z
  .string()
  .describe(
    "Site controller code: svh, pdx, boi, eug, sea, fgt. Warehouse variants: boi_wh, eug_wh, sea_wh. " +
    "Add more by setting UNIFI_{SITE}_URL and UNIFI_{SITE}_KEY in the SVH OpsMan Bitwarden item."
  );

const SITE_PARAM = z
  .string()
  .default("default")
  .describe("UniFi site name (e.g. 'default'). Use 'default' for single-site UDMs.");

function classicData(raw: unknown): A[] {
  const r = raw as A;
  return (r["data"] as A[] | undefined) ?? (Array.isArray(raw) ? (raw as A[]) : []);
}

export function registerUnifiAlertsTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "unifi_list_alerts",
    {
      description:
        "List UniFi alerts on a site. Returns active (unarchived) alerts by default.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        archived: z.boolean().default(false).describe(
          "When false (default), return only unarchived alerts. When true, include all alerts."
        ),
      }),
    },
    async ({ controller, site_id, archived }) => {
      try {
        const res = await createControllerClient(controller).get(`/api/s/${site_id}/stat/alarm`);
        const all = classicData(res.data);
        const filtered = archived ? all : all.filter((a) => a["archived"] !== true);
        const alerts = filtered.map((a: A) => ({
          id: a["_id"] ?? a["id"],
          key: a["key"],
          msg: a["msg"],
          time: a["time"],
          site_id: a["site_id"],
          archived: a["archived"] ?? false,
        }));
        return ok({ controller, site_id, count: alerts.length, alerts });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "unifi_archive_alerts",
    {
      description:
        "Archive alerts to clear the active alert list. Omit alert_ids to archive all alerts on the site.",
      inputSchema: z.object({
        controller: CONTROLLER_PARAM,
        site_id: SITE_PARAM,
        alert_ids: z.array(z.string()).optional().describe(
          "Specific alert IDs to archive (from unifi_list_alerts). Omit to archive all alerts on the site."
        ),
      }),
    },
    async ({ controller, site_id, alert_ids }) => {
      try {
        const client = createControllerClient(controller);
        if (alert_ids && alert_ids.length > 0) {
          for (const id of alert_ids) {
            await client.post(`/api/s/${site_id}/cmd/evtmgr`, { cmd: "archive-alarm", _id: id });
          }
          return ok({ controller, site_id, archived_count: alert_ids.length, success: true });
        } else {
          await client.post(`/api/s/${site_id}/cmd/evtmgr`, { cmd: "archive-all-alarms" });
          return ok({ controller, site_id, archived_count: "all", success: true });
        }
      } catch (e) {
        return err(e);
      }
    }
  );
}
