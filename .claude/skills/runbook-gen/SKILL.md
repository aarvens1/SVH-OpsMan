---
name: runbook-gen
description: Generate a structured, reusable runbook from a description, rough notes, or existing procedure. Covers prerequisites, numbered steps with commands, expected outputs, verification, and rollback. Trigger phrases: "write a runbook for", "generate a runbook", "make this a runbook", "document this procedure".
when_to_use: Use when a repeatable IT procedure needs clean documentation for future reference or delegation. Distinct from /scribe (which cleans up existing rough notes) — runbook-gen can start from a verbal description with no prior notes.
allowed-tools: "mcp__obsidian__* mcp__svh-opsman__confluence_create_page mcp__svh-opsman__confluence_search_pages mcp__time__* Read(*)"
---

# Runbook Generator

## Step 1 — Understand the procedure

Gather before writing:
- **Process name** — what this runbook covers (e.g., "Restore MABS backup", "Add user to Entra group")
- **Input** — rough notes, verbal description, or file path to existing documentation
- **Audience** — who will execute this (Aaron only, any SVH tech, external vendor)
- **Frequency** — how often this runs (one-time, weekly, on-incident, ad-hoc)

If a file is provided, read it first. If the user describes the process verbally, use that as the source.

**If the procedure involves PowerShell:** read `powershell/README.md` before writing any commands. Use SVH module functions (`Get-SVH*`, `Invoke-SVH*`, `Set-SVH*`) over raw cmdlets where they exist — they handle credential patterns, error formatting, and account tiers consistently. If a step requires a raw cmdlet because no module function covers it, note the gap in the runbook's Notes section and suggest which module it should be added to.

Check `confluence_search_pages` for any existing documentation on this topic — update rather than duplicate if found. Also check Obsidian `Investigations/runbooks/` for any prior version.

## Step 2 — Structure the runbook

### Metadata block
- **Purpose** — one sentence: what this accomplishes and when it's needed
- **Trigger** — when to use it (alert type, user request, schedule, incident type)
- **Time estimate** — rough duration for a competent tech
- **Prerequisites** — accounts, access, tools, and credentials needed before starting. Note which require interactive auth (`sa_stevens`, `da_stevens`).

### Steps
Number every step. For each:
1. **Action** — imperative instruction ("Run…", "Navigate to…", "Open…")
2. **Command or path** — exact command in a labelled code block:
   - Label `# PowerShell` or `# bash (WSL)` as appropriate
   - Include the full command, not a placeholder
3. **Expected output** — what success looks like (exit code, message, UI state, value)
4. **If it fails** — one-line triage before escalating (check X, try Y)

Rules:
- One action per step — if two things must happen together, note it explicitly
- ⚠️ Mark any step that is destructive or irreversible inline
- Note any step that requires `sa_stevens` or `da_stevens` (interactive `Get-Credential` — cannot be automated)
- Write for someone who knows IT but not this specific system

### Verification
After all steps: how to confirm the procedure worked end-to-end. This is separate from per-step output checks — it's the "is the thing actually done?" test. Include the exact command or UI check and what a passing result looks like.

### Rollback
How to undo or recover if the procedure causes a problem. If rollback is impossible, say so explicitly and list the blast radius (what will be affected and how).

### Notes
Known quirks, environment-specific variations, common failure modes, links to related runbooks or references.

## Step 3 — Save

Write to `Investigations/runbooks/[topic].md`:

```yaml
---
date: YYYY-MM-DD
skill: Runbook Generator
status: draft
tags: [runbook, documentation]
---
```

If the user asks to promote to Confluence: find the appropriate parent page in INF or PROC space using `confluence_search_pages`, then `confluence_create_page` — present as a staged draft for review before creating.
