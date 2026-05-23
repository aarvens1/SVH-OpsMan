import axios from "axios";
import { getNinjaToken } from "../auth/ninja.js";
import { writeStagingFile } from "../staging.js";
import type { Job } from "./base.js";

type A = Record<string, unknown>;

function ninjaClient(token: string) {
  return axios.create({
    baseURL: "https://app.ninjarmm.com/api/v2",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

// Devices in maintenance mode should not surface in alert processing.
// We still collect them so the watch phase has complete disk/uptime data.
const MAINTENANCE_DEVICE_IDS = new Set<number>();

async function fetchDevices(token: string): Promise<A[]> {
  const client = ninjaClient(token);
  const allDevices: A[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string | number> = {
      pageSize: 200,
      df: "class in (WINDOWS_SERVER,LINUX_SERVER,WINDOWS_WORKSTATION,LINUX_WORKSTATION)",
    };
    if (after) params["after"] = after;

    const res = await client.get<A[]>("/devices", { params });
    const page = res.data ?? [];

    for (const d of page) {
      const shaped: A = {
        id: d["id"],
        displayName: d["displayName"] ?? d["systemName"],
        dnsName: d["dnsName"],
        nodeClass: d["nodeClass"],
        offline: d["offline"],
        lastContact: d["lastContact"],
        osName: d["osName"],
        ipAddresses: d["ipAddresses"],
        maintenanceMode: d["maintenanceMode"] ?? false,
      };

      if (shaped["maintenanceMode"] === true && typeof shaped["id"] === "number") {
        MAINTENANCE_DEVICE_IDS.add(shaped["id"] as number);
      }

      // Attach disk volumes if present in the device payload
      if (Array.isArray(d["volumes"])) shaped["volumes"] = d["volumes"];

      allDevices.push(shaped);
    }

    // NinjaOne paginates via cursor — stop when we get a partial page
    after = page.length === 200 ? (page[page.length - 1]?.["id"] as string | undefined) : undefined;
  } while (after);

  return allDevices;
}

async function fetchAlerts(token: string): Promise<A[]> {
  const client = ninjaClient(token);
  const res = await client.get<A[]>("/alerts", {
    params: { status: "ACTIVE", pageSize: 200 },
  });
  const alerts = res.data ?? [];

  // Filter out alerts for devices in maintenance mode
  return alerts
    .filter((a) => {
      const deviceId = a["deviceId"];
      return typeof deviceId !== "number" || !MAINTENANCE_DEVICE_IDS.has(deviceId);
    })
    .map((a) => ({
      id: a["id"],
      deviceId: a["deviceId"],
      deviceName: a["deviceName"],
      message: a["message"],
      severity: a["severity"],
      type: a["type"],
      createTime: a["createTime"],
    }));
}

export const ninjaJob: Job = {
  name: "ninjaone",

  async run(stagingDir: string) {
    const token = await getNinjaToken();

    const [devicesResult, alertsResult] = await Promise.allSettled([
      fetchDevices(token),
      fetchAlerts(token),
    ]);

    const files: string[] = [];
    let records = 0;

    if (devicesResult.status === "fulfilled") {
      writeStagingFile(stagingDir, "ninja-devices.json", devicesResult.value);
      files.push("ninja-devices.json");
      records += devicesResult.value.length;
    } else {
      throw new Error(`NinjaOne devices fetch failed: ${String(devicesResult.reason)}`);
    }

    if (alertsResult.status === "fulfilled") {
      writeStagingFile(stagingDir, "ninja-alerts.json", alertsResult.value);
      files.push("ninja-alerts.json");
      records += alertsResult.value.length;
    } else {
      console.error("[ninjaone] alerts failed:", alertsResult.reason);
    }

    return { files, records };
  },
};
