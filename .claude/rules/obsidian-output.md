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

Exceptions:
- **Projects (indexes):** `status: active | on-hold | closed` — not the draft/filed lifecycle
- **Reference/infrastructure docs:** `status: active` — these are living docs, always current
- **Archived work artifacts:** `status: archived` — also add `archived` to the tags array

Extra fields by note type:
- **Incidents:** `incident_id: INC-YYYY-NNN`, `severity: critical|high|medium|low`, `status: open|contained|closed`
- **Changes:** `change_id: CHG-YYYY-NNN`, `risk: low|medium|high`, `window: YYYY-MM-DD HH:MM – HH:MM`, `change_date: YYYY-MM-DD` (clean date for Bases calendar view — same day as the window start)
- **Vulnerabilities:** `cve: CVE-YYYY-NNNNN`, `priority: emergency|this-week|next-cycle|accept`
- **Assets:** `asset_type: server|workstation|user`, `ninja_device_id: <id>` (if in NinjaOne), `mde_machine_id: <id>` (if in Defender)
- **Daily briefings:** `has_pending_tasks: true|false` — set to `true` if the note contains draft Planner actions that were not pushed during the session
- **Weekly briefings:** `week: YYYY-WW`
- **Meetings:** `attendees: [Name, Name]`
- **Projects:** `priority: P1|P2|P3` (drives Day Starter stale flags — P1 ≥ 7d, P2 ≥ 14d, P3 silent), `planner_plan_id: <id>` (optional — populated by `/project-creator` Step 7 if a Planner plan is created), `has_pending_tasks: true|false` (same semantics as briefings — true while staged Planner build blocks remain in the note)

### Project tag convention

Projects use a `project/<slug>` tag in their frontmatter (e.g. `project/network-segmentation` for `Projects/Network-Segmentation.md`). This tag is the cross-reference glue:

- Meeting notes, change records, and incident notes can optionally include the same tag when they touch a project (the creating skills prompt for this).
- Dataview query `FROM #project/<slug>` returns every note touching the project — no manual indexing required.
- Slug is the kebab-case form of the project filename. One slug per project. Tag the project note itself with its own slug.

## MOC layer

Every major folder has a `folder-home.md` MOC. These are the entry points — link to them, not to the raw folder path. When a skill creates a note in a folder, it should link the new note back to that folder's MOC in its **Related** section.

| Folder | MOC |
|--------|-----|
| Vault root | `home.md` |
| `Briefings/` | `Briefings/briefings-home.md` |
| `Assets/` | `Assets/assets-home.md` |
| `Infrastructure/` | `Infrastructure/infrastructure-home.md` |
| `Sites/` | `Sites/sites-home.md` |
| `Projects/` | `Projects/projects-home.md` |
| `Meetings/` | `Meetings/meetings-home.md` |
| `Incidents/` | `Incidents/incidents-home.md` |
| `Investigations/` | `Investigations/investigations-home.md` |
| `Changes/` | `Changes/changes-home.md` |
| `Vulnerabilities/` | `Vulnerabilities/vulnerabilities-home.md` |
| `Reviews/` | `Reviews/reviews-home.md` |
| `Skills/` | `Skills/index.md` |

**When to add a new note to a MOC:** The following MOCs are self-maintaining via Dataview and require no manual updates when new notes are added — Briefings, Meetings, Incidents, Investigations. For all other MOCs (Projects, Assets, Changes, Vulnerabilities, Reviews), manually add a row when creating a new note.

## Dataview

Dataview is installed and enabled. Use it in MOC files to replace manual tables with live queries.

**Installed plugins:** Dataview, Excalidraw, Local REST API, ExcaliBrain, Collapsible Code Blocks, Floating Headings, Collapse All

**Key patterns:**

```dataview
TABLE date as "Date", severity as "Severity"
FROM "Incidents/Active"
SORT date DESC
```

```dataview
TABLE date as "Date", tags as "Tags"
FROM "Investigations"
WHERE file.folder = "Investigations" AND status = "draft"
SORT date DESC
```

```dataview
TABLE date as "Date", attendees as "Attendees"
FROM "Meetings"
WHERE file.name != "meetings-home"
SORT date DESC
```

**Status values by note type (for WHERE clauses):**
- Investigations: `status: draft` (active) → `status: filed` (resolved). NOT "In progress" — use `draft`.
- Incidents: location-based — `Incidents/Active/` = open; no `WHERE status` filter needed.
- Projects: `status: active | on-hold | closed`
- Assets/Infrastructure/Sites: `status: active` always (living docs)

**Project tag queries:** `FROM #project/network-segmentation` returns all notes tagged with that project slug — no manual cross-referencing needed.

## Vault paths

| Content | Path |
|---------|------|
| Day Starter / Day Ender | `Briefings/Daily/YYYY-MM-DD.md` |
| Week Starter / Week Ender | `Briefings/Weekly/YYYY-WW.md` |
| Incidents (open/contained) | `Incidents/Active/YYYY-MM-DD-name.md` |
| Incidents (closed) | `Incidents/Closed/YYYY-MM-DD-name.md` |
| Investigations | `Investigations/` |
| Changes | `Changes/CHG-YYYY-NNN.md` |
| Meetings | `Meetings/YYYY-MM-DD-name.md` |
| Assets | `Assets/[name].md` (persistent — update in place) |
| Projects (indexes) | `Projects/[ProjectName].md` (evergreen — update in place) |
| Project work artifacts | `Projects/Archive/slug-YYYY-MM-DD.md` (dated, archived when phase closes) |
| Initiatives | No separate folder — use a shared `project/<initiative-slug>` tag across related project notes. An initiative is just a Dataview query away. |
| Access reviews | `Reviews/Access/YYYY-MM-DD-access-review.md` |
| Patch reviews | `Reviews/Patches/YYYY-MM-DD-patch-review.md` |
| Task triage / reviews | `Reviews/Tasks/YYYY-MM-DD-triage.md` |
| Vulnerabilities | `Vulnerabilities/CVE-YYYY-NNNNN.md` |
| Research (filed Gemini search output) | `Research/YYYY-MM-DD-<slug>.md` (filed via `/import-research`) |
| S2D cluster health snapshots | `Infrastructure/s2d-cluster-health-YYYY-MM-DD.md` |
| Excalidraw diagrams | `Diagrams/<category>/[name].md` |
| Skill reference pages | `Skills/[skill-name].md` (persistent — update in place) |

## File naming conventions

| Folder | Convention | Example |
|--------|-----------|---------|
| `Infrastructure/` | kebab-case | `kemp-load-balancer.md` |
| `Assets/` | UPPERCASE device name | `ACCOCOLOKEMP.md` |
| `Sites/` | PascalCase or kebab-case | `ACCO-Colo.md` |
| `Projects/` (indexes) | PascalCase-kebab | `Network-Segmentation.md` |
| `Projects/Archive/` | `slug-YYYY-MM-DD.md` (date at end) | `network-snapshot-pdx-2026-05-17.md` |
| `Briefings/`, `Incidents/`, `Investigations/`, `Meetings/` | `YYYY-MM-DD-slug.md` (date first — calendar-indexed) | `2026-05-29-cmdb-audit.md` |
| `Handoffs/` | `YYYY-MM-DD-HHMM-slug.md` (no colon in time) | `2026-05-27-1503-mcp-test.md` |

**General rule:** No spaces in filenames anywhere. Prefer lowercase or kebab-case for new files. Existing Asset/Site names that are already established don't need to be changed.

**Handoffs folder:** Written by `/code-handoff`. Creates a sanitized spec note for Claude Dev — review in vault, then paste into a `claude-dev` session.

## Diagrams

For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than a prose description. Save to `Diagrams/<category>/` and embed with `![[filename.md]]`.

**File extension rule:** All Excalidraw files must use `.md` extension, never `.excalidraw`. Correct: `FGT-Site-Topology.md`. Wrong: `FGT-Site-Topology.excalidraw`.

**Full diagram spec:** See `.claude/rules/excalidraw.md` — color palette, AP style, client count indicators, arrow weights, file wrapper format, and Python generation approach.

## Visual style

See `.claude/rules/note-patterns.md` for the full design spec: functional emoji suite, callout usage, table conventions, and prose tone rules. Apply these to all skill output.

## Daily note write mode

Daily notes have three fixed top-level sections: `# Day Starter`, `# Activity Log`, `# Day Ender`. The Day Ender is always the last section. No emojis in top-level section headers.

The `# Activity Log` section is a pure work log. Its placeholder text should be: "*Timestamped work log — investigation links, meeting summaries, findings, and decisions.*"

**Day Starter** — written once at the start of day using `mode: rewrite`. Creates the initial three-section structure. The initial write populates `# Day Starter` content and a `### Staged Tasks — HH:MM` subsection inside `# Day Ender` (not the Activity Log).

**Day Ender** — adds any EOD task blocks to `### Staged Tasks` in the `# Day Ender` section via `edit_block`, then processes all staged tasks in one pass, then appends the close-out narrative to the end of the file using `mode: append`.

**Mid-day additions** — Free-form notes (investigation links, meeting summaries, findings) are inserted into the `# Activity Log` using `edit_block` targeting the `<!-- DAY-STARTER-END -->` sentinel.
- `old_string`: `<!-- DAY-STARTER-END -->`
- `new_string`: `<!-- DAY-STARTER-END -->\n\n[new content]`

Draft tasks created mid-day go into `### Staged Tasks` in the `# Day Ender` section, not the Activity Log.

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
