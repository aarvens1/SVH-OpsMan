# Incident Response Triage Gate

Determines the response lane before any enrichment begins. Be conservative with Burning Building — alarm fatigue is a real risk.

---

## Lane Definitions

### 🔥 Burning Building
Active credential theft, mass impact in motion, or confirmed compromise with ongoing attacker presence.

**Criteria (any one):**
- Active impossible travel with successful sign-ins in two locations within 30 minutes
- Mass mailbox forward rule created on executive or finance mailbox
- Defender alert: `Ransomware activity` or `Suspicious remote service creation` at severity High/Critical on multiple hosts
- Wazuh: `authentication_failures` rule group firing on 5+ hosts within 10 minutes
- NinjaOne: service stopped on multiple servers simultaneously (especially VSS, backup agents, or AV)
- Entra: bulk risky user flag (5+ users flagged High in < 1 hour)
- Defender: lateral movement or credential dumping techniques on a domain controller

**Action:** Send Teams notification immediately (not draft) to techs channel with bare facts + assigned owner. Create urgent Planner card with assignee. Continue full enrichment in parallel.

---

### 🔎 Active Investigation
Confirmed malicious or suspicious activity, but contained or not clearly in motion.

**Criteria (any one):**
- Single confirmed bad sign-in but no evidence of further activity in the last 2 hours
- Defender alert on an isolated endpoint with no lateral movement indicators
- Known-bad IOC (KEV CVE or VirusTotal malicious) found in environment but not yet exploited
- Phishing email confirmed delivered, but no user interaction detected
- Suspicious script execution on one endpoint (Wazuh level 10+) without spread

**Action:** Standard enrichment. Draft Teams notification and Planner card — present to operator for review before sending.

---

### 🔍 Background Enrichment
Suspicious, but likely benign or too vague to act on without more data.

**Criteria (default lane if Burning Building and Active Investigation don't apply):**
- Single failed sign-in from unfamiliar IP with no follow-on activity
- Low-EPSS CVE (< 0.05) with no KEV hit on an internal-only system
- Unusual process seen in Wazuh at level 6–8 with no corroborating signals
- Defender alert at severity Informational or Low on an isolated, non-critical host

**Action:** Enrichment only. No notifications. Add summary note to Planner if relevant.

---

## Escalation Path

Background Enrichment → Active Investigation: if a second corroborating signal appears within 4 hours.
Active Investigation → Burning Building: if containment fails or new evidence shows active spread.

---

## Tuning Notes

- Wazuh level thresholds here are starting points — adjust based on your environment's noise floor.
- Defender alert severity mappings may drift as Microsoft updates their detection logic; review quarterly.
- Add environment-specific signatures (e.g., known scanner IPs, scheduled task noise) to the Background Enrichment exclusion list rather than suppressing in Wazuh.
