import { formatError } from "./http.js";

type McpContent = { type: "text"; text: string };
export type McpResult = { isError?: true; content: McpContent[] };

export function ok(data: unknown): McpResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function err(e: unknown): McpResult {
  return { isError: true, content: [{ type: "text", text: formatError(e) }] };
}

export function cfgErr(msg: string): McpResult {
  return { isError: true, content: [{ type: "text", text: msg }] };
}
