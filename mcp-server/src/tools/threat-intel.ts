import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { formatError } from "../utils/http.js";

const DISABLED_MSG =
  "Threat Intel service not configured: set at least VIRUSTOTAL_API_KEY; optionally SHODAN_API_KEY, ABUSEIPDB_API_KEY, URLSCAN_API_KEY, GREYNOISE_API_KEY";

function disabled() {
  return { isError: true as const, content: [{ type: "text" as const, text: DISABLED_MSG }] };
}
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(e: unknown) {
  return { isError: true as const, content: [{ type: "text" as const, text: formatError(e) }] };
}

const DEFAULT_TIMEOUT = 20_000;

export function registerThreatIntelTools(server: McpServer, enabled: boolean): void {
  // ── CVE / EPSS / KEV ─────────────────────────────────────────────────────

  server.registerTool(
    "ti_lookup_cve",
    {
      description:
        "Full CVE profile: NVD metadata (CVSS v3, description, affected products) + " +
        "EPSS probability + CISA KEV status + exploitability summary.",
      inputSchema: z.object({
        cve_id: z.string().describe("CVE identifier (e.g. CVE-2024-12345)"),
      }),
    },
    async ({ cve_id }) => {
      if (!enabled) return disabled();
      const id = cve_id.toUpperCase();
      try {
        const [nvdRes, epssRes, kevRes] = await Promise.allSettled([
          axios.get(
            `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${id}`,
            { timeout: DEFAULT_TIMEOUT }
          ),
          axios.get(`https://api.first.org/data/v1/epss?cve=${id}`, {
            timeout: DEFAULT_TIMEOUT,
          }),
          axios.get(
            "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            { timeout: DEFAULT_TIMEOUT }
          ),
        ]);

        const nvd =
          nvdRes.status === "fulfilled"
            ? nvdRes.value.data?.vulnerabilities?.[0]?.cve ?? null
            : null;
        const epss =
          epssRes.status === "fulfilled"
            ? epssRes.value.data?.data?.[0] ?? null
            : null;
        const kevVulns: { cveID: string }[] =
          kevRes.status === "fulfilled"
            ? kevRes.value.data?.vulnerabilities ?? []
            : [];
        const inKev = kevVulns.some((v) => v.cveID === id);
        const kevEntry = inKev ? kevVulns.find((v) => v.cveID === id) : null;

        return ok({ cve: id, nvd, epss, cisa_kev: { in_catalog: inKev, entry: kevEntry } });
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ti_cisa_kev",
    {
      description:
        "Query the CISA Known Exploited Vulnerabilities catalog. " +
        "Returns all KEV entries or search by keyword/CVE.",
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe("Filter by CVE ID, product name, or vendor"),
        limit: z.number().int().min(1).max(500).default(50),
      }),
    },
    async ({ search, limit }) => {
      if (!enabled) return disabled();
      try {
        const res = await axios.get(
          "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
          { timeout: DEFAULT_TIMEOUT }
        );
        let vulns: Record<string, string>[] = res.data?.vulnerabilities ?? [];
        if (search) {
          const q = search.toLowerCase();
          vulns = vulns.filter(
            (v) =>
              v["cveID"]?.toLowerCase().includes(q) ||
              v["vendorProject"]?.toLowerCase().includes(q) ||
              v["product"]?.toLowerCase().includes(q)
          );
        }
        return ok({ total: vulns.length, results: vulns.slice(0, limit) });
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── VirusTotal ────────────────────────────────────────────────────────────

  server.registerTool(
    "ti_vt_lookup_ip",
    {
      description:
        "VirusTotal IP address report — detection ratio, threat categories, " +
        "country, ASN, passive DNS, and recent communication files.",
      inputSchema: z.object({
        ip: z.string().describe("IPv4 or IPv6 address"),
      }),
    },
    async ({ ip }) => {
      if (!enabled) return disabled();
      const key = process.env["VIRUSTOTAL_API_KEY"];
      if (!key) return err("VIRUSTOTAL_API_KEY not set");
      try {
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`,
          { headers: { "x-apikey": key }, timeout: DEFAULT_TIMEOUT }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ti_vt_lookup_domain",
    {
      description:
        "VirusTotal domain report — detection ratio, categories, DNS records, " +
        "WHOIS, and subdomains.",
      inputSchema: z.object({
        domain: z.string().describe("Domain name (e.g. example.com)"),
      }),
    },
    async ({ domain }) => {
      if (!enabled) return disabled();
      const key = process.env["VIRUSTOTAL_API_KEY"];
      if (!key) return err("VIRUSTOTAL_API_KEY not set");
      try {
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`,
          { headers: { "x-apikey": key }, timeout: DEFAULT_TIMEOUT }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ti_vt_lookup_hash",
    {
      description:
        "VirusTotal file hash report — detection ratio by engine, threat names, " +
        "file type, size, first/last seen, and behavioral summary.",
      inputSchema: z.object({
        hash: z
          .string()
          .describe("MD5, SHA-1, or SHA-256 hash of the file"),
      }),
    },
    async ({ hash }) => {
      if (!enabled) return disabled();
      const key = process.env["VIRUSTOTAL_API_KEY"];
      if (!key) return err("VIRUSTOTAL_API_KEY not set");
      try {
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/files/${hash}`,
          { headers: { "x-apikey": key }, timeout: DEFAULT_TIMEOUT }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  server.registerTool(
    "ti_vt_lookup_url",
    {
      description:
        "VirusTotal URL report — detection ratio, HTTP response, redirects, and associated files.",
      inputSchema: z.object({
        url: z.string().describe("URL to look up"),
      }),
    },
    async ({ url }) => {
      if (!enabled) return disabled();
      const key = process.env["VIRUSTOTAL_API_KEY"];
      if (!key) return err("VIRUSTOTAL_API_KEY not set");
      try {
        const urlId = Buffer.from(url).toString("base64url");
        const res = await axios.get(
          `https://www.virustotal.com/api/v3/urls/${urlId}`,
          { headers: { "x-apikey": key }, timeout: DEFAULT_TIMEOUT }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── Shodan ────────────────────────────────────────────────────────────────

  server.registerTool(
    "ti_shodan_lookup_ip",
    {
      description:
        "Shodan host report for an IP — open ports, services, banners, CVEs, " +
        "hostnames, and geolocation.",
      inputSchema: z.object({
        ip: z.string().describe("IPv4 address"),
      }),
    },
    async ({ ip }) => {
      if (!enabled) return disabled();
      const key = process.env["SHODAN_API_KEY"];
      if (!key) return err("SHODAN_API_KEY not set");
      try {
        const res = await axios.get(
          `https://api.shodan.io/shodan/host/${ip}?key=${key}`,
          { timeout: DEFAULT_TIMEOUT }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── AbuseIPDB ─────────────────────────────────────────────────────────────

  server.registerTool(
    "ti_abuseipdb_check",
    {
      description:
        "AbuseIPDB lookup for an IP — abuse confidence score, number of reports, " +
        "country, ISP, and recent abuse categories.",
      inputSchema: z.object({
        ip: z.string().describe("IPv4 or IPv6 address"),
        max_age_days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .default(90)
          .describe("How far back to look for abuse reports"),
      }),
    },
    async ({ ip, max_age_days }) => {
      if (!enabled) return disabled();
      const key = process.env["ABUSEIPDB_API_KEY"];
      if (!key) return err("ABUSEIPDB_API_KEY not set");
      try {
        const res = await axios.get("https://api.abuseipdb.com/api/v2/check", {
          headers: { Key: key, Accept: "application/json" },
          params: { ipAddress: ip, maxAgeInDays: max_age_days, verbose: true },
          timeout: DEFAULT_TIMEOUT,
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── urlscan.io ────────────────────────────────────────────────────────────

  server.registerTool(
    "ti_urlscan_search",
    {
      description:
        "Search urlscan.io for historical scans of a URL, domain, or IP. " +
        "Returns screenshots, DOM analysis, and security verdicts.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "urlscan search query. E.g. 'domain:evil.com', 'ip:1.2.3.4', 'page.url:phish'"
          ),
        size: z.number().int().min(1).max(100).default(10),
      }),
    },
    async ({ query, size }) => {
      if (!enabled) return disabled();
      const key = process.env["URLSCAN_API_KEY"];
      if (!key) return err("URLSCAN_API_KEY not set");
      try {
        const res = await axios.get("https://urlscan.io/api/v1/search/", {
          headers: { "API-Key": key },
          params: { q: query, size },
          timeout: DEFAULT_TIMEOUT,
        });
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── GreyNoise ─────────────────────────────────────────────────────────────

  server.registerTool(
    "ti_greynoise_lookup",
    {
      description:
        "GreyNoise context for an IP — whether it is a benign scanner, malicious actor, " +
        "or unknown. Includes classification, tags, intent, and first/last seen.",
      inputSchema: z.object({
        ip: z.string().describe("IPv4 address"),
      }),
    },
    async ({ ip }) => {
      if (!enabled) return disabled();
      const key = process.env["GREYNOISE_API_KEY"];
      if (!key) return err("GREYNOISE_API_KEY not set");
      try {
        const res = await axios.get(
          `https://api.greynoise.io/v3/community/${ip}`,
          {
            headers: { key },
            timeout: DEFAULT_TIMEOUT,
          }
        );
        return ok(res.data);
      } catch (e) {
        return err(e);
      }
    }
  );

  // ── MITRE ATT&CK ─────────────────────────────────────────────────────────

  server.registerTool(
    "ti_mitre_lookup",
    {
      description:
        "Look up MITRE ATT&CK techniques, tactics, or groups by ID or keyword. " +
        "Returns technique name, tactic, description, detection guidance, and mitigation references.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("ATT&CK ID (e.g. T1566, G0016) or keyword search term"),
        type: z
          .enum(["technique", "tactic", "group", "software", "mitigation", "any"])
          .default("any"),
      }),
    },
    async ({ query, type }) => {
      if (!enabled) return disabled();
      try {
        const res = await axios.get(
          "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json",
          { timeout: 30_000 }
        );
        const objects: Record<string, unknown>[] =
          (res.data as { objects: Record<string, unknown>[] }).objects ?? [];

        const typeMap: Record<string, string> = {
          technique: "attack-pattern",
          tactic: "x-mitre-tactic",
          group: "intrusion-set",
          software: "tool",
          mitigation: "course-of-action",
        };

        const q = query.toLowerCase();
        const results = objects
          .filter((o) => {
            if (type !== "any" && o["type"] !== typeMap[type]) return false;
            const extId =
              (
                (o["external_references"] as { external_id?: string }[] | undefined) ?? []
              ).find((r) => r.external_id)?.external_id ?? "";
            const name = ((o["name"] as string | undefined) ?? "").toLowerCase();
            const desc = ((o["description"] as string | undefined) ?? "").toLowerCase();
            return (
              extId.toLowerCase() === q ||
              name.includes(q) ||
              (q.length > 4 && desc.includes(q))
            );
          })
          .slice(0, 10)
          .map((o) => ({
            id: (
              (o["external_references"] as { external_id?: string }[] | undefined) ?? []
            ).find((r) => r.external_id)?.external_id,
            name: o["name"],
            type: o["type"],
            description:
              typeof o["description"] === "string"
                ? (o["description"] as string).slice(0, 500)
                : null,
            kill_chain_phases: o["kill_chain_phases"],
            x_mitre_detection: o["x_mitre_detection"],
          }));

        return ok({ query, results });
      } catch (e) {
        return err(e);
      }
    }
  );
}
