---
name: gemini-handoff
description: Hand off a pure-code task to Gemini by writing a structured spec to .gemini/handoff.md. Trigger phrases: "hand this to Gemini", "gemini can do this part", "hand off to Gemini", "send this to Gemini", "let Gemini handle this".
when_to_use: When the next step is pure code work (scaffolding, refactoring, testing, type generation) that doesn't require live MCP tool calls or raw private system data. Do NOT use when the task needs live Ninja/Defender/M365 data — pass a sanitized schema or shape instead.
allowed-tools: "mcp__time__*"
---

You are writing a handoff spec from Claude to Gemini. The task must be completable using only what's in the project files plus whatever clean artifact you provide here.

**Step 1 — Extract the task**

From the conversation, identify:
- **Task**: what Gemini needs to do (one sentence)
- **Context**: file paths, class names, interfaces, API shapes — everything Gemini needs that isn't obvious from reading the code
- **Inputs**: any data or schema derived from private sources, passed here as a clean artifact (e.g. a JSON response shape from a NinjaOne call — field names and types only, no real device data)
- **Expected output**: which files Gemini should create or modify
- **Constraints**: naming conventions, import patterns, test framework, style rules
- **Suggested Gemini skill**: the `.gemini/skills/` skill best suited to the task
- **Suggested account**: Dev (active coding), Docs (large-file analysis), Research (web lookup)

**Step 2 — Sanitize**

Before writing, confirm the spec contains none of:
- Raw API responses with hostnames, IPs, or real user identities
- Alert content, log excerpts, or credentials
- Anything that couldn't appear in a public repo

Strip to abstract shape only (field names, TypeScript types, synthetic example values). If a field is sensitive, replace the value with a descriptive placeholder: `"deviceName": "<string>"`.

**Step 3 — Write .gemini/handoff.md**

Overwrite the file — this is a queue, not a log. One pending task at a time.

```
# Gemini Handoff — YYYY-MM-DD HH:MM

**Task:** [one sentence]
**Suggested skill:** `[skill-name]`
**Suggested account:** Dev | Docs | Research

## Context

[file paths, class names, interfaces — terse bullets, no prose]

## Spec / inputs

[clean artifact: TypeScript types, JSON shapes, field descriptions — no private data]

## Expected output

[files to create or modify, with paths relative to project root]

## Constraints

[naming conventions, import paths, test framework, anything non-obvious from reading the code]

## Reply channel

When done, write your result summary to `.gemini/to-claude.md` so Claude can review and integrate.
```

**Step 4 — Reply**

Confirm the write. State the task in one sentence. Note which account and skill to use. Confirm no private data is in the file.
