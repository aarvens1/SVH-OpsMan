---
name: brain-dump
description: Zero-friction capture. Appends a timestamped bullet to Inbox.md in the vault. Accepts inline text or whatever is in the current message. Trigger phrases: "brain dump", "jot this down", "log this", "/brain-dump", "capture this", "add to inbox".
when_to_use: When you want to capture a thought, link, idea, or reminder without ceremony. No note structure, no frontmatter — just a timestamped line in Inbox.md.
allowed-tools: "mcp__desktop-commander__write_file mcp__desktop-commander__read_file"
---

# Brain Dump

## Step 1 — Extract the content

Take whatever the user passed after the trigger phrase as the capture text. If they said `/brain-dump` with no args and the message has other content, use that. Never ask for clarification — capture what's there.

## Step 2 — Get timestamp

Format: `YYYY-MM-DD HH:MM` (24h, no seconds).

## Step 3 — Append to Inbox.md

Vault path: `/mnt/c/Users/astevens/vaults/OpsManVault/Inbox.md`

Read the file first. If it doesn't exist, create it with:
```
# Inbox

```

Append the new line at the end:
```
- YYYY-MM-DD HH:MM — [capture text]
```

Write the file back.

## Step 4 — Confirm

One line reply:
> Logged: "[capture text]"

No other output. No frontmatter, no skill headers, no "I've added..." preamble.
