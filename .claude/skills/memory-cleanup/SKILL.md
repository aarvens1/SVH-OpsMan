---
name: memory-cleanup
description: Audit and prune the Claude auto-memory store. Reads every file in the memory directory, assesses freshness and accuracy, deletes stale or resolved entries, moves any actionable items to TODO.md, and rebuilds MEMORY.md. Trigger phrases: "clean up memory", "prune memory", "memory cleanup", "audit memory".
when_to_use: Run at the end of each work week (week-ender calls this automatically) or any time memory feels cluttered. Do NOT use for mid-session task tracking — that belongs in conversation context.
allowed-tools: "Read Edit Write Bash"
---

# Memory Cleanup

Memory path: `/home/wsl_stevens/.claude/projects/-home-wsl-stevens-SVH-OpsMan/memory/`
TODO path: `/home/wsl_stevens/SVH-OpsMan/TODO.md`

## Step 1 — Inventory

Read every `.md` file in the memory directory except `MEMORY.md` itself. Note the `type` field from each file's frontmatter.

## Step 2 — Assess each memory

Apply these rules in order:

**Delete if any of the following:**
- Type is `project` and the work described is clearly done (check current code, tool list, or TODO.md for confirmation)
- The memory describes a plan or approach for a specific task that is now complete
- The memory duplicates something already in CLAUDE.md, config.yaml, or a skill file
- The memory is about temporary state from a single session (in-progress debugging, "we tried X today")

**Move to TODO.md if:**
- The memory is a to-do list, backlog, or "implement X" note
- The item is actionable and not yet done

**Keep if:**
- Type is `feedback` — behavioral rules the user has given (how to format output, what to avoid, defaults to use)
- Type is `user` — facts about the user's role, preferences, or knowledge
- Type is `reference` — pointers to external systems
- Type is `project` AND the context is still actively load-bearing (e.g. an org ID default with a documented bug that hasn't been fixed)

When in doubt, keep feedback memories and delete project memories.

## Step 3 — Execute changes

For each file to delete: `rm` it via Bash.

For each item to move to TODO.md: Read the current TODO.md, add the item under the appropriate section (or create a new "## Memory-extracted TODOs" section at the bottom), then delete the memory file.

## Step 4 — Rebuild MEMORY.md

Rewrite `MEMORY.md` with one line per remaining memory file:
```
- [Title](filename.md) — one-line hook (≤ 120 chars)
```

No frontmatter on MEMORY.md. No section headers. No extra commentary.

## Step 5 — Report

Print a brief summary:
- Files deleted (with reason)
- Items moved to TODO.md
- Files kept (with reason)
- Final MEMORY.md line count
