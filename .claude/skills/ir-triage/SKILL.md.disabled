---
name: ir-triage
description: Incident response triage. Takes an alert, IOC, or suspicion and classifies it into a response lane before enriching. Use for alert investigation, IOC enrichment, "is this suspicious", suspected compromise, phishing reports. This is the only skill that can send non-draft Teams messages.
when_to_use: Any time a security alert needs investigation, an IOC needs enriching, or something feels off.
allowed-tools: "mcp__svh-opsman__mde_list_alerts mcp__svh-opsman__mde_get_device mcp__svh-opsman__mde_list_devices mcp__svh-opsman__mde_get_device_vulnerabilities mcp__svh-opsman__mde_list_indicators mcp__svh-opsman__wazuh_search_alerts mcp__svh-opsman__wazuh_list_agents mcp__svh-opsman__wazuh_get_fim_events mcp__svh-opsman__entra_list_risky_users mcp__svh-opsman__entra_get_sign_in_logs mcp__svh-opsman__entra_get_audit_logs mcp__svh-opsman__entra_get_user_mfa_methods mcp__svh-opsman__ninja_get_server mcp__svh-opsman__ninja_get_event_logs mcp__svh-opsman__ninja_list_device_alerts mcp__svh-opsman__ninja_list_processes mcp__svh-opsman__ninja_list_services mcp__svh-opsman__teams_send_message mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_list_plans mcp__obsidian__* mcp__excalidraw__* mcp__firecrawl__* mcp__time__*"
---

# IR Triage

@../../references/triage-gate.md

---

## Step 1 — Restate the situation

Before any tool use, write one sentence: what is the suspected behaviour, what triggered attention, and what's the source (Defender alert ID, Wazuh alert, user report, etc.).

## Step 2 — Classify the lane

Apply the criteria in `triage-gate.md` above. Be conservative with Burning Building — alarm fatigue is a real risk. When in doubt, start at Active Investigation.

---

## Step 3 — Act by lane

### 🔥 Burning Building

1. Post immediately to the Teams IT techs channel via `teams_send_message` — bare facts only: what, which systems, assigned owner. This is the **only non-draft send** allowed. Write the message in Aaron's voice following the `aaron-voice` rules: no greeting, no exclamation marks, plain declarative sentences, one bold imperative if an action is required now (e.g. `**Do not log in to <system> until further notice.**`).
2. Create an urgent Planner card via `planner_create_task` with the owner assigned and due date of today.
3. Continue enrichment in parallel (see below).

### 🔎 Active Investigation

1. Run full enrichment (see below).
2. Draft a Teams notification and Planner card — present both to the operator for review. Do not send. Draft the Teams message in Aaron's voice following the `aaron-voice` rules (same guidance as Burning Building above). Run the self-check before presenting.

### 🔍 Background Enrichment

1. Run full enrichment (see below).
2. No notifications. Add a summary note to Planner only if it's worth tracking.

---

## Enrichment sequence

Work through these in order, stopping when the picture is clear:

1. **IOC enrichment** — look up any IP, domain, hash, or email in `mde_list_indicators`. Use Firecrawl (`mcp__firecrawl__*`) to check threat intel if the IOC isn't in Defender.
2. **Defender** — `mde_list_alerts` filtered to affected host/user. Note severity, tactics, techniques.
3. **Entra sign-in logs** — `entra_get_sign_in_logs` for affected user. Look for impossible travel, unfamiliar IP, MFA failures.
4. **Entra audit logs** — `entra_get_audit_logs` for changes made by or to the affected account in the past 48h.
5. **NinjaOne endpoint state** — `ninja_get_server` + `ninja_list_processes` + `ninja_list_services` for affected host. Anything unexpected running?
6. **Wazuh correlation** — `wazuh_search_alerts` scoped to the affected host and time window. Any corroborating signals?

---

## Output

Write `Incidents/Active/YYYY-MM-DD-[short-name].md` with frontmatter:

```yaml
---
date: YYYY-MM-DD
skill: IR Triage
status: draft
tags: [incident, ir]
incident_id: INC-YYYY-NNN
severity: critical|high|medium|low
status: open
---
```

For Burning Building and Active Investigation lanes, produce an Excalidraw attack-path diagram:
- Filename: `Diagrams/Incidents/INC-YYYY-NNN.excalidraw`
- Show: initial access vector → lateral movement (if any) → impact/target
- Embed in the note with `![[INC-YYYY-NNN.excalidraw]]`

Incident note structure:
1. **Situation** — one-paragraph summary
2. **Lane** — which lane and why
3. **Timeline** — chronological events with sources
4. **Enrichment findings** — by source
5. **Recommended actions** — ordered by urgency
6. **Drafts** — Teams message draft and Planner card draft (Active/BB only)
