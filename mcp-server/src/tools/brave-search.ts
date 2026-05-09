import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { braveSearchClient, formatError } from "../utils/http.js";

const DISABLED_MSG = "Brave Search not configured: set BRAVE_SEARCH_API_KEY";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

export function registerBraveSearchTools(server: McpServer, enabled: boolean): void {
  server.registerTool(
    "brave_web_search",
    {
      description:
        "Search the web using Brave Search. Returns organic results with title, URL, and description. " +
        "Useful for looking up documentation, error messages, CVEs, or any general information.",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of results to return (max 20)"),
        country: z
          .string()
          .default("US")
          .describe("Country code for localised results (e.g. US, GB, AU)"),
        safe_search: z
          .enum(["off", "moderate", "strict"])
          .default("moderate")
          .describe("Safe search filter level"),
      }),
    },
    async ({ query, count, country, safe_search }) => {
      if (!enabled) return disabled();
      try {
        const res = await braveSearchClient().get("/web/search", {
          params: {
            q: query,
            count,
            country,
            safesearch: safe_search,
          },
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "brave_news_search",
    {
      description:
        "Search for recent news articles using Brave Search. Returns news items with title, URL, source, and publish date. " +
        "Useful for monitoring security bulletins, vendor announcements, or IT industry news.",
      inputSchema: z.object({
        query: z.string().describe("News search query"),
        count: z
          .number()
          .int()
          .min(1)
          .max(20)
          .default(10)
          .describe("Number of news results to return (max 20)"),
        country: z
          .string()
          .default("US")
          .describe("Country code for localised results (e.g. US, GB, AU)"),
        freshness: z
          .enum(["pd", "pw", "pm", "py"])
          .optional()
          .describe("Time filter: pd = past day, pw = past week, pm = past month, py = past year"),
      }),
    },
    async ({ query, count, country, freshness }) => {
      if (!enabled) return disabled();
      try {
        const params: Record<string, string | number> = { q: query, count, country };
        if (freshness) params["freshness"] = freshness;
        const res = await braveSearchClient().get("/news/search", { params });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );
}
