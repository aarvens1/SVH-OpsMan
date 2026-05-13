# SVH OpsMan — Token Cost & Design Notes

Observations on architectural decisions that affect how many tokens Claude consumes
per session, with recommendations for each. Ordered roughly by impact.

**Last audited:** 2026-05-13. `/context` breakdown from a full ops session:
- Messages: 124.3k tokens (62%) ← dominant cost
- Read results: 32.7k tokens (16%) ← explicitly flagged by /context
- System prompt: 6.4k (3.2%)
- System tools: 6.9k (3.5%)
- Memory files: 5k (2.5%) — aaron-voice.md is 2.8k of this
- MCP tools: 994 tokens (0.5%) — only 2 tools loaded; deferred loading is working
- Skills: 2.9k (1.5%)

---

## 0. Message bloat is the dominant cost — 62% of context

This section didn't exist in earlier versions of these notes because we assumed
tool schema tokens were the main lever. They're not. With deferred tool loading
live (see item 2), schemas only count when loaded. The real cost is accumulated
tool results and dialogue in the message history.

**What drives message bloat:**
- Long-running skills (day-starter: 15+ tool calls) add every response to context
- Large unshapen API responses (item 4) inflate each result
- Re-calling the same tool twice in a session doubles the result tokens
- Reading large files (daily notes, device lists) when only a section is needed

**Fix strategies — in order of impact:**

1. **Response shaping (item 4)** — the biggest lever. A well-shaped response is
   60–80% smaller. Every token saved in a tool result is saved for the rest of the
   session.

2. **Minified JSON (item 3)** — small effort, ~25% reduction per tool result.

3. **Pre-aggregation (W1)** — eliminate 10–15 tool calls per morning by fetching
   raw data before Claude opens. No tool results in context at all.

4. **Use offset/limit on file reads** — the /context command explicitly flagged
   read results at 32.7k tokens (16%). See W9 and the broader principle below.

5. **Proactive /compact at task boundaries** — Claude Code's autocompact fires at
   the buffer limit (33k free). Manual /compact before starting a new investigation
   keeps the session clean and preserves more useful context.

6. **Session-level deduplication** — if a skill calls `ninja_list_servers` and the
   user later asks a follow-up about a server, do NOT re-call the list. Refer to
   prior results. Server-side TTL caching (item 7) makes this automatic.

---

## 1. All 140 tool schemas sent on every session — **resolved**

**Was:** Every `registerXxxTools()` call ran unconditionally. Even when a service had
no credentials, its tool schemas were sent to Claude on every API call.

**Fix applied:** Each register function returns early when `!enabled`, so disabled
services contribute zero schema tokens. Additionally, Claude Code's deferred tool
loading means available-but-unloaded tools don't count toward context at all.

**Current state (verified 2026-05-13):** MCP tools consumed 994 tokens in a full
ops session (only 2 tools were loaded; the other ~140 were deferred). The earlier
estimate of "17,000 tokens per session" was wrong under the deferred loading model.

**No further action needed here.** Focus shifted to tool *results* (item 4) and
message history (item 0).

---

## 2. Single monolithic MCP server — **lower priority than previously assessed**

All tools live in one MCP server process. This was originally flagged as the
biggest scaling bottleneck, estimated at 17k tokens per session.

**Reality check (2026-05-13):** With deferred tool loading, tools appear as
"Available" in /context and their schemas don't load until a ToolSearch fetch.
A full ops session spent only 994 tokens on MCP tools. Splitting into service-
specific MCP servers would save a negligible amount on top of this.

**Remaining value of splitting:** Organizational clarity, not token savings. If
the server grows to 200+ tools and the deferred-loading list itself becomes
unwieldy, revisiting makes sense. Not a near-term priority.

**Deprioritized.** The tool result size (item 4) is the actual lever now.

---

## 3. Pretty-printed JSON responses add ~25% token overhead

Every tool returns `JSON.stringify(data, null, 2)`. The two-space indent is
readable but wasteful — whitespace counts as tokens.

**Current:** A 50-device NinjaOne list might return 8,000 tokens.
**Minified:** Same data ≈ 6,200 tokens.

**Fix:** Change `ok()` in `utils/response.ts` to use `JSON.stringify(data)` (no
indent). Claude doesn't need pretty-printing to parse JSON. Keep indent only in
dev/debug mode.

The risk is slightly harder human-readable debugging in logs, which matters less
since the MCP server runs over stdio and output goes to Claude, not a terminal.

---

## 4. Tools return full API payloads instead of shaped responses

The TypeScript rules say to shape responses, but in practice many tools return the
raw API object (`res.data`) — especially the read-only list/get tools. Graph API
responses in particular include many `@odata.*` fields, `createdDateTime` on every
sub-object, and deeply nested structures Claude never uses.

**Example:** `admin_get_service_health` returns the full Graph healthOverviews
object including `servicePlansInfo`, `issues`, and redundant status strings. For a
day-starter briefing, only `service`, `status`, and any active issues are needed.

**Fix:** Add response-shaping maps to high-frequency tools (planner, mail, NinjaOne
device lists, Wazuh alerts). Target: tools called by skills that run on every
workday. A well-shaped response should be 60–80% smaller than the raw API payload.

---

## 5. Tool descriptions include inline examples that Claude doesn't need

Several descriptions embed usage examples:

```
"Search your Outlook messages using KQL (keyword query language). " +
"Examples: 'from:alice@example.com', 'subject:invoice', 'hasAttachments:true received>=2025-05-01'."
```

Claude already knows KQL syntax. The examples add ~30 tokens per tool for zero
functional value. Same pattern appears in `confluence_search_pages` (CQL examples),
`wazuh_search_alerts` (time format examples), and others.

**Fix:** Strip examples from descriptions. If Claude needs syntax reminders, a
system prompt note or skill instruction is the right place — not the tool schema
which loads on every call.

**Estimated saving:** ~500–800 tokens across all 140 tools per session.

---

## 6. Zod `.describe()` on every field duplicates common descriptions

`limit`, `top`, `offset`, `cursor`, and `page_size` each carry their own
`.describe()` text, repeated across ~80 tools. A few examples:

- `z.number().int().default(100)` → described differently 15 times
- `"ISO 8601"` time format → mentioned 12 times
- `"UPN or object ID"` → 8 times

Each description adds tokens to the JSON schema Claude receives.

**Fix options:**
- Extract shared Zod schemas (`const PAGE_SIZE = z.number().int()...`) and reuse
  them. Description only appears once in source; it still appears once per tool in
  the schema, but at least it's consistent and easy to shorten globally.
- For very common fields (`limit`, `top`), remove `.describe()` entirely — these
  names are self-explanatory.

---

## 7. Response caching: none

Every tool call hits the API fresh. In a day-starter skill, Claude might call
`ninja_list_servers`, then later call it again (or call `ninja_get_device` on
devices from the first list). The second call returns the same data.

Token cost: duplicate tool results inflate the context window. A 50-server list
returned twice = ~16,000 tokens of redundant context.

**Fix:** Add a simple in-memory TTL cache to high-read tools (60-second TTL is
enough for a single skill run). The MCP server process stays alive for the session,
so module-level cache objects persist across tool calls.

Good candidates: `ninja_list_servers`, `wazuh_list_agents`, `mde_list_devices`,
`admin_get_service_health`.

---

## 8. Skill files are verbose and load entirely into context

Each skill's `SKILL.md` loads on invocation. Some skills reference many tools and
include long system-prompt instructions. The day-starter skill, for example, calls
10+ tools and its SKILL.md includes detailed formatting instructions that repeat
per-run.

**Fix:**
- Move boilerplate instructions (date formatting, Obsidian frontmatter) to a
  shared base skill or CLAUDE.md section loaded once, not per-skill.
- Keep individual skill files focused on the delta — what's unique to that skill.

---

## 9. MCP over stdio: no cross-session state

The MCP server spawns fresh each time Claude Code starts. Token caches, auth
tokens, and any computed state are lost. Each session re-authenticates to every
service (triggering token-fetch API calls) and has no memory of the previous
session's data.

This is a Claude Code architecture constraint, not a design choice we can easily
change. Worth knowing when estimating session startup cost.

Auth tokens are cached within a session (the `cachedJwt`, `cachedToken` module-
level variables in each auth file), but not across sessions.

---

## Priority order for next work

| Impact | Item | Effort | Notes |
|--------|------|--------|-------|
| High | Shape responses on top-10 most-called tools (item 4) | Medium | Biggest per-result saving; compounds across session |
| High | Minify JSON responses (item 3) | Tiny | ~25% per result; 1-line change in `ok()` |
| High | TTL cache for high-read list tools (item 7) | Small | Prevents double-result bloat mid-session |
| Medium | Strip inline examples from tool descriptions (item 5) | Small | Small per-tool; ~500–800 tokens total |
| Medium | Deduplicate Zod descriptions (item 6) | Small | Consistency + global shortening |
| Low | Slim down skill SKILL.md files (item 8) | Small | Move boilerplate to CLAUDE.md |
| Low | Split into service-specific MCP servers (item 2) | Large | Mostly solved by deferred loading; deprioritized |

---

# Workflow Friction & Automation Opportunities

Observations on the day-to-day usage pattern — where Claude is doing work that
code should do, where brittleness causes re-work, and what would make the whole
thing faster to use.

---

## W1. Pre-aggregation script for morning briefing (highest daily ROI)

The day-starter skill makes 15+ tool calls across two steps. Every call is
sequential latency + tokens. A script that runs before you open Claude — or wired
into the session-start hook — can pre-fetch the raw data and write it to a single
staging file. Claude reads one file, skips all the fetching, and jumps straight to
synthesis.

**Rough shape:**

```bash
# .claude/hooks/morning-fetch.sh  (run from session-start on weekday mornings)
#!/usr/bin/env bash
# Calls NinjaOne, Wazuh, Defender, Planner APIs directly and writes
# /tmp/svh-morning-YYYY-MM-DD.json — Claude reads this instead of calling tools.
```

What to pre-fetch (all fast, all read-only):
- NinjaOne: offline/alerting devices
- Wazuh: alerts ≥ medium, last 24h (72h on Monday)
- Defender: High/Critical alerts
- Entra: risky users
- M365 service health
- Planner: Aaron's assigned tasks across all boards
- Calendar: today's events

Claude's job: read the file, prioritize, synthesize, write the briefing. No tool
calls needed for data gathering — only for any follow-up investigation on a
specific item.

**Estimated saving:** 10–15 tool calls eliminated per morning, plus the latency
of waiting for each API response one at a time.

---

## W2. Centralize shared config — board IDs, user IDs, vault path

The same data is hardcoded in at least 3 skill files (day-starter, day-ender,
week-starter/ender likely too):

- `astevens@shoestringvalley.com` — Aaron's UPN
- 9 Planner board IDs
- `/mnt/c/Users/astevens/vaults/OpsManVault/` — Obsidian vault path
- IT Team group ID `1acb76b4-f2eb-42fc-8ae3-3b2262277516`

When a board gets archived or the vault path changes, you're hunting through
multiple files.

**Fix:** Create `.claude/config.yaml` (or `.json`) with all of these as named
constants. The session-start hook reads it and injects the values as context so
Claude always has the current values without them being embedded in skill files.

```yaml
user:
  upn: astevens@shoestringvalley.com
  entra_id: <object-id>
  it_group_id: 1acb76b4-f2eb-42fc-8ae3-3b2262277516

obsidian:
  vault: /mnt/c/Users/astevens/vaults/OpsManVault

planner:
  operational:
    sysadmin: -aZEdilGAUqLC8B8GwOLfmQAAh9M
    recurring: ZTlTUrl1gUunMMwExKSDRWQABKjH
    management: e0-6qZKUSkyZJUQg9nNbzmQAEjoO
    overview: nyrAlo2ciUKVEv8GXUA78WQAG8mL
  projects:
    office_network: E4PruQekE0K25KH40pWa9WQAAfAr
    bdr_testing: lJQrriNYnUuLKm5u485GX2QAE_WS
    isp: 2es7HS5UakyP3K6ZkwRfd2QAF3I_
    cmmc_l1: qxQKzAEGd0m3Q6EUysaGVmQADbmg
    copilot_audit: wP9PL7YWCEqGbG6o4aYVT2QADaLq
```

Skill files reference `{{user.upn}}` instead of the literal value. One change
propagates everywhere.

---

## W3. Bitwarden unlock wrapper — **resolved**

**Was:** Every session started with `BW_SESSION not set` and fell back to `.env`.

**Current state (verified 2026-05-13):** Session-start hook reports
`BW_SESSION active`. The alias or wrapper is already in place. No further action
needed unless the unlock setup changes.

---

## W4. Day-ender append fragility

The day-ender skill has a `CRITICAL: Always use mode: append` warning and a note
about the Obsidian tool returning only metadata without body content. This is a
known failure mode that's been worked around in skill instructions rather than
fixed at the source.

The underlying issue: the day-starter writes the full note; the day-ender is
supposed to append to it; but if the MCP tool misbehaves, the morning content
gets lost.

**Fix options (pick one):**
- **Structural separator:** Day-starter always ends its note with a `<!-- EOD -->` 
  marker. Day-ender's append starts after that marker. Even if the tool returns
  only metadata, the append adds content at the end rather than replacing it.
- **Separate files:** Day-starter writes `YYYY-MM-DD-morning.md`; day-ender
  writes `YYYY-MM-DD-eod.md`; a Dataview query in a weekly note stitches them
  together. No append needed, no fragility.
- **Fix it in the MCP server:** The Obsidian tool's `read` returning metadata
  without body is a bug. Worth investigating and patching in the server rather
  than papering over it in skill instructions.

---

## W5. Monday compliance gap — automate the reminder into real data

The day-starter surfaces a manual reminder every Monday:

> Run `Get-SVHComplianceGap` in PowerShell and review the output.

This is the right instinct but it means you have to remember to do it, switch to
a PowerShell terminal, run it, and then mentally merge the output with your
briefing. Claude never sees the results.

**Better pattern:** Schedule the scan to run automatically Sunday night (or
Monday at 6am before you start) and write the output to a file in the Obsidian
vault. The day-starter skill reads that file as part of Step 1, includes the
findings in the briefing, and can flag specific gaps for follow-up. No manual
step, no context switch.

```powershell
# Task Scheduler or Windows scheduled task
. ./connect.ps1
Get-SVHComplianceGap | ConvertTo-Json | Out-File "$vault\References\compliance-gap-latest.json"
```

Day-starter skill reads `References/compliance-gap-latest.json` via the Obsidian
MCP and includes findings in the **🔴 Needs attention now** section.

---

## W6. Session-start hook — inject more useful context

The current hook reports branch, dirty files, ahead count, and BW status. Useful
for development work; not very useful for IT ops sessions where the repo is
usually clean.

For ops sessions, the hook should inject:

- **Day of week** — so Claude knows Monday = 72h lookback without calling a time
  tool first.
- **"Today's briefing already exists"** — check if `Briefings/Daily/YYYY-MM-DD.md`
  exists in the vault. If it does, Claude can skip the day-starter or append-only
  mode instead of recreating it.
- **Active incidents** — scan `Incidents/Active/` for any `.md` files and inject
  their names. Claude immediately knows "there is an open incident" without
  needing to be told.
- **Last briefing date** — inject the date of the most recent daily briefing so
  Claude can compute the actual lookback window for `day-starter` on days after
  a holiday or a Friday skip.

```bash
# Addition to session-start.sh
TODAY=$(date +%Y-%m-%d)
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
BRIEFING_EXISTS="no"
[ -f "$VAULT/Briefings/Daily/$TODAY.md" ] && BRIEFING_EXISTS="yes"
OPEN_INCIDENTS=$(ls "$VAULT/Incidents/Active/" 2>/dev/null | wc -l | tr -d ' ')
DOW=$(date +%A)
```

---

## W7. Reference file sync — automate what CLAUDE.md says to do manually

`CLAUDE.md` says:

> Copy to `Obsidian/References/` so the Obsidian MCP can serve them in any
> Claude session, not just when this repo is open.

This is currently a manual step. If you forget, skills that depend on those
reference docs (IR triage embeds `triage-gate.md` via `@../../references/`) may
be working from a stale copy.

**Fix:** A git post-commit hook (or an addition to session-start) that rsync's
`references/` to `$VAULT/References/` automatically:

```bash
rsync -a --delete references/ "$VAULT/References/"
```

One command. Zero manual steps. The Obsidian MCP always has the latest versions.

---

## W8. "Already done today" guard on day-starter

Running `/day-starter` twice overwrites the morning's note (or at minimum
re-does 15 tool calls). There's no guard.

The session-start hook already knows if today's briefing file exists (see W6).
If it does, the day-starter skill should open with a check: "Today's briefing
already exists — do you want to regenerate it or append a midday update?" rather
than silently overwriting.

This is a one-line addition to the day-starter SKILL.md:

> If today's briefing already exists in the vault (injected by session-start
> hook), ask before regenerating. Offer to append a **Midday check-in** section
> instead.

---

## W9. Daily note token bloat — carry-forward pattern — **partially implemented**

**Symptom:** Daily notes grow substantially throughout the day — morning brief
(~150 lines) + meeting note links + work-log appends + EOD section. By end of
day a note can exceed 400–500 lines. The /context output from 2026-05-13 flagged
read results at 32.7k tokens (16%) with a suggestion to use offset/limit.

**What's already done:**
- Day-starter has Step 2b "Carry forward open items from yesterday" — it reads
  the previous day's note and surfaces open threads/draft tasks.

**What's missing (two SKILL.md edits, no code changes):**

**1. Day-starter: use offset to read only the tail of yesterday's note**

Step 2b currently reads the full `Briefings/Daily/YYYY-MM-DD.md`. Since the
carry-forward section is always at the end (written by day-ender), reading the
last 50–60 lines is sufficient. Add to Step 2b:

> Read yesterday's note using `offset: <line_count - 60>` or equivalent tail
> parameter, not the full file.

Saving: ~2,800 tokens per morning (full ~3,200 → tail ~400).

**2. Day-ender: append a compact `## 📌 Carry Forward` section AND read only
the first 150 lines of today's note**

Day-ender currently reads today's full note to understand "what was flagged
this morning." Add two instructions to day-ender SKILL.md:

a. Read today's note with `limit: 150` — the morning brief is always at the top.

b. At the end of Step 3, append a tightly-scoped carry-forward section:

```markdown
## 📌 Carry Forward

**Open (must action):**
- Item 1 — suggested first move

**Context to hold:**
- Brief fact worth knowing tomorrow

**Watching:**
- Item that doesn't need action but should stay on radar
```

Hard limit: 25–30 lines. No full Planner task list — only items Claude would
otherwise lose between sessions (context that isn't captured in Planner).

**Token impact:**

| Current | After fix |
|---------|-----------|
| Day-ender reads full note (~400–500 lines, ~3,200–4,000 tokens) | Reads first 150 lines (~1,200 tokens) |
| Day-starter reads full yesterday note (~3,200 tokens) | Reads last 60 lines (~480 tokens) |
| Net per day | Save ~4,700–5,500 tokens on daily note reads alone |

**W9b. Broader principle: offset/limit on all large file reads**

The same principle applies to any skill that reads a large Obsidian note: use
the minimum window needed. Posture-check reading a device list, asset-
investigation reading a multi-section asset note, and meeting-prep reading a
past meeting note all benefit from targeted reads. Default to reading the full
file only when the entire content is genuinely needed for the task.

---

## W10. aaron-voice.md loads every session — 2.8k tokens wasted on non-drafting sessions

`aaron-voice.md` (9.5KB, ~2.8k tokens) lives in `.claude/rules/` and loads into
every session's system context, including debugging sessions, investigations,
posture checks, and any session where no external communication is drafted.

The vast majority of sessions don't draft emails or Teams messages. Loading the
full voice guide for those sessions is pure overhead.

**Fix:** Move `aaron-voice.md` out of `.claude/rules/` and into the `draft`
skill's SKILL.md (or as an `@include` reference). Remove it from global rules.

The voice guide then loads only when the `draft` skill is invoked — either by
`/draft` or by a trigger phrase ("write an email", "draft a message", etc.).

**Risk:** If the user says "write a quick reply to this" without triggering the
skill, the voice rules won't apply. In practice the skill trigger phrases cover
this, and a brief reminder in CLAUDE.md ("use /draft for external messages") is
sufficient.

**Saving:** ~2.8k tokens on every non-drafting session. On a typical day with
one drafting session and four non-drafting sessions, saves ~11k tokens/day.

**W10b. obsidian-output.md is a smaller but similar case**

`obsidian-output.md` (2.7k bytes, ~670 tokens) loads every session. Its content
is only relevant when writing a note. Since every skill writes notes, this one is
actually worth keeping global — but audit its content for any verbosity that
could be trimmed (the daily note mode section and lifecycle table together account
for most of the length).

---

## Workflow priority order

| Impact | Item | Effort | Status |
|--------|------|--------|--------|
| High | Move aaron-voice.md out of global rules (W10) | Tiny | TODO |
| High | Daily note carry-forward: offset/limit reads (W9) | Tiny | Partial |
| High | Pre-aggregation script for morning briefing (W1) | Medium | TODO |
| High | Centralize config / remove hardcoded IDs (W2) | Small | TODO |
| Medium | Session-start hook improvements (W6) | Small | TODO |
| Medium | Day-ender append fragility fix (W4) | Small | TODO |
| Medium | Automate compliance gap scan (W5) | Medium | TODO |
| Low | Reference file auto-sync (W7) | Tiny | TODO |
| Low | Day-starter idempotency guard (W8) | Tiny | TODO |
| Done | BW unlock wrapper alias (W3) | — | ✓ Active |

---

# Data Access Model — What Actually Flows Through Claude

A note on what "Claude has access to X" means in practice for this server.

## How the tools query

Every tool makes a targeted API call and returns only what was asked for. No tool
fetches broadly and filters client-side. Examples:

- `teams_list_my_chats` → `GET /users/{graphUserId}/chats` — Microsoft returns
  only chats Aaron is a member of; the server never sees any other user's threads.
- `teams_list_messages` → `GET /teams/{teamId}/channels/{channelId}/messages` —
  only the specific channel queried; nothing else in the tenant is touched.
- `mail_search` → `GET /users/{graphUserId}/messages` — same scoping by user.

The permission grant on the app registration determines *what the credential could
access if misused*. The actual query determines *what data comes back in practice*.
Those are two separate things.

## What flows through Claude's context

Tool responses flow into Claude's context window during the session in which they
are called. A day-starter that calls `teams_list_my_chats` means the returned
chat previews are visible to the model for that session. Claude does not retain
data between sessions, and has no ability to query data outside of an active
session where a tool is explicitly invoked.

The practical implication: Claude sees exactly what a targeted API call returns —
not a broader slice of tenant data — and only when a tool is actively called.

## The gap between permission scope and query scope

`ChannelMessage.Read.All` and `Chat.Read.All` are tenant-wide application
permissions. The credential *could* be used to read any channel or chat in the
tenant. The server *only* uses them to query IT Team channels and Aaron's own
chats. That gap is enforced by code, not by the permission grant itself.

This is the same pattern already in use for `Mail.ReadWrite` and
`Calendars.ReadWrite` — both are application permissions that could touch any
mailbox, but the server locks them to `GRAPH_USER_ID` via targeted queries and
an Exchange ApplicationAccessPolicy.

**If the blast-radius concern ever needs addressing for Teams specifically:**
RSC (`ChannelMessage.Read.Group`) is the right fix — it enforces the scope at the
permission layer, not just in code. See the RSC approach documented in the
2026-05-12 daily briefing for the implementation path.
