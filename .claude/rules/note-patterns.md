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

**Briefing implication rule:** Every callout block item in a Day Starter or posture check must answer "so what." State the fact, then state the impact or next move — one sentence each. A finding with no implication is incomplete.

## Activity Log inclusion rule

Skills that produce a note linked to today's work (incident triage, investigations, task triage, access reviews, patch campaigns) add a wikilink entry to `# Activity Log`. Skills that produce reference material (asset profiles, skill pages, runbooks, diagrams, project indexes) do not — those notes stand alone.

The test: if the output note would be stale or irrelevant tomorrow, it belongs in the Activity Log. If it's a living document that will be updated in place, skip the log entry.

---

## Daily note structure

Top-level sections — plain text, no emoji in the header:

```markdown
# Day Starter — HH:MM
# Activity Log
# Day Ender
```

Section order inside Day Starter:
1. Needs attention now (callout block)
2. Carried from yesterday (if any — omit items already in Planner as overdue tasks)
3. Today (calendar table)
4. Infrastructure (always include even when clean)
5. Communications (DMs/channels first, then mail — merged section)
6. Inbox (if any brain-dump entries since last day-starter)
7. Your tasks
8. Projects
9. IT team boards
10. Worth watching (callout block)
11. Tenant activity
12. Personal
13. Next moves (last — synthesis after all data)

Day Ender section order:
1. Staged Tasks — task blocks accumulated since morning, processed in one pass here (written by Day Starter, added to by Day Ender before processing)
2. ✅ Closed today (appended)
3. 📨 Communications close-out (appended)
4. 🔴 Active issues at EOD (appended)
5. 🔄 Still open — yours (appended)
6. Personal close-out (appended)
7. 🌅 First move tomorrow (appended)
8. 📌 Carry Forward (appended)

Week Starter section order:
1. Needs attention now (callout block)
2. Suggested first move
3. Calendar (day-by-day)
4. Communications (DMs/channels first, then mail)
5. Infrastructure status
6. Your tasks
7. Projects
8. IT team boards
9. Things to watch (callout block)
10. Personal
11. Draft Planner actions (#### subsection format)

Week Ender sections (appended to weekly note):
1. ✅ Shipped this week
2. 🔄 Slipped to next week
3. 🌱 Seeds for next week
4. Personal
5. Summary draft (optional)
6. 🖥 Thu snapshot — Infrastructure
7. ⛔ Before you close out
8. 🌅 First thing Monday
9. Draft Planner actions (#### subsection format)
