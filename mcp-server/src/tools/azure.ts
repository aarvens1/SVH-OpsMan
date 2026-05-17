import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getArmToken } from "../auth/azure.js";
import { armClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

function sub(): string {
  return process.env["AZURE_SUBSCRIPTION_ID"] ?? "";
}

function resourceName(id: string | undefined): string | null {
  return id ? (id.split("/").pop() ?? null) : null;
}

function powerState(statuses: Array<{ code?: string; displayStatus?: string }>): string {
  return statuses.find((s) => s.code?.startsWith("PowerState/"))?.displayStatus ?? "Unknown";
}

// ARM API responses have no SDK types; alias avoids per-line eslint suppressions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = Record<string, any>;

// Read-only. Service principal needs: Reader + Cost Management Reader at subscription scope.

export function registerAzureTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "azure_list_resource_groups",
    {
      description:
        "List all resource groups in the Azure subscription. " +
        "Use this to discover what resource groups exist before scoping other azure_ tools.",
      inputSchema: z.object({
        filter: z
          .string()
          .optional()
          .describe("OData $filter expression, e.g. \"tagName eq 'env' and tagValue eq 'prod'\""),
      }),
    },
    async ({ filter }) => {
      try {
        const token = await getArmToken();
        const params: Record<string, string> = { "api-version": "2021-04-01" };
        if (filter) params["$filter"] = filter;
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/resourcegroups`,
          { params }
        );
        const groups = (res.data.value ?? []).map((g: A) => ({
          name: g.name,
          location: g.location,
          provisioning_state: g.properties?.provisioningState,
          tags: g.tags ?? {},
        }));
        return ok(groups);
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
        "Returns VM name, size, OS, power state, and location.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit for all VMs."),
      }),
    },
    async ({ resource_group }) => {
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Compute/virtualMachines`
          : `/subscriptions/${sub()}/providers/Microsoft.Compute/virtualMachines`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-03-01", $expand: "instanceView" },
        });
        const vms = (res.data.value ?? []).map((vm: A) => ({
          name: vm.name,
          location: vm.location,
          resource_group: vm.id?.split("/")[4] ?? null,
          size: vm.properties?.hardwareProfile?.vmSize ?? null,
          os_type: vm.properties?.storageProfile?.osDisk?.osType ?? null,
          power_state: powerState(vm.properties?.instanceView?.statuses ?? []),
          provisioning_state: vm.properties?.provisioningState ?? null,
          tags: vm.tags ?? {},
        }));
        return ok(vms);
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
      try {
        const token = await getArmToken();
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Compute/virtualMachines/${vm_name}`,
          { params: { "api-version": "2024-03-01", $expand: "instanceView" } }
        );
        const vm: A = res.data;
        const nics = (vm.properties?.networkProfile?.networkInterfaces ?? []).map((n: A) =>
          resourceName(n.id)
        );
        return ok({
          name: vm.name,
          location: vm.location,
          resource_group: vm.id?.split("/")[4] ?? null,
          size: vm.properties?.hardwareProfile?.vmSize ?? null,
          os_type: vm.properties?.storageProfile?.osDisk?.osType ?? null,
          os_disk: vm.properties?.storageProfile?.osDisk?.name ?? null,
          power_state: powerState(vm.properties?.instanceView?.statuses ?? []),
          provisioning_state: vm.properties?.provisioningState ?? null,
          network_interfaces: nics,
          tags: vm.tags ?? {},
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_storage_accounts",
    {
      description:
        "List storage accounts in the subscription or resource group. " +
        "Returns account name, SKU, kind, location, and primary endpoints.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit to list across the subscription."),
      }),
    },
    async ({ resource_group }) => {
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Storage/storageAccounts`
          : `/subscriptions/${sub()}/providers/Microsoft.Storage/storageAccounts`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2023-01-01" },
        });
        const accounts = (res.data.value ?? []).map((a: A) => ({
          name: a.name,
          location: a.location,
          resource_group: a.id?.split("/")[4] ?? null,
          sku: a.sku?.name ?? null,
          kind: a.kind ?? null,
          blob_endpoint: a.properties?.primaryEndpoints?.blob ?? null,
          https_only: a.properties?.supportsHttpsTrafficOnly ?? null,
          allow_blob_public_access: a.properties?.allowBlobPublicAccess ?? null,
          provisioning_state: a.properties?.provisioningState ?? null,
          tags: a.tags ?? {},
        }));
        return ok(accounts);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_app_services",
    {
      description:
        "List App Service web apps, function apps, and API apps in the subscription. " +
        "Returns app name, kind, state, hostnames, and App Service Plan.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit to list across the subscription."),
      }),
    },
    async ({ resource_group }) => {
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Web/sites`
          : `/subscriptions/${sub()}/providers/Microsoft.Web/sites`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2023-12-01" },
        });
        const apps = (res.data.value ?? []).map((app: A) => ({
          name: app.name,
          location: app.location,
          resource_group: app.id?.split("/")[4] ?? null,
          kind: app.kind ?? null,
          state: app.properties?.state ?? null,
          default_hostname: app.properties?.defaultHostName ?? null,
          https_only: app.properties?.httpsOnly ?? null,
          app_service_plan: resourceName(app.properties?.serverFarmId),
          provisioning_state: app.properties?.provisioningState ?? null,
          tags: app.tags ?? {},
        }));
        return ok(apps);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_vnets",
    {
      description:
        "List virtual networks and their subnets in the subscription. " +
        "Returns VNet name, address space, subnets with CIDRs, and peering connections. " +
        "Use when mapping cloud network topology or investigating routing.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit to list across the subscription."),
      }),
    },
    async ({ resource_group }) => {
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Network/virtualNetworks`
          : `/subscriptions/${sub()}/providers/Microsoft.Network/virtualNetworks`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-01-01" },
        });
        const vnets = (res.data.value ?? []).map((v: A) => ({
          name: v.name,
          location: v.location,
          resource_group: v.id?.split("/")[4] ?? null,
          address_space: v.properties?.addressSpace?.addressPrefixes ?? [],
          subnets: (v.properties?.subnets ?? []).map((s: A) => ({
            name: s.name,
            // addressPrefixes (array) supersedes addressPrefix (string) for multi-CIDR subnets
            cidrs: s.properties?.addressPrefixes ?? (
              s.properties?.addressPrefix != null ? [s.properties.addressPrefix] : []
            ),
            nsg: resourceName(s.properties?.networkSecurityGroup?.id),
          })),
          peerings: (v.properties?.virtualNetworkPeerings ?? []).map((p: A) => p.name),
          tags: v.tags ?? {},
        }));
        return ok(vnets);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "azure_list_nsgs",
    {
      description:
        "List network security groups and their inbound/outbound security rules. " +
        "Use when auditing internet-exposed ports or reviewing firewall posture for Azure resources.",
      inputSchema: z.object({
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit to list across the subscription."),
      }),
    },
    async ({ resource_group }) => {
      try {
        const token = await getArmToken();
        const path = resource_group
          ? `/subscriptions/${sub()}/resourceGroups/${resource_group}/providers/Microsoft.Network/networkSecurityGroups`
          : `/subscriptions/${sub()}/providers/Microsoft.Network/networkSecurityGroups`;
        const res = await armClient(token).get(path, {
          params: { "api-version": "2024-01-01" },
        });
        const nsgs = (res.data.value ?? []).map((nsg: A) => ({
          name: nsg.name,
          location: nsg.location,
          resource_group: nsg.id?.split("/")[4] ?? null,
          rules: (nsg.properties?.securityRules ?? [])
            .map((r: A) => ({
              name: r.name,
              priority: r.properties?.priority,
              direction: r.properties?.direction,
              access: r.properties?.access,
              protocol: r.properties?.protocol,
              source: r.properties?.sourceAddressPrefix,
              source_port: r.properties?.sourcePortRange,
              destination: r.properties?.destinationAddressPrefix,
              destination_port: r.properties?.destinationPortRange,
            }))
            .sort((a: A, b: A) => a.priority - b.priority),
          tags: nsg.tags ?? {},
        }));
        return ok(nsgs);
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
        resource_group: z
          .string()
          .optional()
          .describe("Scope to a specific resource group. Omit for subscription-wide logs."),
        caller: z.string().optional().describe("Filter by caller UPN or service principal"),
        status: z
          .enum(["Succeeded", "Failed", "Started", "Accepted"])
          .optional()
          .describe("Filter by operation status"),
        top: z.number().int().default(50).describe("Maximum number of events to return (default 50)"),
      }),
    },
    async ({ start_time, end_time, resource_group, caller, status, top }) => {
      try {
        const token = await getArmToken();
        const filters: string[] = [`eventTimestamp ge '${start_time}'`];
        if (end_time) filters.push(`eventTimestamp le '${end_time}'`);
        if (resource_group) filters.push(`resourceGroupName eq '${resource_group}'`);
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
        const events = (res.data.value ?? []).map((e: A) => ({
          timestamp: e.eventTimestamp,
          level: e.level,
          operation: e.operationName?.localizedValue ?? e.operationName?.value ?? null,
          caller: e.caller ?? null,
          resource_group: e.resourceGroupName ?? null,
          resource: resourceName(e.resourceId),
          resource_id: e.resourceId ?? null,
          status: e.status?.localizedValue ?? e.status?.value ?? null,
          correlation_id: e.correlationId ?? null,
        }));
        return ok(events);
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
          .default("ResourceGroup")
          .describe("Dimension to group costs by — ResourceGroup, ServiceName, or ResourceType"),
      }),
    },
    async ({ period, group_by }) => {
      try {
        const token = await getArmToken();
        const payload = {
          type: "ActualCost",
          timeframe: period === "BillingMonth" || period === "Month" ? period : "Custom",
          dataset: {
            granularity: "None",
            aggregation: { totalCost: { name: "Cost", function: "Sum" } },
            grouping: [{ type: "Dimension", name: group_by }],
          },
        };
        const res = await armClient(token).post(
          `/subscriptions/${sub()}/providers/Microsoft.CostManagement/query`,
          payload,
          { params: { "api-version": "2023-11-01" } }
        );
        const props: A = res.data?.properties;
        const columns: string[] = (props?.columns ?? []).map((c: A) => c.name as string);
        const rows = (props?.rows ?? []).map((row: unknown[]) => {
          const obj: Record<string, unknown> = {};
          columns.forEach((col, i) => { obj[col] = row[i]; });
          return obj;
        });
        return ok({ currency: props?.currency ?? "USD", group_by, rows });
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
      try {
        const token = await getArmToken();
        const params: Record<string, string> = { "api-version": "2020-01-01" };
        if (category) params["$filter"] = `category eq '${category}'`;
        const res = await armClient(token).get(
          `/subscriptions/${sub()}/providers/Microsoft.Advisor/recommendations`,
          { params }
        );
        const recs = (res.data.value ?? []).map((r: A) => ({
          category: r.properties?.category ?? null,
          impact: r.properties?.impact ?? null,
          problem: r.properties?.shortDescription?.problem ?? null,
          solution: r.properties?.shortDescription?.solution ?? null,
          resource: resourceName(r.properties?.resourceMetadata?.resourceId),
          resource_id: r.properties?.resourceMetadata?.resourceId ?? null,
          impacted_field: r.properties?.impactedField ?? null,
          impacted_value: r.properties?.impactedValue ?? null,
          last_updated: r.properties?.lastUpdated ?? null,
        }));
        return ok(recs);
      } catch (e) {
        return err(e);
      }
    }
  );
}
