import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

export function registerIntuneTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const filters: string[] = [];
        if (os_type !== "all") filters.push(`operatingSystem eq '${os_type}'`);
        if (compliance_state !== "all") filters.push(`complianceState eq '${compliance_state}'`);
        const params: Record<string, string | number> = { $top: top };
        if (filters.length) params["$filter"] = filters.join(" and ");
        const res = await graphClient(token).get("/deviceManagement/managedDevices", { params });
        const devices = ((res.data as A)["value"] as A[] ?? []).map((d: A) => ({
          id: d["id"],
          deviceName: d["deviceName"],
          operatingSystem: d["operatingSystem"],
          osVersion: d["osVersion"],
          complianceState: d["complianceState"],
          managementState: d["managementState"],
          enrollmentType: d["enrollmentType"],
          lastSyncDateTime: d["lastSyncDateTime"],
          enrolledDateTime: d["enrolledDateTime"],
          userPrincipalName: d["userPrincipalName"],
          userDisplayName: d["userDisplayName"],
          serialNumber: d["serialNumber"],
          model: d["model"],
          manufacturer: d["manufacturer"],
          isEncrypted: d["isEncrypted"],
          managedDeviceOwnerType: d["managedDeviceOwnerType"],
          aadRegistered: d["aadRegistered"],
          azureADRegistered: d["azureADRegistered"],
        }));
        return ok({ count: devices.length, devices });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/deviceManagement/managedDevices/${device_id}`);
        const d = res.data as A;
        return ok({
          id: d["id"],
          deviceName: d["deviceName"],
          operatingSystem: d["operatingSystem"],
          osVersion: d["osVersion"],
          complianceState: d["complianceState"],
          managementState: d["managementState"],
          enrollmentType: d["enrollmentType"],
          lastSyncDateTime: d["lastSyncDateTime"],
          enrolledDateTime: d["enrolledDateTime"],
          userPrincipalName: d["userPrincipalName"],
          userDisplayName: d["userDisplayName"],
          serialNumber: d["serialNumber"],
          model: d["model"],
          manufacturer: d["manufacturer"],
          isEncrypted: d["isEncrypted"],
          totalStorageSpaceInBytes: d["totalStorageSpaceInBytes"],
          freeStorageSpaceInBytes: d["freeStorageSpaceInBytes"],
          physicalMemoryInBytes: d["physicalMemoryInBytes"],
          processorArchitecture: d["processorArchitecture"],
          imei: d["imei"],
          meid: d["meid"],
          wiFiMacAddress: d["wiFiMacAddress"],
          ethernetMacAddress: d["ethernetMacAddress"],
          managedDeviceOwnerType: d["managedDeviceOwnerType"],
          aadRegistered: d["aadRegistered"],
          azureADDeviceId: d["azureADDeviceId"],
          deviceEnrollmentType: d["deviceEnrollmentType"],
          activationLockBypassCode: d["activationLockBypassCode"],
          emailAddress: d["emailAddress"],
          azureActiveDirectoryDeviceId: d["azureActiveDirectoryDeviceId"],
        });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/deviceManagement/managedDevices/${device_id}/deviceCompliancePolicyStates`
        );
        const states = ((res.data as A)["value"] as A[] ?? []).map((s: A) => ({
          id: s["id"],
          displayName: s["displayName"],
          state: s["state"],
          version: s["version"],
          settingCount: s["settingCount"],
          settingStates: s["settingStates"],
          platformType: s["platformType"],
        }));
        return ok({ count: states.length, policyStates: states });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceManagement/deviceCompliancePolicies");
        const policies = ((res.data as A)["value"] as A[] ?? []).map((p: A) => ({
          id: p["id"],
          displayName: p["displayName"],
          description: p["description"],
          version: p["version"],
          createdDateTime: p["createdDateTime"],
          lastModifiedDateTime: p["lastModifiedDateTime"],
          scheduledActionsForRule: p["scheduledActionsForRule"],
        }));
        return ok({ count: policies.length, policies });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceManagement/deviceConfigurations");
        const configs = ((res.data as A)["value"] as A[] ?? []).map((c: A) => ({
          id: c["id"],
          displayName: c["displayName"],
          description: c["description"],
          version: c["version"],
          createdDateTime: c["createdDateTime"],
          lastModifiedDateTime: c["lastModifiedDateTime"],
        }));
        return ok({ count: configs.length, configurations: configs });
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
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/deviceAppManagement/mobileApps", {
          params: { $top: top },
        });
        const apps = ((res.data as A)["value"] as A[] ?? []).map((a: A) => ({
          id: a["id"],
          displayName: a["displayName"],
          description: a["description"],
          publisher: a["publisher"],
          appVersion: a["appVersion"],
          publishingState: a["publishingState"],
          createdDateTime: a["createdDateTime"],
          lastModifiedDateTime: a["lastModifiedDateTime"],
          isFeatured: a["isFeatured"],
          privacyInformationUrl: a["privacyInformationUrl"],
          informationUrl: a["informationUrl"],
        }));
        return ok({ count: apps.length, apps });
      } catch (e) {
        return err(e);
      }
    }
  );
}
