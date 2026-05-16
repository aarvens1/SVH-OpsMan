# SVH Common Failure Modes

SVH-specific failure patterns for the Troubleshooting Methodology skill. Reference when building the hypothesis list.

---

## Hyper-V Cluster

### VM Won't Start — vmms.exe / Configuration File Issues
- **Symptoms:** VM fails to start, event log shows `Hyper-V-VMMS` errors, "could not find a required file" or "configuration file not found"
- **Common causes:**
  - VM config XML orphaned on a node that no longer holds the VM's storage (common after a live migration that didn't complete cleanly)
  - Storage path mismatch — VM configured to a path that's no longer present or mounted to a different drive letter after failover
  - Cluster shared volume (CSV) not redirected properly; another node holds the exclusive access
- **Checks:** FailoverClustering event log on all nodes, `Get-VM` on each node, `Get-ClusterSharedVolume` state

### FAT_FILE_SYSTEM / BugCheck on Hyper-V Host
- **Symptoms:** BSOD on host, stop code `FAT_FILE_SYSTEM`, VM migrations fail
- **Common causes:**
  - CSV corruption — usually triggered by a host losing connectivity to shared storage mid-write
  - Tiered storage misconfiguration on the SAN/NAS
  - Outdated storage multipath (MPIO) driver
- **Checks:** System event log for disk errors (Event IDs 7, 11, 51, 157), `Get-PhysicalDisk` health, NinjaOne disk health

### Orphaned VM Configurations
- **Symptoms:** Cluster Manager shows a VM resource but VM doesn't appear in Hyper-V Manager on any node
- **Common causes:** Node removed from cluster while VMs were still registered there; config was not migrated
- **Fix path:** `Get-ClusterResource | where ResourceType -eq "Virtual Machine"` to identify orphans, then `Remove-ClusterResource` on confirmed orphans

---

## MABS / SQL Memory Pressure

### MABS Backup Jobs Failing
- **Symptoms:** DPM/MABS alerts in NinjaOne, backup jobs stuck in "Preparing replica" or failing with "Unable to connect"
- **Common causes:**
  - SQL instance hosting MABS database under memory pressure — SQL taking too much RAM, starving MABS agent
  - MABS agent service stopped on the protected server (check NinjaOne services)
  - Disk space exhaustion on the MABS storage pool
- **Checks:** NinjaOne process list for `DPMRA.exe`, NinjaOne volumes for MABS drives, SQL Server `sys.dm_os_memory_clerks` via Desktop Commander

### SQL Max Server Memory Not Set
- **Pattern:** SQL Server 2019+ will consume available RAM aggressively if max server memory isn't capped. On servers hosting both SQL and other services (MABS, IIS, etc.), this causes everything else to page-fault.
- **Default check:** `SELECT * FROM sys.configurations WHERE name = 'max server memory (MB)'` — if value_in_use is 2147483647, it's uncapped.

---

## CMiC R12 External Access (via Kemp)

### External Users Can't Access CMiC
- **Symptoms:** Users report CMiC is down externally; internal access works fine
- **Common causes:**
  - Kemp LoadMaster virtual service health check failing — CMiC app pool recycled and health check endpoint returns 503 before warmup
  - Kemp SSL certificate expired on the virtual service
  - Kemp persistence table full (rare but happens after large events or failovers)
- **Checks:** Kemp Admin UI → Virtual Services → check real server health, Desktop Commander `Invoke-WebRequest` from WAN to CMiC URL

### CMiC Slow or Timeouts After Hours
- **Pattern:** CMiC performs maintenance tasks (nightly batch, index rebuilds) that contend with the app pool and SQL. If this coincides with a MABS backup job hitting SQL, performance degrades.
- **Check:** Wazuh/NinjaOne for scheduled task events 23:00–02:00, SQL Server query wait stats

---

## Multi-site UniFi

### Site Fully Offline (All Devices Disconnected in Controller)
- **Common causes:**
  - UDM Pro or gateway lost WAN — ISP issue, or upstream firewall blocking controller inform URL
  - Controller inform URL changed after a controller migration and remote devices not re-provisioned
  - VLAN trunk between gateway and core switch lost (cable or port profile change)
- **Checks:** UniFi Cloud for site status, then Desktop Commander `ping` + `traceroute` from MCP host to site WAN IP

### WLAN Up but No IP / Clients Stuck on APIPA
- **Common causes:**
  - DHCP scope exhausted on the VLAN serving that WLAN
  - VLAN tag mismatch between the WLAN and the switch port profile
  - Inter-VLAN routing rule blocking DHCP relay

### Device Shows "Isolated" in Controller
- **Pattern:** Switch or AP shows connected but isolated — usually a tagged VLAN missing from the uplink port profile, or a firewall rule blocking the management VLAN.

---

## BITS / WSUS

### Updates Stuck Downloading
- **Symptoms:** NinjaOne shows pending patches; endpoints not downloading
- **Common causes:**
  - BITS service stopped or in a failed state on the endpoint (check NinjaOne services)
  - WSUS database needs maintenance (`CleanupObsoleteUpdates`, `CompressUpdate`, sync issues)
  - IIS application pool for WSUS recycled/stopped
- **Checks:** NinjaOne services for BITS and WUAUServ, NinjaOne event logs for Windows Update errors (Event IDs 20, 25, 16, 20)

### WSUS Approval Backlog
- **Pattern:** Large number of updates in "Detected" state but not "Approved" — check WSUS console via Desktop Commander for stuck approval groups.

---

## PrinterLogic

### Printers Not Appearing for Users

- **Symptoms:** Users can't see printers that should be deployed to them; PrinterLogic web portal shows printers as assigned
- **Common causes:**
  - PrinterLogic client agent service (`PrinterLogicClient`) stopped or not installed on the workstation
  - Agent not reaching the PrinterLogic server — check firewall rules for TCP 443 from workstation to PrinterLogic URL
  - Stale assignment cache on the client — agent may not have pulled the latest policy since enrollment
- **Checks:** NinjaOne services for `PrinterLogicClient`, NinjaOne event logs for PrinterLogic agent errors, verify client can reach PrinterLogic URL from the affected machine

### Print Jobs Stuck in Queue

- **Symptoms:** Jobs show in queue but don't print; clearing and re-sending doesn't help
- **Common causes:**
  - Print spooler in a wedged state on the workstation — common after a driver update or a partial install
  - Driver mismatch between the version deployed by PrinterLogic and what's cached locally
  - Printer offline or backend unreachable (IP change, DHCP lease, powered off)
- **Fix path:** Restart Print Spooler on the affected machine (`Restart-Service Spooler`); if that doesn't clear it, delete jobs manually from `C:\Windows\System32\spool\PRINTERS\` while spooler is stopped, then restart

### Driver Deployment Failures

- **Symptoms:** PrinterLogic reports driver install failed; printer appears in Devices but not usable
- **Common causes:**
  - Driver package in PrinterLogic admin console is mismatched to OS architecture (x86 vs x64)
  - Unsigned driver blocked by Windows Driver Signature Enforcement
  - Previous failed install left a partial INF entry — requires manual cleanup via `pnputil /delete-driver`
- **Checks:** PrinterLogic admin console → Deployment Logs for the affected machine, Windows Application log for Spooler errors (Event IDs 372, 375, 6161)

### PrinterLogic Server / Portal Unreachable

- **Symptoms:** Agents go offline in the PrinterLogic console; web portal returns 503 or times out
- **Common causes:**
  - PrinterLogic server service stopped (IIS-based or native service depending on version)
  - Database backend (SQL) under memory pressure — same pattern as MABS/SQL issues
  - SSL certificate expired on the PrinterLogic web service
- **Checks:** NinjaOne services on the PrinterLogic server, NinjaOne volumes for the PrinterLogic data drive, check SSL cert expiry from a browser

---

## FailoverClustering Events

See `common-event-clusters.md` for the full event ID reference. Key IDs for quick lookup: 1069 (resource failed), 1177 (quorum lost), 1254 (node connectivity), 5120/5142 (CSV state).
