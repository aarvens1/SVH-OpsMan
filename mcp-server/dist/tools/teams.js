import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE, formatError } from "../utils/http.js";
const DISABLED_MSG = "Graph service not configured: set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET";
function disabled() {
    return { isError: true, content: [{ type: "text", text: DISABLED_MSG }] };
}
function ok(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function err(e) {
    return { isError: true, content: [{ type: "text", text: formatError(e) }] };
}
export function registerTeamsTools(server, enabled) {
    server.registerTool("teams_list_teams", {
        description: "List all Microsoft Teams in the tenant. Returns team ID, display name, description, and visibility.",
        inputSchema: z.object({
            top: z.number().int().min(1).max(100).default(25),
        }),
    }, async ({ top }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const res = await graphClient(token).get("/groups", {
                params: {
                    $filter: "resourceProvisioningOptions/Any(x:x eq 'Team')",
                    $select: "id,displayName,description,visibility",
                    $top: top,
                },
            });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("teams_list_channels", {
        description: "List all channels in a Microsoft Team, including General and any custom channels.",
        inputSchema: z.object({
            team_id: z.string().describe("Team object ID (from teams_list_teams)"),
        }),
    }, async ({ team_id }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const res = await graphClient(token).get(`/teams/${team_id}/channels`, {
                params: { $orderby: "displayName" },
            });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("teams_send_message", {
        description: "Send a message to a Microsoft Teams channel. Supports plain text or HTML content. " +
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
    }, async ({ team_id, channel_id, content, content_type }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const res = await graphClient(token).post(`/teams/${team_id}/channels/${channel_id}/messages`, { body: { content, contentType: content_type } });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("teams_list_messages", {
        description: "List recent messages in a Teams channel, ordered newest first. Returns sender, timestamp, and content.",
        inputSchema: z.object({
            team_id: z.string().describe("Team object ID"),
            channel_id: z.string().describe("Channel ID"),
            top: z.number().int().min(1).max(50).default(20),
        }),
    }, async ({ team_id, channel_id, top }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const res = await graphClient(token).get(`/teams/${team_id}/channels/${channel_id}/messages`, { params: { $top: top, $orderby: "createdDateTime desc" } });
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("teams_create_channel", {
        description: "Create a new standard channel in a Microsoft Team.",
        inputSchema: z.object({
            team_id: z.string().describe("Team object ID"),
            display_name: z.string().describe("Channel display name"),
            description: z.string().optional().describe("Optional channel description"),
        }),
    }, async ({ team_id, display_name, description }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const body = {
                displayName: display_name,
                membershipType: "standard",
            };
            if (description)
                body["description"] = description;
            const res = await graphClient(token).post(`/teams/${team_id}/channels`, body);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
    server.registerTool("teams_add_member", {
        description: "Add a user to a Microsoft Team as a member or owner.",
        inputSchema: z.object({
            team_id: z.string().describe("Team object ID"),
            user_id: z.string().describe("User object ID or UPN (e.g. user@company.com)"),
            role: z
                .enum(["member", "owner"])
                .default("member")
                .describe("Role to assign the user in the team"),
        }),
    }, async ({ team_id, user_id, role }) => {
        if (!enabled)
            return disabled();
        try {
            const token = await getGraphToken(GRAPH_SCOPE);
            const body = {
                "@odata.type": "#microsoft.graph.aadUserConversationMember",
                roles: role === "owner" ? ["owner"] : [],
                "user@odata.bind": `https://graph.microsoft.com/v1.0/users('${user_id}')`,
            };
            const res = await graphClient(token).post(`/teams/${team_id}/members`, body);
            return ok(res.data);
        }
        catch (e) {
            return err(e);
        }
    });
}
//# sourceMappingURL=teams.js.map