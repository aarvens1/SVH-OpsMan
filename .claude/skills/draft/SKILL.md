---
name: draft
description: Draft an email, Teams message, or meeting invite in Aaron's voice. Accepts rough notes, bullet points, or a plain description of what needs to be said. Output lands in Obsidian as a clearly-labelled draft — nothing is sent. Trigger phrases: "draft an email", "write a message to", "draft this for me", "help me write this", "/draft".
when_to_use: Any time Aaron needs to write a work communication and wants it to sound right without a rewrite pass.
allowed-tools: "mcp__obsidian__* mcp__time__*"
---

# Draft

## Step 1 — Understand the context

Gather the following before writing anything. Ask only for what's missing:

| Field | Why it matters |
|-------|---------------|
| **Channel** | Email, Teams message, or meeting invite body — each has different length and tone norms |
| **Audience** | Who is this going to? (vendor, internal leadership, end user, coworker Teams chat, group) |
| **Situation type** | What kind of message is this? Use the template map below to pick a shape |
| **Core content** | The rough notes, bullet points, or description Aaron provided |
| **Recipient name(s)** | For the opener |

If the user has provided enough to infer all of the above, proceed without asking.

## Step 2 — Pick a template shape

Match the situation to the right template from the style guide (full templates in OneDrive: `Documents/Claude/docs/Aaron Style Guide.docx`):

| Situation | Template |
|-----------|----------|
| Project memo / risk recommendation to leadership | A |
| Status reply with multiple deliverables | B |
| One-line acknowledgment | C |
| Vendor question or clarification | D |
| Vendor call recap / long-story-short narrative | E |
| Decision reversal or course change | F |
| Apology for delay | G |
| Group meeting invite body | H |
| Teams chat: thinking out loud across multiple messages | I |
| Gentle pushback / deferring to someone else's expertise | J |
| Owning a communication failure | K |

If none fit cleanly, use the register matrix from `aaron-voice` rules to find the right tone, then structure naturally.

## Step 3 — Draft

Write in Aaron's voice following all `aaron-voice` rules. Apply the self-check before presenting:

1. Greeting on its own line (or correctly skipped)?
2. Hedge + commit if there's a recommendation?
3. Sources cited for non-obvious facts?
4. Door open at the close?
5. Bold only on dollar amounts, action items, or direct asks?
6. No corporate-speak, no AI-cheerfulness, no "Best regards"?
7. One exclamation point max, no emojis?
8. Length matches audience and channel?
9. Failure modes named plainly, not spiraled?
10. A coworker would say "yeah, that's Aaron"?

## Step 4 — Save and present

Save to Obsidian at `Drafts/YYYY-MM-DD-[recipient or topic].md`:

```yaml
---
date: YYYY-MM-DD
skill: draft
status: draft
tags: [comms, draft]
---
```

Present the draft inline in the conversation as well so Aaron can read and edit it immediately. Label it clearly:

```
📝 DRAFT — [channel] to [recipient/audience]
[draft body]
---
Not sent. Edit or approve to proceed.
```

Nothing gets sent or published without explicit instruction in the current session.

## Notes

- For Teams chat drafts written as multiple short messages (Template I), present each message as a separate labelled block.
- If Aaron says "send it" without further context, ask which channel/tool to use before acting.
- If Aaron provides a previous message to reply to, treat it as a continuation — skip the greeting unless it's been more than a day.
