---
name: backlink-update
description: Targeted backlink auditor for the Obsidian vault. Checks outbound wikilinks in recently changed (or specified) files and adds missing return links to their targets. Scoped to structural folders (Assets/, Sites/, Infrastructure/) only — never touches Briefings, Incidents, or Investigations. Trigger phrases: "update backlinks", "check backlinks", "fix backlinks", "backlink audit".
when_to_use: Run after a session where you've created or moved notes in Assets/, Sites/, or Infrastructure/. Not a full vault re-index — scoped to changed files only.
allowed-tools: "Bash Read Edit Write"
---

# Backlink Update

## When to Run

Run at the end of any session where you:
- Created new notes in Assets/, Sites/, or Infrastructure/
- Moved or renamed notes in those folders
- Added a new Related section to an existing note

Do NOT run automatically on every write — it's meant as a deliberate, post-session step.

## Scope

Only structural notes participate in bidirectional backlinks:
- `Assets/` — per-device notes
- `Sites/` — per-site notes
- `Infrastructure/` — reference docs

Excluded (outbound-only, no return link needed):
- `Briefings/` — daily/weekly notes are reference consumers, not targets
- `Incidents/` — transient
- `Investigations/` — transient
- `Meetings/`, `Changes/`, `Reviews/`, `Projects/` — same

## Determining Scope

### Default (no argument)
Find vault notes modified in the last 24 hours in structural folders:
```bash
find /mnt/c/Users/astevens/vaults/OpsManVault/{Assets,Sites,Infrastructure} \
  -name "*.md" -mmin -1440 | sort
```

### With argument
Argument can be:
- A specific file path (relative or absolute in the vault)
- A folder name (`Assets`, `Sites`, `Infrastructure`)
- A comma-separated list of file names

## Algorithm

For each source file in scope:

**Step 1: Extract outbound wikilinks**
```bash
grep -oP '\[\[([^\]|#]+)' source.md | sed 's/\[\[//'
```
This gives you link targets like `Assets/ACCOCOLOKEMP`, `Infrastructure/kemp-load-balancer`, `Sites/ACCO-Colo`.

**Step 2: Filter to structural targets only**
Keep links that start with `Assets/`, `Sites/`, or `Infrastructure/`.

**Step 3: For each structural target, check for return link**
```bash
grep -l "SourceName\|SourcePath" target.md
```
Check for both the full path (`[[Assets/ACCOCOLOKEMP]]`) and the bare name (`ACCOCOLOKEMP`) in the target file.

**Step 4: Add missing backlink**
If the return link is absent, add it to the appropriate section:

- **Target is an Asset note** → add bullet to Ops Notes section, before `## Recent Activity`:
  ```
  - Infrastructure doc: [[Infrastructure/X]]   ← if source is Infrastructure/
  - Site: [[Sites/X]]                          ← if source is Sites/ (rare)
  - Related: [[X]]                             ← for other Asset sources
  ```
  If the asset already has `- Site:` or `- Infrastructure doc:` on the same type, append after the last one.

- **Target is a Site note** → add link to Related section, or create Related section at end of file:
  ```markdown
  ## Related
  
  - [[Infrastructure/X]]
  ```

- **Target is an Infrastructure note** → add to Related section at end:
  ```markdown
  - [[Assets/X]]   or   - [[Sites/X]]
  ```

## What "Add" Looks Like

Before modifying: always confirm the link doesn't exist anywhere in the file (not just Related) — a link buried in body prose counts.

Use Edit tool with targeted replacements, not full file rewrites.

For new Related section (file has none):
```markdown
\n---\n\n## Related\n\n- [[SourcePath]]\n
```

For existing Related section — append before `\n` that terminates the last bullet.

## Output Report

After running, produce a summary:

```
Files scanned: N
Structural links checked: N
Backlinks already present: N
Backlinks added: N

Added:
- [[Assets/ACCOCOLOKEMP]] ← [[Infrastructure/kemp-load-balancer]]
- [[Sites/ACCO-Portland]] ← [[Infrastructure/synology-rackstation]]
  (etc.)

Skipped (excluded folder):
- Briefings/Daily/2026-05-28.md (not a structural note)
```

## Edge Cases

- **Circular links** (A links to B, B already links to A): no action — already correct.
- **Link to non-existent file**: skip silently, don't create the file.
- **Alias links** (`[[Path|Display Name]]`): strip the alias — target is `Path`.
- **Anchor links** (`[[Path#Section]]`): strip the anchor — target is `Path`.
- **Link already exists in body prose** (not Related): count as present, no duplicate added.
- **Asset Ops Notes section not found**: fall back to appending a Related section.
- **Infrastructure Home.md and Infrastructure Overview.md**: these are index notes; skip as backlink targets (too many things link to them, adding backlinks to all would pollute them).

## State Update

After every successful run, update `System/briefing-state.md` in the vault with the current timestamp:

```bash
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
TS=$(TZ='America/Los_Angeles' date '+%Y-%m-%dT%H:%M:%S%z')
sed -i "s|^last_backlink_update:.*|last_backlink_update: $TS|" "$VAULT/System/briefing-state.md"
```

This lets the Day Starter surface a stale backlink state (e.g., "last run 8 days ago, vault has had N writes since").

## Token Efficiency

This skill is deliberately narrow to stay cheap:
1. `find` to get changed files — one bash call
2. `grep` to extract outbound links from each changed file — one bash call per file
3. `grep` to check each target for return links — one bash call per target
4. `Edit` only when a link is genuinely missing

For a typical post-session run (3–5 changed files, 10–15 links), this is ~20–30 tool calls total. A full vault re-index would be 150+ file reads. The scoped approach keeps a routine run under 1 minute.
