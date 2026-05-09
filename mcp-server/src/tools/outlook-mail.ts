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

export function registerOutlookMailTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "mail_search",
    {
      description:
        "Search Outlook messages using KQL (keyword query language). " +
        "Examples: 'from:alice@example.com', 'subject:invoice', 'hasAttachments:true received>=2025-05-01'.",
      inputSchema: z.object({
        query: z.string().describe("KQL search query"),
        user_id: z
          .string()
          .optional()
          .describe("UPN or object ID to search. Defaults to the service account."),
        top: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max messages to return"),
        select: z
          .string()
          .optional()
          .describe(
            "Comma-separated fields to return. Default: id,subject,from,receivedDateTime,hasAttachments,bodyPreview"
          ),
      }),
    },
    async ({ query, user_id, top, select }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const params: Record<string, string | number> = {
          $search: `"${query}"`,
          $top: top,
          $select:
            select ??
            "id,subject,from,receivedDateTime,hasAttachments,bodyPreview,importance,isRead",
        };
        const res = await graphClient(token).get(`${base}/messages`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_get_message",
    {
      description: "Get the full content of a specific email message, including body and attachments list.",
      inputSchema: z.object({
        message_id: z.string().describe("Message ID"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ message_id, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const [msg, attachments] = await Promise.all([
          graphClient(token).get(`${base}/messages/${message_id}`),
          graphClient(token).get(`${base}/messages/${message_id}/attachments?$select=id,name,contentType,size`),
        ]);
        return ok({ ...msg.data, attachments: attachments.data.value });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_send",
    {
      description: "Send an email from the service account (or a specified user's mailbox).",
      inputSchema: z.object({
        to: z
          .array(z.string())
          .describe("List of recipient email addresses"),
        subject: z.string().describe("Email subject"),
        body: z.string().describe("Email body (plain text or HTML)"),
        body_type: z
          .enum(["text", "html"])
          .default("text")
          .describe("Content type of body"),
        cc: z.array(z.string()).optional().describe("CC recipients"),
        bcc: z.array(z.string()).optional().describe("BCC recipients"),
        importance: z
          .enum(["low", "normal", "high"])
          .default("normal"),
        user_id: z
          .string()
          .optional()
          .describe("UPN or object ID to send from. Defaults to the service account."),
        save_to_sent: z
          .boolean()
          .default(true)
          .describe("Whether to save a copy to Sent Items"),
      }),
    },
    async ({ to, subject, body, body_type, cc, bcc, importance, user_id, save_to_sent }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const toRecipients = to.map((addr) => ({ emailAddress: { address: addr } }));
        const payload: Record<string, unknown> = {
          message: {
            subject,
            importance,
            body: { contentType: body_type, content: body },
            toRecipients,
            ...(cc?.length ? { ccRecipients: cc.map((a) => ({ emailAddress: { address: a } })) } : {}),
            ...(bcc?.length ? { bccRecipients: bcc.map((a) => ({ emailAddress: { address: a } })) } : {}),
          },
          saveToSentItems: save_to_sent,
        };
        await graphClient(token).post(`${base}/sendMail`, payload);
        return ok({ sent: true, to, subject });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_draft",
    {
      description: "Create a draft email (does not send). Returns the draft message ID.",
      inputSchema: z.object({
        to: z.array(z.string()).describe("Recipient email addresses"),
        subject: z.string(),
        body: z.string(),
        body_type: z.enum(["text", "html"]).default("text"),
        cc: z.array(z.string()).optional(),
        importance: z.enum(["low", "normal", "high"]).default("normal"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ to, subject, body, body_type, cc, importance, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const payload = {
          subject,
          importance,
          body: { contentType: body_type, content: body },
          toRecipients: to.map((a) => ({ emailAddress: { address: a } })),
          ...(cc?.length ? { ccRecipients: cc.map((a) => ({ emailAddress: { address: a } })) } : {}),
        };
        const res = await graphClient(token).post(`${base}/messages`, payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_list_folders",
    {
      description: "List mail folders (Inbox, Sent Items, custom folders, etc.).",
      inputSchema: z.object({
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
        include_child_folders: z
          .boolean()
          .default(false)
          .describe("Also return child folders"),
      }),
    },
    async ({ user_id, include_child_folders }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).get(`${base}/mailFolders`, {
          params: { $top: 100, includeHiddenFolders: include_child_folders },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_move_message",
    {
      description: "Move a message to a different folder.",
      inputSchema: z.object({
        message_id: z.string().describe("Message ID"),
        destination_folder_id: z
          .string()
          .describe("Target folder ID or well-known name (inbox, sentItems, deletedItems, junk, drafts, archive)"),
        user_id: z.string().optional().describe("UPN or object ID. Defaults to the service account."),
      }),
    },
    async ({ message_id, destination_folder_id, user_id }) => {
      if (!enabled) return disabled();
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const base = user_id ? `/users/${user_id}` : "/me";
        const res = await graphClient(token).post(
          `${base}/messages/${message_id}/move`,
          { destinationId: destination_folder_id }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
