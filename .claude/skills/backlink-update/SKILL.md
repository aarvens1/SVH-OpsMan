---
name: backlink-update
description: Vault structural auditor. Phase 1 — bidirectional backlink check for recently changed structural notes (Assets/, Sites/, Infrastructure/). Phase 2 — MOC gap detection for manual-update MOCs. Phase 3 — frontmatter audit for missing required fields. Phase 4 — project tag consistency check. Trigger phrases: "update backlinks", "check backlinks", "fix backlinks", "backlink audit", "vault audit", "moc gaps".
when_to_use: Run after any session that creates/moves structural notes, or weekly to catch drift in MOCs, frontmatter, and project tags.
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

---

## Phase 2 — MOC Gap Detection

Run after Phase 1. Check the five manual-update MOCs for notes that exist on disk but aren't listed in the MOC file.

**MOCs to check** (these require manual row additions — not Dataview-powered):

| MOC file | Source folder | Note pattern |
|----------|--------------|--------------|
| `Projects/projects-home.md` | `Projects/` | `*.md` excluding `projects-home.md` and `Archive/` |
| `Assets/assets-home.md` | `Assets/` | `*.md` excluding `assets-home.md` |
| `Changes/changes-home.md` | `Changes/` | `*.md` excluding `changes-home.md` |
| `Vulnerabilities/vulnerabilities-home.md` | `Vulnerabilities/` | `*.md` excluding `vulnerabilities-home.md` |
| `Reviews/` | `Reviews/Access/` and `Reviews/Patches/` | `*.md` excluding `*-home.md` |

**Algorithm:**
1. `find` the source folder for notes on disk
2. `grep` the MOC file for each note's filename (bare name without `.md`)
3. If a note is not found in the MOC: add to the gap report

Do NOT auto-add entries to MOCs — surface them as a gap report for Aaron to review and add manually. The report format:

```
## MOC Gaps

| MOC | Missing note | Action |
|-----|-------------|--------|
| projects-home.md | Network-Segmentation.md | Add row manually |
```

If no gaps: `✅ All manual-update MOCs current — no missing entries.`

---

## Phase 3 — Frontmatter Audit

Scan structural notes (Assets/, Sites/, Infrastructure/) and recently changed notes in Projects/, Changes/, Vulnerabilities/, Reviews/ for missing required frontmatter fields.

**Required fields on all notes:** `date`, `skill`, `status`, `tags`

**Extra required by type:**
- Incidents: `incident_id`, `severity`
- Changes: `change_id`, `risk`, `window`, `change_date`
- Vulnerabilities: `cve`, `priority`
- Assets: `asset_type`
- Projects: `priority`

**Algorithm:**
```bash
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
# For each file in scope, extract frontmatter block and check for required keys
grep -L "^skill:" "$VAULT/Assets/"*.md 2>/dev/null   # example: find files missing 'skill:'
```

Run one grep per required field per folder. Surface only files with at least one missing field.

Gap report format:

```
## Frontmatter Gaps

| File | Missing fields |
|------|---------------|
| Assets/SERVERNAME.md | skill, status |
| Changes/CHG-2026-001.md | change_date |
```

If no gaps in scanned files: `✅ Frontmatter audit clean — all scanned notes have required fields.`

Scope: Assets/ (all), Sites/ (all), Infrastructure/ (all), plus any files modified in the last 7 days in Projects/, Changes/, Vulnerabilities/, Reviews/.

---

## Phase 4 — Project Tag Consistency

Verify that work artifact notes touching active projects carry the correct `project/<slug>` tag.

**Active projects** — read from `Projects/projects-home.md` or list `Projects/*.md` (excluding Archive/ and projects-home.md). For each project note, extract:
1. The `project/<slug>` tag from its frontmatter
2. The project name

**Check scope** — for each active project, find notes that likely touch it by:
```bash
# Find notes that wikilink to the project note
grep -rl "\[\[Projects/ProjectName\]\]" "$VAULT" --include="*.md"
```

For each note that links to a project but lacks the `project/<slug>` tag in its frontmatter: add to gap report.

Gap report format:

```
## Project Tag Gaps

| File | Links to project | Missing tag |
|------|-----------------|-------------|
| Meetings/2026-06-01-meeting.md | [[Projects/Network-Segmentation]] | project/network-segmentation |
| Changes/CHG-2026-005.md | [[Projects/ISP]] | project/isp |
```

Do NOT auto-add tags — surface for Aaron to add manually (or confirm "add all" before writing). If no gaps: `✅ Project tag audit clean.`

---

## State Update

After every successful run, update `System/briefing-state.md` in the vault with the current timestamp:

```bash
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
TS=$(TZ='America/Los_Angeles' date '+%Y-%m-%dT%H:%M:%S%z')
sed -i "s|^last_backlink_update:.*|last_backlink_update: $TS|" "$VAULT/System/briefing-state.md"
```

This lets the Day Starter surface a stale backlink state.

## Output Report

Produce a single consolidated report covering all four phases:

```
## Backlink Update — YYYY-MM-DD

**Phase 1 — Backlinks**
Files scanned: N | Links checked: N | Added: N

Added:
- [[Assets/DEVICE]] ← [[Infrastructure/doc]]

**Phase 2 — MOC Gaps**
[table or ✅ clean]

**Phase 3 — Frontmatter Gaps**
[table or ✅ clean]

**Phase 4 — Project Tag Gaps**
[table or ✅ clean]
```

## Token Efficiency

Phase 1 stays cheap (scoped to changed files). Phases 2–4 use `grep` and `find` — no file reads unless a gap is found. A full four-phase run on a clean vault is ~40–60 tool calls. Only read file contents when you need to add a backlink (Phase 1) or verify a frontmatter block (Phase 3).
