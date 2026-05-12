import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

// Read-only — views sites, lists, pages, permissions, content types.
// File operations (browse, search, download) live in onedrive.ts (Graph drives).

export function registerSharePointTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "sp_search_sites",
    {
      description:
        "Search for SharePoint sites by keyword. Returns site name, URL, and description.",
      inputSchema: z.object({
        query: z.string().describe("Site search keyword or name"),
        top: z.number().int().min(1).max(50).default(20),
      }),
    },
    async ({ query, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/sites?search=${encodeURIComponent(query)}&$top=${top}&$select=id,displayName,webUrl,description,createdDateTime`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_get_site",
    {
      description:
        "Get details of a specific SharePoint site — display name, URL, creation date, and storage quota.",
      inputSchema: z.object({
        site_id: z
          .string()
          .describe(
            "Site ID (GUID) or relative path (e.g. 'contoso.sharepoint.com:/sites/IT')"
          ),
      }),
    },
    async ({ site_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const path = site_id.includes("sharepoint.com") ? `/sites/${site_id}` : `/sites/${site_id}`;
        const res = await graphClient(token).get(path);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_list_site_lists",
    {
      description:
        "List the SharePoint lists within a site (document libraries, custom lists, etc.).",
      inputSchema: z.object({
        site_id: z.string().describe("Site ID"),
        include_hidden: z.boolean().default(false),
      }),
    },
    async ({ site_id, include_hidden }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $select: "id,displayName,description,list,webUrl,createdDateTime,lastModifiedDateTime",
        };
        if (!include_hidden) params["$filter"] = "list/hidden eq false";
        const res = await graphClient(token).get(`/sites/${site_id}/lists`, { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_get_list_items",
    {
      description: "Get items from a SharePoint list.",
      inputSchema: z.object({
        site_id: z.string().describe("Site ID"),
        list_id: z.string().describe("List ID or name"),
        top: z.number().int().min(1).max(200).default(50),
        filter: z
          .string()
          .optional()
          .describe("OData $filter expression for list items"),
      }),
    },
    async ({ site_id, list_id, top, filter }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const params: Record<string, string | number> = {
          $top: top,
          $expand: "fields",
        };
        if (filter) params["$filter"] = filter;
        const res = await graphClient(token).get(
          `/sites/${site_id}/lists/${list_id}/items`,
          { params }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_list_site_pages",
    {
      description: "List published pages in a SharePoint site's Site Pages library.",
      inputSchema: z.object({
        site_id: z.string().describe("Site ID"),
        top: z.number().int().default(25),
      }),
    },
    async ({ site_id, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/sites/${site_id}/pages?$top=${top}&$select=id,name,title,webUrl,publishingState,lastModifiedDateTime,lastModifiedBy`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_get_site_permissions",
    {
      description:
        "List permission grants on a SharePoint site — shows which apps and users have access.",
      inputSchema: z.object({
        site_id: z.string().describe("Site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/sites/${site_id}/permissions`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "sp_list_content_types",
    {
      description: "List content types defined on a SharePoint site.",
      inputSchema: z.object({
        site_id: z.string().describe("Site ID"),
      }),
    },
    async ({ site_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/sites/${site_id}/contentTypes?$select=id,name,description,group,isBuiltIn`
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
