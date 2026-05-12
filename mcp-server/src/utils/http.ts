import axios, { type AxiosInstance, isAxiosError } from "axios";
import https from "https";

const WAZUH_AGENT = new https.Agent({ rejectUnauthorized: false });

export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const DEFAULT_TIMEOUT_MS = 30_000;

function makeBearer(baseURL: string, token: string, extra?: object): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...extra,
  });
}

export const graphClient = (token: string) =>
  makeBearer("https://graph.microsoft.com/v1.0", token);

export const mdeClient = (token: string) =>
  makeBearer("https://api.securitycenter.microsoft.com/api", token);

export const ninjaClient = (token: string) =>
  makeBearer("https://app.ninjarmm.com/api/v2", token);

export const armClient = (token: string) =>
  makeBearer("https://management.azure.com", token);

export const wazuhClient = (jwt: string) =>
  makeBearer(process.env["WAZUH_URL"] ?? "https://localhost:55000", jwt, { httpsAgent: WAZUH_AGENT });

export function unifiCloudClient(): AxiosInstance {
  return axios.create({
    baseURL: "https://api.ui.com",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      "X-API-KEY": process.env["UNIFI_API_KEY"] ?? "",
      "Content-Type": "application/json",
    },
  });
}

export function printerlogicClient(): AxiosInstance {
  const baseURL = process.env["PRINTERLOGIC_URL"] ?? "";
  const token = process.env["PRINTERLOGIC_API_TOKEN"] ?? "";
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export function confluenceClient(): AxiosInstance {
  const domain = process.env["CONFLUENCE_DOMAIN"] ?? "";
  const email = process.env["CONFLUENCE_EMAIL"] ?? "";
  const token = process.env["CONFLUENCE_API_TOKEN"] ?? "";
  const auth = Buffer.from(`${email}:${token}`).toString("base64");
  return axios.create({
    baseURL: `https://${domain}.atlassian.net/wiki/api/v2`,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });
}

export function formatError(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined;
    // Graph API wraps errors as { error: { code, message } } — unwrap if present
    const errorObj = data?.["error"];
    const nestedMsg =
      typeof errorObj === "object" && errorObj !== null
        ? ((errorObj as Record<string, unknown>)["message"] as string | undefined)
        : typeof errorObj === "string"
        ? errorObj
        : undefined;
    const msg =
      (data?.["message"] as string | undefined) ??
      nestedMsg ??
      (data?.["errors"] as string | undefined) ??
      err.response?.statusText ??
      err.message;
    const status = err.response?.status;
    return status ? `HTTP ${status}: ${msg}` : msg;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
