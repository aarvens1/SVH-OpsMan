---
name: diagram
description: Create or update an Excalidraw diagram in Obsidian. Accepts a description, rough sketch, or existing note and produces a visual using color, grouping, and layout to make it genuinely useful — not just a box-and-arrow dump. Trigger phrases: "diagram this", "draw this", "make an excalidraw", "visualize this", "sketch this out".
when_to_use: Use when a concept, system, process, or relationship would be clearer as a picture than as prose. Works for anything — architecture, workflows, timelines, org structures, comparisons.
allowed-tools: "mcp__obsidian__* mcp__excalidraw__* mcp__time__*"
---

# Diagram

## Step 1 — Understand what's being drawn

Parse the user's request for:
- **Subject** — what is being visualized (system, process, timeline, comparison, org chart, etc.)
- **Audience** — who will read this (Aaron only, team meeting, external)
- **Existing context** — any notes, diagrams, or descriptions to pull from
- **Output path** — where to save (default: `Diagrams/General/` — override if a more specific category fits)

Category paths:
| Type | Path |
|------|------|
| Network topology / site layout | `Diagrams/Network/` |
| Asset position | `Diagrams/Assets/` |
| Change impact | `Diagrams/Changes/` |
| Project WBS | `Diagrams/Projects/` |
| Process / workflow | `Diagrams/Process/` |
| Architecture / system design | `Diagrams/Architecture/` |
| Ad-hoc / general | `Diagrams/General/` |

If the user provides a path or name, use it exactly.

## Step 2 — Design before drawing

Before calling any Excalidraw tool, plan the diagram mentally:

1. **What are the nodes?** — every distinct thing that needs a box, circle, or label
2. **What are the relationships?** — arrows, groupings, containment, flows
3. **What's the hierarchy or reading order?** — left→right, top→bottom, inside→out
4. **What needs color?** — use color to communicate, not decorate (see palette below)
5. **What can be grouped?** — visually cluster related things with a background rectangle

Never produce a flat list of boxes connected by lines — that's not a diagram, it's a graph dump. Invest in layout.

## Step 3 — Color palette and visual language

Use color purposefully. Every color should mean something consistent within the diagram:

| Color | Meaning |
|-------|---------|
| 🔴 Red / `#e03131` | Critical, blocked, down, high risk |
| 🟠 Orange / `#e8590c` | Warning, degraded, medium risk |
| 🟢 Green / `#2f9e44` | Healthy, complete, approved |
| 🔵 Blue / `#1971c2` | Primary flow, selected path, your system |
| 🟣 Purple / `#7048e8` | External systems, third-party, cloud |
| 🟡 Yellow / `#f08c00` | Caution, in-progress, pending |
| ⬜ Light grey / `#f1f3f5` | Background grouping, out-of-scope, inactive |
| ⬛ Dark grey / `#495057` | Labels, annotations, secondary elements |

Shapes:
- **Rectangle** — systems, services, locations
- **Rounded rectangle** — users, roles, personas
- **Diamond** — decisions
- **Circle / ellipse** — events, triggers, endpoints
- **Cylinder** — databases, storage
- **Arrow** — flow direction; label arrows when the relationship isn't obvious
- **Background rectangle (no border, light fill)** — grouping / zone

Font sizes:
- Diagram title: 24px, bold
- Section/zone labels: 16px, bold
- Node labels: 14px
- Annotation text: 12px, italic

## Step 4 — Draw

Call the Excalidraw MCP tools to build the diagram. Work in this order:
1. Background grouping rectangles first (zones, swimlanes)
2. Primary nodes
3. Secondary nodes
4. Arrows and connectors
5. Labels and annotations
6. Title

Keep the canvas organized — align nodes to a grid, maintain consistent spacing. A cluttered diagram is worse than no diagram.

## Step 5 — Save and embed

Save to the determined path: `Diagrams/<category>/[name].excalidraw`

If there's a related Obsidian note (the user mentioned one, or the diagram category implies one), embed it:
```markdown
![[name.excalidraw]]
```

Write or update the note if appropriate. Do not create a standalone note just for the diagram — embed it where it belongs.

## Notes

- If the user says "update this diagram" or pastes an existing Excalidraw path, read the existing diagram first and modify rather than starting fresh.
- If the subject is a network topology, attack path, asset position, change impact, or project WBS, follow the more specific instructions in the relevant skill (network-troubleshooter, asset-investigation, change-record, project-creator). This skill is for everything else.
- If the user says "make it look good" or "creative" — use color grouping aggressively, vary shapes, and add a title and legend. A legend is especially useful when color carries meaning.
