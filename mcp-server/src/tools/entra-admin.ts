import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

export function registerEntraAdminTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;
  server.registerTool(
    "entra_get_user_mfa_methods",
    {
      description:
        "List the MFA / authentication methods registered for a user: " +
        "Authenticator app, FIDO2 keys, phone numbers, temporary access passes, etc.",
      inputSchema: z.object({
        user_id: z.string().describe("User object ID or UPN (e.g. user@company.com)"),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/users/${user_id}/authentication/methods`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_list_conditional_access_policies",
    {
      description:
        "List all Conditional Access policies in the tenant, including their state (enabled/disabled/report-only), " +
        "conditions (users, apps, locations, device compliance), and grant controls (MFA, compliant device, etc.).",
      inputSchema: z.object({
        state: z
          .enum(["enabled", "disabled", "enabledForReportingButNotEnforced", "all"])
          .default("all")
          .describe("Filter by policy state"),
      }),
    },
    async ({ state }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string> = {};
        if (state !== "all") params["$filter"] = `state eq '${state}'`;
        const res = await graphClient(token).get(
          "/identity/conditionalAccess/policies",
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_list_app_registrations",
    {
      description:
        "List all Entra ID app registrations. Returns display name, app ID, creation date, " +
        "and credential expiry dates so you can spot apps with expiring or expired secrets/certificates.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(200).default(50),
        filter: z
          .string()
          .optional()
          .describe("OData filter, e.g. \"displayName eq 'MyApp'\""),
      }),
    },
    async ({ top, filter }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $top: top,
          $select:
            "id,displayName,appId,createdDateTime,passwordCredentials,keyCredentials,signInAudience",
        };
        if (filter) params["$filter"] = filter;
        const res = await graphClient(token).get("/applications", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_list_expiring_secrets",
    {
      description:
        "Find app registrations and service principals with client secrets or certificates " +
        "expiring within the next N days. Essential for preventing authentication outages.",
      inputSchema: z.object({
        days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(30)
          .describe("Flag secrets expiring within this many days"),
      }),
    },
    async ({ days }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const client = graphClient(token);
        const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

        const [appsRes, spsRes] = await Promise.all([
          client.get("/applications?$select=id,displayName,appId,passwordCredentials,keyCredentials&$top=200"),
          client.get("/servicePrincipals?$select=id,displayName,appId,passwordCredentials,keyCredentials&$top=200"),
        ]);

        type CredItem = { displayName?: string; endDateTime?: string; hint?: string };
        type AppItem = { displayName: string; appId: string; passwordCredentials: CredItem[]; keyCredentials: CredItem[] };

        const expiring: unknown[] = [];
        const check = (items: AppItem[], kind: string) => {
          for (const app of items) {
            const creds = [
              ...app.passwordCredentials.map((c) => ({ ...c, credType: "secret" })),
              ...app.keyCredentials.map((c) => ({ ...c, credType: "certificate" })),
            ];
            for (const cred of creds) {
              if (cred.endDateTime && cred.endDateTime < cutoff) {
                expiring.push({
                  kind,
                  appDisplayName: app.displayName,
                  appId: app.appId,
                  credType: cred.credType,
                  hint: cred.hint,
                  expiresAt: cred.endDateTime,
                  expired: cred.endDateTime < new Date().toISOString(),
                });
              }
            }
          }
        };

        check(appsRes.data.value as AppItem[], "app_registration");
        check(spsRes.data.value as AppItem[], "service_principal");

        expiring.sort((a, b) => {
          const ea = (a as Record<string, string>)["expiresAt"] ?? "";
          const eb = (b as Record<string, string>)["expiresAt"] ?? "";
          return ea.localeCompare(eb);
        });

        return ok({ count: expiring.length, within_days: days, expiring });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_list_directory_roles",
    {
      description:
        "List all active directory roles in the tenant (e.g. Global Administrator, " +
        "Security Administrator, Helpdesk Administrator). Returns role ID and display name.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/directoryRoles", {
          params: { $select: "id,displayName,description,roleTemplateId" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_get_role_members",
    {
      description:
        "List the users, groups, and service principals currently assigned to a directory role. " +
        "Use this to audit who has elevated privileges like Global Admin.",
      inputSchema: z.object({
        role_id: z.string().describe("Directory role object ID (from entra_list_directory_roles)"),
      }),
    },
    async ({ role_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/directoryRoles/${role_id}/members`, {
          params: { $select: "id,displayName,userPrincipalName,mail,@odata.type" },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_list_risky_users",
    {
      description:
        "List users flagged as risky by Entra ID Identity Protection, with their risk level " +
        "(low/medium/high) and risk detail. Requires an Entra ID P2 license.",
      inputSchema: z.object({
        risk_level: z
          .enum(["low", "medium", "high", "all"])
          .default("high")
          .describe("Minimum risk level to return"),
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ risk_level, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $top: top,
          $select: "id,userDisplayName,userPrincipalName,riskLevel,riskState,riskDetail,riskLastUpdatedDateTime",
        };
        if (risk_level !== "all") params["$filter"] = `riskLevel eq '${risk_level}'`;
        const res = await graphClient(token).get("/identityProtection/riskyUsers", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_dismiss_risky_user",
    {
      description:
        "Dismiss the risk for one or more users in Entra ID Identity Protection, " +
        "marking them as safe after investigation.",
      inputSchema: z.object({
        user_ids: z
          .array(z.string())
          .min(1)
          .describe("List of user object IDs to dismiss risk for"),
      }),
    },
    async ({ user_ids }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        await graphClient(token).post("/identityProtection/riskyUsers/dismiss", {
          userIds: user_ids,
        });
        return ok({ success: true, dismissed_count: user_ids.length });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_get_sign_in_logs",
    {
      description:
        "Query Entra ID sign-in logs. Filter by user, app, IP, status, or time window. " +
        "Returns sign-in time, app, IP, location, device, MFA result, and conditional access outcome. " +
        "Requires AuditLog.Read.All.",
      inputSchema: z.object({
        user_id: z
          .string()
          .optional()
          .describe("Filter by UPN or object ID"),
        app_display_name: z
          .string()
          .optional()
          .describe("Filter by application display name"),
        ip_address: z.string().optional().describe("Filter by client IP address"),
        status: z
          .enum(["success", "failure", "interrupted", "all"])
          .default("all"),
        hours: z
          .number()
          .int()
          .min(1)
          .max(168)
          .default(24)
          .describe("Look back this many hours"),
        top: z.number().int().min(1).max(500).default(100),
      }),
    },
    async ({ user_id, app_display_name, ip_address, status, hours, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const since = new Date(Date.now() - hours * 3_600_000).toISOString();
        const filters: string[] = [`createdDateTime ge ${since}`];
        if (user_id) filters.push(`userPrincipalName eq '${user_id}'`);
        if (app_display_name) filters.push(`appDisplayName eq '${app_display_name}'`);
        if (ip_address) filters.push(`ipAddress eq '${ip_address}'`);
        if (status === "success") filters.push("status/errorCode eq 0");
        if (status === "failure") filters.push("status/errorCode ne 0");
        const res = await graphClient(token).get("/auditLogs/signIns", {
          params: {
            $filter: filters.join(" and "),
            $top: top,
            $orderby: "createdDateTime desc",
            $select:
              "id,createdDateTime,userDisplayName,userPrincipalName,appDisplayName,ipAddress,location,status,conditionalAccessStatus,mfaDetail,deviceDetail,clientAppUsed,riskLevelDuringSignIn",
          },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "entra_get_audit_logs",
    {
      description:
        "Query Entra ID audit logs — directory changes like user creation/deletion, " +
        "group membership changes, role assignments, app consent, and policy modifications. " +
        "Requires AuditLog.Read.All.",
      inputSchema: z.object({
        category: z
          .string()
          .optional()
          .describe(
            "Audit log category (e.g. 'UserManagement', 'GroupManagement', 'RoleManagement', 'ApplicationManagement', 'Policy')"
          ),
        initiated_by: z
          .string()
          .optional()
          .describe("Filter by actor UPN or app display name"),
        hours: z.number().int().min(1).max(168).default(24).describe("Look back this many hours"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ category, initiated_by, hours, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const since = new Date(Date.now() - hours * 3_600_000).toISOString();
        const filters: string[] = [`activityDateTime ge ${since}`];
        if (category) filters.push(`category eq '${category}'`);
        if (initiated_by)
          filters.push(
            `initiatedBy/user/userPrincipalName eq '${initiated_by}' or initiatedBy/app/displayName eq '${initiated_by}'`
          );
        const res = await graphClient(token).get("/auditLogs/directoryAudits", {
          params: {
            $filter: filters.join(" and "),
            $top: top,
            $orderby: "activityDateTime desc",
            $select:
              "id,activityDateTime,activityDisplayName,category,result,resultReason,initiatedBy,targetResources",
          },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
