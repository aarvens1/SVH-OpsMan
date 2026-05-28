---
name: gemini-handoff
description: Creates a handoff note in Obsidian (status: draft) with a sanitized spec for Gemini. Trigger phrases: "/gemini-handoff", "hand this to Gemini", "send this to Gemini".
when_to_use: When the next step is pure code work (scaffolding, refactoring, testing, type generation) that doesn't require live MCP tool calls or raw private system data.
allowed-tools: ["mcp__obsidian__*", "mcp__time__*"]
---

# Gemini Handoff — Create Draft Note

Your primary goal is to create a handoff note in the Obsidian vault at `Handoffs/`. This note acts as a draft queue item. You do NOT write to `.gemini/handoff.md` yourself; that is the job of the `/handoff-queue` skill, which runs later.

**Step 1 — Extract and Sanitize the Task**

From the conversation, identify and sanitize the core task details. This process is critical for maintaining the data boundary.

1.  **Task Summary:** A one-sentence summary of what Gemini needs to do.
2.  **Task Slug:** Create a 3-5 word kebab-case slug from the summary (e.g., `redesign-daily-note-activity-log`).
3.  **Target Account & Skill:** Determine the correct Gemini account (`dev`, `docs`, or `research`) and the specific `gemini_skill` to be used (e.g., `claude-handoff`, `api-spec`).
4.  **Full Spec:** The detailed, sanitized instructions for Gemini. This includes context, inputs (as clean data shapes), expected output, and constraints.

**Crucially, you must strip all private data** before writing the spec. Convert real data into abstract shapes (e.g., TypeScript types, JSON schemas with placeholder values like `"<string>"`). Ensure no real hostnames, IPs, UPNs, or credentials are included.

**Step 2 — Write the Handoff Note in Obsidian**

1.  Get the current timestamp using `mcp__time__get_current_time`. Format it as `YYYY-MM-DD-HH:MM`.
2.  Construct the filename: `Handoffs/YYYY-MM-DD-HH:MM-<task-slug>.md`.
3.  Write the note to the Obsidian vault using the structure below. The `status` must be `draft`.

```markdown
---
date: YYYY-MM-DD
created: YYYY-MM-DDTHH:MM:SS
skill: gemini-handoff
status: draft
target: <dev | docs | research>
gemini_skill: <gemini_skill>
task_slug: <task-slug>
tags: [handoff, gemini]
related_briefing: "[[Briefings/Daily/YYYY-MM-DD]]"
---

# Handoff — <task-slug>

*Queued from [[Briefings/Daily/YYYY-MM-DD]] at HH:MM*

## Summary
[One paragraph: what was asked for, what Gemini will do, which account and skill]

## How to push this handoff
1. Review the spec below — edit anything that needs to be adjusted
2. Change `status: draft` to `status: ready` in the frontmatter above
3. Run `/handoff-queue` in Claude Code

## Spec

[Full sanitized spec — same content that would go to .gemini/handoff.md. Identical format.]

---

## Result

*Pending*
```

**Step 3 — Link Handoff in Daily Note**

Add a wikilink to the newly created handoff note in today's daily note.

1.  Use `edit_block` to target the `<!-- DAY-STARTER-END -->` sentinel in `Briefings/Daily/YYYY-MM-DD.md`.
2.  Insert the following line, linking to the new handoff file:
    `→ [[Handoffs/YYYY-MM-DD-HH:MM-task-slug]] — [one sentence describing the task]`

**Step 4 — Reply to User**

Confirm to the user that the handoff has been created as a draft.

> Handoff created: `[[Handoffs/YYYY-MM-DD-HH:MM-task-slug]]` — review the spec, change status to `ready`, then run `/handoff-queue`.
