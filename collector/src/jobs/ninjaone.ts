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

async function fetchBackups(token: string): Promise<A[]> {
  const client = ninjaClient(token);
  const allBackups: A[] = [];
  let cursor: string | undefined;

  try {
    do {
      const params: Record<string, string | number> = { pageSize: 200 };
      if (cursor) params["cursor"] = cursor;
      const res = await client.get("/backup/jobs", { params });
      const raw = res.data as A;
      const results = (raw["results"] as A[] | undefined) ?? [];
      for (const b of results) {
        allBackups.push({
          jobId: b["jobId"],
          deviceId: b["deviceId"],
          organizationId: b["organizationId"],
          planName: b["planName"],
          planType: b["planType"],
          jobStatus: b["jobStatus"],
          jobStartTime: b["jobStartTime"],
          jobEndTime: b["jobEndTime"],
          totalStoredBytes: b["totalStoredBytes"],
        });
      }
      cursor = results.length === 200
        ? ((raw["cursor"] as A | undefined)?.["name"] as string | undefined)
        : undefined;
    } while (cursor);
  } catch (e: unknown) {
    // Backup module may not be enabled or the credential may lack the backup scope
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 403) return [];
    throw e;
  }

  return allBackups;
}

async function fetchFleetVolumes(token: string): Promise<A[]> {
  const client = ninjaClient(token);
  const allVolumes: A[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string | number> = { pageSize: 1000 };
    if (cursor) params["cursor"] = cursor;
    const res = await client.get("/queries/volumes", { params });
    const raw = res.data as A;
    const results = (raw["results"] as A[] | undefined) ?? [];
    for (const v of results) {
      allVolumes.push({
        deviceId: v["deviceId"],
        deviceName: v["deviceName"] ?? v["displayName"],
        name: v["name"],
        label: v["label"],
        capacity: v["capacity"],
        freeSpace: v["freeSpace"],
      });
    }
    cursor = results.length === 1000
      ? ((raw["cursor"] as A | undefined)?.["name"] as string | undefined)
      : undefined;
  } while (cursor);

  return allVolumes;
}

export const ninjaJob: Job = {
  name: "ninjaone",

  async run(stagingDir: string) {
    const token = await getNinjaToken();

    const [devicesResult, alertsResult, backupsResult, volumesResult] = await Promise.allSettled([
      fetchDevices(token),
      fetchAlerts(token),
      fetchBackups(token),
      fetchFleetVolumes(token),
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

    if (backupsResult.status === "fulfilled" && backupsResult.value.length > 0) {
      writeStagingFile(stagingDir, "ninja-backups.json", backupsResult.value);
      files.push("ninja-backups.json");
      records += backupsResult.value.length;
    } else if (backupsResult.status === "rejected") {
      console.error("[ninjaone] backups failed:", backupsResult.reason);
    }

    if (volumesResult.status === "fulfilled" && volumesResult.value.length > 0) {
      writeStagingFile(stagingDir, "ninja-volumes.json", volumesResult.value);
      files.push("ninja-volumes.json");
      records += volumesResult.value.length;
    } else if (volumesResult.status === "rejected") {
      console.error("[ninjaone] volumes failed:", volumesResult.reason);
    }

    return { files, records };
  },
};
