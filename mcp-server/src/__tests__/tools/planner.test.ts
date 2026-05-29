import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPlannerTools } from "../../tools/planner.js";
import { getGraphToken } from "../../auth/graph.js";

// Mock graphClient to avoid hoisting issues with vi.mock
const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn(() => mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
  formatError: (e: any) => e.message || "An error occurred",
}));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn(),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

vi.mock("crypto", () => ({
  randomUUID: vi.fn(() => "mock-uuid"),
}));


describe("Planner Tools", () => {
  let server: McpServer;
  let registeredTools: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();
    server = {
      registerTool: (name: string, schema: any, handler: any) => {
        registeredTools.set(name, { name, schema, handler });
      },
    } as any;
    registerPlannerTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerPlannerTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("planner_list_plans", () => {
    const toolName = "planner_list_plans";

    it("should list plans on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          value: [{ id: "plan1", title: "My Plan" }],
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ group_id: "group1" });

      expect(mockGraphClient.get).toHaveBeenCalledWith("/groups/group1/planner/plans");
      expect(result).toEqual({
        ok: true,
        data: [{ id: "plan1", title: "My Plan" }],
      });
    });

    it("should handle errors when listing plans", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("API Error");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ group_id: "group1" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("planner_get_plan", () => {
    const toolName = "planner_get_plan";

    it("should get a plan on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          id: "plan1",
          title: "My Plan",
          "@odata.etag": "etag123",
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ plan_id: "plan1" });

      expect(mockGraphClient.get).toHaveBeenCalledWith("/planner/plans/plan1");
      expect(result).toEqual({
        ok: true,
        data: {
          id: "plan1",
          title: "My Plan",
          etag: "etag123",
        },
      });
    });

    it("should handle errors when getting a plan", async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue("fake-token");
        const error = new Error("Not Found");
        vi.mocked(mockGraphClient.get).mockRejectedValue(error);
  
        const result = await handler({ plan_id: "plan1" });
  
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: "Not Found" });
    });
  });
});
