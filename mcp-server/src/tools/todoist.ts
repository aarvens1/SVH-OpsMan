import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { todoistClient, formatError } from "../utils/http.js";

const DISABLED_MSG = "Todoist not configured: set TODOIST_API_TOKEN";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerTodoistTools(server: McpServer, enabled: boolean): void {
  // ── Projects ───────────────────────────────────────────────────────────────

  server.registerTool(
    "todoist_list_projects",
    {
      description: "List all Todoist projects with their IDs, names, colors, and hierarchy.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!enabled) return disabled();
      try {
        const res = await todoistClient().get("/projects");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_list_sections",
    {
      description: "List sections within a Todoist project.",
      inputSchema: z.object({
        project_id: z.string().describe("Todoist project ID"),
      }),
    },
    async ({ project_id }) => {
      if (!enabled) return disabled();
      try {
        const res = await todoistClient().get("/sections", { params: { project_id } });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Tasks ──────────────────────────────────────────────────────────────────

  server.registerTool(
    "todoist_list_tasks",
    {
      description:
        "List Todoist tasks, optionally filtered by project, section, label, or a Todoist filter query. " +
        "Filter examples: 'today', 'overdue', 'p1', 'assigned to: me'.",
      inputSchema: z.object({
        project_id: z.string().optional().describe("Filter by project ID"),
        section_id: z.string().optional().describe("Filter by section ID"),
        label: z.string().optional().describe("Filter by label name"),
        filter: z
          .string()
          .optional()
          .describe("Todoist filter query (e.g. 'today', 'overdue & p1')"),
      }),
    },
    async ({ project_id, section_id, label, filter }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string> = {};
        if (project_id) params["project_id"] = project_id;
        if (section_id) params["section_id"] = section_id;
        if (label) params["label"] = label;
        if (filter) params["filter"] = filter;
        const res = await todoistClient().get("/tasks", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_get_task",
    {
      description: "Get full details of a specific Todoist task by ID.",
      inputSchema: z.object({
        task_id: z.string().describe("Todoist task ID"),
      }),
    },
    async ({ task_id }) => {
      if (!enabled) return disabled();
      try {
        const res = await todoistClient().get(`/tasks/${task_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_create_task",
    {
      description: "Create a new task in Todoist.",
      inputSchema: z.object({
        content: z.string().describe("Task title/content (supports Markdown inline formatting)"),
        description: z.string().optional().describe("Longer task description"),
        project_id: z.string().optional().describe("Project to add the task to (defaults to Inbox)"),
        section_id: z.string().optional().describe("Section within the project"),
        due_string: z
          .string()
          .optional()
          .describe("Natural language due date, e.g. 'tomorrow', 'next Monday', 'every Friday'"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Priority 1 (normal) to 4 (urgent/p1)"),
        labels: z.array(z.string()).optional().describe("Label names to apply"),
      }),
    },
    async ({ content, description, project_id, section_id, due_string, priority, labels }) => {
      if (!enabled) return disabled();
      try {
        const body: Record<string, unknown> = { content };
        if (description) body["description"] = description;
        if (project_id) body["project_id"] = project_id;
        if (section_id) body["section_id"] = section_id;
        if (due_string) body["due_string"] = due_string;
        if (priority !== undefined) body["priority"] = priority;
        if (labels?.length) body["labels"] = labels;
        const res = await todoistClient().post("/tasks", body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_update_task",
    {
      description: "Update an existing Todoist task. Only fields provided are changed.",
      inputSchema: z.object({
        task_id: z.string().describe("Todoist task ID"),
        content: z.string().optional().describe("New task title"),
        description: z.string().optional().describe("New description"),
        due_string: z.string().optional().describe("New due date in natural language"),
        priority: z.number().int().min(1).max(4).optional().describe("New priority (1–4)"),
        labels: z.array(z.string()).optional().describe("Replacement label list"),
      }),
    },
    async ({ task_id, content, description, due_string, priority, labels }) => {
      if (!enabled) return disabled();
      try {
        const body: Record<string, unknown> = {};
        if (content !== undefined) body["content"] = content;
        if (description !== undefined) body["description"] = description;
        if (due_string !== undefined) body["due_string"] = due_string;
        if (priority !== undefined) body["priority"] = priority;
        if (labels !== undefined) body["labels"] = labels;
        const res = await todoistClient().post(`/tasks/${task_id}`, body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_close_task",
    {
      description: "Mark a Todoist task as complete.",
      inputSchema: z.object({
        task_id: z.string().describe("Todoist task ID"),
      }),
    },
    async ({ task_id }) => {
      if (!enabled) return disabled();
      try {
        await todoistClient().post(`/tasks/${task_id}/close`);
        return ok({ success: true, task_id, closed: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "todoist_delete_task",
    {
      description: "Permanently delete a Todoist task.",
      inputSchema: z.object({
        task_id: z.string().describe("Todoist task ID"),
      }),
    },
    async ({ task_id }) => {
      if (!enabled) return disabled();
      try {
        await todoistClient().delete(`/tasks/${task_id}`);
        return ok({ success: true, deleted_task_id: task_id });
      } catch (e) {
        return err(e);
      }
    }
  );
}
