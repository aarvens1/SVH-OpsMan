import axios, { type AxiosInstance, isAxiosError } from "axios";
import https from "https";

const WAZUH_AGENT = new https.Agent({ rejectUnauthorized: false });

export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const DEFAULT_TIMEOUT_MS = 30_000;

export function graphClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function mdeClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: "https://api.securitycenter.microsoft.com/api",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function ninjaClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: "https://app.ninjarmm.com/api/v2",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

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

export function todoistClient(): AxiosInstance {
  return axios.create({
    baseURL: "https://api.todoist.com/rest/v2",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${process.env["TODOIST_API_TOKEN"] ?? ""}`,
      "Content-Type": "application/json",
    },
  });
}

export function armClient(token: string): AxiosInstance {
  return axios.create({
    baseURL: "https://management.azure.com",
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function wazuhClient(jwt: string): AxiosInstance {
  const baseURL = process.env["WAZUH_URL"] ?? "https://localhost:55000";
  return axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    httpsAgent: WAZUH_AGENT,
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
    const msg =
      (data?.["message"] as string | undefined) ??
      (data?.["error"] as string | undefined) ??
      (data?.["errors"] as string | undefined) ??
      err.response?.statusText ??
      err.message;
    const status = err.response?.status;
    return status ? `HTTP ${status}: ${msg}` : msg;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
