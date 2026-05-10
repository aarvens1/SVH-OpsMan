---
name: meeting-prep
description: Meeting preparation and post-call notes. Before a meeting: pulls calendar event, Fathom history with same attendees, Confluence context, open Planner tasks, and produces a prep brief. After a recorded call: fetches Fathom transcript, extracts decisions and action items, and structures into an Obsidian note with suggested tasks. Trigger phrases: "prep me for [meeting/time]", "meeting prep for X", "pull notes from my [meeting] call".
when_to_use: Use before any meeting to prepare, or after a recorded call to structure notes and extract action items.
allowed-tools: "mcp__svh-opsman__calendar_list_events mcp__svh-opsman__calendar_get_event mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_create_task mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page mcp__obsidian__* mcp__fathom__* mcp__time__*"
---

# Meeting Prep

## Route: Before a meeting

### Step 1 — Get the event
`calendar_list_events` to find today's or upcoming meetings. `calendar_get_event` for the target meeting — get attendees, location/link, and any attached agenda.

### Step 2 — Pull context
Run in parallel:
- **Fathom** — search past recordings with the same attendees or organisation. Any open action items from the last call?
- `confluence_search_pages` — any docs related to this meeting's topic or the attendee's org.
- Obsidian — read any existing meeting notes for this recurring meeting or vendor.
- `planner_list_tasks` — any open tasks assigned to or from the attendees.

### Step 3 — Produce prep brief

Write `Meetings/YYYY-MM-DD-[meeting-name].md`:

```yaml
---
date: YYYY-MM-DD
skill: Meeting Prep
status: draft
tags: [meeting, prep]
---
```

Sections:
- **Meeting details** — time, attendees, location/link
- **Context** — what this relationship is, last interaction, open threads
- **Open items** — action items from last call, tasks due
- **Suggested agenda** — blank template to fill in during the call
- **Questions to raise** — anything that needs answering

---

## Route: After a recorded call

### Step 1 — Fetch the transcript
Use Fathom to get the transcript and summary for the call. Identify: meeting name, attendees, date.

### Step 2 — Extract and structure

From the transcript, pull:
- **Decisions made** — what was agreed
- **Action items** — who owns what, by when
- **Key information** — facts, numbers, context worth keeping
- **Open questions** — things that came up but weren't resolved

### Step 3 — Write and suggest tasks

Update (or create) `Meetings/YYYY-MM-DD-[meeting-name].md` with a post-call section.

Suggest action items as `planner_create_task` or `todo_create_task` entries — presented as drafts for review. Nothing creates without confirmation.
