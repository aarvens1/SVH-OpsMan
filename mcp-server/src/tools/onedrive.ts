import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGraphToken } from "../auth/graph.js";
import { graphClient, GRAPH_SCOPE } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

export function registerOneDriveTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "onedrive_get_user_drive",
    {
      description:
        "Get the OneDrive drive metadata for a user, including the drive ID needed for other OneDrive tools, quota usage, and web URL.",
      inputSchema: z.object({
        user_id: z.string().describe("User object ID or UPN (e.g. user@company.com)"),
      }),
    },
    async ({ user_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/users/${user_id}/drive`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_list_items",
    {
      description:
        "List files and folders inside a OneDrive folder. Use 'root' as item_id to list the top level. " +
        "Returns name, size, type, last modified date, and web URL for each item.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID (from onedrive_get_user_drive)"),
        item_id: z
          .string()
          .default("root")
          .describe("Folder item ID, or 'root' for the top-level folder"),
        top: z.number().int().min(1).max(200).default(50),
      }),
    },
    async ({ drive_id, item_id, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/drives/${drive_id}/items/${item_id}/children`,
          {
            params: {
              $select: "id,name,size,file,folder,createdDateTime,lastModifiedDateTime,webUrl",
              $top: top,
            },
          }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_get_item",
    {
      description:
        "Get metadata for a specific file or folder in OneDrive: name, size, path, last modified, MIME type, and web URL.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        item_id: z.string().describe("File or folder item ID"),
      }),
    },
    async ({ drive_id, item_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(`/drives/${drive_id}/items/${item_id}`);
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_search_files",
    {
      description:
        "Search for files in a OneDrive by name or content keyword. Returns matching items with their IDs and web URLs.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        query: z.string().describe("Search keyword (matches file name and content)"),
        top: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ drive_id, query, top }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).get(
          `/drives/${drive_id}/root/search(q='${encodeURIComponent(query)}')`,
          { params: { $top: top, $select: "id,name,size,webUrl,parentReference,lastModifiedDateTime" } }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_create_folder",
    {
      description: "Create a new folder inside a OneDrive location.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        parent_item_id: z
          .string()
          .default("root")
          .describe("Parent folder item ID, or 'root' to create at the top level"),
        folder_name: z.string().describe("Name for the new folder"),
      }),
    },
    async ({ drive_id, parent_item_id, folder_name }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const res = await graphClient(token).post(
          `/drives/${drive_id}/items/${parent_item_id}/children`,
          {
            name: folder_name,
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
          }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_move_item",
    {
      description:
        "Move a file or folder to a different parent folder in OneDrive. " +
        "Optionally rename it at the same time. Returns the updated item metadata.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        item_id: z.string().describe("Item ID of the file or folder to move"),
        new_parent_id: z.string().describe("Item ID of the destination folder (or 'root')"),
        new_name: z
          .string()
          .optional()
          .describe("Optional new name for the item after moving"),
      }),
    },
    async ({ drive_id, item_id, new_parent_id, new_name }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = {
          parentReference: { id: new_parent_id },
        };
        if (new_name) body["name"] = new_name;
        const res = await graphClient(token).patch(
          `/drives/${drive_id}/items/${item_id}`,
          body
        );
        return ok({ id: res.data.id, name: res.data.name, webUrl: res.data.webUrl });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_delete_item",
    {
      description:
        "Permanently delete a file or folder from OneDrive. " +
        "Folders must be empty or the entire subtree is deleted. Use with caution.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        item_id: z.string().describe("Item ID of the file or folder to delete"),
      }),
    },
    async ({ drive_id, item_id }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        await graphClient(token).delete(`/drives/${drive_id}/items/${item_id}`);
        return ok({ deleted: true, item_id });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "onedrive_create_sharing_link",
    {
      description:
        "Create a shareable link for a OneDrive file or folder. " +
        "Returns the URL that can be sent to others.",
      inputSchema: z.object({
        drive_id: z.string().describe("OneDrive drive ID"),
        item_id: z.string().describe("File or folder item ID"),
        link_type: z
          .enum(["view", "edit", "embed"])
          .default("view")
          .describe("'view' = read-only, 'edit' = editable, 'embed' = embeddable read-only"),
        scope: z
          .enum(["organization", "anonymous"])
          .default("organization")
          .describe("'organization' = anyone in the tenant, 'anonymous' = anyone with the link"),
        expiry_datetime: z
          .string()
          .optional()
          .describe("Optional expiry date/time in ISO 8601 format (e.g. 2025-12-31T23:59:59Z)"),
      }),
    },
    async ({ drive_id, item_id, link_type, scope, expiry_datetime }) => {
      try {
        const token = await getGraphToken(GRAPH_SCOPE);
        const body: Record<string, unknown> = { type: link_type, scope };
        if (expiry_datetime) body["expirationDateTime"] = expiry_datetime;
        const res = await graphClient(token).post(
          `/drives/${drive_id}/items/${item_id}/createLink`,
          body
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
