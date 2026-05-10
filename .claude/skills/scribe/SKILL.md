---
name: scribe
description: Structures rough technician notes into clean documentation. Accepts pasted text, .txt, .md, .pdf, or screenshots. Five output styles: standard, concise, detailed, incident-report, how-to. Output goes to Obsidian; optionally promoted to Confluence on request. Trigger phrases: "write this up", "document what I did", "make this a how-to", "write the closure notes", "scribe".
when_to_use: When you have rough notes, shorthand, or out-of-order thoughts that need to become readable documentation.
allowed-tools: "mcp__obsidian__* mcp__svh-opsman__confluence_create_page mcp__svh-opsman__confluence_search_pages Read(*)"
---

# Scribe

## Input

Accept however it arrives: paste, file, screenshot. Transcribe screenshots before processing.

## Style selection

If the user doesn't specify a style, default to **standard**. Ask only if the input is ambiguous between incident-report and standard.

| Style | When to use | Structure |
|-------|------------|-----------|
| **standard** | Default — general structured doc | Context → Steps → Outcome |
| **concise** | Quick summary for ticket or handoff | Problem → What was done → Result (3–5 bullets) |
| **detailed** | Step-by-step runbook with rationale | Numbered steps, each with purpose + command |
| **incident-report** | Post-incident write-up | Timeline → Root cause → Resolution → Follow-up items |
| **how-to** | Reusable guide | Numbered steps, prerequisites noted, reusable format |

## Rewrite rules

- Preserve all factual details from the input — don't invent or assume.
- Fix ordering (put steps in logical sequence).
- Expand shorthand into full sentences.
- Remove conversational filler ("so basically", "then I kind of", "idk if this matters").
- Add section headers that make it scannable.
- Note any gaps ("**Note:** original notes did not include the specific error message — add if available").

## Output

Determine the right Obsidian path based on content:
- Incident closure → `Incidents/Archive/YYYY-MM-DD-[name].md`
- How-to / runbook → `Investigations/runbooks/[topic].md`
- General investigation notes → `Investigations/YYYY-MM-DD-[topic].md`

```yaml
---
date: YYYY-MM-DD
skill: Scribe
status: draft
tags: [documentation]
---
```

If the user asks to promote to Confluence: `confluence_search_pages` to find an appropriate parent page, then `confluence_create_page` — present as draft for review before creating.
