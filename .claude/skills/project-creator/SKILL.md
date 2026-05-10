---
name: project-creator
description: Break a large task or initiative into a structured project with scope, deliverables, WBS, dependencies, and effort estimate. Small projects (≤8 items) get a single Planner card. Larger ones get a full Planner plan with buckets, a Confluence project page, and an Excalidraw WBS diagram. Trigger phrases: "turn this into a project", "help me plan X", "create a project for Y".
when_to_use: Use when a task is too large to fit in a single Planner card and needs decomposition.
allowed-tools: "mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page mcp__svh-opsman__confluence_create_page mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_create_plan mcp__svh-opsman__planner_create_bucket mcp__svh-opsman__planner_create_task mcp__svh-opsman__calendar_list_events mcp__obsidian__* mcp__excalidraw__* mcp__time__*"
---

# Project Creator

## Step 1 — Gather context

Search for existing context before structuring:
- `confluence_search_pages` — any existing docs for this project or system
- Read relevant Obsidian notes if mentioned
- `calendar_list_events` — any upcoming deadlines or review meetings

## Step 2 — Produce the project structure

Work through these in order:

1. **Scope statement** — one paragraph: what this project delivers and what it does not
2. **Deliverables** — concrete, testable outputs (not activities)
3. **WBS** — work breakdown structure, hierarchical task decomposition
4. **Dependencies** — what must happen before each task, external blockers
5. **Effort estimate** — rough sizing per task (hours or days), total

## Step 3 — Route by size

**Small project (≤ 8 WBS items):**
- Single `planner_create_task` with a checklist of items
- Obsidian note with scope and deliverables

**Larger project (> 8 WBS items):**
- `planner_create_plan` named for the project
- `planner_create_bucket` per phase or workstream
- `planner_create_task` per WBS item with due dates and notes
- `confluence_create_page` — project page in the IT space with scope, deliverables, WBS table, and link to Planner
- Excalidraw WBS diagram saved to `Diagrams/Projects/[project-name].excalidraw`

Embed the WBS diagram in the Obsidian note with `![[project-name.excalidraw]]`.

Present Planner tasks and Confluence page as drafts for review. Nothing creates until the user confirms.

## Output

Write `Projects/[project-name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Project Creator
status: draft
tags: [project]
---
```

Sections: Scope → Deliverables → WBS (with links to Planner tasks) → Dependencies → Timeline → Confluence link.
