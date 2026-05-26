import axios from "axios";
import { writeStagingFile } from "../staging.js";
import { getConfig } from "../config.js";
import type { Job } from "./base.js";

type A = Record<string, unknown>;

function unifiClient(apiKey: string) {
  return axios.create({
    baseURL: "https://api.ui.com",
    timeout: 30_000,
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
  });
}

async function fetchDevices(apiKey: string): Promise<A[]> {
  const res = await unifiClient(apiKey).get<{ data: A[] }>("/ea/devices");
  const hostGroups = res.data.data ?? [];
  const devices: A[] = [];
  for (const host of hostGroups) {
    for (const d of (host["devices"] as A[] | undefined) ?? []) {
      devices.push({
        id: d["id"],
        name: d["name"],
        mac: d["mac"],
        model: d["model"],
        ip: d["ip"],
        status: d["status"],
        firmwareVersion: d["version"],
        firmwareStatus: d["firmwareStatus"],
        isConsole: d["isConsole"],
        startupTime: d["startupTime"],
        hostId: host["hostId"],
        hostName: host["hostName"],
      });
    }
  }
  return devices;
}

async function fetchAlerts(apiKey: string): Promise<A[]> {
  const client = unifiClient(apiKey);
  // Try known alert endpoints — the EA API surface isn't fully documented
  for (const path of ["/ea/alerts", "/ea/alarms", "/v1/alerts"]) {
    try {
      const res = await client.get<{ data?: A[]; alerts?: A[]; alarms?: A[] }>(path);
      const items =
        res.data.data ??
        res.data.alerts ??
        res.data.alarms ??
        (Array.isArray(res.data) ? (res.data as unknown as A[]) : null);
      if (items !== null) {
        return items.map((a) => ({
          id: a["id"],
          type: a["type"],
          severity: a["severity"],
          message: a["message"] ?? a["description"],
          createdAt: a["createdAt"] ?? a["timestamp"],
          siteId: a["siteId"],
          deviceId: a["deviceId"],
        }));
      }
    } catch {
      // try next path
    }
  }
  return [];
}

export const unifiJob: Job = {
  name: "unifi",

  async run(stagingDir: string) {
    const apiKey = getConfig().unifi.apiKey;
    if (!apiKey) {
      console.warn("[unifi] API key not configured — skipping");
      return { files: [], records: 0 };
    }

    const [devices, alerts] = await Promise.allSettled([
      fetchDevices(apiKey),
      fetchAlerts(apiKey),
    ]);

    const files: string[] = [];
    let records = 0;

    if (devices.status === "fulfilled") {
      writeStagingFile(stagingDir, "unifi-devices.json", devices.value);
      files.push("unifi-devices.json");
      records += devices.value.length;
    } else {
      const r = devices.reason as { response?: { status?: number; data?: unknown } } | undefined;
      if (r?.response) {
        console.error(`[unifi] devices failed: HTTP ${r.response.status}`, r.response.data);
      } else {
        console.error("[unifi] devices failed:", devices.reason);
      }
    }

    // Always write alerts file — empty array is a valid "no active alerts" result
    const alertList = alerts.status === "fulfilled" ? alerts.value : [];
    writeStagingFile(stagingDir, "unifi-alerts.json", alertList);
    files.push("unifi-alerts.json");
    records += alertList.length;
    if (alerts.status === "rejected") {
      console.warn("[unifi] alerts fetch failed — writing empty alerts");
    }

    if (files.length === 0) {
      throw new Error("All UniFi sub-requests failed");
    }

    return { files, records };
  },
};
