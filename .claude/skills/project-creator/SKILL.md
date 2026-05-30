---
name: project-creator
description: Break a large task or initiative into a structured project with scope, deliverables, WBS, dependencies, and effort estimate. Small projects (≤8 items) get a single Planner card. Larger ones get a full Planner plan with buckets and tasks, a Confluence project page, and an Excalidraw WBS diagram — with a full staged review before anything is pushed. Trigger phrases: "turn this into a project", "help me plan X", "create a project for Y".
when_to_use: Use when a task is too large to fit in a single Planner card and needs decomposition.
allowed-tools: "mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page mcp__svh-opsman__confluence_create_page mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_get_plan_details mcp__svh-opsman__planner_create_plan mcp__svh-opsman__planner_create_bucket mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__calendar_list_events"
---

# Project Creator

## Step 1 — Gather context

Run in parallel:
- `confluence_search_pages` — any existing docs for this project, system, or domain
- Read relevant Obsidian notes if the user mentions them
- `calendar_list_events` — any upcoming deadlines, reviews, or milestones already on the calendar
- `planner_list_plans` (IT Team group: `config.groups.it_team`) — check if a Planner plan for this project already exists before creating a new one
- List `Projects/` in the vault — check for a sibling project on the same topic; if one exists, ask whether this is a child work artifact (belongs in `Projects/Archive/` when complete) or a separate project

If a plan already exists, surface it and ask whether to extend it or build a parallel structure.

Also ask: **priority** — P1 (active focus), P2 (rolling, lower cadence), P3 (backlog/eval). Default P2 unless the conversation has already established otherwise. Day Starter uses this to drive stale-project flags (P1 at 7 days, P2 at 14, P3 silent).

## Step 2 — Structure the project

Work through these in order:

1. **Scope statement** — one paragraph: what this project delivers and what it explicitly does not
2. **Deliverables** — concrete, testable outputs (not activities). Each one should be falsifiable: "X is done when Y is true."
3. **WBS** — work breakdown structure. Decompose deliverables into tasks. Group tasks into phases or workstreams (these become Planner buckets). Aim for tasks that are 1–3 days of effort — smaller is trackable, larger needs splitting.
4. **Dependencies** — what must happen before each task; external blockers (vendor, access, budget)
5. **Effort estimate** — rough sizing per task (hours or days). Sum per phase and total.

## Step 3 — Route by size

**Small project (≤ 8 WBS items):**
- Single `planner_create_task` in IT Sysadmin Tasks with a checklist of all WBS items
- Obsidian note with scope and deliverables
- Skip Steps 4–6; write the draft card using the standard day-starter CREATE format

**Larger project (> 8 WBS items):**
Continue to Step 4.

## Step 4 — Draw the WBS diagram

Before writing the Obsidian note, create the Excalidraw diagram:
- Save to `Diagrams/Projects/[project-name].md`
- Show phases/buckets as swimlane rows or grouped zones
- Tasks as boxes inside their phase/bucket
- Dependencies as arrows between tasks
- Color: blue for in-scope tasks, grey for out-of-scope/deferred, red for blocked/dependent on external

Embed in the project note with `![[project-name.md]]`.

## Step 5 — Write the project note with staged draft

Write `Projects/[project-name].md`. Filename is kebab-case for new projects (PascalCase-kebab is also accepted for existing convention, e.g. `Network-Segmentation.md`).

```yaml
---
date: YYYY-MM-DD
skill: project-creator
status: active
tags: [project, project/<slug>, <domain-tags>]
priority: P1
planner_plan_id:
has_pending_tasks: true
---
```

**Frontmatter notes:**
- `status` — `active | on-hold | closed`. NOT the draft→filed lifecycle. New projects start `active`.
- `tags` — always include `project` and `project/<slug>` (kebab-case slug matching the filename). The `project/<slug>` tag is what lets meeting notes, change records, and incident notes backlink to this project via Dataview.
- `priority` — `P1 | P2 | P3` (see Step 1). Day Starter reads this for stale flags.
- `planner_plan_id` — leave empty until Step 7 executes and a plan is created; populate then.
- `has_pending_tasks: true` only while the staged Planner build at the bottom is unresolved. Step 7 sets it to `false` once all blocks are processed.

**Required section:** `## Scope`. **Strongly recommended:** Deliverables. Other sections grow organically from the work — do not force empty templates. The lived pattern (see `Projects/Network-Segmentation.md`) is fat working documents that accumulate standards, tables, and per-site progress as the project advances. Suggest sections during the interview; don't enforce them.

**Suggested sections (use what fits):**
- **Scope** — one paragraph (required)
- **Deliverables** — bulleted list, each falsifiable
- **WBS diagram** — `![[project-name.md]]` (if a WBS diagram was generated)
- **Dependencies** — table: Task → Depends on → Blocker type
- **Timeline** — phases with target dates
- **Reference / Standard** — for projects that encode a standard or reference table
- **Per-site progress** — for projects that roll out across multiple sites
- **Confluence link** — once created

Then append the full **staged draft block** at the bottom (see Step 6 format). The entire Planner build — plan, buckets, tasks — goes here as editable blocks for review before any API call.

## Step 6 — Staged Planner build format

**Nothing is created until Aaron explicitly confirms.** Write this section verbatim at the bottom of the note:

```
---

## 🚀 Staged Planner build

Review all blocks below. Edit any field directly in the note. To skip a bucket or task, change `CREATE` to `SKIP`. When ready: say "push the project" or "push [specific section]" to execute.

**Execution order is fixed: Plan → Buckets → Tasks.** After creation, task bucket_id is resolved from the bucket name — do not change bucket names after pushing the plan/buckets.

### CREATE PLAN
- **Title:** [project name]
- **Group:** IT Team (`config.groups.it_team`)

---

### CREATE BUCKET — [Phase/Workstream Name]
- **Order:** 1

### CREATE BUCKET — [Phase/Workstream Name]
- **Order:** 2

[...one block per bucket, ordered as they should appear left→right in Planner]

---

### CREATE TASK — [Task Title]
- **Bucket:** [Bucket name — must match a CREATE BUCKET name above]
- **Due:** YYYY-MM-DD
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Notes:** [1–2 sentences of context]
- **Checklist:**
  - [ ] [outcome phrase]
  - [ ] [outcome phrase]

[...one block per task]

---
```

## Step 7 — Execute on confirmation

When Aaron confirms ("push the project", "push it", "go ahead"):

Execute in strict sequence:
1. `planner_create_plan` (group_id: `config.groups.it_team`, title from the PLAN block) → record the returned `plan_id`, then update the project note's frontmatter `planner_plan_id:` field with this value via `edit_block`
2. For each `CREATE BUCKET` block (in order): `planner_create_bucket` (plan_id, name) → record the returned `bucket_id`, building a `name → id` map
3. For each `CREATE TASK` block: resolve `bucket_id` from the name map, then `planner_create_task` with all fields

After each successful block execution, remove that block from the note using `edit_block`. When all blocks are gone, remove the `## 🚀 Staged Planner build` section header and update `has_pending_tasks` to `false` in frontmatter.

If Aaron registers this as a tracked project for the day-starter Projects section, the `planner_plan_id` written to frontmatter is the value he'll paste into `.claude/config.yaml` under the project plan registry.

If Aaron confirms only a subset ("push just the buckets", "push Phase 1 tasks"), execute only those blocks and leave the rest staged.

### Partial confirmation handling

If creating the plan or a bucket fails, stop and report — do not attempt task creation against an unknown plan_id or bucket_id. Fix the failed step first, then continue.

## Step 8 — Confluence page (optional)

If Aaron asks to promote to Confluence:
- `confluence_search_pages` to find the right parent (IT projects space or INF)
- `confluence_create_page` with scope, deliverables, WBS table, and a link to the Planner plan
- Present as a draft block for review before creating
- Add the Confluence link to the `Projects/[project-name].md` note once published

## Step 9 — Skill log

Append one line to `System/skill-log.md` in the vault:
`YYYY-MM-DD HH:MM | project-creator | Projects/[project-name].md | [project name + size: small/large + Planner staged Y/N]`

## Closing the project

When the project is complete, run `/project-close` — it captures a retrospective, archives dated work artifacts under `Projects/Archive/`, sets `status: closed`, and prompts to close any open Planner tasks. Do not manually edit a project's `status` to `closed` — use the skill so the close-out is consistent.
