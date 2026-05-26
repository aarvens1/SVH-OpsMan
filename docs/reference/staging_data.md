# Staging Data Reference

The Collector process writes bulk data snapshots as JSON files into the `staging/YYYY-MM-DD/` directory. This document provides a reference for the content and structure of these files. You can browse them with the `staging-cat <name>` alias.

---

### `graph-mail.json`
Last 24 hours of inbox messages.
```json
{
  "id": "AAMk...",
  "subject": "UniFi Console Backup Created",
  "from": { "name": "UniFi OS...", "address": "no-reply@notifications.ui.com" },
  "receivedDateTime": "2026-05-25T20:53:35Z",
  "isRead": false
}
```

---

### `graph-calendar.json`
Next 7 days of calendar events.
```json
{
  "id": "AAMk...",
  "subject": "KP SMC Overall Big Room",
  "start": { "dateTime": "2026-05-26T17:00:00.0000000", "timeZone": "UTC" },
  "end":   { "dateTime": "2026-05-26T19:00:00.0000000", "timeZone": "UTC" },
  "attendeeCount": 225
}
```

---

### `graph-audit.json`
Last 24 hours of Entra directory audit events.
```json
{
  "id": "Directory_b88a832e...",
  "activityDateTime": "2026-05-26T17:44:02Z",
  "activity": "Update user",
  "category": "UserManagement",
  "result": "success",
  "initiatedBy": { "app": { "displayName": "Microsoft Substrate Management" } }
}
```

---

### `graph-signin-logs.json`
Failed Entra sign-ins from the last 24 hours.
```json
{
  "id": "5e21111f...",
  "createdDateTime": "2026-05-26T17:38:05Z",
  "userPrincipalName": "user@domain.com",
  "appDisplayName": "Bluebeam",
  "errorCode": 50125,
  "failureReason": "Sign-in was interrupted...",
  "riskLevel": "none"
}
```

---

### `graph-expiring-secrets.json`
App registration credentials expiring within 90 days.
```json
{
  "appDisplayName": "Mercury Build",
  "credentialType": "password",
  "endDateTime": "2026-06-10T22:14:03Z",
  "daysUntilExpiry": 16
}
```

---

### `graph-risky-users.json`
Entra Identity Protection users with a non-remediated risk state.
```json
{
  "id": "c6e4722c...",
  "userPrincipalName": "user@domain.com",
  "riskLevel": "high",
  "riskState": "atRisk"
}
```

---

### `graph-service-health.json`
Current M365 service health status. This is a single object, not an array.
```json
{
  "services": [{ "service": "Exchange Online", "status": "serviceOperational" }],
  "activeIssues": [{ "id": "EX12345", "title": "Users may be unable to access mailboxes" }]
}
```

---

### `ninja-devices.json`
All managed devices from NinjaOne.
```json
{
  "id": 466,
  "displayName": "PDX-JECOOK-L",
  "nodeClass": "WINDOWS_WORKSTATION",
  "offline": true,
  "lastContact": 1779487391.064,
  "maintenanceMode": false
}
```

---

### `ninja-alerts.json`
Active alerts from NinjaOne.
```json
{
  "deviceId": 1958,
  "message": "Disk Volume Free space for 'C:' is less than or equal to 10%...",
  "severity": "CRITICAL"
}
```

---

### `ninja-volumes.json`
Disk volumes for all NinjaOne managed devices.
```json
{
  "deviceId": 2982,
  "name": "C:",
  "capacity": 510738296832,
  "freeSpace": 310013095936
}
```

---

### `ninja-backups.json`
Backup job results from all NinjaOne backup plans.
```json
{
  "jobId": "400745e1...",
  "deviceId": 2218,
  "planName": "Image backup plan",
  "jobStatus": "FAILED"
}
```

---

### `unifi-devices.json`
All network devices from all UniFi sites.
```json
{
  "id": "D8B37099F5DF",
  "name": "SYL-Main Office",
  "model": "UDM",
  "status": "online",
  "firmwareStatus": "upToDate"
}
```

---

### `unifi-alerts.json`
Active UniFi Cloud alerts. An empty array `[]` means no active alerts.

---

### `planner-tasks.json`
All tasks from the primary IT Sysadmin Tasks Planner board.
```json
{
  "id": "wKROI1Oa8kaqygUiNxKsVWQAJUNA",
  "title": "Look into creating a dynamic Entra group for managers",
  "percentComplete": 50,
  "priority": 5
}
```

---

### `manifest.json`
Metadata about the collector run itself, including job status and record counts.
```json
{
  "runId": "a1b2c3d4",
  "startTime": "2026-05-26T12:00:00Z",
  "jobs": [
    {
      "job": "ninjaone",
      "status": "success",
      "records": 150,
      "duration_ms": 5000
    }
  ]
}
```
