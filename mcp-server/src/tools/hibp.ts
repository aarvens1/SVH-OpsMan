import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { ok, err, cfgErr } from "../utils/response.js";

type A = Record<string, unknown>;

const NO_CFG_MSG =
  "Have I Been Pwned tools are not configured — set HIBP_API_KEY in the SVH OpsMan Bitwarden item";

function hibpClient() {
  return axios.create({
    baseURL: "https://haveibeenpwned.com/api/v3",
    headers: {
      "hibp-api-key": process.env["HIBP_API_KEY"] ?? "",
      "user-agent": "svh-opsman",
    },
    timeout: 15_000,
  });
}

export function registerHibpTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "hibp_check_account",
    {
      description:
        "Check if an email address appears in any known data breach. " +
        "Returns each breach name, the service that was compromised, breach date, " +
        "account count, and data classes exposed (passwords, phone numbers, physical addresses, etc.). " +
        "Use for user investigations, security posture checks, or after a suspected credential exposure.",
      inputSchema: z.object({
        email: z.string().describe("Email address to check (e.g. user@shoestringvalley.com)"),
      }),
    },
    async ({ email }) => {
      if (!process.env["HIBP_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await hibpClient().get(
          `/breachedaccount/${encodeURIComponent(email)}`,
          { params: { truncateResponse: false } }
        );
        const breaches = (res.data as A[]).map((b: A) => ({
          name: b["Name"],
          title: b["Title"],
          domain: b["Domain"],
          breach_date: b["BreachDate"],
          pwn_count: b["PwnCount"],
          data_classes: b["DataClasses"],
          is_verified: b["IsVerified"],
          is_sensitive: b["IsSensitive"],
          description: b["Description"],
        }));
        return ok({ email, breach_count: breaches.length, breaches });
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          return ok({ email, breach_count: 0, breaches: [], note: "Not found in any known breach" });
        }
        return err(e);
      }
    }
  );

  server.registerTool(
    "hibp_check_pastes",
    {
      description:
        "Check if an email address has appeared in any paste site (Pastebin, GitHub Gists, etc.) " +
        "monitored by Have I Been Pwned. Pastes often contain credential dumps. " +
        "Returns paste source, title, date, and total email count per paste.",
      inputSchema: z.object({
        email: z.string().describe("Email address to check"),
      }),
    },
    async ({ email }) => {
      if (!process.env["HIBP_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await hibpClient().get(`/pasteaccount/${encodeURIComponent(email)}`);
        const pastes = (res.data as A[]).map((p: A) => ({
          source: p["Source"],
          id: p["Id"],
          title: p["Title"],
          date: p["Date"],
          email_count: p["EmailCount"],
        }));
        return ok({ email, paste_count: pastes.length, pastes });
      } catch (e: unknown) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          return ok({ email, paste_count: 0, pastes: [], note: "Not found in any known paste" });
        }
        return err(e);
      }
    }
  );

  server.registerTool(
    "hibp_get_breach",
    {
      description:
        "Get full details of a specific named breach — description, affected service domain, " +
        "breach date, number of compromised accounts, and all data classes exposed. " +
        "Use after hibp_check_account to investigate a specific breach by name.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Breach name as returned by hibp_check_account (e.g. 'Adobe', 'LinkedIn2016', 'Collection1')"),
      }),
    },
    async ({ name }) => {
      if (!process.env["HIBP_API_KEY"]) return cfgErr(NO_CFG_MSG);
      try {
        const res = await hibpClient().get(`/breach/${encodeURIComponent(name)}`);
        const b = res.data as A;
        return ok({
          name: b["Name"],
          title: b["Title"],
          domain: b["Domain"],
          breach_date: b["BreachDate"],
          added_date: b["AddedDate"],
          pwn_count: b["PwnCount"],
          data_classes: b["DataClasses"],
          description: b["Description"],
          is_verified: b["IsVerified"],
          is_fabricated: b["IsFabricated"],
          is_sensitive: b["IsSensitive"],
          is_retired: b["IsRetired"],
          is_spam_list: b["IsSpamList"],
        });
      } catch (e) {
        return err(e);
      }
    }
  );
}
