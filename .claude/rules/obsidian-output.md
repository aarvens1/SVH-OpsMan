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
- **Changes:** `change_id: CHG-YYYY-NNN`, `risk: low|medium|high`, `window: YYYY-MM-DD HH:MM – HH:MM`
- **Vulnerabilities:** `cve: CVE-YYYY-NNNNN`, `priority: emergency|this-week|next-cycle|accept`

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

## Nothing leaves Obsidian without explicit user instruction

Draft all Teams messages, emails, Confluence pages, and Planner updates in Obsidian or as clearly-labelled drafts. Never send or publish without the user saying so in the current session.
