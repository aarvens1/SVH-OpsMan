# OpsManVault — Editorial Review
_2026-05-28 · claude/opsmanvault-docs-review-Vza8X_

---

## What was reviewed

All content accessible in the Google Drive backup of OpsManVault:

| Folder | Files reviewed |
|--------|---------------|
| References/ | credentials.md, users.md, ps-remoting-snippets.md, common-failure-modes.md, common-event-clusters.md, triage-gate.md, hypothesis-patterns.md |
| Templates/ | Asset Investigation, Change Record, Incident, Day Starter |
| Briefings/Weekly/ | 2026-W20 (week-ender), 2026-W21 (week-starter), 2026-W22 (week-starter) |
| Meetings/ | 2026-05-12 IT Team, 2026-05-12 BRG, 2026-05-13 Standup, 2026-05-19 CMCC Follow-up |
| System/ | briefing-state.md |

---

## TL;DR

The vault is well-conceived and mostly well-executed. The reference docs are strong — technical, precise, useful. The recent weekly briefings (W22) follow the style rules cleanly. Meeting notes from deliberate writing (IT Team, CMCC prep, BRG) are good. Two problems cut across everything: emoji encoding corruption in older files, and Fathom AI dump output landing in notes raw and unedited. A third issue — `status: draft` on every note, forever — suggests the status lifecycle is dead in practice and should either be enforced or removed.

---

## 1. Vault structure

**What's working well:**
- Top-level folder taxonomy is clean and self-explanatory.
- The daily/weekly briefing separation is the right architecture.
- Reference docs are correctly separated from live operational content.
- The template set covers the main use cases.

**Structural gaps:**

| Missing or unclear | Recommendation |
|---|---|
| No visible `Assets/` folder in Drive | Confirm it exists; if not, create it — the template references it |
| No visible `Incidents/Active/` content | Expected to exist if incidents are being tracked |
| `Investigations/` folder exists but appears empty | Expected or genuinely unused? If unused, remove from the taxonomy spec |
| `Scripts/` folder exists but wasn't explored | Scripts belong in the repo, not the vault — consider whether this folder serves a real purpose |
| `Confluence/` has only `Infrastructure/` and `Sites/` subfolders | Add `Confluence/index.md` so the tree is self-documenting |

**Note taxonomy consistency:**

The `note-patterns.md` spec says daily notes are an index, not a content repo, and that content should live in dedicated notes linked from the daily. In practice:
- W22 week starter embeds full task tables and project summaries inline instead of linking to `[[Projects/Network-Segmentation]]`, `[[Projects/CMCC]]`, etc.
- Project notes exist in the Projects/ folder (from the truncated listing) but aren't systematically wikilinked from briefings.

This is a "nice in theory" rule that may not be worth enforcing strictly — briefings with embedded tables are faster to scan. But if the rule is in the spec, the output should follow it or the spec should change.

---

## 2. Systemic bugs

### 2a. Emoji encoding corruption

Several files have garbled Unicode: `ð¥` `ð` `ð¨` `ð´` `ð±` appearing where emoji should be. This is a double-encoding artifact — UTF-8 bytes read as Latin-1 and then re-encoded. Files affected:

- `2026-W21.md` — headers throughout: `# ð Week Starter`, `## ð´ Needs attention now`, `## ð¨ Mail`
- `2026-05-19-cmmc-followup.md` — status indicators: `ð¡ Partially addressed`, `ð¡ Likely in place`
- `triage-gate.md` — lane headers: `ð¥ Burning Building`, `ð Active Investigation`, `ð Background Enrichment`

**Fix:** The Drive MCP tool or the backup pipeline is mangling multi-byte characters. Check whether the issue is in the Obsidian→Drive sync (rclone or the backup script) or in the MCP tool's download path. The vault files on disk should be correct — verify with `hexdump` on a known-emoji file.

The correct characters are:
- `ð¥` → 🔥
- `ð´` → 🔴
- `ð¡` → 🟡
- `ð` → 🔍 (or 📅 depending on context)
- `ð±` → 📱

### 2b. `status: draft` as a dead field

Every note reviewed has `status: draft`. The spec defines a lifecycle: `draft → reviewed → filed | promoted`. In practice, nothing ever leaves draft. Either:

1. **Enforce it** — build a weekly "un-reviewed notes" query in Obsidian Dataview and actually advance status on reviewed notes, or
2. **Remove it** — drop the field from all templates and the spec. A field that's always the same value is noise.

Leaning toward option 2 unless you have a specific workflow that depends on querying by status.

### 2c. Fathom AI dump format in meeting notes

The `2026-05-13-sysadmin-daily-standup.md` is a raw Fathom AI export. Every bullet has an inline hyperlink to the Fathom timestamp:

```markdown
- [**CMCC Mandate:** Create accounts for 73 non-welders to secure FCI. This requires provisioning
  30–40 new users and a major device wipe/reset project.](https://fathom.video/calls/670645322?tab=summary&timestamp=13.0)
```

This is unreadable as a note. The links add no operational value — they link back to a call recording you'll rarely open, and they break Obsidian's link graph since they're external URLs, not wikilinks.

The content itself is solid. The Fathom output is accurate and thorough. The issue is purely formatting.

**Fix:** Either strip links on paste (a simple regex: `\[(.+?)\]\(https://fathom\.video[^)]+\)` → `$1`), or edit the note post-paste. The cleaner notes (IT Team Meeting, BRG) show what the end state should look like — no inline URLs, just clean decisions and actions.

---

## 3. Reference docs — writing quality

These are the strongest documents in the vault. Most need minor edits only.

### 3a. `triage-gate.md`

Beyond the encoding issue (see §2a), the content is tight and operationally grounded. One prose issue:

> **Current:** "Determines the response lane before any enrichment begins. Be conservative with Burning Building — alarm fatigue is a real risk."

The second sentence is a doc comment, not a definition. It belongs in the Tuning Notes section at the bottom, not the intro.

> **Revised:**
> ```
> Determines the response lane before any enrichment begins.
> ```
> (Move "Be conservative…" to Tuning Notes, where the other calibration advice lives.)

The Escalation Path section is good and should stay exactly as written. The Tuning Notes section at the bottom is well-placed but gets cut off — confirm the full file on disk isn't truncated.

### 3b. `common-failure-modes.md`

Excellent document. Specific, tool-referenced, SVH-calibrated. The structure (symptom → common causes → checks) is consistent and correct.

Two small edits:

**1. Intro sentence fragment:**
> **Current:** "SVH-specific failure patterns for the Troubleshooting Methodology skill. Reference when building the hypothesis list."

"Reference when building the hypothesis list" is an instruction to Claude, not prose. Move it to a comment or just delete it — the skill already knows to use this document.

> **Revised:** "SVH-specific failure patterns by subsystem. Each entry follows: symptoms → common causes → diagnostic commands."

**2. SQL Memory section, passive construction:**
> **Current:** "SQL Server 2019+ will consume available RAM aggressively if max server memory isn't capped."

> **Revised:** "SQL Server 2019+ consumes all available RAM unless `max server memory` is capped."

**3. BITS/WSUS section** — the snippet cuts off mid-sentence in the Drive content. Confirm the full file on disk has the complete section.

### 3c. `hypothesis-patterns.md`

Clean and well-organized. The scoring heuristic at the end is the best part of the document — keep it.

One wording issue in the performance section:

> **Current:** "MABS agent leaking memory (known pattern — restart DPMRA.exe)"

> **Revised:** "MABS agent memory leak — restart DPMRA.exe"

(The parenthetical acknowledges it's a known pattern without saying so — the dash construction does the same work more cleanly.)

The `→` arrows in the "One User vs. Many" numbered lists work well for "rules out X" notation. Keep that convention.

### 3d. `credentials.md`

Well-organized reference. The table-per-service format is correct for this type of content. Three edits:

**1. Opening line:**
> **Current:** "Where credentials live for each integrated service. Check both custom fields AND item notes — some credentials are stored in notes, not fields."

The second sentence is a warn that belongs right before the table it applies to (the BW item section), not in the doc intro.

> **Revised intro:** "Credential locations for each integrated service."

Then, directly above the BW item table: "> [!warning] Check both custom fields and item notes — some credentials are stored in notes, not fields."

**2. Google OAuth section:**
> **Current:** "OAuth2 refresh token flow. Create a Web application client in GCP Console → APIs & Services → Credentials, then obtain a refresh token with `email`, `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/gmail.modify` scopes."

This sentence is doing too much. Split it:

> **Revised:**
> ```
> OAuth2 refresh token flow. Client type: Web application (GCP Console → APIs & Services → Credentials).
>
> Required scopes:
> - `email`
> - `https://www.googleapis.com/auth/calendar`
> - `https://www.googleapis.com/auth/drive`
> - `https://www.googleapis.com/auth/gmail.modify`
> ```

**3. Self-signed TLS note for Synology:**
> **Current:** "Note: self-signed TLS cert is accepted automatically — no CA configuration needed."

> **Revised:** "Self-signed TLS — no CA config needed."

(Drop "Note:" — if it's in the document, it's a note. "Note: X" is a verbal tic that adds nothing.)

### 3e. `common-event-clusters.md`

Good reference. The provider/event ID tables are exactly the right format. The "Diagnosis pattern" lines under each section — `5120 → 5142 → 1069 → 13002 sequence = CSV lost...` — are the most valuable part and should be prominent.

One issue: the PrinterLogic / Print Spooler section is cut off in the Drive snippet. Confirm the full document on disk.

Minor prose edit in the Wazuh rule groups note:

> **Current:** "Wazuh rule groups: `microsoft-eventchannel`, `windows`"

> **Revised:** "Wazuh rule groups: `microsoft-eventchannel` · `windows`"

(The middle dot is cleaner than a comma in a list of two items where both are code.)

### 3f. `ps-remoting-snippets.md`

Reference material, not prose — correct. The snippets are well-commented. The "Check Cluster State (Without Remoting)" section at the end is particularly useful and well-placed.

One convention issue: the setup section says:
> `# One-time: trust the remote host (run on MCP host in WSL if using PSRemoting over WinRM)`
> `# See docs/setup/winrm.md for full trust setup`

`docs/setup/winrm.md` — does this file exist? If not, the reference is a dead link. Either create the doc or remove the reference.

### 3g. `users.md`

Clean. No changes needed. The Obsidian vault paths table at the bottom is useful context for the MCP tools.

---

## 4. Templates — writing quality

The templates are structural scaffolds, not prose documents. They should be evaluated on completeness and field accuracy, not writing style. That said:

### `Incident.md`

The frontmatter has:
```yaml
status: draft
incident_status: open
```

Two status fields is confusing. `status` is the vault lifecycle field; `incident_status` is the operational state of the incident. They mean different things and both should exist — but they should be distinguished clearly.

> **Recommendation:** Rename `incident_status` to `lifecycle` in the template and spec, or add an inline comment: `# operational state — open | contained | closed`.

### `Change Record.md`

The Approvals table at the bottom is the right pattern. Small improvement: add a `decision` field to the Risk Assessment table:

> **Current columns:** Risk | Likelihood | Impact | Mitigation
> **Add:** Decision (accept / mitigate / avoid / transfer)

### `Day Starter.md`

The template matches the spec exactly. The `<!-- DAY-STARTER-END -->` sentinel is correctly placed.

One question: the "Worth watching" section uses a `[!note]` callout, but `note-patterns.md` says to use `[!warning]` for "watch or act soon." Worth watching is usually below warning threshold — `[!note]` is right here, but it's worth confirming the intent.

### `Asset Investigation.md`

Good structure. "Recent activity — Timeline of notable events from all sources" is the most useful section and is placed correctly at the bottom as a synthesizing view.

Minor: the "Entra / Intune" section header implies the data comes from one source. The underlying tools are separate. Consider: `## Entra · Intune` to signal both.

---

## 5. Briefings — writing quality

### 5a. `2026-W22.md` (Week Starter — the current standard)

**The best document in the vault.** Clean callout structure, plain headers, functional emoji in content only, tables where tables belong, prose where prose belongs.

Specific improvements:

**1. Redundant Thursday callout:**
The calendar table already has "Heavy day — 3 blocks" in the Notes column. The sentence immediately after the table repeats it:
> "Thursday is heavy. Net Seg Review needs prep materials before 8:30 AM."

One or the other — not both. The standalone sentence is more actionable, so keep that and drop the Notes column annotation, or flip it: keep the table note brief and remove the redundant sentence.

**2. Missing date on the Friday row:**
```
| Fri — | — | Peter off all next week |
```
The date should be `Fri 5/29`, consistent with the other rows.

**3. "Effective week start" as a table note:**
```
| Tue 5/26 | — | Effective week start |
```
"Effective week start" is a note to self, not calendar content. Drop it from the table — the preceding sentence already covers the Memorial Day context. If you want to keep it, it belongs in prose above the table, not in a Notes column cell.

**4. IT team boards section:**
> "ACCOCOLOKMS22 — offline investigation (overdue, Sam assigned)"
> "Additional Sam items from board (no specific due dates flagged)"

"Additional Sam items from board (no specific due dates flagged)" is padding. If there's nothing specific, the section should say "No new items" or be omitted entirely. Never document the absence of specifics with a vague placeholder.

### 5b. `2026-W21.md` (Week Starter — style drift example)

This is the before to W22's after. The main issues are structural violations, not prose problems:

1. **Emoji in headers** — `# 📅 Week Starter`, `## 🔴 Needs attention now`. Violates note-patterns.md. Should be plain headers with callout blocks.
2. **Encoded emoji corruption** — all those `ð` characters (see §2a).
3. **Calendar table columns** — W21 uses `Time (PDT)` as a column; W22 uses just the date/day in the first column. The W22 format is better — time doesn't belong in a weekly calendar view, only in a daily one.
4. **"Note:" prefix** in the calendar: `*Note: Peter Kinnari is on Tuesday and Thursday meetings this week but OUT May 22 + full week May 25–29.*` — drop "Note:", state it directly: `*Peter is on Tue/Thu this week, out May 22 and the full week of May 25.*`

W21 has better prose in some areas than W22. The "Tuesday is the heavy day" line is identical across both weeks — that's good, it's a working pattern. The mail section in W21 is more narrative and detailed; W22's mail section is more terse. Both work, but W21's mail section is arguably more useful.

### 5c. `2026-W20.md` (Week Ender — best prose in the vault)

The "Summary draft" section at the bottom is the best-written content in the entire vault:

> "Good week operationally. We closed out the Hyper-V maintenance window clean — cluster's healthy, no VM impact. Also knocked out the CMiC backup vault issue, finished the Synology build, completed the SMTP2Go move, and fixed a couple of drive space situations. A handful of solid closes."

This is EB White. Active voice, specific facts, no throat-clearing, appropriate informality for an internal audience. Every section should aim for this tone.

The "Seeds for next week" section is equally good — each item is a specific action with a reason, not a vague category.

One issue: the "Slipped to next week" table has `Status` as a column with values like "In progress — ETA 2026-05-22" and "Watching — Monday follow-up in To Do." The status column is doing double duty — it's both a disposition and a next step. Split into two columns: `Status` and `Next step`, or collapse to a single "Notes" column and write one sentence per item.

---

## 6. Meeting notes — writing quality

### `2026-05-12-IT-Team-Meeting.md` ⭐

Best meeting note structure in the vault. Decisions → Action items → Status highlights. Clean, no filler. Every action item has an owner and a verb. This is the template that `Meeting.md` in Templates/ should model.

The status highlights table at the bottom (`| Person | Focus |`) is an excellent pattern — it makes the team's state visible in one scan.

Minor: the "Key information" section at the bottom mixes administrative notes (printer SMTP, E3 licenses) with meta-notes about the meeting itself (Fathom demoed, Leland's travel). The meta-notes should be trimmed or moved to a separate `# Notes` section. They add noise to a clean document.

### `2026-05-12-BRG-Meeting.md`

Well written throughout. The prep section (timeline, open items, suggested agenda) is crisp and organized. The post-call notes are concise.

The "Key information" section has the best individual sentences in the meeting notes:

> "Trade partners prioritize actual work opportunities over networking — attendance at events requires a live project."

That sentence is doing real work. Keep that rhythm.

One structural issue: the post-call "Decisions made" list and the "Key information" bullet list contain different types of content but aren't clearly distinguished. "Decisions made" should only contain decisions. Pivot points like "union requirements are a barrier for small diverse firms" are context, not decisions — they belong in Key information or a Background section.

### `2026-05-19-cmmc-followup.md`

Strong document for a complex topic. The per-control table format (What's needed | Current state) plus the "To check this box:" paragraph is the right structure for compliance prep. It's thorough without being bureaucratic.

The encoded emoji corruption (`ð¡` for 🟡) in the status indicators hurts readability here specifically because the visual signal matters — you need to be able to scan for 🟢/🟡/🔴 at a glance.

One prose issue in the intro:

> **Current:** "The May 13 standup established the core gap: Fought has **73 non-welders who handle FCI** but no individual accounts."

> **Revised:** "The core gap: Fought has 73 non-welders who handle FCI and no individual accounts."

The attribution ("The May 13 standup established") adds nothing once the note exists. State the fact.

### `2026-05-13-sysadmin-daily-standup.md`

Raw Fathom dump — see §2c. The underlying content is good. The format is not. The "Meeting Purpose" section followed by "Key Takeaways" followed by "Topics" produces three rounds of the same information. After stripping the links, collapse to: Decisions made → Action items → Topics (one section per topic, no duplicated summary).

---

## 7. Specific before/after edits

A selected set of concrete sentence-level changes:

| Location | Before | After |
|---|---|---|
| credentials.md intro | "Where credentials live for each integrated service." | "Credential locations for each integrated service." |
| credentials.md Synology | "Note: self-signed TLS cert is accepted automatically — no CA configuration needed." | "Self-signed TLS — no CA config needed." |
| common-failure-modes.md intro | "Reference when building the hypothesis list." | _(delete — the skill already knows)_ |
| common-failure-modes.md SQL | "SQL Server 2019+ will consume available RAM aggressively if max server memory isn't capped." | "SQL Server 2019+ consumes all available RAM unless `max server memory` is capped." |
| hypothesis-patterns.md | "MABS agent leaking memory (known pattern — restart DPMRA.exe)" | "MABS agent memory leak — restart DPMRA.exe" |
| triage-gate.md intro | "Be conservative with Burning Building — alarm fatigue is a real risk." | _(move to Tuning Notes)_ |
| W22 calendar table | `\| Fri — \| — \| Peter off all next week \|` | `\| Fri 5/29 \| — \| Peter off all next week \|` |
| W22 IT team boards | "Additional Sam items from board (no specific due dates flagged)" | _(delete entire line)_ |
| W21 calendar note | "*Note: Peter Kinnari is on Tuesday and Thursday meetings this week but OUT May 22...*" | "*Peter is on Tue/Thu this week, out May 22 and the full week of May 25.*" |
| CMCC followup | "The May 13 standup established the core gap: Fought has **73 non-welders who handle FCI** but no individual accounts." | "The core gap: Fought has 73 non-welders who handle FCI and no individual accounts." |
| Any document | "It is worth noting that..." | _(delete the phrase, state the fact)_ |
| Any document | "At this time..." | _(delete)_ |
| Any document | "Note: X" | "X" — if it's in the document, it's already a note |

---

## 8. Anti-patterns to ban

These appear in various notes and should be flagged and fixed whenever encountered:

| Anti-pattern | Why | Fix |
|---|---|---|
| "Note: X" as a sentence opener | If it's in the document, it's a note. The prefix adds nothing. | Start with X. |
| "It is worth noting that" | Filler. | Delete the phrase; state the fact. |
| "At this time" | Filler. | Delete or replace with a specific time reference. |
| "Please note" | Deferential. You're documenting, not asking permission. | State the fact. |
| "As mentioned above/below" | Self-referential. | Repeat the fact or use a wikilink. |
| Passive voice in action items | "The account should be rotated" leaves ownership unclear. | "Aaron: rotate the account." |
| `status: draft` on a note that's clearly done | False metadata. | Advance status or remove the field. |
| "Additional X items (no specific details flagged)" | Documents the absence of information. | Omit the section or write "No new items." |
| Parenthetical "known pattern" annotations | If it's documented here, it's a known pattern by definition. | Delete the annotation. |

---

## 9. Style guide proposal

The existing `note-patterns.md` is 80% of a style guide already. What's missing:

### Additions for `note-patterns.md`

**Sentence structure:**
- One fact per sentence. Full stop.
- Active voice. "Aaron will rotate the secret" not "the secret should be rotated."
- State the implication only if non-obvious. "D: drive at 8% — CMiC outage risk if not cleared" is correct; "D: drive at 8%, which is a low disk space situation" is not.
- Attribution goes in the past, not the present. "The standup established X" → "X." Source attribution belongs in git/Obsidian history, not prose.

**Reference doc conventions:**
- Intro line: one declarative sentence. No "this document" or "this guide."
- Sections: noun-first headers ("Hypothesis Ranking" not "How to Rank Hypotheses").
- Lists: parallel structure — all bullets start with the same part of speech.
- Code in backticks always. Never wrap config values, commands, or field names in quotes.

**Meeting note conventions:**
- Strip Fathom inline links before saving. Content only.
- Post-call sections: Decisions made → Action items → Key information. No duplicated summary.
- Action items: `- [ ] **Owner** — verb + object + deadline`. Three parts, always.
- "Key information" means context that changes how you'll act later. Not meeting trivia.

**Frontmatter:**
- `status: draft` — only keep if you have a workflow to advance it.
- `skill:` field — use the actual skill name (lowercase, hyphenated), not a display name.
- Incident frontmatter: rename `incident_status` to `lifecycle` to avoid confusion with the vault `status` field.

### New section: "When to use callouts vs. prose"

```
Use a callout when:
- You need the reader to stop and act before reading further
- The item is time-sensitive and the eye needs to catch it at a glance
- It's a single discrete alert (1–5 items max)

Use prose when:
- The finding needs a sentence of context to be useful
- It's background or reference information
- There are more than 5 items (a table is better than a long callout)

Never use a callout for every section. Reserve them for the content that earns the visual weight.
```

---

## 10. Skill ideas

### 10a. `/note-polish` — prose linter for vault notes

Run on the current note (or a specified path) and:
1. Flag anti-patterns from the ban list (Note:, "it is worth noting", passive action items, status: draft on old notes)
2. Detect Fathom inline links and strip them
3. Check emoji encoding — if `ð` patterns are present, flag the file and suggest re-encoding
4. Report: N findings, list with line numbers, apply fixes with confirmation

This is a Gemini Account B task (large-file read, no private system data needed for the linting logic). Could be triggered as a post-meeting-notes hook.

### 10b. `/fathom-clean` — Fathom import cleaner

Takes a Fathom AI summary (pasted or linked), strips all `[text](https://fathom.video/...)` links to plain text, deduplicates Key Takeaways vs. Topics, and outputs clean meeting note content in the vault's format:

```
# Meeting title

**When:** date/time
**Attendees:** ...

## Decisions made
- ...

## Action items
- [ ] **Owner** — action — due date

## Key information
- ...
```

Ten minutes of manual work per standup, automated to zero. High ROI.

### 10c. `/posture-snapshot` improvement

(Not a new skill — existing `/posture-check`.) The triage-gate.md is operationally excellent but the three-tier model (Burning Building / Active Investigation / Background Enrichment) isn't reflected in the posture check output format. The posture check produces a Green/Yellow/Red × six-category grid; the triage gate produces a lane assignment. These should inform each other. Suggestion: the posture check output should include a "Current triage lane" field derived from the most severe open item.

### 10d. Style guide skill: `/vault-style`

A read-only skill that:
- Returns the current style rules in a compact, skimmable format
- Accepts `--check <note-path>` to lint a specific note against the rules
- Can be invoked before writing any vault output to remind Claude of the conventions

The source of truth would be `note-patterns.md` + a new `style-guide.md` file in the vault's System/ folder. The skill reads those files and applies them.

---

## 11. Priority order for fixes

1. **Fix the emoji encoding in the Drive backup pipeline** — affects readability across the whole vault and will corrupt future notes if not addressed at the source.
2. **Strip Fathom links from existing standup notes** — one regex, ten minutes, clean output.
3. **Decide on `status: draft`** — enforce it (build the Dataview query) or remove it from all templates.
4. **Apply the sentence-level edits in §7** — mechanical, low risk, significant readability improvement.
5. **Add the missing sections to `note-patterns.md`** (§9 additions) — formalizes what W22 already does correctly so future output matches.
6. **Build `/fathom-clean` skill** — automation for the highest-friction manual step in the meeting note workflow.
