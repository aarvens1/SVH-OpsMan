import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Graph service not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerEntraAdminTools(server: McpServer, enabled: boolean): void {
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
      if (!enabled) return disabled();
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
}
