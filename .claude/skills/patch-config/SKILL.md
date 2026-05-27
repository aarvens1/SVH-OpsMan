---
name: patch-config
description: Generate a ready-to-paste Gemini Code prompt for config edits Claude can't make due to self-modification guards (.claude/rules/, .claude/hooks/, .claude/skills/). No Obsidian output — produces a formatted prompt block with exact diffs and verification steps. Trigger phrases: "hit a self-write block", "generate a config patch prompt", "hand this config change to Gemini Code".
when_to_use: Use when Edit/Write is blocked on a Claude config file, or when delegating to Gemini Code. Output goes directly to chat — nothing written to .gemini/handoff.
allowed-tools: ["Read"]
---

# patch-config

Generate a Gemini Code prompt for config changes Claude cannot make directly due to self-modification guards.

When invoked:

Either:
- Claude just hit a self-write block on a `.claude/` file, OR
- The user explicitly asks for a config patch prompt.

## Step 1 — Collect

Assemble the full context from the current session:
- What file needs editing.
- What specifically changes (add / remove / modify a block).
- Why — one sentence summary of the goal.

## Step 2 — Read each file

Use `read_file` to get the current content of each file that needs editing. The exact text is required for precise `before/after` blocks in the prompt.

## Step 3 — Build the prompt

Output the following as a fenced code block the user can copy directly into Gemini Code. No surrounding prose — just the block.

# Config Patch — [Brief Title]

Context: [one sentence explaining what session state prompted it]

---

## Changes

### [relative file path]

**[What and why — one sentence]**

[Use one of these three formats for each change:]

REPLACE — find this exact text:
```
[current text — enough context to locate it uniquely in the file]
```
with:
```
[replacement text]
```

ADD — insert after/before `[anchor text]`:
```
[text to insert]
```

REMOVE — delete this exact text:
```
[exact text to remove]
```

[Repeat for each file and each change within a file]

---

## Verification

After all edits, run from the repo root:
```bash
git diff .claude/
```
Paste the full diff back into your Claude session.

## Expected diff shape

[For each file: one line describing what the diff should show]

## Step 4 — Present the output

Print one line above the block:

▎ Paste into Gemini Code (Account A). When done, paste the `git diff .claude/` output back here.

Nothing else. No summary after the block.
