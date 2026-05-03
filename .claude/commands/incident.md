Start a structured incident response investigation for: $ARGUMENTS

Work through this IR workflow step by step.

---

**Phase 1 — Identify & Scope (run in parallel)**
1. List active MDE alerts related to this device/user via `mde_list_alerts` — collect all alert IDs, titles, severity, and status
2. Find the device in MDE via `mde_list_devices` (match hostname); then call `mde_get_device` for full detail: risk score, exposure level, last seen, OS version
3. Cross-reference in NinjaOne: find device via `ninja_list_servers`, then run in parallel:
   - `ninja_get_server` for hardware/agent detail
   - `ninja_list_processes` to see running processes
   - `ninja_get_event_logs` with log_name=Security, level=Error, page_size=50
   - `ninja_list_device_alerts` for active RMM alerts
4. Check if the device's likely user is flagged as risky in Entra via `entra_list_risky_users` with risk_level=all

---

**Phase 2 — Assess Severity**

After collecting data, assign a severity based on evidence:
- **P1 — Critical**: Active malware execution, ransomware indicators, confirmed credential theft + lateral movement
- **P2 — High**: Suspicious process/script execution, risky user with compromised device, potential data exfil
- **P3 — Medium**: Policy violation, isolated anomaly, no evidence of lateral movement
- **P4 — Low**: Likely false positive, informational alert only

---

**Phase 3 — Containment Decision**

Present a containment checklist tailored to the severity.

For P1 or P2: explicitly ask the user — *"This looks serious. Do you want me to isolate this device in Defender now? I'll use `mde_isolate_device` with Full isolation."* — wait for confirmation before acting.

For P3/P4: recommend monitoring steps only (acknowledge alert, watch for recurrence).

---

**Phase 4 — Document**

After presenting your findings, ask: *"Should I create a Confluence incident page to document this?"* If yes, use `confluence_search_pages` to find an existing IR space, then `confluence_create_page` with a structured IR summary including timeline, evidence, and actions taken.

---

**Output:**

## Incident Investigation: $ARGUMENTS

**Severity:** P[1–4] — [label]  
**Device:** [hostname] | **User:** [UPN or unknown] | **MDE Alerts:** [N]

### Timeline of Events
[Chronological — earliest first]

### Evidence Summary
[What was found and where]

### Containment Checklist
- [ ] Item

### Recommended Next Steps
[Numbered, most urgent first]
