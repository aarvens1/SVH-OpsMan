// Note: planner_delete_task is intentionally not implemented.
// Tasks are marked complete at 100% to preserve history — see CLAUDE.md conventions.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";
import { ok, err } from "../utils/response.js";
import { randomUUID } from "crypto";

type A = Record<string, unknown>;

const CATEGORY_KEYS = [
  "category1","category2","category3","category4","category5","category6","category7",
  "category8","category9","category10","category11","category12","category13","category14",
  "category15","category16","category17","category18","category19","category20","category21",
  "category22","category23","category24","category25",
] as const;

export function registerPlannerTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/groups/${group_id}/planner/plans`);
        const plans = ((res.data as A)["value"] as A[] ?? []).map((p: A) => ({
          id: p["id"],
          title: p["title"],
          owner: p["owner"],
          createdDateTime: p["createdDateTime"],
        }));
        return ok(plans);
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/plans/${plan_id}`);
        const p = res.data as A;
        return ok({
          id: p["id"],
          title: p["title"],
          owner: p["owner"],
          createdDateTime: p["createdDateTime"],
          etag: p["@odata.etag"],
        });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post("/planner/plans", { owner: group_id, title });
        const p = res.data as A;
        return ok({
          id: p["id"],
          title: p["title"],
          owner: p["owner"],
          createdDateTime: p["createdDateTime"],
        });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/plans/${plan_id}/buckets`);
        const buckets = ((res.data as A)["value"] as A[] ?? []).map((b: A) => ({
          id: b["id"],
          name: b["name"],
          planId: b["planId"],
          orderHint: b["orderHint"],
        }));
        return ok(buckets);
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post("/planner/buckets", { planId: plan_id, name });
        const b = res.data as A;
        return ok({
          id: b["id"],
          name: b["name"],
          planId: b["planId"],
        });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);
        const url = bucket_id
          ? `/planner/buckets/${bucket_id}/tasks`
          : `/planner/plans/${plan_id}/tasks`;
        const res = await client.get(url);
        const tasks = ((res.data as A)["value"] as A[] ?? []).map((t: A) => ({
          id: t["id"],
          title: t["title"],
          planId: t["planId"],
          bucketId: t["bucketId"],
          percentComplete: t["percentComplete"],
          dueDateTime: t["dueDateTime"],
          assignments: t["assignments"],
          appliedCategories: t["appliedCategories"],
          priority: t["priority"],
          etag: t["@odata.etag"],
        }));
        return ok(tasks);
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/tasks/${task_id}`);
        const t = res.data as A;
        return ok({
          id: t["id"],
          title: t["title"],
          planId: t["planId"],
          bucketId: t["bucketId"],
          percentComplete: t["percentComplete"],
          dueDateTime: t["dueDateTime"],
          assignments: t["assignments"],
          appliedCategories: t["appliedCategories"],
          priority: t["priority"],
          etag: t["@odata.etag"],
        });
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
        labels: z
          .array(z.enum(CATEGORY_KEYS))
          .optional()
          .describe("Category labels to apply (e.g. ['category1']). Label names are set per-plan via planner_set_plan_label. Category-to-name mapping is plan-specific — check with planner_get_plan_details before assigning."),
      }),
    },
    async ({ plan_id, bucket_id, title, assigned_to, due_date, checklist_items, labels }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);

        const body: Record<string, unknown> = { planId: plan_id, bucketId: bucket_id, title };
        if (due_date) body["dueDateTime"] = due_date;
        if (assigned_to) body["assignments"] = { [assigned_to]: { "@odata.type": "#microsoft.graph.plannerAssignment", orderHint: " !" } };
        if (labels && labels.length > 0) {
          const appliedCategories: Record<string, boolean> = {};
          for (const key of labels) appliedCategories[key] = true;
          body["appliedCategories"] = appliedCategories;
        }

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

        return ok({
          id: task["id"],
          title: task["title"],
          planId: task["planId"],
          bucketId: task["bucketId"],
          percentComplete: task["percentComplete"],
          dueDateTime: task["dueDateTime"],
          assignments: task["assignments"],
          appliedCategories: task["appliedCategories"],
          priority: task["priority"],
          etag: task["@odata.etag"],
          checklist_items_added: checklist_items?.length ?? 0,
        });
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
        labels: z
          .array(z.enum(CATEGORY_KEYS))
          .optional()
          .describe("Replace the task's category labels. Pass an empty array to clear all labels. Category-to-name mapping is plan-specific — check with planner_get_plan_details before assigning."),
      }),
    },
    async ({ task_id, etag, title, percent_complete, due_date, bucket_id, labels }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = {};
        if (title !== undefined) body["title"] = title;
        if (percent_complete !== undefined) body["percentComplete"] = percent_complete;
        if (due_date !== undefined) body["dueDateTime"] = due_date;
        if (bucket_id !== undefined) body["bucketId"] = bucket_id;
        if (labels !== undefined) {
          const appliedCategories: Record<string, boolean> = {};
          for (const key of CATEGORY_KEYS) appliedCategories[key] = false;
          for (const key of labels) appliedCategories[key] = true;
          body["appliedCategories"] = appliedCategories;
        }

        const res = await graphClient(token).patch(`/planner/tasks/${task_id}`, body, {
          headers: { "If-Match": etag },
        });
        return ok(res.data ?? { success: true, task_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── User task views ───────────────────────────────────────────────────────

  server.registerTool(
    "planner_get_user_tasks",
    {
      description:
        "Get all Planner tasks assigned to a specific user across every plan they belong to. " +
        "Use this to build the 'Your Tasks' section of a daily briefing — it covers personal plans " +
        "and team plans alike without needing to enumerate plan IDs.",
      inputSchema: z.object({
        user_id: z.string().describe("UPN or Entra object ID of the user (e.g. astevens@shoestringvalley.com)"),
        open_only: z
          .boolean()
          .optional()
          .default(true)
          .describe("If true (default), exclude tasks at 100% completion"),
      }),
    },
    async ({ user_id, open_only }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${encodeURIComponent(user_id)}/planner/tasks`);
        const tasks = (res.data?.value ?? []) as A[];
        const filtered = open_only ? tasks.filter((t) => (t["percentComplete"] as number) < 100) : tasks;
        const shaped = filtered.map((t: A) => ({
          id: t["id"],
          title: t["title"],
          planId: t["planId"],
          bucketId: t["bucketId"],
          percentComplete: t["percentComplete"],
          dueDateTime: t["dueDateTime"],
          assignments: t["assignments"],
          appliedCategories: t["appliedCategories"],
          priority: t["priority"],
          etag: t["@odata.etag"],
        }));
        return ok({ count: shaped.length, value: shaped });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_list_user_plans",
    {
      description:
        "List all Planner plans owned by or visible to a specific user, including personal (non-group) plans. " +
        "Use this to find Aaron's personal Planner board when building a daily briefing.",
      inputSchema: z.object({
        user_id: z.string().describe("UPN or Entra object ID of the user"),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${encodeURIComponent(user_id)}/planner/plans`);
        const plans = ((res.data as A)["value"] as A[] ?? []).map((p: A) => ({
          id: p["id"],
          title: p["title"],
          owner: p["owner"],
          createdDateTime: p["createdDateTime"],
        }));
        return ok(plans);
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/tasks/${task_id}/details`);
        const d = res.data as A;
        return ok({
          id: d["id"],
          description: d["description"],
          checklist: d["checklist"],
          references: d["references"],
          etag: d["@odata.etag"],
        });
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

  // ── Plan labels (categoryDescriptions) ────────────────────────────────────

  server.registerTool(
    "planner_get_plan_details",
    {
      description:
        "Get a Planner plan's category label definitions (categoryDescriptions). " +
        "Use this to see which category slot (category1–25) maps to which display name " +
        "(e.g. 'Aaron', 'Sam'). The @odata.etag in the response is required for planner_set_plan_label.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
      }),
    },
    async ({ plan_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/planner/plans/${plan_id}/details`);
        const d = res.data as A;
        return ok({
          id: d["id"],
          categoryDescriptions: d["categoryDescriptions"],
          etag: d["@odata.etag"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "planner_set_plan_label",
    {
      description:
        "Set or rename a category label on a Planner plan. " +
        "For example, set category1 to 'Aaron'. Fetches the current plan details etag automatically. " +
        "Pass an empty string for name to clear a label.",
      inputSchema: z.object({
        plan_id: z.string().describe("The Planner plan ID"),
        category: z.enum(CATEGORY_KEYS).describe("The category slot to name (e.g. 'category1')"),
        name: z.string().describe("Display name for this label (e.g. 'Aaron'). Pass empty string to clear."),
      }),
    },
    async ({ plan_id, category, name }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);
        const detailsRes = await client.get(`/planner/plans/${plan_id}/details`);
        const etag =
          (detailsRes.headers as Record<string, string>)["etag"] ??
          (detailsRes.data["@odata.etag"] as string);
        const res = await client.patch(
          `/planner/plans/${plan_id}/details`,
          { categoryDescriptions: { [category]: name } },
          { headers: { "If-Match": etag } }
        );
        return ok(res.data ?? { success: true, plan_id, category, name });
      } catch (e) {
        return err(e);
      }
    }
  );
}
