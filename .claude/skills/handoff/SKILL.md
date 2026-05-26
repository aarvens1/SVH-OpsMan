---
name: handoff
description: Write a session handoff note to Obsidian and add a summary line to today's daily note. Use at the end of any working session where you want to preserve context for later. Trigger phrases: "create a handoff", "write a handoff", "session handoff", "save session context", "handoff note".
when_to_use: End of any session that produced changes, decisions, or open items worth preserving. Especially useful before context window compaction or when switching between projects.
allowed-tools: "mcp__obsidian__* mcp__time__*"
---

Review the current conversation and produce two outputs.

**Step 1 — Identify the session content**

From the conversation, extract:
- **Topic**: one short phrase naming what the session was about (used in the filename)
- **What changed**: code written, bugs fixed, configs updated, decisions made — concrete and specific
- **Open items**: anything unfinished, deferred, or worth revisiting
- **Key commands or context**: non-obvious things that would help someone pick up cold — file paths, gotchas discovered, env requirements, relevant aliases

**Step 2 — Write the handoff note**

Path: `Projects/YYYY-MM-DD-[topic]-handoff.md`

Use today's date and a kebab-case topic slug (e.g. `2026-05-26-collector-staging-handoff`).

Frontmatter:
```yaml
---
date: YYYY-MM-DD
skill: handoff
status: draft
tags: [handoff, <topic-tag>]
---
```

Structure:
```
# [Topic] — Session Handoff

One sentence: what this session was about and where it ended up.

## What was done
Bullet list — one item per discrete change, fix, or decision. Be specific:
file paths, error messages resolved, commands that now work. Not prose.

## Open items
Bullets with ⚠️ for anything that needs follow-up. ➖ if nothing is open.

## Key context
Things that aren't obvious from reading the code:
- Gotchas discovered (e.g. "Graph audit log requires ConsistencyLevel header")
- Environment requirements (e.g. "BW_SESSION must be active before running X")
- Relevant aliases or commands introduced this session
- File locations that matter

## Where to start next time
One or two sentences: the concrete next action if picking this up again.
```

**Step 3 — Update the daily note**

Read today's daily note at `Briefings/Daily/YYYY-MM-DD.md`.

If the note exists, use `edit_block` to insert a handoff entry into the Notes section — place it after `<!-- DAY-STARTER-END -->` (which keeps it before the Day Ender):
```
old_string: <!-- DAY-STARTER-END -->
new_string: <!-- DAY-STARTER-END -->

## Session handoff — HH:MM
→ [[Projects/YYYY-MM-DD-[topic]-handoff]]
One sentence summary of what the session produced.
```

If today's daily note doesn't exist yet, skip the daily note step and mention it in your reply.

**Step 4 — Reply**

Confirm both writes. Give the vault path to the handoff note and the one-sentence summary you used in the daily note.
