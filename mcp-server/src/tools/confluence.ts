import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { confluenceClient, formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Confluence not configured: set CONFLUENCE_DOMAIN, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerConfluenceTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "confluence_list_spaces",
    {
      description:
        "List all Confluence spaces the account can access, with their key, name, and type.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(250).default(50),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      }),
    },
    async ({ limit, cursor }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string | number> = { limit };
        if (cursor) params["cursor"] = cursor;
        const res = await confluenceClient().get("/spaces", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_search_pages",
    {
      description:
        "Search Confluence pages using CQL (Confluence Query Language). " +
        "Examples: 'title ~ \"incident\"', 'space.key = \"OPS\" AND lastModified >= \"-7d\"', " +
        "'type = page AND creator = \"user@company.com\"'.",
      inputSchema: z.object({
        cql: z.string().describe("CQL query string"),
        limit: z.number().int().min(1).max(250).default(25),
        cursor: z.string().optional().describe("Pagination cursor from a previous response"),
      }),
    },
    async ({ cql, limit, cursor }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string | number> = { cql, limit };
        if (cursor) params["cursor"] = cursor;
        const res = await confluenceClient().get("/pages", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_get_page",
    {
      description:
        "Get the full content and metadata of a Confluence page, including body text, version number, space, and last modified date.",
      inputSchema: z.object({
        page_id: z.string().describe("Confluence page ID"),
        body_format: z
          .enum(["storage", "view", "export_view", "atlas_doc_format"])
          .default("storage")
          .describe(
            "Body format: 'storage' = raw XML/HTML (editable), 'view' = rendered HTML (readable)"
          ),
      }),
    },
    async ({ page_id, body_format }) => {
      if (!enabled) return disabled();
      try {
        const res = await confluenceClient().get(`/pages/${page_id}`, {
          params: { "body-format": body_format },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_get_page_children",
    {
      description: "List the direct child pages of a given Confluence page — useful for navigating a page hierarchy.",
      inputSchema: z.object({
        page_id: z.string().describe("Parent Confluence page ID"),
        limit: z.number().int().min(1).max(250).default(25),
        cursor: z.string().optional(),
      }),
    },
    async ({ page_id, limit, cursor }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string | number> = { limit };
        if (cursor) params["cursor"] = cursor;
        const res = await confluenceClient().get(`/pages/${page_id}/children`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_create_page",
    {
      description:
        "Create a new Confluence page in a space. " +
        "Body content uses Confluence Storage Format (XHTML-based). " +
        "Optionally nest it under a parent page.",
      inputSchema: z.object({
        space_id: z.string().describe("Confluence space ID (not key — get it from confluence_list_spaces)"),
        title: z.string().describe("Page title"),
        body: z
          .string()
          .describe(
            "Page content in Confluence Storage Format, e.g. '<p>Hello <strong>world</strong></p>'"
          ),
        parent_id: z
          .string()
          .optional()
          .describe("ID of the parent page to nest this under"),
        status: z.enum(["current", "draft"]).default("current"),
      }),
    },
    async ({ space_id, title, body, parent_id, status }) => {
      if (!enabled) return disabled();
      try {
        const payload: Record<string, unknown> = {
          spaceId: space_id,
          title,
          status,
          body: { representation: "storage", value: body },
        };
        if (parent_id) payload["parentId"] = parent_id;
        const res = await confluenceClient().post("/pages", payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_update_page",
    {
      description:
        "Update the title or content of an existing Confluence page. " +
        "Requires the current version number (get it from confluence_get_page → version.number) — " +
        "the update will be rejected if the version is stale.",
      inputSchema: z.object({
        page_id: z.string().describe("Confluence page ID"),
        version_number: z
          .number()
          .int()
          .describe("Current version number from confluence_get_page (increment by 1 is handled automatically)"),
        title: z.string().optional().describe("New page title (omit to keep existing)"),
        body: z
          .string()
          .optional()
          .describe("New body in Confluence Storage Format (omit to keep existing)"),
        status: z.enum(["current", "draft"]).default("current"),
      }),
    },
    async ({ page_id, version_number, title, body, status }) => {
      if (!enabled) return disabled();
      try {
        const payload: Record<string, unknown> = {
          id: page_id,
          status,
          version: { number: version_number + 1 },
        };
        if (title) payload["title"] = title;
        if (body) payload["body"] = { representation: "storage", value: body };
        const res = await confluenceClient().put(`/pages/${page_id}`, payload);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_get_page_comments",
    {
      description: "List comments on a Confluence page, ordered newest first.",
      inputSchema: z.object({
        page_id: z.string().describe("Confluence page ID"),
        limit: z.number().int().min(1).max(250).default(25),
        cursor: z.string().optional(),
      }),
    },
    async ({ page_id, limit, cursor }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string | number> = { limit, sort: "-created-date" };
        if (cursor) params["cursor"] = cursor;
        const res = await confluenceClient().get(`/pages/${page_id}/footer-comments`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "confluence_add_page_comment",
    {
      description: "Add a footer comment to a Confluence page.",
      inputSchema: z.object({
        page_id: z.string().describe("Confluence page ID"),
        body: z
          .string()
          .describe("Comment text in Confluence Storage Format, e.g. '<p>Looks good to me.</p>'"),
      }),
    },
    async ({ page_id, body }) => {
      if (!enabled) return disabled();
      try {
        const res = await confluenceClient().post(`/pages/${page_id}/footer-comments`, {
          body: { representation: "storage", value: body },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
