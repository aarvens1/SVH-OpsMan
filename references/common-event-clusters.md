# Common Event Clusters

SVH-specific Wazuh/Windows event signatures for the Event Log Triage skill. Use these to match against grouped Provider+EventID output from Wazuh queries.

---

## Hyper-V Cluster Failover

**Windows Event Log: Microsoft-Windows-FailoverClustering / System**

| Provider | Event ID | Signal |
|----------|----------|--------|
| FailoverClustering | 1069 | Resource failure — look for VM or network resource |
| FailoverClustering | 1254 | Node lost quorum connectivity |
| FailoverClustering | 5120 | CSV volume state change |
| FailoverClustering | 5142 | CSV no longer accessible |
| Microsoft-Windows-Hyper-V-VMMS | 12010 | VM migration started |
| Microsoft-Windows-Hyper-V-VMMS | 12011 | VM migration completed |
| Microsoft-Windows-Hyper-V-VMMS | 12012 | VM migration failed |
| Microsoft-Windows-Hyper-V-VMMS | 13002 | Virtual machine could not be started |
| Microsoft-Windows-Hyper-V-VMMS | 18590 | VM configuration file error |

**Wazuh rule groups:** `microsoft-eventchannel`, `windows`

**Diagnosis pattern:** 5120 → 5142 → 1069 → 13002 sequence = CSV lost, resource group failed, VM couldn't start. Check which node owns the CSV and whether storage is accessible.

---

## MABS / SQL Memory Pressure

**Windows Event Log: Application / System**

| Provider | Event ID | Signal |
|----------|----------|--------|
| MSSQLSERVER | 701 | SQL Server out of memory |
| MSSQLSERVER | 17803 | Memory allocation failed |
| DPM | 4 | Agent communication failure — check DPMRA service |
| DPM | 999 | Disk threshold exceeded on MABS storage pool |
| Service Control Manager | 7031 | Service crashed unexpectedly |
| Service Control Manager | 7036 | Service state change |

**Diagnosis pattern:** 17803 or 701 on SQL host → MABS agent failing to communicate → backup job failures. Check SQL max server memory and DPMRA process state.

---

## CMiC / Kemp Health Checks

**IIS / Application log**

| Source | Signal |
|--------|--------|
| IIS W3SVC | HTTP 503 during app pool warm-up (first 30–60s after recycle) |
| W3SVC | Connection refused from Kemp health check IP |

**Diagnosis pattern:** App pool recycle → Kemp marks real server as down → external traffic fails. Kemp health check interval (default 5s) means a brief recycle window can trip the check. Increase Kemp health check retries or configure app pool warm-up.

---

## Authentication Failures / Brute Force

**Wazuh rule groups:** `authentication_failed`, `windows_event_log`

| Provider | Event ID | Signal |
|----------|----------|--------|
| Microsoft-Windows-Security-Auditing | 4625 | Failed logon |
| Microsoft-Windows-Security-Auditing | 4771 | Kerberos pre-authentication failed |
| Microsoft-Windows-Security-Auditing | 4776 | NTLM credential validation failed |
| Microsoft-Windows-Security-Auditing | 4740 | Account locked out |
| Microsoft-Windows-Security-Auditing | 4624 | Successful logon (follow failed cluster) |

**Diagnosis pattern:** Multiple 4625 → 4740 → 4624 (different IP) = classic brute force followed by successful logon. Cross with Entra sign-in logs.

---

## FailoverClustering Channel Patterns

The FailoverClustering event channel (`Microsoft-Windows-FailoverClustering/Operational`) is separate from System. Access via:

```powershell
Get-WinEvent -LogName "Microsoft-Windows-FailoverClustering/Operational" -MaxEvents 100
```

Key signals:
- **Event 1150:** Node joined cluster — normal but noteworthy after a reboot
- **Event 1155:** Node removed from cluster — may indicate unexpected disconnect
- **Event 1560:** Cluster network interface went down
- **Event 1561:** Cluster network interface came back up
- **Event 1573:** Network lost — cluster network partitioned

---

## UniFi Syslog Patterns (via Wazuh)

Requires UniFi syslog forwarding to Wazuh (see `setup-winrm.md` for UniFi syslog config).

| Pattern | Signal |
|---------|--------|
| `STA-LEAVE` | Client disconnected from AP |
| `STA-ASSOC` | Client associated |
| `IDS_IPS_EVENT` | UniFi IDS/IPS triggered |
| `WU-BLOCKED` | Traffic blocked by firewall policy |
| `LAN_CONNECT` / `LAN_DISCONNECT` | Switch port state change |
| `uplink-monitor.sh` | Gateway uplink state change |
| `DHCP_LEASE_EXPIRED` | Client lease expired without renewal |

**Diagnosis pattern for port flap:** Alternating `LAN_CONNECT` and `LAN_DISCONNECT` on same MAC within seconds = cable issue or negotiation failure. Check switch port profile for duplex mismatch.

---

## Wazuh Alert Level Reference

| Level | Meaning |
|-------|---------|
| 1–4 | Noise / informational |
| 5–7 | Low-impact events, worth grouping |
| 8–9 | Notable — configuration change, auth failure |
| 10–12 | High — brute force, privilege escalation, FIM critical paths |
| 13–15 | Critical — rootkit, known malware, mass failures |

Start triage at level 8+. Pull level 6+ for context when investigating a specific window.
