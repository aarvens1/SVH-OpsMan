import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerOneDriveTools } from "../../tools/onedrive";
import { getGraphToken } from "../../auth/graph.js";

// Mock graphClient to avoid hoisting issues with vi.mock
const mockGraphClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
};

vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn(() => mockGraphClient),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

vi.mock("../../auth/graph.js", () => ({
  getGraphToken: vi.fn(),
}));

vi.mock("../../utils/response.js", () => ({
  ok: (data: any) => ({ ok: true, data }),
  err: (e: any) => ({ ok: false, error: { message: e.message || "An error occurred" } }),
}));

// These imports must be after mocks
import { graphClient } from "../../utils/http.js";

describe("OneDrive Tools", () => {
  let server: McpServer;
  let registeredTools: Map<string, any>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();
    server = {
      registerTool: (name: string, schema: any, handler: any) => {
        registeredTools.set(name, { name, schema, handler });
      },
    } as any;
    registerOneDriveTools(server, true);
  });

  it("should not register tools if disabled", () => {
    registeredTools.clear();
    const mockServer = { registerTool: vi.fn() };
    registerOneDriveTools(mockServer as any, false);
    expect(mockServer.registerTool).not.toHaveBeenCalled();
  });

  describe("onedrive_get_user_drive", () => {
    const toolName = "onedrive_get_user_drive";

    it("should get user drive metadata on happy path", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      expect(handler).toBeDefined();

      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const mockDriveData = {
        data: {
          id: "drive-id",
          name: "My Drive",
          driveType: "personal",
          webUrl: "http://example.com/drive",
          quota: { total: 100, used: 50 },
          owner: { user: { displayName: "Test User" } },
          createdDateTime: "2023-01-01T00:00:00Z",
          lastModifiedDateTime: "2023-01-02T00:00:00Z",
        },
      };
      vi.mocked(mockGraphClient.get).mockResolvedValue(mockDriveData);

      const result = await handler({ user_id: "test-user" });

      expect(getGraphToken).toHaveBeenCalledWith("https://graph.microsoft.com/.default");
      expect(graphClient).toHaveBeenCalledWith("fake-token");
      expect(mockGraphClient.get).toHaveBeenCalledWith("/users/test-user/drive");
      expect(result).toEqual({
        ok: true,
        data: {
          id: "drive-id",
          name: "My Drive",
          driveType: "personal",
          webUrl: "http://example.com/drive",
          quota: { total: 100, used: 50 },
          owner: { displayName: "Test User" },
          createdDateTime: "2023-01-01T00:00:00Z",
          lastModifiedDateTime: "2023-01-02T00:00:00Z",
        },
      });
    });

    it("should handle errors when getting user drive", async () => {
      const handler = registeredTools.get(toolName)?.handler;
      vi.mocked(getGraphToken).mockResolvedValue("fake-token");
      const error = new Error("API Error");
      vi.mocked(mockGraphClient.get).mockRejectedValue(error);

      const result = await handler({ user_id: "test-user" });
      
      expect(result.ok).toBe(false);
      expect(result.error).toEqual({ message: "API Error" });
    });
  });

  describe('onedrive_list_items', () => {
    const toolName = 'onedrive_list_items';

    it('should list items in a folder on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockItemsData = {
            data: {
                value: [
                    { id: 'item1', name: 'File1.txt', size: 1024, webUrl: 'http://file1.com', lastModifiedDateTime: '2023-01-01T00:00:00Z', file: { mimeType: 'text/plain' }, folder: null },
                    { id: 'item2', name: 'Folder1', size: 0, webUrl: 'http://folder1.com', lastModifiedDateTime: '2023-01-02T00:00:00Z', file: null, folder: { childCount: 1 } },
                ]
            }
        };
        vi.mocked(mockGraphClient.get).mockResolvedValue(mockItemsData);

        const result = await handler({ drive_id: 'drive-id', item_id: 'root', top: 2 });
        expect(getGraphToken).toHaveBeenCalledWith('https://graph.microsoft.com/.default');
        expect(graphClient).toHaveBeenCalledWith('fake-token');
        expect(mockGraphClient.get).toHaveBeenCalledWith('/drives/drive-id/items/root/children', {
            params: {
                $select: "id,name,size,file,folder,createdDateTime,lastModifiedDateTime,webUrl",
                $top: 2,
            },
        });
        expect(result).toEqual({
            ok: true,
            data: {
                count: 2,
                items: [
                    { id: 'item1', name: 'File1.txt', size: 1024, webUrl: 'http://file1.com', lastModifiedDateTime: '2023-01-01T00:00:00Z', isFile: true, isFolder: false, mimeType: 'text/plain', childCount: undefined },
                    { id: 'item2', name: 'Folder1', size: 0, webUrl: 'http://folder1.com', lastModifiedDateTime: '2023-01-02T00:00:00Z', isFile: false, isFolder: true, mimeType: undefined, childCount: 1 },
                ]
            }
        });
    });

    it('should handle errors when listing items', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Failed to list items');
        vi.mocked(mockGraphClient.get).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', item_id: 'root', top: 50 });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Failed to list items' });
    });
  });

  describe('onedrive_get_item', () => {
    const toolName = 'onedrive_get_item';

    it('should get item metadata on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockItemData = {
            data: {
                id: 'item1',
                name: 'File1.txt',
                size: 1024,
                webUrl: 'http://file1.com',
                createdDateTime: '2023-01-01T00:00:00Z',
                lastModifiedDateTime: '2023-01-01T00:00:00Z',
                file: { mimeType: 'text/plain' },
                parentReference: { driveId: 'drive-id', id: 'parent-id', path: '/drive/root:' },
                '@microsoft.graph.downloadUrl': 'http://download.com'
            }
        };
        vi.mocked(mockGraphClient.get).mockResolvedValue(mockItemData);

        const result = await handler({ drive_id: 'drive-id', item_id: 'item1' });
        expect(mockGraphClient.get).toHaveBeenCalledWith('/drives/drive-id/items/item1');
        expect(result).toEqual({
            ok: true,
            data: {
                id: 'item1',
                name: 'File1.txt',
                size: 1024,
                webUrl: 'http://file1.com',
                createdDateTime: '2023-01-01T00:00:00Z',
                lastModifiedDateTime: '2023-01-01T00:00:00Z',
                isFile: true,
                isFolder: false,
                mimeType: 'text/plain',
                childCount: undefined,
                parentReference: { driveId: 'drive-id', id: 'parent-id', path: '/drive/root:' },
                downloadUrl: 'http://download.com'
            }
        });
    });

    it('should handle errors when getting an item', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Item not found');
        vi.mocked(mockGraphClient.get).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1' });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Item not found' });
    });
  });

  describe('onedrive_search_files', () => {
    const toolName = 'onedrive_search_files';
    it('should search for files on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockSearchData = {
            data: {
                value: [
                    { id: 'item1', name: 'search-result.txt', size: 123, webUrl: 'http://search.com/1', lastModifiedDateTime: '2023-01-01', parentReference: { path: '/drive/root:/folder' } },
                ]
            }
        };
        vi.mocked(mockGraphClient.get).mockResolvedValue(mockSearchData);
        const result = await handler({ drive_id: 'drive-id', query: 'keyword', top: 10 });
        const encodedQuery = encodeURIComponent('keyword');
        expect(mockGraphClient.get).toHaveBeenCalledWith(
            `/drives/drive-id/root/search(q='${encodedQuery}')`,
            { params: { $top: 10, $select: "id,name,size,webUrl,parentReference,lastModifiedDateTime" } }
        );
        expect(result).toEqual({
            ok: true,
            data: {
                count: 1,
                items: [
                    { id: 'item1', name: 'search-result.txt', size: 123, webUrl: 'http://search.com/1', lastModifiedDateTime: '2023-01-01', parentPath: '/drive/root:/folder' },
                ]
            }
        });
    });

    it('should handle errors during search', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Search failed');
        vi.mocked(mockGraphClient.get).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', query: 'keyword', top: 25 });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Search failed' });
    });
  });

  describe('onedrive_create_folder', () => {
    const toolName = 'onedrive_create_folder';
    it('should create a folder on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockFolderData = {
            data: {
                id: 'folder-id',
                name: 'New Folder',
                webUrl: 'http://new-folder.com',
                createdDateTime: '2023-01-01T00:00:00Z',
            }
        };
        vi.mocked(mockGraphClient.post).mockResolvedValue(mockFolderData);
        const result = await handler({ drive_id: 'drive-id', parent_item_id: 'root', folder_name: 'New Folder' });
        expect(mockGraphClient.post).toHaveBeenCalledWith('/drives/drive-id/items/root/children', {
            name: 'New Folder',
            folder: {},
            "@microsoft.graph.conflictBehavior": "rename",
        });
        expect(result).toEqual({
            ok: true,
            data: {
                id: 'folder-id',
                name: 'New Folder',
                webUrl: 'http://new-folder.com',
                createdDateTime: '2023-01-01T00:00:00Z',
            }
        });
    });

    it('should handle errors when creating a folder', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Could not create folder');
        vi.mocked(mockGraphClient.post).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', parent_item_id: 'root', folder_name: 'New Folder' });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Could not create folder' });
    });
  });

  describe('onedrive_move_item', () => {
    const toolName = 'onedrive_move_item';
    it('should move an item on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockMovedItemData = {
            data: {
                id: 'item1',
                name: 'MovedFile.txt',
                webUrl: 'http://moved.com'
            }
        };
        vi.mocked(mockGraphClient.patch).mockResolvedValue(mockMovedItemData);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1', new_parent_id: 'parent2', new_name: 'MovedFile.txt' });
        expect(mockGraphClient.patch).toHaveBeenCalledWith('/drives/drive-id/items/item1', {
            parentReference: { id: 'parent2' },
            name: 'MovedFile.txt'
        });
        expect(result).toEqual({ ok: true, data: { id: 'item1', name: 'MovedFile.txt', webUrl: 'http://moved.com' } });
    });

    it('should handle errors when moving an item', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Move failed');
        vi.mocked(mockGraphClient.patch).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1', new_parent_id: 'parent2' });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Move failed' });
    });
  });

  describe('onedrive_delete_item', () => {
    const toolName = 'onedrive_delete_item';
    it('should delete an item on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        vi.mocked(mockGraphClient.delete).mockResolvedValue({} as any);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1' });
        expect(mockGraphClient.delete).toHaveBeenCalledWith('/drives/drive-id/items/item1');
        expect(result).toEqual({ ok: true, data: { deleted: true, item_id: 'item1' } });
    });

    it('should handle errors when deleting an item', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Delete failed');
        vi.mocked(mockGraphClient.delete).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1' });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Delete failed' });
    });
  });

  describe('onedrive_create_sharing_link', () => {
    const toolName = 'onedrive_create_sharing_link';
    it('should create a sharing link on happy path', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const mockLinkData = {
            data: {
                id: 'link1',
                link: {
                    type: 'view',
                    scope: 'organization',
                    webUrl: 'http://share.com/link1'
                }
            }
        };
        vi.mocked(mockGraphClient.post).mockResolvedValue(mockLinkData);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1', link_type: 'view', scope: 'organization' });
        expect(mockGraphClient.post).toHaveBeenCalledWith('/drives/drive-id/items/item1/createLink', {
            type: 'view',
            scope: 'organization'
        });
        expect(result).toEqual({
            ok: true,
            data: {
                id: 'link1',
                type: 'view',
                scope: 'organization',
                webUrl: 'http://share.com/link1',
                expirationDateTime: undefined
            }
        });
    });

    it('should handle errors when creating a sharing link', async () => {
        const handler = registeredTools.get(toolName)?.handler;
        vi.mocked(getGraphToken).mockResolvedValue('fake-token');
        const error = new Error('Link creation failed');
        vi.mocked(mockGraphClient.post).mockRejectedValue(error);
        const result = await handler({ drive_id: 'drive-id', item_id: 'item1', link_type: 'view', scope: 'organization' });
        expect(result.ok).toBe(false);
        expect(result.error).toEqual({ message: 'Link creation failed' });
    });
  });
});
