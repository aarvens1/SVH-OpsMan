---
name: project-close
description: Close out a project — capture a retrospective, archive dated work artifacts under Projects/Archive/, set status to closed, and prompt to close any open Planner tasks. Trigger phrases: "close the [name] project", "wrap up project X", "project close", "close out [project]".
when_to_use: Use when a project is complete and ready to be retired from active rotation. Do not manually edit a project note's status field — use this skill so the close-out is captured consistently and dated artifacts land in Archive.
allowed-tools: "mcp__svh-opsman__planner_get_plan mcp__svh-opsman__planner_get_plan_details mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_get_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page"
---

# Project Close

## Step 1 — Pick the project

If the user named the project in the invocation ("close the Network Segmentation project"), use that. Otherwise list every note in `Projects/` (NOT `Projects/Archive/`) where frontmatter has `status: active` or `status: on-hold`, and ask which to close.

Read the chosen project note end-to-end. Note: the project's slug (`project/<slug>` tag) — you'll need it for the artifact sweep. Also note any `planner_plan_id` in frontmatter.

## Step 2 — Retrospective

Ask Aaron four questions. Capture each answer as 1–3 lines, no rewriting. These are his words — do not paraphrase.

1. **What shipped?** — concrete outcomes delivered
2. **What didn't?** — scope that was cut, deferred, or never happened
3. **What surprised us?** — unexpected discoveries, gotchas, vendor behavior
4. **What would we do differently next time?** — process or technical lessons

Append the answers to the project note as a new section at the bottom, immediately before any staged Planner build remnant:

```markdown
## Closure Retrospective — YYYY-MM-DD

**What shipped**
[Aaron's words]

**What didn't**
[Aaron's words]

**What surprised us**
[Aaron's words]

**What would we do differently**
[Aaron's words]
```

If any answer is empty ("nothing surprising," "everything shipped"), still write the heading with that single line. Empty sections are signal.

## Step 3 — Artifact sweep

Find every dated work artifact tied to this project. Look in three places:

1. **`Projects/Archive/`** — files matching `<slug>-YYYY-MM-DD.md` or that wikilink-reference this project. If they're already in Archive, no action needed — note them as already archived in the closure record.
2. **`Projects/` (root)** — sibling files that are dated work products of this project (e.g. for Network-Segmentation: `EUG-Network-Plan-2026-05-25.md`, `PDX-Network-Plan-2026-05-25.md`, `SEA-Network-Plan-2026-05-25.md`, `Fought-Network-Plan.md`). Identify by `project/<slug>` tag, by skill field, or by topical filename + the user's confirmation. List them and propose archive-vs-delete per the table below.
3. **Files wikilinked from the project's `## Artifacts` section** (or referenced inline).

**Archive-vs-delete decision (apply per file, confirm with Aaron on each):**

| Artifact type | Action | Reason |
|---|---|---|
| Baseline / "before" snapshot (network map, inventory, config dump) | **Archive** | Forensic value — "what did it look like before we changed it" |
| Completed phase deliverable (signed plan, ratified design, sent proposal) | **Archive** | Historical record of decisions |
| Vendor evaluation matrix (with decision) | **Archive** | Future eval cycles want to see this |
| Diagram tied to a specific point-in-time state | **Archive** (in `Diagrams/`; project note links to it) | Same as snapshot |
| Rough draft, scratch outline, scaffolding | **Delete** | No reader will benefit |
| Superseded version of a living doc | **Delete** | Git history is the audit trail |
| Investigation that resolved into a change record | **Delete or merge into change** | The change record is the durable artifact |
| Failed approach / dead end | **Archive with retrospective note** | "We tried X and it didn't work because Y" is high-value |

**For each Archive action:**
- Move the file from `Projects/` to `Projects/Archive/`. Filename should already follow `slug-YYYY-MM-DD.md` (date at end). If it doesn't, rename during the move.
- Update the archived file's frontmatter: `status: archived` and add `archived` to the tags array. Preserve all other fields.
- The original `[[Projects/X-Filename]]` wikilink will break — update the project index note to point at the new `[[Projects/Archive/X-Filename]]` path.

**For each Delete action:** confirm explicitly with Aaron before deleting. Once confirmed, delete the file.

If a file's category isn't obvious from the table, show it to Aaron with a recommended action and the reason.

## Step 4 — Update project frontmatter

Update the project note's frontmatter via `edit_block`:
- `status: closed`
- Drop `has_pending_tasks` if present and `true` (closure assumes no staged work remains; if it does, surface it as a blocker in Step 6 instead of closing)
- Preserve all other fields

The project note itself stays in `Projects/` root — closed projects remain discoverable, just marked closed. They are NOT moved to Archive. Only dated work artifacts move.

## Step 5 — Planner close-out (if applicable)

If the frontmatter has `planner_plan_id` set:

1. `planner_get_plan_details` for that plan — list every open task.
2. Present open tasks to Aaron as a draft block:

```
### Planner close-out — [Plan Name]

Open tasks in this plan. For each: confirm CLOSE (mark 100%), KEEP-OPEN (leave alone), or REASSIGN to another plan.

#### CLOSE — [task title] (task_id: xxx)
- Bucket: [name]
- Reason: [why we're calling it done]

#### KEEP-OPEN — [task title] (task_id: xxx)
- Reason: [why this stays open even though the project is closed]
```

3. Nothing is closed until Aaron says push it. On confirmation, for each CLOSE block: `planner_update_task` with `percent_complete: 100`. KEEP-OPEN tasks stay untouched. After execution, remove the block from the project note.

If a Planner plan has only completed and closed tasks: note that and move on, no action needed.

## Step 6 — Backlink scan

Search the vault for `[[Projects/<Project-Name>]]` references. Surface the list to Aaron — these are notes that link to the now-closed project. Do not auto-update them; just show the list so Aaron can decide if any need a note added ("project closed YYYY-MM-DD") or a link redirected.

Common locations to expect backlinks: `Sites/`, `Assets/`, `Changes/`, `Meetings/`, daily briefings.

## Step 7 — Activity log

Append a closure line to today's daily note (`Briefings/Daily/YYYY-MM-DD.md`) in the `# Activity Log` section using the `<!-- DAY-STARTER-END -->` sentinel pattern:

```markdown
✅ Closed project [[Projects/<Project-Name>]] — [one-sentence summary of what shipped]
```

If today's daily note doesn't exist yet, skip this step.

## Step 8 — Skill log

Append one line to `System/skill-log.md`:
`YYYY-MM-DD HH:MM | project-close | Projects/<Project-Name>.md | closed — N artifacts archived, M deleted, K Planner tasks closed`

## Output summary

Report to Aaron at the end:
- Project note path + new `status: closed`
- Artifacts archived (count + list)
- Artifacts deleted (count + list)
- Planner tasks closed (count) or "no Planner plan registered"
- Backlinks found (count) — left for manual review
