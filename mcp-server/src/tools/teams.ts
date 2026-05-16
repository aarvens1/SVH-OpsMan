import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err, cfgErr } from "../utils/response.js";

export function registerTeamsTools(server: McpServer, enabled: boolean, graphUserId?: string): void {
  if (!enabled) return;

  server.registerTool(
    "teams_list_teams",
    {
      description:
        "List all Microsoft Teams in the tenant. Returns team ID, display name, description, and visibility.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get("/groups", {
          params: {
            $filter: "resourceProvisioningOptions/Any(x:x eq 'Team')",
            $select: "id,displayName,description,visibility",
            $top: top,
          },
        });
        const teams = ((res.data as Record<string, unknown>)["value"] as Record<string, unknown>[] ?? []).map((t) => ({
          id: t["id"],
          displayName: t["displayName"],
          description: t["description"],
          visibility: t["visibility"],
        }));
        return ok({ count: teams.length, teams });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_list_channels",
    {
      description: "List all channels in a Microsoft Team, including General and any custom channels.",
      inputSchema: z.object({
        team_id: z.string().describe("Team object ID (from teams_list_teams)"),
      }),
    },
    async ({ team_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/teams/${team_id}/channels`);
        const channels = ((res.data as Record<string, unknown>)["value"] as Record<string, unknown>[] ?? []).map((c) => ({
          id: c["id"],
          displayName: c["displayName"],
          description: c["description"],
          membershipType: c["membershipType"],
          email: c["email"],
          webUrl: c["webUrl"],
        }));
        return ok({ count: channels.length, channels });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_send_message",
    {
      description:
        "Send a message to a Microsoft Teams channel. Supports plain text or HTML content. " +
        "Useful for posting alerts, status updates, or notifications.",
      inputSchema: z.object({
        team_id: z.string().describe("Team object ID"),
        channel_id: z.string().describe("Channel ID (from teams_list_channels)"),
        content: z.string().describe("Message text — use HTML tags for formatting (e.g. <b>bold</b>)"),
        content_type: z
          .enum(["text", "html"])
          .default("html")
          .describe("'html' allows rich formatting; 'text' is plain"),
      }),
    },
    async ({ team_id, channel_id, content, content_type }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post(
          `/teams/${team_id}/channels/${channel_id}/messages`,
          { body: { content, contentType: content_type } }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_list_messages",
    {
      description:
        "List recent messages in a Teams channel, ordered newest first. Returns sender, timestamp, and content.",
      inputSchema: z.object({
        team_id: z.string().describe("Team object ID"),
        channel_id: z.string().describe("Channel ID"),
        top: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ team_id, channel_id, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/teams/${team_id}/channels/${channel_id}/messages`,
          { params: { $top: top } }
        );
        const messages = ((res.data as Record<string, unknown>)["value"] as Record<string, unknown>[] ?? []).map((m) => {
          const fromUser = ((m["from"] as Record<string, unknown> | undefined)?.["user"]) as Record<string, unknown> | undefined;
          const rawContent = ((m["body"] as Record<string, unknown> | undefined)?.["content"] as string) ?? "";
          // Strip HTML tags and truncate — raw Teams HTML can be 2–5k tokens per message
          const textContent = rawContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
          return {
            id: m["id"],
            createdDateTime: m["createdDateTime"],
            lastModifiedDateTime: m["lastModifiedDateTime"],
            messageType: m["messageType"],
            from: fromUser ? { displayName: fromUser["displayName"], id: fromUser["id"] } : null,
            body: textContent,
            hasAttachments: ((m["attachments"] as unknown[] | undefined)?.length ?? 0) > 0,
            reactionCount: (m["reactions"] as unknown[] | undefined)?.length ?? 0,
            mentionCount: (m["mentions"] as unknown[] | undefined)?.length ?? 0,
          };
        });
        return ok({ count: messages.length, messages });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_create_channel",
    {
      description: "Create a new standard channel in a Microsoft Team.",
      inputSchema: z.object({
        team_id: z.string().describe("Team object ID"),
        display_name: z.string().describe("Channel display name"),
        description: z.string().optional().describe("Optional channel description"),
      }),
    },
    async ({ team_id, display_name, description }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = {
          displayName: display_name,
          membershipType: "standard",
        };
        if (description) body["description"] = description;
        const res = await graphClient(token).post(`/teams/${team_id}/channels`, body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_list_my_chats",
    {
      description:
        "List recent Teams direct message and group chat threads for the configured user. " +
        "Returns participants and last message preview, ordered by most recent activity. " +
        "Requires Chat.Read.All application permission.",
      inputSchema: z.object({
        top: z.number().int().min(1).max(50).default(20).describe("Number of chats to return"),
      }),
    },
    async ({ top }) => {
      if (!graphUserId)
        return cfgErr("teams_list_my_chats — set GRAPH_USER_ID in your .env or Bitwarden vault");
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${graphUserId}/chats`, {
          params: { $expand: "lastMessagePreview,members", $top: top },
        });
        const chats = ((res.data.value ?? []) as Record<string, unknown>[]).map((chat) => {
          const members = ((chat["members"] as Record<string, unknown>[]) ?? [])
            .map((m) => (m["displayName"] as string) ?? (m["email"] as string))
            .filter(Boolean)
            .join(", ");
          const preview = chat["lastMessagePreview"] as Record<string, unknown> | null;
          const fromUser = preview
            ? ((preview["from"] as Record<string, unknown>)?.["user"] as Record<string, unknown>)
            : null;
          return {
            id: chat["id"],
            chatType: chat["chatType"],
            topic: chat["topic"] ?? null,
            members,
            lastMessage: preview
              ? {
                  from: (fromUser?.["displayName"] as string) ?? "System",
                  body: ((preview["body"] as Record<string, unknown>)?.["content"] as string) ?? "",
                  createdDateTime: preview["createdDateTime"],
                }
              : null,
          };
        });
        return ok({ value: chats });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_get_chat_messages",
    {
      description:
        "Get recent messages from a specific Teams chat thread (DM or group chat). " +
        "Use teams_list_my_chats to get chat IDs first. " +
        "Requires Chat.Read.All application permission.",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat ID (from teams_list_my_chats)"),
        top: z.number().int().min(1).max(50).default(20).describe("Number of messages to return"),
      }),
    },
    async ({ chat_id, top }) => {
      if (!graphUserId)
        return cfgErr("teams_get_chat_messages — set GRAPH_USER_ID in your .env or Bitwarden vault");
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/chats/${chat_id}/messages`, {
          params: { $top: top },
        });
        const messages = ((res.data.value ?? []) as Record<string, unknown>[]).map((msg) => {
          const fromUser = ((msg["from"] as Record<string, unknown>)?.["user"]) as
            | Record<string, unknown>
            | undefined;
          return {
            id: msg["id"],
            createdDateTime: msg["createdDateTime"],
            from: (fromUser?.["displayName"] as string) ?? "System",
            body: ((msg["body"] as Record<string, unknown>)?.["content"] as string) ?? "",
            messageType: msg["messageType"],
          };
        });
        return ok({ value: messages });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "teams_add_member",
    {
      description: "Add a user to a Microsoft Team as a member or owner.",
      inputSchema: z.object({
        team_id: z.string().describe("Team object ID"),
        user_id: z.string().describe("User object ID or UPN (e.g. user@company.com)"),
        role: z
          .enum(["member", "owner"])
          .default("member")
          .describe("Role to assign the user in the team"),
      }),
    },
    async ({ team_id, user_id, role }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = {
          "@odata.type": "#microsoft.graph.aadUserConversationMember",
          roles: role === "owner" ? ["owner"] : [],
          "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${user_id}')`,
        };
        const res = await graphClient(token).post(`/teams/${team_id}/members`, body);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
