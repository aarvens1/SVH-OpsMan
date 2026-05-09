import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "MS Intune not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET. " +
  "App registration requires: DeviceManagementManagedDevices.Read.All, " +
  "DeviceManagementConfiguration.Read.All, DeviceManagementApps.Read.All";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerIntuneTools(server: McpServer, enabled: boolean): void {
  // ── Managed Devices ────────────────────────────────────────────────────────

  server.registerTool(
    "intune_list_devices",
    {
      description:
        "List all devices enrolled in Microsoft Intune with OS, compliance state, last sync time, and assigned user.",
      inputSchema: z.object({
        os_type: z
          .enum(["windows", "ios", "android", "macos", "all"])
          .default("all")
          .describe("Filter by operating system"),
        compliance_state: z
          .enum(["compliant", "noncompliant", "unknown", "all"])
          .default("all")
          .describe("Filter by compliance state"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ os_type, compliance_state, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const filters: string[] = [];
        if (os_type !== "all") filters.push(`operatingSystem eq '${os_type}'`);
        if (compliance_state !== "all") filters.push(`complianceState eq '${compliance_state}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await graphClient(token).get("/deviceManagement/managedDevices", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "intune_get_device",
    {
      description:
        "Get full details for a specific Intune-managed device: hardware info, OS version, encryption status, last sync, and assigned user.",
      inputSchema: z.object({
        device_id: z.string().describe("Intune managed device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/deviceManagement/managedDevices/${device_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "intune_get_device_compliance",
    {
      description:
        "Get the compliance policy states for a specific Intune-managed device, showing which policies pass or fail.",
      inputSchema: z.object({
        device_id: z.string().describe("Intune managed device ID"),
      }),
    },
    async ({ device_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/deviceManagement/managedDevices/${device_id}/deviceCompliancePolicyStates`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Compliance Policies ────────────────────────────────────────────────────

  server.registerTool(
    "intune_list_compliance_policies",
    {
      description:
        "List all device compliance policies configured in Intune with their platform, settings, and assignment targets.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceManagement/deviceCompliancePolicies");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Device Configurations ──────────────────────────────────────────────────

  server.registerTool(
    "intune_list_device_configurations",
    {
      description:
        "List all device configuration profiles in Intune (e.g. Wi-Fi, VPN, restrictions, endpoint protection).",
      inputSchema: z.object({}),
    },
    async () => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceManagement/deviceConfigurations");
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Apps ───────────────────────────────────────────────────────────────────

  server.registerTool(
    "intune_list_apps",
    {
      description:
        "List all managed apps deployed via Intune, including their type, publisher, and assignment status.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceAppManagement/mobileApps", {
          params: { $top: top },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
