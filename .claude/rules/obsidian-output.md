# Obsidian output conventions

These apply whenever Claude writes a note to the Obsidian vault.

## Vault structure

```
Inbox/      ← staged items awaiting Execute — the only folder that empties
Daily/      ← one note per day, operational log and reactive hub
Record/     ← everything permanent
Archive/    ← manually moved when truly done
```

Obsidian is the operational intelligence layer and drafting table. Confluence holds authoritative official documentation. When a note graduates to Confluence, it does so via Execute — never autonomously.

## Frontmatter (required on every note)

```yaml
---
date: YYYY-MM-DD
type: <see types below>
status: <see lifecycle below>
tags: []
entities: []
---
```

**Types:** `daily | incident | change | meeting | research | plan | session | draft | vuln`

**Status lifecycle:**
- `Inbox/` notes: `staged` → `pushed` or `discarded`
- `Record/` notes: `active` → `closed` or `filed`
- `Daily/` notes: always `active`

**Extra fields by type:**
- **Incidents:** `incident_id: INC-YYYY-NNN`, `severity: critical|high|medium|low`
- **Changes:** `change_id: CHG-YYYY-NNN`, `risk: low|medium|high`, `window: YYYY-MM-DD HH:MM – HH:MM`, `change_date: YYYY-MM-DD`
- **Vulnerabilities:** `cve: CVE-YYYY-NNNNN`, `priority: emergency|this-week|next-cycle|accept`
- **Daily:** `has_pending_tasks: true|false`
- **Weekly sessions:** `week: YYYY-WW`
- **Meetings:** `attendees: [Name, Name]`

**`entities:`** — list every server, site, system, or person the note is about using consistent names (e.g. `SVH-SQL01`, `Site B`, `Sam Maxon`). This is what makes backlink search useful. No wikilinks needed — consistent naming is enough.

## Vault paths

| Content | Path |
|---------|------|
| Daily notes | `Daily/YYYY-MM-DD.md` |
| Staged items (Inbox) | `Inbox/YYYY-MM-DD-slug.md` |
| Incidents | `Record/YYYY-MM-DD-incident-name.md` |
| Changes | `Record/CHG-YYYY-NNN.md` |
| Meetings | `Record/YYYY-MM-DD-meeting-name.md` |
| Investigations | `Record/YYYY-MM-DD-investigation-topic.md` |
| Research | `Record/YYYY-MM-DD-research-topic.md` |
| Plans | `Record/YYYY-MM-DD-plan-name.md` |
| Vulnerabilities | `Record/CVE-YYYY-NNNNN.md` or `Record/YYYY-MM-DD-vuln-name.md` |
| Sessions (scribe/wrap) | `Record/YYYY-MM-DD-session-name.md` |
| Excalidraw diagrams | `Diagrams/<category>/[name].excalidraw` |

Everything permanent goes in `Record/`. Frontmatter `type:` is what distinguishes them — not subfolders. Dataview queries on `type` and `entities` replace manual folder navigation.

## Staged note format (Inbox/)

Every item written to `Inbox/` must include destination and type in frontmatter:

```yaml
---
date: YYYY-MM-DD
type: draft
status: staged
destination: planner | confluence | teams | mail | none
entities: []
tags: []
---
```

Nothing in `Inbox/` gets pushed without Aaron initiating Execute. Status moves to `pushed` or `discarded` — nothing else.

## Diagrams

For network topology, attack paths, change impact scope, and project WBS — produce an Excalidraw diagram rather than prose. Save to `Diagrams/<category>/` and embed with `![[filename.excalidraw]]`.

## Visual style

See `.claude/rules/note-patterns.md` for the full design spec: functional emoji suite, callout usage, table conventions, and prose tone rules. Apply these to all skill output.

## Daily note structure

Three fixed top-level sections. No emojis in section headers.

```
# Day Starter — HH:MM
# Notes
# Day Ender
```

**Day Starter** — written once at session start. Check `staging_status` first — if stale, run `collector_run`. Then read staging files and synthesize. Use `mode: rewrite` (new file).

**Day Ender** — appended at end of day. Use `mode: append`. Do NOT read the daily note before appending — the Obsidian MCP tool sometimes returns only metadata; reading first risks a false-empty result that overwrites the file. The Day Starter ends with `<!-- DAY-STARTER-END -->` as a sentinel.

**Mid-day additions** — do NOT use `mode: append` (appends after Day Ender). Use `edit_block` to insert before the sentinel:
- `old_string`: `<!-- DAY-STARTER-END -->`
- `new_string`: `<!-- DAY-STARTER-END -->\n\n[new content]`

**If a read returns no body content:** assume the file has content the tool failed to surface. Never rewrite without confirming the file is actually new or empty.

## Daily note as index

The daily note links to content — it doesn't contain it. If a dedicated Record/ note exists, the daily note gets a wikilink.

| Situation | Daily note entry |
|-----------|-----------------|
| Open incident | `→ [[Record/YYYY-MM-DD-incident-name]]` |
| Active investigation | `→ [[Record/YYYY-MM-DD-investigation-topic]]` |
| Change record | `→ [[Record/CHG-YYYY-NNN]]` |
| Meeting | `- [[Record/YYYY-MM-DD-meeting-name]] — one sentence` |
| Staged item in Inbox | `→ [[Inbox/YYYY-MM-DD-slug]] — what it is` |
| Carry-forward | `→ [[Daily/YYYY-MM-DD]]` |

## Nothing leaves Obsidian without explicit user instruction

Draft all Teams messages, emails, Confluence pages, and Planner updates here first. Never send or publish without the user saying so in the current session.
