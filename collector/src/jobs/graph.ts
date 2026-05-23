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
      $filter: `receivedDateTime ge '${since}'`,
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
      $filter: `activityDateTime ge '${since}'`,
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

// Required: ServiceHealth.Read.All
async function fetchServiceHealth(token: string): Promise<A> {
  const client = graphClient(token);
  try {
    const [overview, issues] = await Promise.all([
      client.get<{ value: A[] }>("/admin/serviceAnnouncement/healthOverviews", {
        params: { $select: "id,service,status" },
      }),
      client.get<{ value: A[] }>("/admin/serviceAnnouncement/issues", {
        params: {
          $filter: "isResolved eq false",
          $select: "id,title,service,status,severity,startDateTime,classification,impactDescription",
          $top: 20,
        },
      }),
    ]);
    return {
      services: (overview.data.value ?? []).map((s) => ({
        service: s["service"],
        status: s["status"],
      })),
      activeIssues: (issues.data.value ?? []).map((i) => ({
        id: i["id"],
        title: i["title"],
        service: i["service"],
        status: i["status"],
        severity: i["severity"],
        startDateTime: i["startDateTime"],
        classification: i["classification"],
        impactDescription: typeof i["impactDescription"] === "string"
          ? i["impactDescription"].slice(0, 300)
          : undefined,
      })),
    };
  } catch {
    // ServiceHealth.Read.All permission may not be granted
    return { services: [], activeIssues: [] };
  }
}

// Required: Application.Read.All
async function fetchExpiringSecrets(token: string): Promise<A[]> {
  const client = graphClient(token);
  try {
    const res = await client.get<{ value: A[] }>("/applications", {
      params: {
        $select: "id,displayName,appId,passwordCredentials,keyCredentials",
        $top: 200,
      },
    });
    const now = Date.now();
    const cutoff = now + 90 * 24 * 60 * 60 * 1000;
    const expiring: A[] = [];

    for (const app of res.data.value ?? []) {
      const passwords = (app["passwordCredentials"] as A[] | undefined) ?? [];
      const keys = (app["keyCredentials"] as A[] | undefined) ?? [];
      for (const cred of passwords) {
        const end = cred["endDateTime"] as string | undefined;
        if (!end) continue;
        const endMs = new Date(end).getTime();
        if (!isNaN(endMs) && endMs > now && endMs < cutoff) {
          expiring.push({
            appId: app["appId"],
            appDisplayName: app["displayName"],
            credentialType: "password",
            displayName: cred["displayName"],
            endDateTime: end,
            daysUntilExpiry: Math.ceil((endMs - now) / 86_400_000),
          });
        }
      }
      for (const cred of keys) {
        const end = cred["endDateTime"] as string | undefined;
        if (!end) continue;
        const endMs = new Date(end).getTime();
        if (!isNaN(endMs) && endMs > now && endMs < cutoff) {
          expiring.push({
            appId: app["appId"],
            appDisplayName: app["displayName"],
            credentialType: "certificate",
            displayName: cred["displayName"],
            endDateTime: end,
            daysUntilExpiry: Math.ceil((endMs - now) / 86_400_000),
          });
        }
      }
    }
    return expiring.sort((a, b) => (a["daysUntilExpiry"] as number) - (b["daysUntilExpiry"] as number));
  } catch {
    // Application.Read.All permission may not be granted
    return [];
  }
}

// Required: IdentityRiskyUser.Read.All
async function fetchRiskyUsers(token: string): Promise<A[]> {
  const client = graphClient(token);
  try {
    const res = await client.get<{ value: A[] }>("/identityProtection/riskyUsers", {
      params: {
        $filter: "riskState ne 'dismissed' and riskState ne 'remediated'",
        $select: "id,userPrincipalName,userDisplayName,riskLevel,riskState,riskLastUpdatedDateTime",
        $top: 50,
      },
    });
    return (res.data.value ?? []).map((u) => ({
      id: u["id"],
      userPrincipalName: u["userPrincipalName"],
      displayName: u["userDisplayName"],
      riskLevel: u["riskLevel"],
      riskState: u["riskState"],
      riskLastUpdatedDateTime: u["riskLastUpdatedDateTime"],
    }));
  } catch {
    // IdentityRiskyUser.Read.All permission may not be granted
    return [];
  }
}

// Required: AuditLog.Read.All (same as audit log — already in use)
async function fetchSignInLogs(token: string): Promise<A[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const client = graphClient(token);
  try {
    const res = await client.get<{ value: A[] }>("/auditLogs/signIns", {
      params: {
        $filter: `createdDateTime ge '${since}' and status/errorCode ne 0`,
        $top: 100,
        $select: "id,createdDateTime,userPrincipalName,appDisplayName,status,ipAddress,location,riskLevelDuringSignIn",
      },
    });
    return (res.data.value ?? []).map((s) => ({
      id: s["id"],
      createdDateTime: s["createdDateTime"],
      userPrincipalName: s["userPrincipalName"],
      appDisplayName: s["appDisplayName"],
      errorCode: (s["status"] as A | undefined)?.["errorCode"],
      failureReason: (s["status"] as A | undefined)?.["failureReason"],
      ipAddress: s["ipAddress"],
      city: ((s["location"] as A | undefined)?.["city"]) as string | undefined,
      countryOrRegion: ((s["location"] as A | undefined)?.["countryOrRegion"]) as string | undefined,
      riskLevel: s["riskLevelDuringSignIn"],
    }));
  } catch {
    return [];
  }
}

export const graphJob: Job = {
  name: "graph",

  async run(stagingDir: string) {
    const token = await getGraphToken(GRAPH_SCOPE);
    const userId = config.graph.userId;

    const [
      mail, calendar, auditLog, tenantAlerts,
      serviceHealth, expiringSecrets, riskyUsers, signinLogs,
    ] = await Promise.allSettled([
      fetchMail(token, userId),
      fetchCalendar(token, userId),
      fetchAuditLog(token),
      fetchTenantAlerts(token),
      fetchServiceHealth(token),
      fetchExpiringSecrets(token),
      fetchRiskyUsers(token),
      fetchSignInLogs(token),
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
    } else if (tenantAlerts.status === "rejected") {
      console.error("[graph] alerts failed:", tenantAlerts.reason);
    }

    // Always write service health — "all green" is a valid and useful result
    if (serviceHealth.status === "fulfilled") {
      writeStagingFile(stagingDir, "graph-service-health.json", serviceHealth.value);
      files.push("graph-service-health.json");
      const sh = serviceHealth.value as { services: A[]; activeIssues: A[] };
      records += sh.services.length + sh.activeIssues.length;
    } else {
      console.error("[graph] service health failed:", serviceHealth.reason);
    }

    if (expiringSecrets.status === "fulfilled" && expiringSecrets.value.length > 0) {
      writeStagingFile(stagingDir, "graph-expiring-secrets.json", expiringSecrets.value);
      files.push("graph-expiring-secrets.json");
      records += expiringSecrets.value.length;
    } else if (expiringSecrets.status === "rejected") {
      console.error("[graph] expiring secrets failed:", expiringSecrets.reason);
    }

    if (riskyUsers.status === "fulfilled" && riskyUsers.value.length > 0) {
      writeStagingFile(stagingDir, "graph-risky-users.json", riskyUsers.value);
      files.push("graph-risky-users.json");
      records += riskyUsers.value.length;
    } else if (riskyUsers.status === "rejected") {
      console.error("[graph] risky users failed:", riskyUsers.reason);
    }

    if (signinLogs.status === "fulfilled" && signinLogs.value.length > 0) {
      writeStagingFile(stagingDir, "graph-signin-logs.json", signinLogs.value);
      files.push("graph-signin-logs.json");
      records += signinLogs.value.length;
    } else if (signinLogs.status === "rejected") {
      console.error("[graph] sign-in logs failed:", signinLogs.reason);
    }

    if (files.length === 0) {
      throw new Error("All Graph sub-requests failed");
    }

    return { files, records };
  },
};
