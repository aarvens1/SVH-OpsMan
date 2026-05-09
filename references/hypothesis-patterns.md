# Hypothesis Patterns

Generic isolation moves by problem class, for use by the Troubleshooting Methodology skill.

---

## Pattern: One User vs. Many

**One user affected:**
1. User's device → try another device (rules out device/profile)
2. User's credentials → reset password, clear token cache (rules out auth state)
3. User's group memberships / Conditional Access → Entra sign-in logs
4. User-specific config in the application

**Multiple users affected (same site):**
1. Network path — check UniFi site health, gateway WAN, switch port state
2. Service endpoint — is the backend down for everyone?
3. Identity service — check Entra health, MS Admin service health

**All users affected (all sites):**
1. Check MS Admin M365 service health first
2. Check DNS (public authoritative + internal)
3. Check upstream firewall / internet circuit

---

## Pattern: Works on Some Devices, Not Others

**Binary split (works on X, not Y):**
- OS version difference (patch level, driver version)
- Client software version difference
- Local firewall / AV policy difference
- Machine certificate / domain trust difference
- Check NinjaOne OS version and patch state for affected vs. unaffected

**Random subset (no clear pattern):**
- DNS round-robin hitting a broken backend
- Load balancer session persistence mismatch
- Client cache / credential manager stale state

---

## Pattern: Worked Before, Broke Now

**Find the delta:**
1. What changed at or just before the start time?
   - Windows Update (NinjaOne patch history)
   - Group Policy (check GPO version in event log)
   - Entra Conditional Access policy change (Entra audit log)
   - UniFi config push (UniFi device event log)
   - Application deployment (NinjaOne script history)
2. Wazuh: search for configuration change events in the window

**Nothing changed (we think):**
- Certificate expiry (Entra expiring secrets, web server cert)
- License expiry (MS Admin subscriptions)
- Storage full (NinjaOne volumes)
- Token/password expiry for a service account

---

## Pattern: Intermittent / Timing-Based

**Regular pattern (e.g., every N minutes, every night):**
- Scheduled task firing and contending with the service
- Backup job hitting storage/CPU
- Certificate renewal check cycle
- Log rotation truncating a file a service is tailing

**Random pattern:**
- Memory leak → check process memory growth over time in NinjaOne
- Race condition in application startup (check for "Warming up" or "Starting" events in window)
- Network flap → UniFi port table, event log port state changes

---

## Pattern: Performance Degradation (Not Full Outage)

**CPU-bound:**
- NinjaOne process list: what's at the top?
- Wazuh: high CPU events, `syscheck` changes to exe files

**Memory-bound:**
- NinjaOne: available memory trend
- SQL Server memory pressure (check `max server memory` setting)
- MABS agent leaking memory (known pattern — restart DPMRA.exe)

**Disk I/O bound:**
- NinjaOne volumes: disk queue length
- Wazuh: FIM events showing high write activity
- CSV on Hyper-V: check for redirect mode (performance impact ~30%)

**Network-bound:**
- UniFi client signal strength, retry rate
- Switch port error counters (CRC errors, collisions)
- Desktop Commander: `iperf3` test from affected host

---

## Hypothesis Ranking Heuristic

Score each hypothesis: **likelihood × ease-of-test**

- Likelihood: 1 (unlikely) to 5 (very likely given available evidence)
- Ease-of-test: 1 (requires downtime or complex steps) to 5 (read-only query, < 2 minutes)

Test highest-score first. Document each test result before moving to the next.
