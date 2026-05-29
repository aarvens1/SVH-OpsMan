import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerPrinterLogicTools } from "../../tools/printerlogic";

// Mock printerlogicClient to avoid hoisting issues with vi.mock
const mockPrinterLogicClient = {
  get: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  printerlogicClient: vi.fn(() => mockPrinterLogicClient),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

// This import must be after mocks
import { printerlogicClient } from "../../utils/http.js";

describe("PrinterLogic Tools", () => {
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
    registerPrinterLogicTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerPrinterLogicTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("pl_list_printers", () => {
    const toolName = "pl_list_printers";

    it("should list printers on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      const mockResponse = {
        data: {
          total: 1,
          printers: [{
            id: "p1",
            name: "Office Printer",
            ipAddress: "192.168.1.100",
            location: "Floor 5",
            driverName: "HP Universal",
            status: "Online",
            enabled: true,
            folderId: "f1",
            model: "LaserJet Pro",
          }],
        },
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ search: "Office", limit: 10, offset: 0 });

      expect(printerlogicClient).toHaveBeenCalled();
      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/printers", {
        params: { search: "Office", limit: 10, offset: 0 },
      });
      expect(result).toEqual({
        ok: true,
        data: {
          total: 1,
          count: 1,
          printers: [{
            id: "p1",
            name: "Office Printer",
            ip_address: "192.168.1.100",
            location: "Floor 5",
            driver_name: "HP Universal",
            status: "Online",
            active: true,
            folder_id: "f1",
            model: "LaserJet Pro",
          }],
        },
      });
    });

    it("should handle errors when listing printers", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("API Error");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({});
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe("pl_get_printer", () => {
    const toolName = "pl_get_printer";

    it("should get printer details on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockDetails = {
        data: {
          id: "p1", name: "Lobby Printer", ipAddress: "10.0.0.5", model: "ColorCube"
        }
      };
      const mockDeployments = {
        data: {
          deployments: [{ id: "dep1", target: "user@example.com" }]
        }
      };
      vi.mocked(mockPrinterLogicClient.get)
        .mockResolvedValueOnce(mockDetails)
        .mockResolvedValueOnce(mockDeployments);

      const result = await handler({ printer_id: "p1" });

      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/printers/p1");
      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/printers/p1/deployments");
      expect(result.ok).toBe(true);
      expect(result.data.name).toBe("Lobby Printer");
      expect(result.data.deployments).toHaveLength(1);
    });

    it("should handle errors when getting a printer", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Not Found");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ printer_id: "p1" });
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Not Found" });
    });
  });

  describe("pl_list_drivers", () => {
    const toolName = "pl_list_drivers";

    it("should list drivers on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: {
          drivers: [{ id: "d1", name: "Generic PCL", version: "1.2", manufacturer: "Generic" }]
        }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ search: "PCL", limit: 10 });
      
      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/drivers", {
        params: { search: "PCL", limit: 10 },
      });
      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.drivers[0].name).toBe("Generic PCL");
    });

    it("should handle errors when listing drivers", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Server Error");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ limit: 10 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Server Error" });
    });
  });

  describe("pl_list_deployment_profiles", () => {
    const toolName = "pl_list_deployment_profiles";

    it("should list profiles on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: {
          profiles: [{ id: "prof1", name: "All Staff", enabled: true, type: "user" }]
        }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ limit: 20 });
      
      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/profiles", {
        params: { limit: 20 },
      });
      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.profiles[0].name).toBe("All Staff");
    });

    it("should handle errors when listing profiles", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Auth Failed");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);
      
      const result = await handler({ limit: 20 });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Auth Failed" });
    });
  });

  describe("pl_get_deployment_status", () => {
    const toolName = "pl_get_deployment_status";
    
    it("should get deployment status on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: { installed: 50, pending: 5, failed: 1, total: 56, lastUpdated: "2023-01-01" }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ printer_id: "p_abc" });

      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/printers/p_abc/deployment-status");
      expect(result.ok).toBe(true);
      expect(result.data.installed).toBe(50);
      expect(result.data.total).toBe(56);
    });

    it("should handle errors when getting status", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Invalid Printer ID");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ printer_id: "p_abc" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Invalid Printer ID" });
    });
  });

  describe("pl_get_audit_logs", () => {
    const toolName = "pl_get_audit_logs";

    it("should get audit logs on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: {
          total: 1,
          logs: [{ id: "log1", eventType: "printer_installed", user: "testuser" }]
        }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ event_type: "printer_installed", limit: 5 });

      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/audit-logs", {
        params: { event_type: "printer_installed", limit: 5 },
      });
      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.logs[0].event_type).toBe("printer_installed");
    });
    
    it("should handle errors when getting logs", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Bad Request");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ limit: 5 });
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Bad Request" });
    });
  });

  describe("pl_get_print_quota", () => {
    const toolName = "pl_get_print_quota";

    it("should get print quota on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: { limit: 1000, used: 250, remaining: 750, enabled: true }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ user_or_group: "finance_team" });

      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/quotas/finance_team");
      expect(result.ok).toBe(true);
      expect(result.data.quota_limit).toBe(1000);
      expect(result.data.pages_remaining).toBe(750);
    });

    it("should handle errors when getting quota", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("User not found");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ user_or_group: "nonexistent" });

      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "User not found" });
    });
  });

  describe("pl_get_usage_reports", () => {
    const toolName = "pl_get_usage_reports";

    it("should get usage reports on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const mockResponse = {
        data: {
          data: [{ user: "testuser", pagesPrinted: 150 }]
        }
      };
      vi.mocked(mockPrinterLogicClient.get).mockResolvedValue(mockResponse);

      const result = await handler({ report_type: "by_user", limit: 10 });
      
      expect(mockPrinterLogicClient.get).toHaveBeenCalledWith("/api/v1/reports/usage", {
        params: { limit: 10, type: "by_user" },
      });
      expect(result.ok).toBe(true);
      expect(result.data.count).toBe(1);
      expect(result.data.rows[0].name).toBe("testuser");
      expect(result.data.rows[0].pages_printed).toBe(150);
    });
    
    it("should handle errors when getting reports", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      const error = new Error("Invalid report type");
      vi.mocked(mockPrinterLogicClient.get).mockRejectedValue(error);

      const result = await handler({ report_type: "by_user", limit: 10 });
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "Invalid report type" });
    });
  });
});
