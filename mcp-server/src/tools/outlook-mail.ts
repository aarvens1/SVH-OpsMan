import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const addr = (a: string) => ({ emailAddress: { address: a } });

const NO_USER_MSG =
  "Mail tools are not configured: set GRAPH_USER_ID to your UPN (e.g. you@company.com)";

// Mail and calendar tools are scoped to a single mailbox (GRAPH_USER_ID).
// Application-permission client-credentials tokens can access any mailbox in
// the tenant, so we hard-lock to the configured owner rather than accepting
// an arbitrary user_id at call time.
export function registerOutlookMailTools(
  server: McpServer,
  enabled: boolean,
  userId: string | undefined
): void {
  if (!enabled) return;
  server.registerTool(
    "mail_search",
    {
      description:
        "Search your Outlook messages using KQL (keyword query language). " +
        "Examples: 'from:alice@example.com', 'subject:invoice', 'hasAttachments:true received>=2025-05-01'.",
      inputSchema: z.object({
        query: z.string().describe("KQL search query"),
        top: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(20)
          .describe("Max messages to return"),
      }),
    },
    async ({ query, top }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $search: `"${query}"`,
          $top: top,
          $select: "id,subject,from,receivedDateTime,hasAttachments,bodyPreview,importance,isRead",
        };
        const res = await graphClient(token).get(`/users/${userId}/messages`, { params });
        const msgs = ((res.data as A)["value"] as A[] ?? []).map((m: A) => ({
          id: m["id"],
          subject: m["subject"],
          from: (m["from"] as A | undefined)?.["emailAddress"],
          receivedDateTime: m["receivedDateTime"],
          isRead: m["isRead"],
          hasAttachments: m["hasAttachments"],
          importance: m["importance"],
          bodyPreview: typeof m["bodyPreview"] === "string" ? m["bodyPreview"].slice(0, 200) : undefined,
        }));
        return ok({ count: msgs.length, messages: msgs });
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
      }),
    },
    async ({ message_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const [msg, attachments] = await Promise.all([
          graphClient(token).get(`/users/${userId}/messages/${message_id}`),
          graphClient(token).get(`/users/${userId}/messages/${message_id}/attachments?$select=id,name,contentType,size`),
        ]);
        const m = msg.data as A;
        return ok({
          id: m["id"],
          subject: m["subject"],
          from: (m["from"] as A | undefined)?.["emailAddress"],
          to: (m["toRecipients"] as A[] | undefined)?.map((r: A) => (r["emailAddress"] as A)?.["address"]),
          cc: (m["ccRecipients"] as A[] | undefined)?.map((r: A) => (r["emailAddress"] as A)?.["address"]),
          receivedDateTime: m["receivedDateTime"],
          sentDateTime: m["sentDateTime"],
          hasAttachments: m["hasAttachments"],
          importance: m["importance"],
          isRead: m["isRead"],
          body: (m["body"] as A | undefined)?.["content"],
          bodyContentType: (m["body"] as A | undefined)?.["contentType"],
          attachments: (attachments.data as A)["value"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_send",
    {
      description: "Send an email from your mailbox.",
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
        save_to_sent: z
          .boolean()
          .default(true)
          .describe("Whether to save a copy to Sent Items"),
      }),
    },
    async ({ to, subject, body, body_type, cc, bcc, importance, save_to_sent }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const payload: Record<string, unknown> = {
          message: {
            subject,
            importance,
            body: { contentType: body_type, content: body },
            toRecipients: to.map(addr),
            ...(cc?.length ? { ccRecipients: cc.map(addr) } : {}),
            ...(bcc?.length ? { bccRecipients: bcc.map(addr) } : {}),
          },
          saveToSentItems: save_to_sent,
        };
        await graphClient(token).post(`/users/${userId}/sendMail`, payload);
        return ok({ sent: true, to, subject });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_draft",
    {
      description: "Create a draft email in your mailbox (does not send). Returns the draft message ID.",
      inputSchema: z.object({
        to: z.array(z.string()).describe("Recipient email addresses"),
        subject: z.string(),
        body: z.string(),
        body_type: z.enum(["text", "html"]).default("text"),
        cc: z.array(z.string()).optional(),
        importance: z.enum(["low", "normal", "high"]).default("normal"),
      }),
    },
    async ({ to, subject, body, body_type, cc, importance }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const payload = {
          subject,
          importance,
          body: { contentType: body_type, content: body },
          toRecipients: to.map(addr),
          ...(cc?.length ? { ccRecipients: cc.map(addr) } : {}),
        };
        const res = await graphClient(token).post(`/users/${userId}/messages`, payload);
        const draft = res.data as A;
        return ok({ id: draft["id"], subject: draft["subject"], created: true });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_list_folders",
    {
      description: "List mail folders in your mailbox (Inbox, Sent Items, custom folders, etc.).",
      inputSchema: z.object({
        include_hidden_folders: z
          .boolean()
          .default(false)
          .describe("Also return hidden system folders (e.g. Conversation History, Purges)"),
      }),
    },
    async ({ include_hidden_folders }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${userId}/mailFolders`, {
          params: { $top: 100, includeHiddenFolders: include_hidden_folders },
        });
        const folders = ((res.data as A)["value"] as A[] ?? []).map((f: A) => ({
          id: f["id"],
          displayName: f["displayName"],
          totalItemCount: f["totalItemCount"],
          unreadItemCount: f["unreadItemCount"],
          parentFolderId: f["parentFolderId"],
        }));
        return ok({ count: folders.length, folders });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "mail_move_message",
    {
      description: "Move a message to a different folder in your mailbox.",
      inputSchema: z.object({
        message_id: z.string().describe("Message ID"),
        destination_folder_id: z
          .string()
          .describe("Target folder ID or well-known name (inbox, sentItems, deletedItems, junk, drafts, archive)"),
      }),
    },
    async ({ message_id, destination_folder_id }) => {
      if (!userId) return cfgErr(NO_USER_MSG);
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post(
          `/users/${userId}/messages/${message_id}/move`,
          { destinationId: destination_folder_id }
        );
        return ok({ id: (res.data as A)["id"], moved: true, destination: destination_folder_id });
      } catch (e) {
        return err(e);
      }
    }
  );
}
