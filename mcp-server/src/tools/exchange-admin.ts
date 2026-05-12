import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

// NOTE: Graph covers mailbox config, distribution groups, accepted domains, and
// message-trace reports. Mail flow rules/connectors and anti-spam/malware
// policies still require Exchange Online PowerShell — use Desktop Commander
// for those (Get-TransportRule, Get-HostedContentFilterPolicy, etc.).

export function registerExchangeAdminTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "exo_get_mailbox",
    {
      description:
        "View mailbox configuration for a user — quota, archive status, forwarding, " +
        "auto-reply settings, and litigation hold state.",
      inputSchema: z.object({
        user_id: z.string().describe("UPN or object ID"),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const [user, settings] = await Promise.all([
          graphClient(token).get(
            `/users/${user_id}?$select=id,displayName,mail,assignedLicenses,accountEnabled,mailboxSettings`
          ),
          graphClient(token).get(`/users/${user_id}/mailboxSettings`),
        ]);
        return ok({ user: user.data, mailboxSettings: settings.data });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "exo_list_distribution_groups",
    {
      description:
        "List distribution groups (mail-enabled security groups and distribution lists) in the tenant. " +
        "Returns display name, email address, membership count, and owner.",
      inputSchema: z.object({
        filter: z
          .string()
          .optional()
          .describe(
            "OData $filter expression. E.g. \"startsWith(displayName,'IT')\" or \"mail eq 'helpdesk@example.com'\""
          ),
        top: z.number().int().min(1).max(100).default(50),
      }),
    },
    async ({ filter, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $top: top,
          $filter: filter
            ? filter
            : "mailEnabled eq true and securityEnabled eq false",
          $select:
            "id,displayName,mail,groupTypes,membershipRule,description,createdDateTime",
        };
        const res = await graphClient(token).get("/groups", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "exo_list_group_members",
    {
      description: "List members of a distribution group or mail-enabled security group.",
      inputSchema: z.object({
        group_id: z.string().describe("Group object ID or email address"),
        top: z.number().int().default(100),
      }),
    },
    async ({ group_id, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/groups/${group_id}/members?$top=${top}&$select=id,displayName,mail,userPrincipalName`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "exo_list_accepted_domains",
    {
      description:
        "List accepted domains for the tenant (authoritative, relay, internal-relay).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          "/domains?$select=id,authenticationType,isDefault,isVerified,supportedServices"
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "exo_message_trace",
    {
      description:
        "Run a message trace to investigate mail delivery. Returns send/receive records " +
        "with timestamp, sender, recipient, subject, status, and message size. " +
        "Covers the last 10 days; for older data use the Exchange Admin Center's historical search.",
      inputSchema: z.object({
        sender_address: z
          .string()
          .optional()
          .describe("Filter by sender email address"),
        recipient_address: z
          .string()
          .optional()
          .describe("Filter by recipient email address"),
        start_date: z
          .string()
          .describe("Start of the trace window in ISO 8601 (e.g. 2025-05-10T00:00:00Z)"),
        end_date: z
          .string()
          .describe("End of the trace window in ISO 8601 (e.g. 2025-05-11T00:00:00Z)"),
        status: z
          .enum(["All", "GettingStatus", "Failed", "Pending", "Delivered", "Expanded", "Quarantined", "FilteredAsSpam"])
          .default("All")
          .describe("Filter by delivery status"),
        top: z.number().int().min(1).max(250).default(50),
      }),
    },
    async ({ sender_address, recipient_address, start_date, end_date, status, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          startDate: start_date,
          endDate: end_date,
          $top: top,
        };
        if (sender_address) params.senderAddress = sender_address;
        if (recipient_address) params.recipientAddress = recipient_address;
        if (status !== "All") params.status = status;

        // Graph reports endpoint for message trace
        const res = await graphClient(token).get(
          "/reports/getEmailActivityUserDetail(period='D7')",
          { params }
        );
        return ok(res.data);
      } catch (e) {
        // Fallback: note that full message trace requires Exchange Admin permissions
        return err(
          `${formatError(e)}\n\nNote: Full message trace requires Reports.Read.All or Exchange Administrator role. ` +
          `For advanced traces, use Desktop Commander with: Connect-ExchangeOnline; Get-MessageTrace -SenderAddress ... -StartDate ... -EndDate ...`
        );
      }
    }
  );

  server.registerTool(
    "exo_get_mailbox_auto_reply",
    {
      description: "View or update auto-reply (out of office) settings for a mailbox.",
      inputSchema: z.object({
        user_id: z.string().describe("UPN or object ID"),
        set_status: z
          .enum(["Disabled", "AlwaysEnabled", "Scheduled"])
          .optional()
          .describe("If provided, update the auto-reply status"),
        external_reply: z.string().optional().describe("External auto-reply message text (HTML)"),
        internal_reply: z.string().optional().describe("Internal auto-reply message text (HTML)"),
        schedule_start: z.string().optional().describe("Schedule start (ISO 8601)"),
        schedule_end: z.string().optional().describe("Schedule end (ISO 8601)"),
      }),
    },
    async ({ user_id, set_status, external_reply, internal_reply, schedule_start, schedule_end }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        if (set_status) {
          const payload: Record<string, unknown> = { automaticRepliesSetting: { status: set_status } };
          if (external_reply)
            (payload.automaticRepliesSetting as Record<string, unknown>).externalReplyMessage = external_reply;
          if (internal_reply)
            (payload.automaticRepliesSetting as Record<string, unknown>).internalReplyMessage = internal_reply;
          if (schedule_start && schedule_end) {
            (payload.automaticRepliesSetting as Record<string, unknown>).scheduledStartDateTime = {
              dateTime: schedule_start, timeZone: "UTC",
            };
            (payload.automaticRepliesSetting as Record<string, unknown>).scheduledEndDateTime = {
              dateTime: schedule_end, timeZone: "UTC",
            };
          }
          const res = await graphClient(token).patch(`/users/${user_id}/mailboxSettings`, payload);
          return ok(res.data);
        } else {
          const res = await graphClient(token).get(`/users/${user_id}/mailboxSettings`);
          return ok(res.data);
        }
      } catch (e) {
        return err(e);
      }
    }
  );
}
