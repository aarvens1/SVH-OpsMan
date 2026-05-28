---
name: diagram
description: Create or update an Excalidraw diagram in Obsidian. Accepts a description, rough sketch, or existing note and produces a visual using color, grouping, and layout to make it genuinely useful — not just a box-and-arrow dump. Trigger phrases: "diagram this", "draw this", "make an excalidraw", "visualize this", "sketch this out".
when_to_use: Use when a concept, system, process, or relationship would be clearer as a picture than as prose. Works for anything — architecture, workflows, timelines, org structures, comparisons.
allowed-tools: "mcp__svh-opsman__* mcp__desktop-commander__*"
---

# Diagram

**Full visual spec:** `.claude/rules/excalidraw.md` — color palette, file format, client count indicators, arrow weights, AP style, Python generation approach. Read it before drawing anything.

## Step 1 — Understand what's being drawn

Parse the user's request for:
- **Subject** — what is being visualized (system, process, timeline, comparison, network, org chart, etc.)
- **Audience** — who will read this (Aaron only, team meeting, external)
- **Existing context** — any notes, diagrams, or data to pull from
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

## Step 2 — Design before drawing

Before writing any code, plan the diagram:

1. **What are the nodes?** — every distinct thing that needs a box, circle, or label
2. **What are the relationships?** — arrows, groupings, containment, flows
3. **What's the hierarchy or reading order?** — left→right, top→bottom, inside→out
4. **What needs color?** — use color to communicate, not decorate
5. **What can be grouped?** — visually cluster related things with a background rectangle

Never produce a flat list of boxes connected by lines — that's not a diagram, it's a graph dump. Invest in layout.

## Step 3 — Color palette

**Network topology diagrams:** Use the exact palette from `.claude/rules/excalidraw.md` (device role → hex code). Do not improvise.

**All other diagrams** — use these semantic colors:

| Color | Meaning |
|-------|---------|
| Red `#e03131` | Critical, blocked, down, high risk |
| Orange `#e8590c` | Warning, degraded, medium risk |
| Green `#2f9e44` | Healthy, complete, approved |
| Blue `#1971c2` | Primary flow, selected path, your system |
| Purple `#7048e8` | External systems, third-party, cloud |
| Yellow `#f08c00` | Caution, in-progress, pending |
| Light grey `#f1f3f5` | Background grouping, out-of-scope, inactive |
| Dark grey `#495057` | Labels, annotations, secondary elements |

Shapes:
- **Rectangle** — systems, services, locations
- **Rounded rectangle** — users, roles, personas
- **Diamond** — decisions
- **Circle / ellipse** — events, triggers, endpoints
- **Background rectangle (no border, light fill)** — grouping / zone

Font sizes: title 20pt · zone labels 14pt · node labels 11pt · annotations 8pt

## Step 4 — Generate via Python script

**Always use a Python script to build the Excalidraw JSON.** Do not hand-craft element coordinates for more than ~5 elements. Do not use Excalidraw MCP tools — they can't be reviewed before saving.

Script pattern (see full helpers in `.claude/rules/excalidraw.md`):

```python
import json

elements = []
_eid = 0

def nid(): ...       # auto-incrementing ID
def rct(...): ...    # rectangle
def txt(...): ...    # text label
def arw(...): ...    # arrow
def ell(...): ...    # ellipse

# build elements...

diagram = {
    "type": "excalidraw", "version": 2,
    "source": "https://excalidraw.com",
    "elements": elements,
    "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"}
}
```

After building, wrap and write using the Obsidian Excalidraw markdown format (frontmatter + `%%` delimiters + ` ```json ` block). See `.claude/rules/excalidraw.md` for the exact wrapper.

After writing: validate JSON, print element count + bounding box.

## Step 5 — Save and embed

- File extension: always `.md`, never `.excalidraw`
- Path: `Diagrams/<category>/[name].md`
- Embed in related notes with `![[name.md]]`

## Notes

- If the user says "update this diagram", read the existing file first — parse the JSON from inside the `%%` block and modify rather than starting fresh.
- If a network diagram, pull live data (UniFi, NinjaOne) before drawing — don't approximate topology.
- Add a legend whenever color carries meaning. A legend-less diagram is incomplete.
- A cluttered diagram is worse than no diagram — prefer two clear diagrams over one dense one.
