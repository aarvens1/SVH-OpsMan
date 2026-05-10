---
name: vuln-triage
description: Vulnerability triage for a specific CVE or Defender TVM finding. Identifies who's exposed, checks patch state, scores composite priority, and recommends a timeline. Produces a Confluence draft and Planner tickets. Trigger phrases: CVE ID, "should we patch X", "TVM finding", "vulnerability triage for X".
when_to_use: Use when you need to assess the actual risk and remediation timeline for a specific vulnerability in your environment.
allowed-tools: "mcp__svh-opsman__mde_list_devices mcp__svh-opsman__mde_get_device mcp__svh-opsman__mde_get_device_vulnerabilities mcp__svh-opsman__mde_get_security_recommendations mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__ninja_list_pending_patches mcp__svh-opsman__ninja_get_patch_history mcp__svh-opsman__confluence_create_page mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_task mcp__obsidian__* mcp__firecrawl__* mcp__time__*"
---

# Vulnerability Triage

## Step 1 — CVE research

Use Firecrawl to look up the CVE:
- CVSS score and vector (network-accessible? authentication required?)
- EPSS score (probability of exploitation in the next 30 days)
- CISA KEV status (is it actively exploited?)
- Available patch or mitigation

## Step 2 — Exposure assessment

`mde_list_devices` + `mde_get_device_vulnerabilities` — which devices in Defender are flagged for this CVE.
`mde_get_security_recommendations` — any TVM recommendation linked to this CVE.
`ninja_list_pending_patches` — filter to this CVE's KB/patch. Who's patched, who isn't?
`ninja_list_servers` — is the exposure on servers (higher risk) or workstations?

## Step 3 — Composite priority score

| Factor | Weight |
|--------|--------|
| EPSS ≥ 0.50 | +3 |
| CISA KEV | +3 |
| CVSS ≥ 9.0 (Critical) | +2 |
| CVSS 7.0–8.9 (High) | +1 |
| Exposed on server | +2 |
| Exposed on workstation | +1 |
| > 25% of devices exposed | +1 |
| No patch available | −1 (note, cannot remediate immediately) |

Score → Timeline:
- **7+** → Emergency (patch within 24–48h)
- **5–6** → This Week
- **3–4** → Next Cycle
- **0–2** → Accept / monitor

## Output

Write `Vulnerabilities/CVE-YYYY-NNNNN.md`:

```yaml
---
date: YYYY-MM-DD
skill: Vulnerability Triage
status: draft
tags: [vulnerability, patching]
cve: CVE-YYYY-NNNNN
priority: emergency|this-week|next-cycle|accept
---
```

Sections: CVE summary → Exposure in environment → Priority score → Recommended timeline → Remediation steps.

Also produce:
- **Confluence draft** — `confluence_create_page` in the IT space, titled "CVE-YYYY-NNNNN — [Short Title]"
- **Planner tickets** — one `planner_create_task` per affected asset group (servers, workstations, specific apps), with due date matching the timeline. Present as drafts for user review.
