## Spec

### Task

Scaffold `mcp-server/src/__tests__/tools/*.test.ts` for all 28 tool files. Each test file covers at minimum: one happy-path call and one error-path call per registered tool.

### Project context

- Framework: vitest + TypeScript, config at `mcp-server/vitest.config.ts`
- Test glob: `src/**/*.test.ts`
- Existing tool test to follow: `src/__tests__/tools/powershell.test.ts`
- Existing utility tests for shape reference: `src/__tests__/response.test.ts`, `src/__tests__/http.test.ts`

### Tool handler shape (every tool follows this pattern)

```typescript
// mcp-server/src/tools/<name>.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getXxxToken } from "../auth/xxx.js";
import { xxxClient } from "../utils/http.js";
import { ok, err, cfgErr } from "../utils/response.js";

export function registerXxxTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;
  server.registerTool("tool_name", { inputSchema: z.object({ ... }) }, async (inputs) => {
    try {
      const token = await getXxxToken(SCOPE);
      const res = await xxxClient(token).get("/endpoint", { params });
      return ok(shaped_data);
    } catch (e) {
      return err(e);
    }
  });
}
```

### Response utility shapes (from `utils/response.ts`)

```typescript
type McpContent = { type: "text"; text: string };
type McpResult = { isError?: true; content: McpContent[] };

ok(data)    // → { content: [{ type: "text", text: JSON.stringify(data) }] }
err(e)      // → { isError: true, content: [{ type: "text", text: formatError(e) }] }
cfgErr(msg) // → { isError: true, content: [{ type: "text", text: msg }] }
```

### Auth functions by integration (module paths to mock)

| File prefix | Auth import | Token getter |
|---|---|---|
| `planner`, `onedrive`, `sharepoint`, `teams`, `outlook-*`, `exchange-admin`, `intune`, `ms-admin`, `defender-mde`, `entra-admin` | `../auth/graph.js` | `getGraphToken(SCOPE)` |
| `ninjaone` | `../auth/ninja.js` | `getNinjaToken()`, `getNinjaManagementToken()` |
| `azure` | `../auth/azure.js` | `getAzureToken(SCOPE)` |
| `confluence` | none (uses env vars in `http.js`) | n/a — mock `confluenceClient` |
| `ms-todo` | `../auth/graph.js` | `getGraphToken(SCOPE)` |

### HTTP client factories to mock (from `utils/http.ts`)

```typescript
// Mock these — each returns an AxiosInstance
graphClient(token)       // → { get, post, patch, delete }
ninjaClient(token)       // → { get }
mdeClient(token)         // → { get, post }
armClient(token)         // → { get, post }
wazuhClient(jwt)         // → { get }
unifiCloudClient()       // → { get }
printerlogicClient()     // → { get }
confluenceClient()       // → { get, post, put }
confluenceSearchClient() // → { get }
```

### Test pattern (follow `powershell.test.ts`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerXxxTools } from "../../tools/xxx.js";

vi.mock("../../auth/graph.js", () => ({ getGraphToken: vi.fn().mockResolvedValue("fake-token") }));
vi.mock("../../utils/http.js", () => ({
  graphClient: vi.fn().mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
  }),
  GRAPH_SCOPE: "https://graph.microsoft.com/.default",
}));

describe("registerXxxTools", () => {
  let server: McpServer;
  let handlers: Map<string, (inputs: unknown) => Promise<unknown>>;

  beforeEach(() => {
    server = new McpServer({ name: "test", version: "0.0.0" });
    handlers = new Map();
    // Capture registered handlers
    vi.spyOn(server, "registerTool").mockImplementation((name, _schema, handler) => {
      handlers.set(name, handler as (inputs: unknown) => Promise<unknown>);
      return server;
    });
    registerXxxTools(server, true);
  });

  describe("tool_name", () => {
    it("returns shaped data on success", async () => {
      // Mock HTTP response with minimal realistic shape
      const mockGet = vi.mocked(graphClient("")).get;
      mockGet.mockResolvedValueOnce({ data: { value: [{ id: "<id>", displayName: "<name>" }] } });

      const result = await handlers.get("tool_name")!({ /* inputs */ });
      expect((result as any).isError).toBeUndefined();
      const parsed = JSON.parse((result as any).content[0].text);
      expect(parsed).toHaveProperty("<expected_field>");
    });

    it("returns error on HTTP failure", async () => {
      const mockGet = vi.mocked(graphClient("")).get;
      mockGet.mockRejectedValueOnce(new Error("network error"));

      const result = await handlers.get("tool_name")!({ /* inputs */ });
      expect((result as any).isError).toBe(true);
    });
  });
});
```

### Scope

- All 28 files in `mcp-server/src/tools/`: `azure.ts`, `cloudflare.ts`, `confluence.ts`, `db-query.ts`, `defender-mde.ts`, `entra-admin.ts`, `exchange-admin.ts`, `freshservice.ts`, `google.ts`, `hibp.ts`, `intune.ts`, `ms-admin.ts`, `ms-todo.ts`, `n8n.ts`, `ninjaone.ts`, `onedrive.ts`, `outlook-calendar.ts`, `outlook-mail.ts`, `planner.ts`, `powershell.ts` (already done), `printerlogic.ts`, `sharepoint.ts`, `staging.ts`, `synology.ts`, `teams.ts`, `unifi-cloud.ts`, `unifi-network.ts`, `wazuh.ts`
- Skip `powershell.ts` — test already exists at `src/__tests__/tools/powershell.test.ts`
- One test file per tool file, named `src/__tests__/tools/<name>.test.ts`
- Minimum: 2 tests per registered tool (happy path + error path)
- Do not test actual API connectivity — all external calls must be mocked

### Output

27 test files in `mcp-server/src/__tests__/tools/`. After writing, confirm `npx vitest run` passes with no type errors.
