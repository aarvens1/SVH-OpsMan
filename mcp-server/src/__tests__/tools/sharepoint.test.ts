import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSharePointTools } from "../../tools/sharepoint.js";
import { getGraphToken } from "../../auth/graph.js";

// Mock graphClient to avoid hoisting issues with vi.mock
const mockGraphClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn(() => mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn(),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

describe("SharePoint Tools", () => {
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
    registerSharePointTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerSharePointTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("sp_search_sites", () => {
    const toolName = "sp_search_sites";

    it("should search for sites on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          value: [{ id: "site1", displayName: "My Site" }],
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ query: "My Site", top: 1 });

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        "/sites?search=My%20Site&$top=1&$select=id,displayName,webUrl,description,createdDateTime"
      );
      expect(result).toEqual({
        ok: true,
        data: {
          count: 1,
          sites: [{ id: "site1", displayName: "My Site" }],
        },
      });
    });

    it("should handle errors when searching for sites", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("API Error");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ query: "My Site", top: 1 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("sp_get_site", () => {
    const toolName = "sp_get_site";

    it("should get a site on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockResponse = {
        data: {
          id: "site1",
          displayName: "My Site",
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ site_id: "site1" });

      expect(mockGraphClient.get).toHaveBeenCalledWith("/sites/site1");
      expect(result).toEqual({
        ok: true,
        data: {
          id: "site1",
          displayName: "My Site",
        },
      });
    });

    it("should handle errors when getting a site", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("Not Found");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ site_id: "site1" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Not Found" });
    });
  });
});
