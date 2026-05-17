---
name: project-creator
description: Break a large task or initiative into a structured project with scope, deliverables, WBS, dependencies, and effort estimate. Small projects (≤8 items) get a single Planner card. Larger ones get a full Planner plan with buckets and tasks, a Confluence project page, and an Excalidraw WBS diagram — with a full staged review before anything is pushed. Trigger phrases: "turn this into a project", "help me plan X", "create a project for Y".
when_to_use: Use when a task is too large to fit in a single Planner card and needs decomposition.
allowed-tools: "mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page mcp__svh-opsman__confluence_create_page mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_get_plan_details mcp__svh-opsman__planner_create_plan mcp__svh-opsman__planner_create_bucket mcp__svh-opsman__planner_create_task mcp__svh-opsman__planner_update_task mcp__svh-opsman__calendar_list_events mcp__obsidian__* mcp__excalidraw__* mcp__time__*"
---

# Project Creator

## Step 1 — Gather context

Run in parallel:
- `confluence_search_pages` — any existing docs for this project, system, or domain
- Read relevant Obsidian notes if the user mentions them
- `calendar_list_events` — any upcoming deadlines, reviews, or milestones already on the calendar
- `planner_list_plans` (IT Team group: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`) — check if a Planner plan for this project already exists before creating a new one

If a plan already exists, surface it and ask whether to extend it or build a parallel structure.

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
- Save to `Diagrams/Projects/[project-name].excalidraw`
- Show phases/buckets as swimlane rows or grouped zones
- Tasks as boxes inside their phase/bucket
- Dependencies as arrows between tasks
- Color: blue for in-scope tasks, grey for out-of-scope/deferred, red for blocked/dependent on external

Embed in the project note with `![[project-name.excalidraw]]`.

## Step 5 — Write the project note with staged draft

Write `Projects/[project-name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Project Creator
status: draft
tags: [project]
has_pending_tasks: true
---
```

Sections:
- **Scope** — one paragraph
- **Deliverables** — bulleted list
- **WBS diagram** — `![[project-name.excalidraw]]`
- **Dependencies** — table: Task → Depends on → Blocker type
- **Timeline** — phases with target dates
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
- **Group:** IT Team (`1acb76b4-f2eb-42fc-8ae3-3b2262277516`)

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
1. `planner_create_plan` (group_id: `1acb76b4-f2eb-42fc-8ae3-3b2262277516`, title from the PLAN block) → record the returned `plan_id`
2. For each `CREATE BUCKET` block (in order): `planner_create_bucket` (plan_id, name) → record the returned `bucket_id`, building a `name → id` map
3. For each `CREATE TASK` block: resolve `bucket_id` from the name map, then `planner_create_task` with all fields

After each successful block execution, remove that block from the note using `edit_block`. When all blocks are gone, remove the `## 🚀 Staged Planner build` section header and update `has_pending_tasks` to `false` in frontmatter.

If Aaron confirms only a subset ("push just the buckets", "push Phase 1 tasks"), execute only those blocks and leave the rest staged.

### Partial confirmation handling

If creating the plan or a bucket fails, stop and report — do not attempt task creation against an unknown plan_id or bucket_id. Fix the failed step first, then continue.

## Step 8 — Confluence page (optional)

If Aaron asks to promote to Confluence:
- `confluence_search_pages` to find the right parent (IT projects space or INF)
- `confluence_create_page` with scope, deliverables, WBS table, and a link to the Planner plan
- Present as a draft block for review before creating
- Add the Confluence link to the `Projects/[project-name].md` note once published
