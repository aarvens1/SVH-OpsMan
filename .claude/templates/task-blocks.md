# Task Block Formats — Canonical Reference

Applies in Morning Tasks and Evening Tasks sections of daily notes. Both day-starter and day-ender generate blocks using these formats. Nothing is created or changed until Aaron explicitly confirms.

## Default destinations

- **IT Sysadmin Tasks** (`config.planner.sysadmin`) — operational/sysadmin follow-ups, security findings, infrastructure issues
- **Personal To Do** — smaller personal action items not appropriate for the team board

## CREATE

```
#### CREATE — [task title]
- **Plan:** [plan name] (`plan_id`)
- **Bucket:** [bucket name or leave blank]
- **Due:** YYYY-MM-DD
- **Start:** [YYYY-MM-DD or leave blank]
- **Priority:** [Urgent / Important / Medium / Low]
- **Assigned:** Aaron Stevens
- **Tag:** Aaron (category23)
- **Notes:** [1–2 sentences of context. Process suggestions and approach notes go here, not in the checklist.]
- **Checklist:**
  - [ ] [outcome phrase, 5–10 words]
  - [ ] [outcome phrase]
  - [ ] [outcome phrase]
```

**Tag field** — default is `Aaron (category23)` for IT Sysadmin Tasks. For Sam: `Sam (category21)`. Category number must match the plan's label mapping — use `planner_get_plan_details` to verify on other plans.

**Priority mapping (Graph API integer):** Urgent=0, Important=1, Medium=3, Low=5.

**Checklist items** are outcomes, not steps. 3–5 max. Put process guidance in Notes.

**When pushing:** pass `priority` (integer), `notes`, `labels` (category key), and `checklist_items` in a single `planner_create_task` call.

## UPDATE

```
#### UPDATE — "[existing task title]"
- **Plan:** [plan name]
- **Change:** [what to update: new due date / set percentComplete to 100 / new assignee / etc.]
- **Notes:** [optional — reason for the update]
```

## TODO (personal To Do, not Planner)

```
#### TODO — [task title]
- **List:** [To Do list name — or leave blank for default]
- **Due:** [YYYY-MM-DD or leave blank]
- **Notes:** [1–2 sentences of context]
```

## REMOVE (discard draft, no action)

```
#### REMOVE — [task title or brief reason]
- **Reason:** [optional]
```

## IGNORE (discard draft, no action)

```
#### IGNORE — [task title or brief reason]
```

Same outcome as REMOVE — remove the block, no entry anywhere.

## CARRYOVER (defer to tomorrow)

```
#### CARRYOVER — [task title]
- **Reason:** [why it's being deferred]
```

Remove the full block. Add one line to a `### Deferred` subsection:
```
- 📌 **[task title]** — [reason]. Full context in [[Briefings/Daily/YYYY-MM-DD]].
```

Step 2b of day-starter reads the `### Deferred` list from yesterday's note at carry-forward time.

## Processing and cleanup

After Aaron confirms and you execute any block (CREATE pushed, UPDATE pushed, TODO pushed, REMOVE/IGNORE discarded, CARRYOVER deferred): remove that subsection from the daily note using `edit_block`. When all action blocks in the section have been processed (only `### Deferred` may remain), remove the section header if nothing remains.

If any blocks remain unprocessed at end of session, update `has_pending_tasks: true` in the daily note frontmatter via `edit_block`.
