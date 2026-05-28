---
name: handoff-queue
description: Scans for ready handoffs and pushes one to Gemini. Trigger phrases: "/handoff-queue", "run ready handoffs", "push ready handoffs".
when_to_use: When you have marked one or more handoff notes in Obsidian with `status: ready` and want to push the oldest one to Gemini for execution.
allowed-tools: ["mcp__obsidian__*"]
---

# Handoff Queue — Push to Gemini

Your job is to find the oldest "ready" handoff in the Obsidian vault, push its spec to Gemini, and update its status.

**Step 1 — Find Ready Handoffs**

1.  List all files in the `Handoffs/` directory in the Obsidian vault.
2.  For each file, read its frontmatter.
3.  Filter this list to only include notes where `status: ready`.
4.  Sort the filtered list by the `created` timestamp, ascending (oldest first).

**Step 2 — Process the Oldest Handoff**

1.  If your sorted list is empty, reply with:
    > No handoffs with `status: ready`. Update a handoff's frontmatter to `status: ready` in Obsidian, then re-run.

2.  If the list is not empty, take the **first** item (the oldest one).
3.  Read the full content of that handoff note.
4.  Extract the content from the `## Spec` section.
5.  Write this extracted spec content to the `.gemini/handoff.md` file in the project root, overwriting any existing content.
6.  Update the frontmatter of the Obsidian note: change `status: ready` to `status: in-progress`.
7.  Extract the `target` and `gemini_skill` values from the frontmatter.

**Step 3 — Report to User**

1.  Report your action to the user:
    > Pushed: `[[Handoffs/YYYY-MM-DD-HH:MM-slug]]` — fire **Gemini [target] account**, use `[gemini_skill]` skill. When done, run `/handoff-receive`.

2.  If there were multiple "ready" handoffs in your list from Step 1, add this note:
    > N more handoffs are queued. Run `/handoff-queue` again after this one is received.
