import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

export function registerMsTodoTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "todo_list_task_lists",
    {
      description: "List all Microsoft To Do task lists for a user.",
      inputSchema: z.object({
        user_id: z
          .string()
          .optional()
          .describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).get(`${base}/todo/lists`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todo_list_tasks",
    {
      description:
        "List tasks in a To Do task list. Optionally filter to only open tasks.",
      inputSchema: z.object({
        list_id: z.string().describe("Task list ID"),
        user_id: z
          .string()
          .optional()
          .describe("UPN or object ID. Defaults to the service account."),
        open_only: z
          .boolean()
          .default(true)
          .describe("If true, exclude completed tasks"),
      }),
    },
    async ({ list_id, user_id, open_only }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const params: Record<string, string> = {};
        if (open_only) params["$filter"] = "status ne 'completed'";
        const res = await graphClient(token).get(
          `${base}/todo/lists/${list_id}/tasks`,
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todo_get_task",
    {
      description: "Get full details of a specific To Do task, including checklist items.",
      inputSchema: z.object({
        list_id: z.string().describe("Task list ID"),
        task_id: z.string().describe("Task ID"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ list_id, task_id, user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const [task, checklist] = await Promise.all([
          graphClient(token).get(`${base}/todo/lists/${list_id}/tasks/${task_id}`),
          graphClient(token).get(
            `${base}/todo/lists/${list_id}/tasks/${task_id}/checklistItems`
          ),
        ]);
        return ok({ ...task.data, checklistItems: checklist.data.value });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todo_create_task",
    {
      description: "Create a new task in a Microsoft To Do list.",
      inputSchema: z.object({
        list_id: z.string().describe("Task list ID"),
        title: z.string().describe("Task title"),
        body: z
          .string()
          .optional()
          .describe("Task body / notes (plain text)"),
        due_date: z
          .string()
          .optional()
          .describe("Due date in ISO 8601 format (e.g. 2025-05-15T00:00:00)"),
        importance: z
          .enum(["low", "normal", "high"])
          .default("normal")
          .describe("Task importance"),
        reminder_date: z
          .string()
          .optional()
          .describe("Reminder date-time in ISO 8601 format"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ list_id, title, body, due_date, importance, reminder_date, user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const payload: Record<string, unknown> = { title, importance };
        if (body) payload.body = { content: body, contentType: "text" };
        if (due_date) payload.dueDateTime = { dateTime: due_date, timeZone: "UTC" };
        if (reminder_date) {
          payload.isReminderOn = true;
          payload.reminderDateTime = { dateTime: reminder_date, timeZone: "UTC" };
        }
        const res = await graphClient(token).post(
          `${base}/todo/lists/${list_id}/tasks`,
          payload
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todo_update_task",
    {
      description:
        "Update a To Do task — change title, body, due date, status, or importance.",
      inputSchema: z.object({
        list_id: z.string().describe("Task list ID"),
        task_id: z.string().describe("Task ID"),
        title: z.string().optional().describe("New title"),
        body: z.string().optional().describe("New body text"),
        status: z
          .enum(["notStarted", "inProgress", "completed", "waitingOnOthers", "deferred"])
          .optional()
          .describe("Task status"),
        importance: z.enum(["low", "normal", "high"]).optional(),
        due_date: z.string().optional().describe("Due date in ISO 8601 format"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ list_id, task_id, title, body, status, importance, due_date, user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const payload: Record<string, unknown> = {};
        if (title) payload.title = title;
        if (body) payload.body = { content: body, contentType: "text" };
        if (status) payload.status = status;
        if (importance) payload.importance = importance;
        if (due_date) payload.dueDateTime = { dateTime: due_date, timeZone: "UTC" };
        const res = await graphClient(token).patch(
          `${base}/todo/lists/${list_id}/tasks/${task_id}`,
          payload
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todo_add_checklist_item",
    {
      description: "Add a checklist sub-item to a To Do task.",
      inputSchema: z.object({
        list_id: z.string().describe("Task list ID"),
        task_id: z.string().describe("Task ID"),
        display_name: z.string().describe("Checklist item text"),
        is_checked: z.boolean().default(false).describe("Whether the item starts checked"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ list_id, task_id, display_name, is_checked, user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).post(
          `${base}/todo/lists/${list_id}/tasks/${task_id}/checklistItems`,
          { displayName: display_name, isChecked: is_checked }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
