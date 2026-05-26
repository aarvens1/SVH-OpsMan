import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { ok, err } from "../utils/response.js";

type A = Record<string, unknown>;

function freshserviceClient() {
  const domain = process.env["FRESHSERVICE_DOMAIN"] ?? "";
  const apiKey = process.env["FRESHSERVICE_API_KEY"] ?? "";
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");
  return axios.create({
    baseURL: `https://${domain}.freshservice.com/api/v2`,
    timeout: 30_000,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });
}

export function registerFreshServiceTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "freshservice_list_tickets",
    {
      description:
        "List FreshService tickets. Filter by status (open/pending/resolved/closed/all). " +
        "Returns ID, subject, status, priority, requester, and creation date.",
      inputSchema: z.object({
        filter: z
          .enum(["open", "pending", "resolved", "closed", "all"])
          .default("open")
          .describe("Ticket status filter"),
        page: z.number().int().default(1).describe("Page number (1-based)"),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(30)
          .describe("Results per page (1–100)"),
        requester_id: z
          .number()
          .int()
          .optional()
          .describe("Filter tickets by requester ID"),
        agent_id: z
          .number()
          .int()
          .optional()
          .describe("Filter tickets by assigned agent ID"),
      }),
    },
    async ({ filter, page, per_page, requester_id, agent_id }) => {
      try {
        const params: Record<string, string | number> = {
          filter,
          page,
          per_page,
        };
        if (requester_id !== undefined) params["requester_id"] = requester_id;
        if (agent_id !== undefined) params["agent_id"] = agent_id;
        const res = await freshserviceClient().get("/tickets", { params });
        const raw = res.data as A;
        const items = (raw["tickets"] as A[] | undefined) ?? [];
        const tickets = items.map((t: A) => ({
          id: t["id"],
          subject: t["subject"],
          status: t["status"],
          priority: t["priority"],
          requester_id: t["requester_id"],
          responder_id: t["responder_id"],
          created_at: t["created_at"],
          updated_at: t["updated_at"],
          due_by: t["due_by"],
          tags: t["tags"],
        }));
        return ok({ count: tickets.length, tickets });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_get_ticket",
    {
      description:
        "Get full details of a FreshService ticket, including description and conversation history.",
      inputSchema: z.object({
        ticket_id: z.number().int().describe("FreshService ticket ID"),
      }),
    },
    async ({ ticket_id }) => {
      try {
        const res = await freshserviceClient().get(`/tickets/${ticket_id}`, {
          params: { include: "conversations,tags" },
        });
        const raw = res.data as A;
        const t = (raw["ticket"] as A | undefined) ?? raw;
        const conversations = ((t["conversations"] as A[] | undefined) ?? []).map((c: A) => ({
          id: c["id"],
          body: typeof c["body"] === "string" ? c["body"].slice(0, 500) : c["body"],
          from_email: c["from_email"],
          created_at: c["created_at"],
          private: c["private"],
        }));
        return ok({
          id: t["id"],
          subject: t["subject"],
          description:
            typeof t["description"] === "string"
              ? t["description"].slice(0, 1000)
              : t["description"],
          status: t["status"],
          priority: t["priority"],
          requester_id: t["requester_id"],
          responder_id: t["responder_id"],
          created_at: t["created_at"],
          updated_at: t["updated_at"],
          due_by: t["due_by"],
          tags: t["tags"],
          conversations,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_create_ticket",
    {
      description: "Create a new FreshService ticket. Returns the created ticket ID and URL.",
      inputSchema: z.object({
        subject: z.string().describe("Ticket subject line"),
        description: z
          .string()
          .describe("Ticket body in plain text or HTML"),
        email: z.string().describe("Requester email"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .default(2)
          .describe("1=Low 2=Medium 3=High 4=Urgent"),
        status: z
          .number()
          .int()
          .default(2)
          .describe("2=Open 3=Pending"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Tags to apply to the ticket"),
        cc_emails: z
          .array(z.string())
          .optional()
          .describe("Additional CC email addresses"),
      }),
    },
    async ({ subject, description, email, priority, status, tags, cc_emails }) => {
      try {
        const payload: Record<string, unknown> = {
          subject,
          description,
          email,
          priority,
          status,
        };
        if (tags && tags.length > 0) payload["tags"] = tags;
        if (cc_emails && cc_emails.length > 0) payload["cc_emails"] = cc_emails;
        const res = await freshserviceClient().post("/tickets", payload);
        const raw = res.data as A;
        const t = (raw["ticket"] as A | undefined) ?? raw;
        return ok({
          id: t["id"],
          subject: t["subject"],
          status: t["status"],
          priority: t["priority"],
          created_at: t["created_at"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_update_ticket",
    {
      description:
        "Update a FreshService ticket — change status, priority, assignee, or add tags.",
      inputSchema: z.object({
        ticket_id: z.number().int().describe("FreshService ticket ID"),
        status: z
          .number()
          .int()
          .min(2)
          .max(5)
          .optional()
          .describe("2=Open 3=Pending 4=Resolved 5=Closed"),
        priority: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("1=Low 2=Medium 3=High 4=Urgent"),
        responder_id: z
          .number()
          .int()
          .optional()
          .describe("Agent ID to assign the ticket to"),
        tags: z
          .array(z.string())
          .optional()
          .describe("Replace the ticket's tags with this list"),
        due_by: z
          .string()
          .optional()
          .describe("Due date-time in ISO 8601 format (e.g. 2026-06-01T17:00:00Z)"),
      }),
    },
    async ({ ticket_id, status, priority, responder_id, tags, due_by }) => {
      try {
        const payload: Record<string, unknown> = {};
        if (status !== undefined) payload["status"] = status;
        if (priority !== undefined) payload["priority"] = priority;
        if (responder_id !== undefined) payload["responder_id"] = responder_id;
        if (tags !== undefined) payload["tags"] = tags;
        if (due_by !== undefined) payload["due_by"] = due_by;
        if (Object.keys(payload).length === 0) {
          return err(new Error("freshservice_update_ticket: at least one field must be provided"));
        }
        const res = await freshserviceClient().put(`/tickets/${ticket_id}`, payload);
        const raw = res.data as A;
        const t = (raw["ticket"] as A | undefined) ?? raw;
        return ok({
          id: t["id"],
          subject: t["subject"],
          status: t["status"],
          priority: t["priority"],
          updated_at: t["updated_at"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_add_note",
    {
      description:
        "Add a private note to a FreshService ticket (visible to agents only).",
      inputSchema: z.object({
        ticket_id: z.number().int().describe("FreshService ticket ID"),
        body: z
          .string()
          .describe("Note content (plain text or HTML)"),
        private: z
          .boolean()
          .default(true)
          .describe("If true, the note is visible to agents only"),
      }),
    },
    async ({ ticket_id, body, private: isPrivate }) => {
      try {
        const res = await freshserviceClient().post(`/tickets/${ticket_id}/notes`, {
          body,
          private: isPrivate,
        });
        const raw = res.data as A;
        const note = (raw["note"] as A | undefined) ?? (raw["conversation"] as A | undefined) ?? raw;
        return ok({
          id: note["id"],
          ticket_id: note["ticket_id"] ?? ticket_id,
          created_at: note["created_at"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_list_assets",
    {
      description:
        "List assets in the FreshService ITAM inventory. Returns display name, asset tag, type, and status.",
      inputSchema: z.object({
        page: z.number().int().default(1).describe("Page number (1-based)"),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(30)
          .describe("Results per page (1–100)"),
        asset_type_id: z
          .number()
          .int()
          .optional()
          .describe("Filter by asset type ID"),
        search_term: z
          .string()
          .optional()
          .describe("Search assets by name or asset tag"),
      }),
    },
    async ({ page, per_page, asset_type_id, search_term }) => {
      try {
        const params: Record<string, string | number> = { page, per_page };
        if (asset_type_id !== undefined) params["asset_type_id"] = asset_type_id;
        if (search_term) params["search_term"] = search_term;
        const res = await freshserviceClient().get("/assets", { params });
        const raw = res.data as A;
        const items = (raw["assets"] as A[] | undefined) ?? [];
        const assets = items.map((a: A) => ({
          id: a["id"],
          display_name: a["display_name"],
          asset_tag: a["asset_tag"],
          asset_type_id: a["asset_type_id"],
          location_id: a["location_id"],
          user_id: a["user_id"],
          department_id: a["department_id"],
          status: a["status"],
          created_at: a["created_at"],
          updated_at: a["updated_at"],
        }));
        return ok({ count: assets.length, assets });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_get_asset",
    {
      description:
        "Get full details of a FreshService asset including all custom fields.",
      inputSchema: z.object({
        asset_display_id: z
          .number()
          .int()
          .describe(
            "The display ID shown in the FreshService UI (not the internal ID)"
          ),
      }),
    },
    async ({ asset_display_id }) => {
      try {
        const res = await freshserviceClient().get(`/assets/${asset_display_id}`);
        const raw = res.data as A;
        const a = (raw["asset"] as A | undefined) ?? raw;
        return ok({
          id: a["id"],
          display_id: a["display_id"],
          display_name: a["display_name"],
          asset_tag: a["asset_tag"],
          description: a["description"],
          asset_type_id: a["asset_type_id"],
          impact: a["impact"],
          status: a["status"],
          location_id: a["location_id"],
          user_id: a["user_id"],
          department_id: a["department_id"],
          type_fields: a["type_fields"],
          created_at: a["created_at"],
          updated_at: a["updated_at"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_list_asset_types",
    {
      description:
        "List all asset type categories in FreshService ITAM (e.g. Laptop, Monitor, Server).",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const res = await freshserviceClient().get("/asset_types");
        const raw = res.data as A;
        const items = (raw["asset_types"] as A[] | undefined) ?? [];
        const types = items.map((t: A) => ({
          id: t["id"],
          name: t["name"],
          description: t["description"],
          parent_asset_type_id: t["parent_asset_type_id"],
        }));
        return ok({ count: types.length, asset_types: types });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "freshservice_list_software",
    {
      description:
        "List software in the FreshService software catalog with license and installation counts.",
      inputSchema: z.object({
        page: z.number().int().default(1).describe("Page number (1-based)"),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(30)
          .describe("Results per page (1–100)"),
      }),
    },
    async ({ page, per_page }) => {
      try {
        const res = await freshserviceClient().get("/applications", {
          params: { page, per_page },
        });
        const raw = res.data as A;
        const items = (raw["applications"] as A[] | undefined) ?? [];
        const software = items.map((s: A) => ({
          id: s["id"],
          name: s["name"],
          description: s["description"],
          application_type: s["application_type"],
          status: s["status"],
          publisher_name: s["publisher_name"],
          installation_count: s["installation_count"],
          license_count: s["license_count"],
        }));
        return ok({ count: software.length, software });
      } catch (e) {
        return err(e);
      }
    }
  );
}
