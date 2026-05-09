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

## FailoverClustering Events (Reference IDs)

| Event ID | Source | Meaning |
|----------|--------|---------|
| 1069 | FailoverClustering | Cluster resource failed |
| 1177 | FailoverClustering | Cluster quorum lost — imminent failover |
| 1205 | FailoverClustering | Cluster service failed to bring resource online |
| 1254 | FailoverClustering | Node lost connectivity to cluster network |
| 5120 | Microsoft-Windows-FailoverClustering | CSV volume status changed |
| 5142 | Microsoft-Windows-FailoverClustering | CSV volume is no longer accessible |
| 7036 | Service Control Manager | Service state change — look for backup agent, vmms, SQL |
