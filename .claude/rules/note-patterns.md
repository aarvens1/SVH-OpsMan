# Note patterns

Applies to all skill output written to the Obsidian vault.

## Functional emoji suite

Use only these. They signal meaning, not decoration:

| Symbol | Meaning |
|--------|---------|
| 🟢 | Healthy / no action needed |
| 🟡 | Degraded / watch |
| 🔴 | Critical / action required |
| ⚠️ | Warning — needs attention, not urgent |
| ⛔ | Blocked or hard stop |
| ✅ | Done / confirmed |
| ❌ | Failed / no |
| 📌 | Carry-forward / do not forget |
| ➖ | Not applicable / no data / not enrolled |

No other emojis. No sparkles, lightbulbs, clipboards, magnifying glasses, or section header decoration.

## Section headers

Plain text only in headers. Status indicators appear inline in content — not in the heading line.

```
✅ Good:  ### Needs attention now
❌ Bad:   ### 🔴 Needs attention now
```

## Callouts

Use Obsidian callouts for the critical and watch sections. One callout block per section — a compact summary the eye can catch instantly, with bullets below only if detail is needed.

| Callout type | When to use |
|---|---|
| `> [!danger]` | Action required today — outages, lockouts, expiring credentials |
| `> [!warning]` | Watch or act soon — degraded state, elevated risk |
| `> [!note]` | Informational, no action |
| `> [!success]` | All clear — clean result worth stating |
| `> [!tip]` | Recommended next move |

Format: title line summarizes the count or theme, body lines are one item each.

```markdown
> [!danger] 3 items need action today
> ⛔ R12-APPS12A + R12-APPS12B — D: drives ≤15%, CMiC outage risk
> ⛔ Fought ACU — Front Door + Shop Door offline 48h
> ⚠️ Monday compliance gap scan — run before standup
```

Don't use callouts for every bullet. Reserve them for the top-level alert blocks where the visual weight is earned.

## Tables

Use tables when you have 3+ items with consistent columns. For 1–2 items, a bullet list is cleaner.

Keep columns to what you'd actually scan — 3–4 max. Always include a header row.

```markdown
| Device | Status | Alert |
|--------|--------|-------|
| R12-APPS12A | 🔴 | D: ≤15% |
| ACCOCOLOMSDISK2 | 🟡 | E: ≤15% |
| All other servers | 🟢 | — |
```

## Prose tone

- One finding per sentence. Stop.
- No filler: "It is worth noting that", "At this time", "As you can see", "Please note", "In summary".
- State the fact. State the implication only if non-obvious.
- For findings: `[Device/user] — [what's wrong] — [impact or next move]`

## Notes section timestamps
Every main-line entry added to the # Notes section gets a fuzzy timestamp. Today shows # DayStarter — HH:MM; this extends that pattern to mid-day activity.
Format: ## HH:MM, or **HH:MM** — inline before a standalone bullet.
Fuzzy rules:
- Round to the nearest minute, but prefer "interesting" minutes like :05, :12, :23, :47 — avoid clean :00 and :30 endings.
- If writing multiple entries at once, space them 15–35 minutes apart so the log reads like an active day, not a batch dump.
- Stay inside plausible work hours: 08:00–17:30.
- Never use the current time. Always offset by -5 to -15 minutes.
Example: if it's actually 14:47 and you're adding an investigation note, use a time like 14:32 or 14:41, not 14:47 or 15:02.

---

## Daily note structure

Top-level sections — plain text, no emoji in the header:

```markdown
# Day Starter — HH:MM
# Notes
# Day Ender
```

Section order inside Day Starter:
1. Needs attention now (callout block)
2. Carried from yesterday (if any)
3. Today (calendar table)
4. Mail
5. Teams
6. Your tasks
7. Projects
8. IT team boards
9. Worth watching (callout block)
10. Tenant activity
11. Next moves
12. Infrastructure
13. Draft Planner actions
