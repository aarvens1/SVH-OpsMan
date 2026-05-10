---
paths:
  - "mcp-server/src/**/*.ts"
---

# TypeScript rules for mcp-server/src

## Tool registration pattern

Every tool module exports a single `register<Service>Tools(server, enabled)` function. When `enabled` is false, register stub tools that return a clear "not configured" error rather than crashing or silently failing.

## Response shaping

Shape all API responses before returning — never pass raw ARM/Graph/API JSON to the MCP caller. Return only the fields Claude needs to reason and act: IDs, names, statuses, timestamps, and anything required for follow-up tool calls. Include a `note` field when pagination or related tools are relevant.

## Error messages

Return actionable errors: `formatError` from `utils/http.ts` wraps axios errors and adds the HTTP status. For missing config, return: `"<tool_name> is not configured — set <ENV_VARS> in your .env or Bitwarden vault"`.

## Zod schemas

All input parameters use Zod. Add `.describe()` to every field, including optional ones. Use `.optional()` not `.nullable()` for optional params.

## No bare `any`

Use the `type A = Record<string, unknown>` alias from azure.ts rather than scattered `// eslint-disable-next-line` suppressions.

## Build

`npm run build` from `mcp-server/`. TypeScript target is ESM. `dist/` is gitignored.
