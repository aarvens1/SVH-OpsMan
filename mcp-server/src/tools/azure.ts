import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getArmToken } from "../auth/azure.js";
import { armClient, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Azure service not configured: set AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

function sub(): string {
  return process.env["AZURE_SUBSCRIPTION_ID"] ?? "";
}

// Read-only. Service principal needs: Reader + Cost Management Reader at subscription scope.

export function registerAzureTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "azure_list_resource_groups",
    {
      description: "List all resource groups in the Azure subscription.",
      inputSchema: z.object({
        filter: z.string().optional().describe("OData $filter expression"),
      }),
    },
    async ({ filter }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const params: Record<string, string> = { "api-version": "2021-04-01" };
        if (filter) params["$filter"] = filter;
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/resourcegroups`,
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_vms",
    {
      description:
        "List virtual machines across the subscription or within a resource group. " +
        "Returns VM name, size, OS, status, and location.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit for all VMs."),
      }),
    },
    async ({ resource_group }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Compute/virtualMachines`
          : `/subscriptions/${sub()}/providers/Microsoft.Compute/virtualMachines`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-03-01", $expand: "instanceView" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_get_vm",
    {
      description: "Get full details for a specific Azure VM including instance view, OS disk, and network interfaces.",
      inputSchema: z.object({
        resource_group: z.string().describe("Resource group name"),
        vm_name: z.string().describe("VM name"),
      }),
    },
    async ({ resource_group, vm_name }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Compute/virtualMachines/${vm_name}`,
          { params: { "api-version": "2024-03-01", $expand: "instanceView" } }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_storage_accounts",
    {
      description: "List storage accounts in the subscription or resource group.",
      inputSchema: z.object({
        resource_group: z.string().optional(),
      }),
    },
    async ({ resource_group }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Storage/storageAccounts`
          : `/subscriptions/${sub()}/providers/Microsoft.Storage/storageAccounts`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2023-01-01" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_app_services",
    {
      description: "List App Service web apps, function apps, and API apps in the subscription.",
      inputSchema: z.object({
        resource_group: z.string().optional(),
      }),
    },
    async ({ resource_group }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Web/sites`
          : `/subscriptions/${sub()}/providers/Microsoft.Web/sites`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2023-12-01" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_vnets",
    {
      description: "List virtual networks and their subnets in the subscription.",
      inputSchema: z.object({
        resource_group: z.string().optional(),
      }),
    },
    async ({ resource_group }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Network/virtualNetworks`
          : `/subscriptions/${sub()}/providers/Microsoft.Network/virtualNetworks`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-01-01" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_nsgs",
    {
      description: "List network security groups and their security rules.",
      inputSchema: z.object({
        resource_group: z.string().optional(),
      }),
    },
    async ({ resource_group }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Network/networkSecurityGroups`
          : `/subscriptions/${sub()}/providers/Microsoft.Network/networkSecurityGroups`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-01-01" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_get_activity_logs",
    {
      description:
        "Query Azure activity logs (audit trail for control-plane operations). " +
        "Useful for investigating 'who deleted X' or 'what changed at time Y'.",
      inputSchema: z.object({
        start_time: z
          .string()
          .describe("Start time in ISO 8601 (e.g. 2025-05-01T00:00:00Z)"),
        end_time: z.string().optional().describe("End time in ISO 8601. Defaults to now."),
        resource_group: z.string().optional(),
        caller: z.string().optional().describe("Filter by caller UPN or service principal"),
        status: z
          .enum(["Succeeded", "Failed", "Started", "Accepted"])
          .optional()
          .describe("Filter by operation status"),
        top: z.number().int().default(50),
      }),
    },
    async ({ start_time, end_time, resource_group, caller, status, top }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const filters: string[] = [`eventTimestamp ge '${start_time}'`];
        if (end_time) filters.push(`eventTimestamp le '${end_time}'`);
        if (resource_group)
          filters.push(`resourceGroupName eq '${resource_group}'`);
        if (caller) filters.push(`caller eq '${caller}'`);
        if (status) filters.push(`status eq '${status}'`);

        const res = await armClient(token).get(
          `/subscriptions/${sub()}/providers/Microsoft.Insights/eventtypes/management/values`,
          {
            params: {
              "api-version": "2015-04-01",
              $filter: filters.join(" and "),
              $top: top,
            },
          }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_get_cost_summary",
    {
      description:
        "Get a cost summary for the subscription broken down by resource group or service. " +
        "Returns actual cost for the specified billing period.",
      inputSchema: z.object({
        period: z
          .string()
          .default("BillingMonth")
          .describe("Time grain: BillingMonth, Month, or a custom range"),
        group_by: z
          .enum(["ResourceGroup", "ServiceName", "ResourceType"])
          .default("ResourceGroup"),
      }),
    },
    async ({ period, group_by }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const payload = {
          type: "ActualCost",
          timeframe: period === "BillingMonth" || period === "Month" ? period : "Custom",
          dataset: {
            granularity: "None",
            aggregation: {
              totalCost: { name: "Cost", function: "Sum" },
            },
            grouping: [{ type: "Dimension", name: group_by }],
          },
        };
        const res = await armClient(token).post(
          `/subscriptions/${sub()}/providers/Microsoft.CostManagement/query`,
          payload,
          { params: { "api-version": "2023-11-01" } }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_advisor_recommendations",
    {
      description:
        "List Azure Advisor recommendations (cost, security, reliability, performance, operational excellence).",
      inputSchema: z.object({
        category: z
          .enum(["Cost", "Security", "HighAvailability", "Performance", "OperationalExcellence"])
          .optional()
          .describe("Filter by recommendation category"),
      }),
    },
    async ({ category }) => {
      if (!enabled) return disabled();
      try {
        const token = await getArmToken();
        const params: Record<string, string> = { "api-version": "2023-01-01" };
        if (category) params["$filter"] = `category eq '${category}'`;
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/providers/Microsoft.Advisor/recommendations`,
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
