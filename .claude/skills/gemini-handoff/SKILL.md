---
name: gemini-handoff
description: Creates a structured Obsidian draft note with a sanitized code-work spec for Claude Dev. Trigger phrases: "/gemini-handoff", "hand this to Gemini", "send this to Gemini".
when_to_use: When the next step is pure code work (scaffolding, refactoring, testing, type generation) that doesn't require live MCP tool calls or raw private system data. Use to capture and sanitize the spec before passing it to Claude Dev manually.
allowed-tools: "mcp__svh-opsman__* mcp__desktop-commander__*"
---

# Gemini Handoff — Create Sanitized Spec Note

> **Status: Async cycle pending rewrite.** This skill creates a structured Obsidian draft note with the sanitized spec. After reviewing it, copy the spec manually into a Claude Dev session (`claude-dev`). Do not run `/handoff-queue` — the Gemini async workflow is not active. See `TODO.md`.

Your goal is to create a handoff note in the Obsidian vault at `Handoffs/` with a fully sanitized spec ready for Claude Dev.

**Step 1 — Extract and Sanitize the Task**

From the conversation, identify and sanitize the core task details. This process is critical for maintaining the data boundary.

1.  **Task Summary:** A one-sentence summary of what needs to be done.
2.  **Task Slug:** Create a 3-5 word kebab-case slug from the summary (e.g., `redesign-daily-note-activity-log`).
3.  **Full Spec:** The detailed, sanitized instructions for Claude Dev. This includes context, inputs (as clean data shapes), expected output, and constraints.

**Crucially, you must strip all private data** before writing the spec. Convert real data into abstract shapes (e.g., TypeScript types, JSON schemas with placeholder values like `"<string>"`). Ensure no real hostnames, IPs, UPNs, or credentials are included.

**Step 2 — Write the Handoff Note in Obsidian**

1.  Use today's date and current time. Format as `YYYY-MM-DD-HHMM`.
2.  Construct the filename: `Handoffs/YYYY-MM-DD-HHMM-<task-slug>.md`.
3.  Write the note to the Obsidian vault using the structure below. The `status` must be `draft`.

```markdown
---
date: YYYY-MM-DD
created: YYYY-MM-DDTHH:MM:SS
skill: gemini-handoff
status: draft
target: claude-dev
task_slug: <task-slug>
tags: [handoff, claude-dev]
related_briefing: "[[Briefings/Daily/YYYY-MM-DD]]"
---

# Handoff — <task-slug>

*Queued from [[Briefings/Daily/YYYY-MM-DD]] at HH:MM*

## Summary
[One paragraph: what was asked for, what Claude Dev will do]

## How to use this handoff
1. Review the spec below — edit anything that needs to be adjusted
2. Open a Claude Dev session (`claude-dev`)
3. Paste the spec content directly into the session

## Spec

[Full sanitized spec. No real device names, hostnames, IPs, UPNs, or credentials.]

---

## Result

*Pending*
```

**Step 3 — Link Handoff in Daily Note**

Add a wikilink to the newly created handoff note in today's daily note.

1.  Use `edit_block` to target the `<!-- DAY-STARTER-END -->` sentinel in `Briefings/Daily/YYYY-MM-DD.md`.
2.  Insert the following line:
    `→ [[Handoffs/YYYY-MM-DD-HHMM-task-slug]] — [one sentence describing the task]`

**Step 4 — Reply to User**

Confirm to the user that the handoff has been created as a draft.

> Handoff created: `[[Handoffs/YYYY-MM-DD-HHMM-task-slug]]` — review the spec in the vault, then paste it into a `claude-dev` session.
