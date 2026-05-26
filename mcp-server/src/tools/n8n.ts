import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_CFG_MSG =
  "n8n tools are not configured — set N8N_URL and N8N_API_KEY in the SVH OpsMan Bitwarden item";

function n8nClient() {
  const url = process.env["N8N_URL"] ?? "";
  return axios.create({
    baseURL: `${url}/api/v1`,
    headers: { "X-N8N-API-KEY": process.env["N8N_API_KEY"] ?? "" },
    timeout: 20_000,
  });
}

export function registerN8nTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "n8n_list_workflows",
    {
      description:
        "List all workflows in n8n — name, active/inactive state, tags, and last execution time. " +
        "Use to understand what automations are configured and which are running.",
      inputSchema: z.object({
        active_only: z
          .boolean()
          .default(false)
          .describe("When true, return only active (enabled) workflows"),
      }),
    },
    async ({ active_only }) => {
      if (!process.env["N8N_URL"] || !process.env["N8N_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await n8nClient().get("/workflows", { params: { limit: 100 } });
        const data = res.data as A;
        let workflows = ((data["data"] as A[]) ?? []).map((w: A) => ({
          id: w["id"],
          name: w["name"],
          active: w["active"],
          tags: (w["tags"] as A[] | undefined)?.map((t) => t["name"]),
          created_at: w["createdAt"],
          updated_at: w["updatedAt"],
        }));
        if (active_only) workflows = workflows.filter((w) => w.active === true);
        return ok({ count: workflows.length, workflows });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "n8n_list_executions",
    {
      description:
        "List recent workflow executions in n8n — workflow name, start/end time, status (success/error/running), " +
        "and execution mode. Use to check if automations are running successfully or have errors.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .describe("Number of executions to return, newest first"),
        workflow_id: z
          .string()
          .optional()
          .describe("Filter to a specific workflow ID from n8n_list_workflows. Omit for all workflows."),
        status: z
          .enum(["success", "error", "running", "waiting"])
          .optional()
          .describe("Filter by execution status. Omit for all statuses."),
      }),
    },
    async ({ limit, workflow_id, status }) => {
      if (!process.env["N8N_URL"] || !process.env["N8N_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const params: Record<string, unknown> = { limit };
        if (workflow_id !== undefined) params["workflowId"] = workflow_id;
        if (status !== undefined) params["status"] = status;
        const res = await n8nClient().get("/executions", { params });
        const data = res.data as A;
        const executions = ((data["data"] as A[]) ?? []).map((e: A) => ({
          id: e["id"],
          workflow_id: (e["workflowData"] as A | undefined)?.["id"],
          workflow_name: (e["workflowData"] as A | undefined)?.["name"],
          status: e["status"],
          mode: e["mode"],
          started_at: e["startedAt"],
          stopped_at: e["stoppedAt"],
          finished: e["finished"],
        }));
        return ok({ count: executions.length, executions });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "n8n_get_execution",
    {
      description:
        "Get full details of a specific n8n workflow execution including per-node run data and any error messages. " +
        "Use after n8n_list_executions to debug a failed execution.",
      inputSchema: z.object({
        execution_id: z.string().describe("Execution ID from n8n_list_executions"),
      }),
    },
    async ({ execution_id }) => {
      if (!process.env["N8N_URL"] || !process.env["N8N_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await n8nClient().get(`/executions/${execution_id}`);
        const e = res.data as A;
        const nodeData = (e["data"] as A | undefined)?.["resultData"] as A | undefined;
        const runData = nodeData?.["runData"];
        const nodes = runData && typeof runData === "object" && !Array.isArray(runData)
          ? Object.entries(runData as Record<string, unknown>).map(([nodeName, runs]) => {
              const run = (runs as A[])[0] as A | undefined;
              const output = run?.["data"] as A | undefined;
              const error = run?.["error"] as A | undefined;
              return {
                node: nodeName,
                execution_time_ms: run?.["executionTime"],
                error: error ? { message: error["message"], name: error["name"] } : undefined,
                output_items: (output?.["main"] as A[][] | undefined)?.[0]?.length,
              };
            })
          : [];
        return ok({
          id: e["id"],
          workflow_name: (e["workflowData"] as A | undefined)?.["name"],
          status: e["status"],
          mode: e["mode"],
          started_at: e["startedAt"],
          stopped_at: e["stoppedAt"],
          note: !nodeData ? "execution data not available (may be pruned)" : undefined,
          nodes,
        });
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          return err(new Error(`Execution ${execution_id} not found`));
        }
        return err(e);
      }
    }
  );
}
