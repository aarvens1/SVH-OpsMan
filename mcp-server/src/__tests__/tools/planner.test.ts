import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPlannerTools } from "../../tools/planner.js";
import { graphClient } from "../../utils/http.js";

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn().mockResolvedValue("fake-token"),
}));

const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue(mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
  formatError: (e: any) => e.message,
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn().mockReturnValue("mock-uuid"),
}));

describe("registerPlannerTools", () => {
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
    registerPlannerTools(server, true);
  });

  describe("planner_list_plans", () => {
    it("returns plans on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "plan1" }] } });
      const result = await handlers.get("planner_list_plans")!({ group_id: "group1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_list_plans")!({ group_id: "group1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_get_plan", () => {
    it("returns a plan on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { id: "plan1" } });
      const result = await handlers.get("planner_get_plan")!({ plan_id: "plan1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_get_plan")!({ plan_id: "plan1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_create_plan", () => {
    it("creates a plan on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ data: { id: "newPlan" } });
      const result = await handlers.get("planner_create_plan")!({ group_id: "group1", title: "New Plan" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_create_plan")!({ group_id: "group1", title: "New Plan" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_list_buckets", () => {
    it("returns buckets on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "bucket1" }] } });
      const result = await handlers.get("planner_list_buckets")!({ plan_id: "plan1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_list_buckets")!({ plan_id: "plan1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_create_bucket", () => {
    it("creates a bucket on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ data: { id: "newBucket" } });
      const result = await handlers.get("planner_create_bucket")!({ plan_id: "plan1", name: "New Bucket" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_create_bucket")!({ plan_id: "plan1", name: "New Bucket" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_list_tasks", () => {
    it("returns tasks on success", async () => {
      mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: "task1" }] } });
      const result = await handlers.get("planner_list_tasks")!({ plan_id: "plan1" });
      expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
      mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_list_tasks")!({ plan_id: "plan1" });
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_get_task", () => {
    it("returns a task on success", async () => {
        mockGraphClient.get.mockResolvedValueOnce({ data: { id: 'task1' } });
        const result = await handlers.get("planner_get_task")!({ task_id: 'task1' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("planner_get_task")!({ task_id: 'task1' });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_create_task", () => {
    const params = { plan_id: "plan1", bucket_id: "bucket1", title: "New Task" };

    it("creates task and details on success", async () => {
      mockGraphClient.post.mockResolvedValueOnce({ data: { id: "newTask" } });
      mockGraphClient.get.mockResolvedValueOnce({ data: { "@odata.etag": "etag1" } });
      mockGraphClient.patch.mockResolvedValueOnce({ data: {} });

      const result = await handlers.get("planner_create_task")!({ ...params, notes: "some notes" });
      expect((result as any).isError).toBeUndefined();
      expect(mockGraphClient.post).toHaveBeenCalledTimes(1);
      expect(mockGraphClient.get).toHaveBeenCalledTimes(1);
      expect(mockGraphClient.patch).toHaveBeenCalledTimes(1);
    });

    it("returns task with warning if details fail", async () => {
        mockGraphClient.post.mockResolvedValueOnce({ data: { id: "newTask" } });
        mockGraphClient.get.mockResolvedValueOnce({ data: { "@odata.etag": "etag1" } });
        mockGraphClient.patch.mockRejectedValueOnce(new Error("Details failed"));

        const result = await handlers.get("planner_create_task")!({ ...params, notes: "some notes" });
        expect((result as any).isError).toBe(true);
        expect((result as any).content[0].text).toContain("details could not be added");
      });

    it("returns error on task creation failure", async () => {
      mockGraphClient.post.mockRejectedValueOnce(new Error("API Error"));
      const result = await handlers.get("planner_create_task")!(params);
      expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_update_task", () => {
    it("updates a task on success", async () => {
        mockGraphClient.patch.mockResolvedValueOnce({ data: { id: 'task1' } });
        const result = await handlers.get("planner_update_task")!({ task_id: 'task1', etag: 'etag1', title: 'New Title' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockGraphClient.patch.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("planner_update_task")!({ task_id: 'task1', etag: 'etag1', title: 'New Title' });
        expect((result as any).isError).toBe(true);
    });
  });

  describe("planner_get_user_tasks", () => {
    it("returns user tasks on success", async () => {
        mockGraphClient.get.mockResolvedValueOnce({ data: { value: [{ id: 'task1' }] } });
        const result = await handlers.get("planner_get_user_tasks")!({ user_id: 'user1' });
        expect((result as any).isError).toBeUndefined();
    });
    it("returns error on failure", async () => {
        mockGraphClient.get.mockRejectedValueOnce(new Error("API Error"));
        const result = await handlers.get("planner_get_user_tasks")!({ user_id: 'user1' });
        expect((result as any).isError).toBe(true);
    });
  });
});
