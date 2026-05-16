import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import https from "https";
import { wazuhClient } from "../utils/http.js";
import { ok, err } from "../utils/response.js";

// Shared TLS agent for the auth POST (same cert-skip as wazuhClient)
const tlsAgent = new https.Agent({ rejectUnauthorized: false });

let cachedJwt: { token: string; expires_at: number } | null = null;

async function getJwt(): Promise<string> {
  if (cachedJwt && Date.now() < cachedJwt.expires_at - 60_000) {
    return cachedJwt.token;
  }
  const url = process.env["WAZUH_URL"] ?? "https://localhost:55000";
  const username = process.env["WAZUH_USERNAME"] ?? "";
  const password = process.env["WAZUH_PASSWORD"] ?? "";
  const res = await axios.post<{ data: { token: string } }>(
    `${url}/security/user/authenticate`,
    {},
    { auth: { username, password }, httpsAgent: tlsAgent, timeout: 15_000 }
  );
  cachedJwt = {
    token: res.data.data.token,
    expires_at: Date.now() + 15 * 60 * 1000,
  };
  return cachedJwt.token;
}

type A = Record<string, unknown>;

// TTL cache for wazuh_list_agents
const responseCache = new Map<string, { data: unknown; expires_at: number }>();
function getCached(key: string): unknown | null {
  const entry = responseCache.get(key);
  if (entry && Date.now() < entry.expires_at) return entry.data;
  return null;
}
function setCached(key: string, data: unknown, ttlMs = 60_000): void {
  responseCache.set(key, { data, expires_at: Date.now() + ttlMs });
}

export function registerWazuhTools(server: McpServer, enabled: boolean): void {
  if (!enabled) return;

  server.registerTool(
    "wazuh_list_agents",
    {
      description:
        "List Wazuh agents with their status, OS, IP, and last keepalive. " +
        "Filter by status or OS platform.",
      inputSchema: z.object({
        status: z
          .enum(["active", "disconnected", "never_connected", "pending"])
          .optional()
          .describe("Filter by agent connection status"),
        os_platform: z
          .string()
          .optional()
          .describe("Filter by OS platform (e.g. 'windows', 'ubuntu')"),
        search: z
          .string()
          .optional()
          .describe("Search by agent name or IP"),
        limit: z.number().int().min(1).max(500).default(100),
        offset: z.number().int().default(0),
      }),
    },
    async ({ status, os_platform, search, limit, offset }) => {
      try {
        const cacheKey = `wazuh_list_agents:${status ?? ""}:${os_platform ?? ""}:${search ?? ""}:${limit}:${offset}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit, offset };
        if (status) params.status = status;
        if (os_platform) params["os.platform"] = os_platform;
        if (search) params.search = search;
        const res = await wazuhClient(jwt).get("/agents", { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((a: A) => ({
          id: a["id"],
          name: a["name"],
          ip: a["ip"],
          status: a["status"],
          os_platform: (a["os"] as A | undefined)?.["platform"],
          os_name: (a["os"] as A | undefined)?.["name"],
          os_version: (a["os"] as A | undefined)?.["version"],
          version: a["version"],
          lastKeepAlive: a["lastKeepAlive"],
          nodeId: a["node_name"],
          manager: a["manager"],
          groupName: a["group"],
        }));
        const shaped = {
          total: data["total_affected_items"],
          count: items.length,
          agents: items,
        };
        setCached(cacheKey, shaped);
        return ok(shaped);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_search_alerts",
    {
      description:
        "Search SIEM alerts. Filter by agent, severity (rule level), time window, and rule group. " +
        "Returns alert details, rule description, MITRE ATT&CK mappings, and agent context.",
      inputSchema: z.object({
        agent_id: z.string().optional().describe("Scope to a specific agent ID"),
        min_level: z
          .number()
          .int()
          .min(1)
          .max(15)
          .default(6)
          .describe("Minimum Wazuh rule level (1=low, 15=critical)"),
        time_from: z
          .string()
          .optional()
          .describe("Start time in ISO 8601 or relative (e.g. 'now-24h')"),
        time_to: z
          .string()
          .optional()
          .describe("End time in ISO 8601. Defaults to now."),
        rule_group: z
          .string()
          .optional()
          .describe("Filter by rule group (e.g. 'windows', 'syslog', 'authentication_failed')"),
        query: z
          .string()
          .optional()
          .describe("Free-text search term matched against alert data"),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    },
    async ({ agent_id, min_level, time_from, time_to, rule_group, query, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = {
          limit,
          "rule.level": min_level,
        };
        if (agent_id) params.agents_list = agent_id;
        if (time_from) params.timestamp_from = time_from;
        if (time_to) params.timestamp_to = time_to;
        if (rule_group) params["rule.groups"] = rule_group;
        if (query) params.q = query;
        const res = await wazuhClient(jwt).get("/alerts", { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((alert: A) => ({
          id: alert["id"],
          timestamp: alert["timestamp"],
          rule: {
            id: (alert["rule"] as A | undefined)?.["id"],
            level: (alert["rule"] as A | undefined)?.["level"],
            description: (alert["rule"] as A | undefined)?.["description"],
            groups: (alert["rule"] as A | undefined)?.["groups"],
            mitre: (alert["rule"] as A | undefined)?.["mitre"],
          },
          agent: {
            id: (alert["agent"] as A | undefined)?.["id"],
            name: (alert["agent"] as A | undefined)?.["name"],
            ip: (alert["agent"] as A | undefined)?.["ip"],
          },
          manager: (alert["manager"] as A | undefined)?.["name"],
          location: alert["location"],
          // Extract only diagnostic top-level fields from the raw event payload.
          // The full data blob (Windows eventdata XML, audit records) can be 500+ tokens
          // per alert and is almost never needed for triage. If deeper data is required,
          // query Wazuh directly with a narrowed filter.
          data: (() => {
            const d = alert["data"] as A | undefined;
            if (!d) return undefined;
            const out: A = {};
            for (const k of ["srcip","dstip","srcuser","dstuser","dstport","protocol","action","command","url","status"]) {
              if (d[k] !== undefined) out[k] = d[k];
            }
            const win = d["win"] as A | undefined;
            if (win) {
              const sys = win["system"] as A | undefined;
              if (sys?.["eventID"]) out["eventID"] = sys["eventID"];
              const ed = win["eventdata"] as A | undefined;
              if (ed) Object.assign(out, Object.fromEntries(Object.entries(ed).slice(0, 5)));
            }
            return Object.keys(out).length ? out : undefined;
          })(),
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          alerts: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_get_agent_vulnerabilities",
    {
      description:
        "List CVE vulnerabilities detected on a specific Wazuh agent. " +
        "Returns CVE ID, severity, CVSS score, package name, and remediation advice.",
      inputSchema: z.object({
        agent_id: z.string().describe("Agent ID (e.g. '001')"),
        severity: z
          .enum(["critical", "high", "medium", "low"])
          .optional()
          .describe("Filter by CVSS severity"),
        limit: z.number().int().default(100),
      }),
    },
    async ({ agent_id, severity, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit };
        if (severity) params.severity = severity;
        const res = await wazuhClient(jwt).get(
          `/vulnerability/${agent_id}`,
          { params }
        );
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((v: A) => ({
          cve: v["cve"],
          name: v["name"],
          version: v["version"],
          severity: v["severity"],
          cvss2_score: v["cvss2_score"],
          cvss3_score: v["cvss3_score"],
          condition: v["condition"],
          title: v["title"],
          published: v["published"],
          references: v["references"],
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          vulnerabilities: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_get_fim_events",
    {
      description:
        "File Integrity Monitoring (FIM) events for an agent. " +
        "Returns file path, event type (added/modified/deleted), timestamp, MD5/SHA hash changes, and user.",
      inputSchema: z.object({
        agent_id: z.string().describe("Agent ID"),
        time_from: z.string().optional().describe("Start time in ISO 8601"),
        time_to: z.string().optional().describe("End time in ISO 8601"),
        path: z.string().optional().describe("Filter by file path prefix"),
        event_type: z
          .enum(["added", "modified", "deleted"])
          .optional()
          .describe("Filter by FIM event type"),
        limit: z.number().int().default(100),
      }),
    },
    async ({ agent_id, time_from, time_to, path, event_type, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit };
        if (time_from) params.date_add_from = time_from;
        if (time_to) params.date_add_to = time_to;
        if (path) params.path = path;
        if (event_type) params.type = event_type;
        const res = await wazuhClient(jwt).get(`/syscheck/${agent_id}`, { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((f: A) => ({
          file: f["file"],
          type: f["type"],
          event: f["event"],
          date: f["date"],
          mtime: f["mtime"],
          md5: f["md5"],
          sha1: f["sha1"],
          sha256: f["sha256"],
          uname: f["uname"],
          gname: f["gname"],
          inode: f["inode"],
          size: f["size"],
          perm: f["perm"],
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          events: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_get_rootcheck",
    {
      description:
        "Rootcheck (system audit) results for an agent — checks for rootkits, " +
        "hidden files, unowned files, and policy violations.",
      inputSchema: z.object({
        agent_id: z.string().describe("Agent ID"),
        status: z
          .enum(["all", "solved", "outstanding"])
          .default("outstanding")
          .describe("Filter by check status"),
        limit: z.number().int().default(100),
      }),
    },
    async ({ agent_id, status, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit };
        if (status !== "all") params.status = status;
        const res = await wazuhClient(jwt).get(`/rootcheck/${agent_id}`, { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((r: A) => ({
          event: r["event"],
          status: r["status"],
          date: r["date"],
          oldDate: r["oldDate"],
          cis: r["cis"],
          reason: r["reason"],
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          results: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_search_rules",
    {
      description:
        "Search Wazuh detection rules by keyword, group, level, or ID range. " +
        "Useful for understanding what triggers a specific alert.",
      inputSchema: z.object({
        search: z.string().optional().describe("Keyword to search in rule descriptions"),
        group: z.string().optional().describe("Rule group (e.g. 'windows', 'authentication')"),
        min_level: z.number().int().optional().describe("Minimum rule level"),
        rule_id: z.string().optional().describe("Specific rule ID"),
        limit: z.number().int().default(50),
      }),
    },
    async ({ search, group, min_level, rule_id, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit };
        if (search) params.search = search;
        if (group) params.groups = group;
        if (min_level) params["level.from"] = min_level;
        if (rule_id) params.rule_ids = rule_id;
        const res = await wazuhClient(jwt).get("/rules", { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((r: A) => ({
          id: r["id"],
          level: r["level"],
          description: r["description"],
          groups: r["groups"],
          mitre: r["mitre"],
          filename: r["filename"],
          relative_dirname: r["relative_dirname"],
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          rules: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "wazuh_search_decoders",
    {
      description:
        "Search Wazuh log decoders. Useful for tracing how raw log lines are parsed into alert fields.",
      inputSchema: z.object({
        search: z.string().optional().describe("Keyword to search in decoder names or files"),
        limit: z.number().int().default(50),
      }),
    },
    async ({ search, limit }) => {
      try {
        const jwt = await getJwt();
        const params: Record<string, string | number> = { limit };
        if (search) params.search = search;
        const res = await wazuhClient(jwt).get("/decoders", { params });
        const raw = res.data as A;
        const data = raw["data"] as A;
        const items = (data["affected_items"] as A[] ?? []).map((d: A) => ({
          name: d["name"],
          details: d["details"],
          filename: d["filename"],
          relative_dirname: d["relative_dirname"],
          position: d["position"],
        }));
        return ok({
          total: data["total_affected_items"],
          count: items.length,
          decoders: items,
        });
      } catch (e) {
        return err(e);
      }
    }
  );
}
