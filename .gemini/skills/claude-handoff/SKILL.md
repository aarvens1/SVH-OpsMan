---
name: claude-handoff
description: Reads a task spec written by Claude and executes it. Writes results back to `.gemini/to-claude.md`.
---

# Skill: Claude Handoff

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Reads a task spec written by Claude and executes it. Writes results back to `.gemini/to-claude.md`.

---

## Capabilities

Picks up work that Claude has queued in `.gemini/handoff.md`. Claude writes these specs when a task is pure code and doesn't require live system integrations. This skill reads the spec, executes the task using the appropriate skill, and posts results back for Claude to review.

**Primary Workflow:**

1. **Read the spec:** Read `.gemini/handoff.md`. If it doesn't exist or is empty, report that and stop.
2. **Confirm the task:** State the task and expected output in your own words and ask the user to confirm before proceeding.
3. **Invoke the appropriate skill:** Use the skill named in the spec (e.g. `create-collector-job`, `test-writer`, `refactor-powershell`, `api-spec`). If no skill is named, choose the best fit based on the task description.
4. **Execute:** Complete the work as described in the spec using the inputs provided.
5. **Write `.gemini/to-claude.md`:** Summarize what was done, list files created/modified, flag any questions or blockers that require Claude's access to private systems.

**`.gemini/to-claude.md` format:**
```
# To Claude — YYYY-MM-DD HH:MM

**Task completed:** [one sentence]

## Files changed
- `path/to/file.ts` — created / modified (one-line description)

## Questions / blockers
[Anything that needs Claude to check against live systems, private data, or MCP tools.
Write ➖ if none.]

## Suggested next step
[What Claude or the user should do to integrate this work.]
```

---

## Invocation Phrases

- "Pick up the Claude handoff"
- "What did Claude leave for me?"
- "Execute the handoff"
- "claude-handoff"

---

## Tools

- **`read_file`**: To read `.gemini/handoff.md`.
- **`write_file`**: To write `.gemini/to-claude.md`.
- **`ask_user`**: To confirm the task before executing.
- All tools available to the invoked sub-skill.
