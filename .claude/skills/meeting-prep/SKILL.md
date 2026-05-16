---
name: meeting-prep
description: Meeting preparation and post-call notes. Before a meeting: pulls calendar event, Fathom history with same attendees, Confluence context, open Planner tasks, and produces a prep brief. After a recorded call: exports Fathom AI notes verbatim into an Obsidian meeting note and appends a line to the daily briefing. Trigger phrases: "prep me for [meeting/time]", "meeting prep for X", "pull notes from my [meeting] call".
when_to_use: Use before any meeting to prepare, or after a recorded call to file Fathom notes and suggest tasks.
allowed-tools: "mcp__svh-opsman__calendar_list_events mcp__svh-opsman__calendar_get_event mcp__svh-opsman__planner_list_plans mcp__svh-opsman__planner_list_tasks mcp__svh-opsman__planner_create_task mcp__svh-opsman__todo_list_tasks mcp__svh-opsman__todo_create_task mcp__svh-opsman__confluence_search_pages mcp__svh-opsman__confluence_get_page mcp__obsidian__* mcp__claude_ai_Fathom__* mcp__time__*"
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

### Step 1 — Resolve the recording
Use `get_recording_by_url` or `get_recording_by_call_id` if the user provides a URL or ID. Otherwise `list_meetings` / `search_meetings` to find the right recording. Note the `recording_id`.

### Step 2 — Fetch Fathom's output
Call `get_meeting_summary` with the `recording_id`. This returns Fathom's own AI-generated summary, action items, and notes — use this output **as-is**. Do not re-interpret, re-summarize, or re-extract. Embed the content verbatim.

### Step 3 — Write the note

Update (or create) `Meetings/YYYY-MM-DD-[meeting-name].md` with a post-call section:

```markdown
## Post-call notes
<!-- Fathom AI output — exported verbatim -->
[paste Fathom summary/notes here]
```

Then append a single line to today's daily note (`Briefings/Daily/YYYY-MM-DD.md`) under `# 📝 Notes`, using the `edit_block` insert-before-Day-Ender pattern from the Obsidian output conventions:

```markdown
- [[Meetings/YYYY-MM-DD-meeting-name]] — [one sentence: key topic and outcome]
```

If multiple calls are filed in one session, add one line per meeting. Full content stays in the meeting note — the daily note gets only the link. Never rewrite the daily note.

### Step 4 — Suggest tasks (drafts only)

If Fathom's summary includes action items, present them as draft `planner_create_task` or `todo_create_task` calls for review. Nothing creates without confirmation.

If the user asks for a follow-up email or Teams message to attendees, draft it in Aaron's voice following the `aaron-voice` rules. For a post-call recap to attendees, Template E (long-story-short narrative) is usually the right shape. Run the self-check before presenting. Nothing gets sent without explicit instruction.
