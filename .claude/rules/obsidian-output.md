# Obsidian output conventions

These apply whenever Claude writes a note to the Obsidian vault.

## Vault root path

**Always use:** `/mnt/c/Users/astevens/vaults/OpsManVault`

This is the live Windows vault that Obsidian reads. The WSL mirror at `/home/wsl_stevens/vaults/OpsManVault` is a read-only sync target — never write to it. When a skill says "read from the Obsidian vault" or "write to the vault", resolve the full path by prepending the vault root above. Do not use `find` to locate vault files — use the explicit path.

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
- **Assets:** `asset_type: server|workstation|user`, `ninja_device_id: <id>` (if in NinjaOne), `mde_machine_id: <id>` (if in Defender)
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
| Task triage / reviews | `Reviews/Tasks/YYYY-MM-DD-triage.md` |
| Vulnerabilities | `Vulnerabilities/` |
| Excalidraw diagrams | `Diagrams/<category>/[name].md` |
| Skill reference pages | `Skills/[skill-name].md` (persistent — update in place) |

## Diagrams

For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than a prose description. Save to `Diagrams/<category>/` and embed with `![[filename.md]]`.

**File extension rule:** All Excalidraw files must use `.md` extension, never `.excalidraw`. Correct: `FGT-Site-Topology.md`. Wrong: `FGT-Site-Topology.excalidraw`.

**Full diagram spec:** See `.claude/rules/excalidraw.md` — color palette, AP style, client count indicators, arrow weights, file wrapper format, and Python generation approach.

## Visual style

See `.claude/rules/note-patterns.md` for the full design spec: functional emoji suite, callout usage, table conventions, and prose tone rules. Apply these to all skill output.

## Daily note write mode

Daily notes have three fixed top-level sections: `# Day Starter`, `# Activity Log`, `# Day Ender`. The Day Ender is always the last section. No emojis in top-level section headers.

The `# Activity Log` section replaces the former `# Notes` section. Its placeholder text should be: "*Task drafts (morning and evening), resolutions, mid-day findings, and investigation links. Structured by generation time.*"

**Day Starter** — written once at the start of day using `mode: rewrite`. This creates the initial structure including the `# Day Starter`, `# Activity Log`, and `# Day Ender` headers. The initial write populates the `# Day Starter` content and the `### Morning Tasks` subsection within the `# Activity Log`.

**Day Ender** — appended at end of day. The `day-ender` skill first injects `### Evening Tasks` into the `# Activity Log` via `edit_block`, then appends the close-out narrative to the end of the file using `mode: append`.

**Mid-day additions** — Free-form notes (e.g., investigation links, meeting summaries) are inserted into the `# Activity Log` using `edit_block` targeting the `<!-- DAY-STARTER-END -->` sentinel. This places them after the Day Starter content but before the task blocks.
- `old_string`: `<!-- DAY-STARTER-END -->`
- `new_string`: `<!-- DAY-STARTER-END -->\n\n[new content]`

Draft tasks created mid-day should be added to the appropriate `### Morning Tasks` or `### Evening Tasks` subsection.

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
