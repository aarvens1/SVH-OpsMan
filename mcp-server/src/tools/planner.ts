// Note: planner_delete_task is intentionally not implemented.
// Tasks are marked complete at 100% to preserve history — see CLAUDE.md conventions.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";
import { randomUUID } from "crypto";

const DISABLED_MSG =
  "Graph service not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET";

function disabled() {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: DISABLED_MSG }],
  };
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerPlannerTools(server: McpServer, enabled: boolean): void {
  // ── Plans ──────────────────────────────────────────────────────────────────

  server.registerTool(
    "planner_list_plans",
    {
      description:
        "List all Planner plans belonging to a Microsoft 365 group. Returns plan IDs, titles, and owner.",
      inputSchema: z.object({
        group_id: z.string().describe("The M365 group (team) object ID"),
      }),
    },
    async ({ group_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/groups/${group_id}/planner/plans`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_get_plan",
    {
      description: "Get details of a specific Planner plan including title and creation info.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
      }),
    },
    async ({ plan_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/plans/${plan_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_create_plan",
    {
      description: "Create a new Planner plan inside an M365 group.",
      inputSchema: z.object({
        group_id: z.string().describe("The M365 group (team) object ID that will own the plan"),
        title: z.string().describe("Title of the new plan"),
      }),
    },
    async ({ group_id, title }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post("/planner/plans", { owner: group_id, title });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Buckets ────────────────────────────────────────────────────────────────

  server.registerTool(
    "planner_list_buckets",
    {
      description: "List all buckets (columns) in a Planner plan.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
      }),
    },
    async ({ plan_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/plans/${plan_id}/buckets`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_create_bucket",
    {
      description: "Create a new bucket (column) in a Planner plan.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
        name: z.string().describe("Display name for the bucket"),
      }),
    },
    async ({ plan_id, name }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post("/planner/buckets", { planId: plan_id, name });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  server.registerTool(
    "planner_list_tasks",
    {
      description:
        "List tasks in a plan. Optionally scope to a specific bucket. Returns title, assignments, due date, percent complete.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
        bucket_id: z.string().optional().describe("Filter to tasks in this bucket only"),
      }),
    },
    async ({ plan_id, bucket_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);
        const url = bucket_id
          ? `/planner/buckets/${bucket_id}/tasks`
          : `/planner/plans/${plan_id}/tasks`;
        const res = await client.get(url);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_get_task",
    {
      description:
        "Get a Planner task's basic fields: title, due date, percent complete, assignments, bucket, and the @odata.etag needed for updates.",
      inputSchema: z.object({
        task_id: z.string().describe("The Planner task ID"),
      }),
    },
    async ({ task_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/tasks/${task_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_create_task",
    {
      description:
        "Create a new Planner task. Optionally assign it, set a due date, and add initial checklist items. " +
        "If checklist_items are provided, a second API call patches the task details automatically.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
        bucket_id: z.string().describe("The bucket to place the task in"),
        title: z.string().describe("Task title"),
        assigned_to: z
          .string()
          .optional()
          .describe("User object ID to assign the task to"),
        due_date: z
          .string()
          .optional()
          .describe("Due date in ISO 8601 format (e.g. 2025-12-31T23:59:59Z)"),
        checklist_items: z
          .array(z.object({ title: z.string() }))
          .optional()
          .describe("Initial checklist items to add to the task"),
      }),
    },
    async ({ plan_id, bucket_id, title, assigned_to, due_date, checklist_items }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);

        const body: Record<string, unknown> = { planId: plan_id, bucketId: bucket_id, title };
        if (due_date) body["dueDateTime"] = due_date;
        if (assigned_to) body["assignments"] = { [assigned_to]: { "@odata.type": "#microsoft.graph.plannerAssignment", orderHint: " !" } };

        const taskRes = await client.post("/planner/tasks", body);
        const task = taskRes.data as Record<string, unknown>;
        const taskId = task["id"] as string;

        if (checklist_items && checklist_items.length > 0) {
          try {
            const detailsRes = await client.get(`/planner/tasks/${taskId}/details`);
            const detailsEtag = (detailsRes.headers as Record<string, string>)["etag"] ?? detailsRes.data["@odata.etag"] as string;

            const checklist: Record<string, unknown> = {};
            for (const item of checklist_items) {
              checklist[randomUUID()] = { "@odata.type": "#microsoft.graph.plannerChecklistItem", title: item.title, isChecked: false };
            }
            await client.patch(`/planner/tasks/${taskId}/details`, { checklist }, {
              headers: { "If-Match": detailsEtag },
            });
          } catch (checklistErr) {
            // Task was created successfully but checklist patching failed.
            // Return the task with a warning so the caller knows the partial state.
            return {
              isError: true as const,
              content: [{
                type: "text" as const,
                text: `Task created (id: ${taskId}) but checklist could not be added: ${formatError(checklistErr)}`,
              }],
            };
          }
        }

        return ok({ ...task, checklist_items_added: checklist_items?.length ?? 0 });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_update_task",
    {
      description:
        "Update a Planner task's title, due date, percent complete (0–100), or bucket. " +
        "Requires the etag from planner_get_task (@odata.etag field).",
      inputSchema: z.object({
        task_id: z.string().describe("The Planner task ID"),
        etag: z.string().describe("The @odata.etag value from the task (required by Graph API)"),
        title: z.string().optional().describe("New task title"),
        percent_complete: z
          .number()
          .int()
          .min(0)
          .max(100)
          .optional()
          .describe("Completion percentage (0, 50, or 100)"),
        due_date: z.string().optional().describe("New due date in ISO 8601 format"),
        bucket_id: z.string().optional().describe("Move task to this bucket ID"),
      }),
    },
    async ({ task_id, etag, title, percent_complete, due_date, bucket_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = {};
        if (title !== undefined) body["title"] = title;
        if (percent_complete !== undefined) body["percentComplete"] = percent_complete;
        if (due_date !== undefined) body["dueDateTime"] = due_date;
        if (bucket_id !== undefined) body["bucketId"] = bucket_id;

        const res = await graphClient(token).patch(`/planner/tasks/${task_id}`, body, {
          headers: { "If-Match": etag },
        });
        return ok(res.data ?? { success: true, task_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Task Details (notes + checklist) ───────────────────────────────────────

  server.registerTool(
    "planner_get_task_details",
    {
      description:
        "Get a task's notes/description and full checklist. " +
        "The response includes @odata.etag required for planner_update_task_notes and planner_update_checklist_item.",
      inputSchema: z.object({
        task_id: z.string().describe("The Planner task ID"),
      }),
    },
    async ({ task_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/tasks/${task_id}/details`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_update_task_notes",
    {
      description:
        "Update the notes/description field of a Planner task. " +
        "Planner has no native comments; the description field is the notes area. " +
        "Requires the etag from planner_get_task_details.",
      inputSchema: z.object({
        task_id: z.string().describe("The Planner task ID"),
        etag: z.string().describe("The @odata.etag from planner_get_task_details"),
        description: z.string().describe("The new notes/description text (plain text)"),
      }),
    },
    async ({ task_id, etag, description }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).patch(
          `/planner/tasks/${task_id}/details`,
          { description },
          { headers: { "If-Match": etag } }
        );
        return ok(res.data ?? { success: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_update_checklist_item",
    {
      description:
        "Add, update (check/uncheck/rename), or remove a checklist item on a Planner task. " +
        "To add a new item omit item_id (one is auto-generated). " +
        "To remove an item set delete=true. " +
        "Requires the etag from planner_get_task_details.",
      inputSchema: z.object({
        task_id: z.string().describe("The Planner task ID"),
        etag: z.string().describe("The @odata.etag from planner_get_task_details"),
        item_id: z
          .string()
          .optional()
          .describe("The checklist item GUID. Omit to create a new item."),
        title: z.string().optional().describe("Item label text (required when adding or renaming)"),
        is_checked: z
          .boolean()
          .optional()
          .describe("true = checked/complete, false = unchecked"),
        delete: z
          .boolean()
          .optional()
          .describe("Set true to remove this checklist item"),
      }),
    },
    async ({ task_id, etag, item_id, title, is_checked, delete: del }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const id = item_id ?? randomUUID();
        const checklist: Record<string, unknown> = {};

        if (del) {
          checklist[id] = null;
        } else {
          const item: Record<string, unknown> = {
            "@odata.type": "#microsoft.graph.plannerChecklistItem",
          };
          if (title !== undefined) item["title"] = title;
          if (is_checked !== undefined) item["isChecked"] = is_checked;
          checklist[id] = item;
        }

        const res = await graphClient(token).patch(
          `/planner/tasks/${task_id}/details`,
          { checklist },
          { headers: { "If-Match": etag } }
        );
        return ok(res.data ?? { success: true, item_id: id });
      } catch (e) {
        return err(e);
      }
    }
  );
}
