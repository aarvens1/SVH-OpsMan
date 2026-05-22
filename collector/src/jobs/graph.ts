import axios from "axios";
import { getGraphToken, GRAPH_SCOPE } from "../auth/graph.js";
import { writeStagingFile } from "../staging.js";
import { config } from "../config.js";
import type { Job } from "./base.js";

type A = Record<string, unknown>;

function graphClient(token: string) {
  return axios.create({
    baseURL: "https://graph.microsoft.com/v1.0",
    timeout: 30_000,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
}

async function fetchMail(token: string, userId: string): Promise<A[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const client = graphClient(token);
  const res = await client.get<{ value: A[] }>(`/users/${userId}/mailFolders/inbox/messages`, {
    params: {
      $filter: `receivedDateTime ge ${since}`,
      $orderby: "receivedDateTime desc",
      $top: 50,
      $select: "id,subject,from,receivedDateTime,isRead,hasAttachments,importance,bodyPreview",
    },
  });
  return (res.data.value ?? []).map((m) => ({
    id: m["id"],
    subject: m["subject"],
    from: (m["from"] as A | undefined)?.["emailAddress"],
    receivedDateTime: m["receivedDateTime"],
    isRead: m["isRead"],
    hasAttachments: m["hasAttachments"],
    importance: m["importance"],
    bodyPreview: typeof m["bodyPreview"] === "string" ? m["bodyPreview"].slice(0, 300) : undefined,
  }));
}

async function fetchCalendar(token: string, userId: string): Promise<A[]> {
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const client = graphClient(token);
  const res = await client.get<{ value: A[] }>(`/users/${userId}/calendarView`, {
    params: {
      startDateTime: start,
      endDateTime: end,
      $orderby: "start/dateTime",
      $top: 30,
      $select: "id,subject,start,end,location,organizer,attendees,isAllDay,bodyPreview",
    },
  });
  return (res.data.value ?? []).map((e) => ({
    id: e["id"],
    subject: e["subject"],
    start: e["start"],
    end: e["end"],
    location: e["location"],
    organizer: (e["organizer"] as A | undefined)?.["emailAddress"],
    attendeeCount: Array.isArray(e["attendees"]) ? e["attendees"].length : 0,
    isAllDay: e["isAllDay"],
    bodyPreview: typeof e["bodyPreview"] === "string" ? e["bodyPreview"].slice(0, 200) : undefined,
  }));
}

async function fetchAuditLog(token: string): Promise<A[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const client = graphClient(token);
  const res = await client.get<{ value: A[] }>("/auditLogs/directoryAudits", {
    params: {
      $filter: `activityDateTime ge ${since}`,
      $orderby: "activityDateTime desc",
      $top: 100,
      $select: "id,activityDateTime,activityDisplayName,category,initiatedBy,targetResources,result",
    },
  });
  return (res.data.value ?? []).map((e) => ({
    id: e["id"],
    activityDateTime: e["activityDateTime"],
    activity: e["activityDisplayName"],
    category: e["category"],
    result: e["result"],
    initiatedBy: e["initiatedBy"],
    targets: Array.isArray(e["targetResources"])
      ? (e["targetResources"] as A[]).map((t) => ({
          type: t["type"],
          displayName: t["displayName"],
          userPrincipalName: t["userPrincipalName"],
        }))
      : [],
  }));
}

async function fetchTenantAlerts(token: string): Promise<A[]> {
  // Microsoft Secure Score recommendations and active alerts from the security namespace
  const client = graphClient(token);
  try {
    const res = await client.get<{ value: A[] }>("/security/alerts_v2", {
      params: {
        $filter: "status ne 'resolved'",
        $orderby: "createdDateTime desc",
        $top: 50,
        $select: "id,title,severity,status,createdDateTime,category,description,detectionSource",
      },
    });
    return (res.data.value ?? []).map((a) => ({
      id: a["id"],
      title: a["title"],
      severity: a["severity"],
      status: a["status"],
      createdDateTime: a["createdDateTime"],
      category: a["category"],
      detectionSource: a["detectionSource"],
      description: typeof a["description"] === "string" ? a["description"].slice(0, 300) : undefined,
    }));
  } catch {
    // Not all tenants have Defender for Endpoint licensed — degrade gracefully
    return [];
  }
}

export const graphJob: Job = {
  name: "graph",

  async run(stagingDir: string) {
    const token = await getGraphToken(GRAPH_SCOPE);
    const userId = config.graph.userId;

    const [mail, calendar, auditLog, tenantAlerts] = await Promise.allSettled([
      fetchMail(token, userId),
      fetchCalendar(token, userId),
      fetchAuditLog(token),
      fetchTenantAlerts(token),
    ]);

    const files: string[] = [];
    let records = 0;

    if (mail.status === "fulfilled") {
      writeStagingFile(stagingDir, "graph-mail.json", mail.value);
      files.push("graph-mail.json");
      records += mail.value.length;
    } else {
      console.error("[graph] mail failed:", mail.reason);
    }

    if (calendar.status === "fulfilled") {
      writeStagingFile(stagingDir, "graph-calendar.json", calendar.value);
      files.push("graph-calendar.json");
      records += calendar.value.length;
    } else {
      console.error("[graph] calendar failed:", calendar.reason);
    }

    if (auditLog.status === "fulfilled") {
      writeStagingFile(stagingDir, "graph-audit.json", auditLog.value);
      files.push("graph-audit.json");
      records += auditLog.value.length;
    } else {
      console.error("[graph] audit log failed:", auditLog.reason);
    }

    if (tenantAlerts.status === "fulfilled" && tenantAlerts.value.length > 0) {
      writeStagingFile(stagingDir, "graph-alerts.json", tenantAlerts.value);
      files.push("graph-alerts.json");
      records += tenantAlerts.value.length;
    }

    if (files.length === 0) {
      throw new Error("All Graph sub-requests failed");
    }

    return { files, records };
  },
};
