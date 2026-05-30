---
name: import-research
description: File pasted Gemini search output (any tier) into the Obsidian vault as a Research note. Adds frontmatter, links from today's daily note, appends to the skill log. Trigger phrases: "file this research", "save this to research", "import-research", "/import-research", "this came from Gemini, save it".
when_to_use: After running a quick/deep/research search in Gemini, when the output is worth keeping. Paste the full output (including the Sources list) and the skill files it consistently. Skip for one-off lookups that don't need a record.
allowed-tools: "Read Write Edit"
---

# Import Research

## Step 1 — Get the content

The user pastes Gemini output directly into the conversation. The expected shape is one of the three tiers:

- **Quick** — short answer with `[1][2]` inline citations and a **Sources** list
- **Deep** — structured response with H2 sections, TL;DR, "Where sources disagree" callout, Sources list
- **Research** — full report with TL;DR, Background, Key findings, Tradeoffs, Recommendations, Sources

If the paste is missing a Sources section, **warn but continue** — Aaron may have edited the boilerplate out. Record `sources_detected: false` in frontmatter so it's queryable later.

## Step 2 — Parse and confirm

Extract:
1. **Title** — first H1 (`# Topic`) line if present, otherwise the TL;DR line, otherwise ask Aaron.
2. **Slug** — kebab-case from title (lowercase, drop punctuation, hyphenate spaces). Trim to ~50 chars.
3. **Tier** — detect by shape:
   - Has `# … Research Brief` header → `research`
   - Has multiple H2 sections + "Where sources disagree" → `deep`
   - Short prose with citations only → `quick`
   - If ambiguous, ask.
4. **Source count** — count `[N]` entries in the Sources list. Record this number.
5. **Date** — use today's date from session context.

Show Aaron: title, slug, tier, source count, target path. Confirm before writing.

## Step 3 — Write the note

Target: `Research/YYYY-MM-DD-<slug>.md` in the vault.

Frontmatter:

```yaml
---
date: YYYY-MM-DD
skill: import-research
status: filed
tags: [research, gemini, <tier>]
tier: quick | deep | research
source: gemini
source_count: N
sources_detected: true | false
---
```

Body: the pasted content **verbatim**. Do not re-summarize, re-format, or re-extract. Gemini's output is the artifact — preserve it as the user saw it, including the inline `[N]` citations and the Sources list at the bottom.

If the pasted content has no H1, prepend one with the title.

## Step 4 — Link from daily note

Append to today's `Briefings/Daily/YYYY-MM-DD.md` in the `# Activity Log` section using the `<!-- DAY-STARTER-END -->` sentinel:

```markdown
- [[Research/YYYY-MM-DD-<slug>]] — [tier] research · N sources · [one-sentence summary from TL;DR or first paragraph]
```

If no daily note exists today, skip silently.

## Step 5 — Skill log

Append one line to `System/skill-log.md`:
`YYYY-MM-DD HH:MM | import-research | Research/YYYY-MM-DD-<slug>.md | [tier] · N sources · [topic]`

## Step 6 — Report back

Show Aaron:
- Vault path written
- Daily note link added (or skipped if no daily)
- Source count and tier
- One-line reminder that the content is verbatim from Gemini — if he needs to edit, do so in place

## What this skill is NOT for

- Internal investigations (use `/troubleshoot` or `/asset-investigation`)
- Notes that didn't come from Gemini search (just write them directly)
- Personal observations or ops findings — Research/ is for external, sourced web research only
