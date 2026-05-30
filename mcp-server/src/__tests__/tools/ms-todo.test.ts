import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMsTodoTools } from "../../tools/ms-todo.js";

const mockGraphClient = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

vi.mock("../../utils/http.js", () => ({
  formatError: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerMsTodoTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });
    registerMsTodoTools(server, true);
  });

  describe("todo_list_task_lists", () => {
    it("returns lists on success", async () => {
      const mockResponse = { data: { value: [{ id: "1", displayName: "Tasks" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("todo_list_task_lists")!({});
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.lists).toHaveLength(1);
      expect(parsed.lists[0].id).toBe("1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_list_task_lists")!({});
      expect((result as any).isError).toBe(true);
    });
  });

  describe("todo_list_tasks", () => {
    it("returns tasks on success", async () => {
      const mockResponse = { data: { value: [{ id: "task1", title: "My Task" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("todo_list_tasks")!({ list_id: "1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.tasks).toHaveLength(1);
      expect(parsed.tasks[0].title).toBe("My Task");
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_list_tasks")!({ list_id: "1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("todo_get_task", () => {
    it("returns a task on success", async () => {
      const mockTaskResponse = { data: { id: "task1", title: "My Task" } };
      const mockChecklistResponse = { data: { value: [{ id: "check1", displayName: "sub-item" }] } };
      mockGraphClient.get.mockResolvedValueOnce(mockTaskResponse);
      mockGraphClient.get.mockResolvedValueOnce(mockChecklistResponse);

      const result = await handlers.get("todo_get_task")!({ list_id: "1", task_id: "task1" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("task1");
      expect(parsed.checklistItems).toHaveLength(1);
    });

    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_get_task")!({ list_id: "1", task_id: "task1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("todo_create_task", () => {
    it("returns created task on success", async () => {
      const mockResponse = { data: { id: "newTask", title: "New Task" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("todo_create_task")!({ list_id: "1", title: "New Task" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("newTask");
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_create_task")!({ list_id: "1", title: "New Task" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("todo_update_task", () => {
    it("returns updated task on success", async () => {
      const mockResponse = { data: { id: "task1", title: "Updated Task" } };
      mockGraphClient.patch.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("todo_update_task")!({ list_id: "1", task_id: "task1", title: "Updated" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.title).toBe("Updated Task");
    });

    it("returns error on failure", async () => {
      mockGraphClient.patch.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_update_task")!({ list_id: "1", task_id: "task1", title: "Updated" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("todo_add_checklist_item", () => {
    it("returns created item on success", async () => {
      const mockResponse = { data: { id: "check1", displayName: "sub-item" } };
      mockGraphClient.post.mockResolvedValueOnce(mockResponse);

      const result = await handlers.get("todo_add_checklist_item")!({ list_id: "1", task_id: "task1", display_name: "sub-item" });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed.id).toBe("check1");
    });

    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("todo_add_checklist_item")!({ list_id: "1", task_id: "task1", display_name: "sub-item" });
      expect((result as any).isError).toBe(true);
    });
  });
});
