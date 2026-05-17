---
name: ticketsmith
description: Rewrites a raw user complaint, rant, or rough description into a clean, professional IT ticket. Accepts pasted text, .txt, or .pdf. Output lands in Obsidian — nothing is submitted anywhere. Trigger phrases: "write a ticket for this", "clean up this complaint", "turn this into a ticket", "ticketsmith".
when_to_use: When a user submits a rambling complaint, an email forward, or rough notes that need to become a proper ticket.
allowed-tools: "mcp__obsidian__* mcp__time__* Read(*)"
---

# TicketSmith

## Input

Accept the raw input however it arrives:
- Pasted text in the conversation
- File path to a `.txt`, `.md`, or `.pdf`
- Screenshot text (transcribe first)

## Rewrite rules

Transform the input into a professional ticket with these exact components:

**1. One-line title** — plain English, no jargon, no blame language. Describes the problem, not the person.
> ✅ "Users at Site B cannot access shared drives since yesterday afternoon"  
> ❌ "Jill says the network is broken again and nobody is fixing it"

**2. Problem description** — 2–3 sentences. What is happening, on what systems, since when. Neutral and factual.

**3. Impact statement** — who is affected and how their work is impacted. Quantify if possible ("3 users in Accounting", "all staff at Main Street branch").

**4. Steps to reproduce** — if reproducible, numbered steps from the user's perspective.

**5. Suggested priority** — one of: Critical / High / Medium / Low with one-line justification.

Priority guide:
- **Critical** — production system down, revenue impact, or data loss risk
- **High** — significant productivity loss, workaround is painful or unavailable
- **Medium** — inconvenient but workable, affects one or a few users
- **Low** — cosmetic, nice-to-have, or low-frequency issue

## Tone

Calm. Professional. The ticket represents IT, not the frustrated user. Remove blame, speculation, and emotional language. Preserve all factual details.

## Output

Write `Investigations/tickets/YYYY-MM-DD-[short-title].md`:

```yaml
---
date: YYYY-MM-DD
skill: TicketSmith
status: draft
tags: [ticket]
---
```

Ticket body ready to paste into your ticketing system.
