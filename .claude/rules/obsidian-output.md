# Obsidian output conventions

These apply whenever Claude writes a note to the Obsidian vault.

## Frontmatter (required on every note)

```yaml
---
date: YYYY-MM-DD
skill: <skill name>
status: draft
tags: [<relevant>, <tags>]
---
```

Status lifecycle: `draft` → `reviewed` → `filed` or `promoted`

Extra fields by note type:
- **Incidents:** `incident_id: INC-YYYY-NNN`, `severity: critical|high|medium|low`, `status: open|contained|closed`
- **Changes:** `change_id: CHG-YYYY-NNN`, `risk: low|medium|high`, `window: YYYY-MM-DD HH:MM – HH:MM`, `change_date: YYYY-MM-DD` (clean date for Bases calendar view — same day as the window start)
- **Vulnerabilities:** `cve: CVE-YYYY-NNNNN`, `priority: emergency|this-week|next-cycle|accept`
- **Assets:** `asset_type: server|workstation|user`
- **Daily briefings:** `has_pending_tasks: true|false` — set to `true` if the note contains draft Planner actions that were not pushed during the session
- **Weekly briefings:** `week: YYYY-WW`
- **Meetings:** `attendees: [Name, Name]`

## Vault paths

| Content | Path |
|---------|------|
| Day Starter / Day Ender | `Briefings/Daily/YYYY-MM-DD.md` |
| Week Starter / Week Ender | `Briefings/Weekly/YYYY-WW.md` |
| Incidents | `Incidents/Active/YYYY-MM-DD-name.md` |
| Investigations | `Investigations/` |
| Changes | `Changes/` |
| Meetings | `Meetings/YYYY-MM-DD-name.md` |
| Assets | `Assets/[name].md` (persistent — update in place) |
| Projects | `Projects/` |
| Access reviews | `Reviews/Access/` |
| Patch reviews | `Reviews/Patches/` |
| Vulnerabilities | `Vulnerabilities/` |
| Excalidraw diagrams | `Diagrams/<category>/[name].excalidraw` |

## Diagrams

For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than a prose description. Save to `Diagrams/<category>/` and embed with `![[filename.excalidraw]]`.

## Daily note write mode

Daily notes have three fixed top-level sections: `# 🌅 Day Starter`, `# 📝 Notes`, `# 🌆 Day Ender`. The Day Ender is always the last section.

**Day Starter** — written once at the start of day. Use `mode: rewrite` (new file).

**Day Ender** — appended at end of day. Use `mode: append`. **Do NOT read the daily note before appending.** The Obsidian MCP tool sometimes returns only metadata with no body content; if you read first and get an empty result, you'll incorrectly conclude the file is empty and overwrite it. The day-starter template ends with `<!-- DAY-STARTER-END -->` as a structural sentinel — the day ender content appends naturally after it.

**Notes section (mid-day additions)** — do NOT use `mode: append`. Appending goes to the end of the file, which is after `# 🌆 Day Ender`. Instead, use `edit_block` to insert content before the Day Ender header using the sentinel:
- `old_string`: `<!-- DAY-STARTER-END -->`
- `new_string`: `<!-- DAY-STARTER-END -->\n\n[new content]`

**If a read of an existing daily note returns no body content:** assume the file has content that the tool failed to surface — not that the file is empty. Never rewrite a daily note without confirming the file is actually empty or brand new.

## Daily note as timeline

The daily note is an index of the day, not a content repository. Prefer wikilinks over inline content wherever a dedicated note exists:

| Situation | Daily note entry |
|-----------|-----------------|
| Open incident | `→ [[Incidents/Active/YYYY-MM-DD-name]]` |
| Active investigation | `→ [[Investigations/YYYY-MM-DD-topic]]` |
| Change record | `→ [[Changes/CHG-YYYY-NNN]]` |
| Meeting notes | `- [[Meetings/YYYY-MM-DD-name]] — one sentence` (meeting-prep handles this) |
| Asset with active alert | `→ [[Assets/device-name]]` |
| Carry-forward item | `→ [[Briefings/Daily/YYYY-MM-DD]]` |

Rule: if the content has a note elsewhere in the vault, the daily note gets a link, not the content.

## Nothing leaves Obsidian without explicit user instruction

Draft all Teams messages, emails, Confluence pages, and Planner updates in Obsidian or as clearly-labelled drafts. Never send or publish without the user saying so in the current session.
