# SVH OpsMan — Design Notes

Architecture decisions, token-cost analysis, and workflow friction points. Review before making changes to the server or skills.

**Last audited:** 2026-05-16

---

## What's resolved

These items were open in the previous audit and are now done. Leaving them here so the history makes sense.

| Item | Resolution |
|------|-----------|
| All 140 tool schemas sent every session | Deferred tool loading — schemas cost tokens only when loaded via ToolSearch. A full ops session uses ~994 schema tokens. |
| Pretty-printed JSON responses | `ok()` in `utils/response.ts` uses `JSON.stringify(data)` (no indent). Already done. |
| Auth token caching | All four auth modules (`graph.ts`, `azure.ts`, `mde.ts`, `ninja.ts`, `wazuh.ts`) have in-memory TTL caches. No re-auth within a session. |
| Bitwarden unlock alias | `bwu` alias and shell warning are live in `dotfiles/bashrc.sh`. |
| Single monolithic MCP server | Deprioritized. With deferred tool loading, splitting into per-service servers saves negligible tokens. Not worth the added operational complexity. |

---

## Open issues

### 1. Response shaping — the dominant remaining lever

The TypeScript rule says "shape all API responses before returning." In practice, 18 of 19 tool files still have raw `ok(res.data)` calls. `azure.ts` is the only fully-shaped file and is the pattern to follow.

**Current state by file:**

| File | Raw `ok(res.data)` | Shaped `.map()` |
|------|--------------------|-----------------|
| `azure.ts` | 0 | 14 ✓ |
| `outlook-mail.ts` | 4 | 5 |
| `teams.ts` | 6 | 3 |
| `ninjaone.ts` | 12 | 6 |
| `entra-admin.ts` | 8 | 2 |
| `outlook-calendar.ts` | 6 | 2 |
| `planner.ts` | 10 | 0 |
| `confluence.ts` | 8 | 0 |
| `defender-mde.ts` | 6 | 0 |
| `exchange-admin.ts` | 6 | 0 |
| `intune.ts` | 6 | 0 |
| `ms-admin.ts` | 7 | 0 |
| `ms-todo.ts` | 5 | 0 |
| `onedrive.ts` | 6 | 0 |
| `planner.ts` | 10 | 0 |
| `printerlogic.ts` | 7 | 0 |
| `sharepoint.ts` | 7 | 0 |
| `unifi-cloud.ts` | 4 | 0 |
| `unifi-network.ts` | 7 | 0 |
| `wazuh.ts` | 7 | 0 |

Graph API responses include `@odata.*` metadata fields, `createdDateTime` on every sub-object, and deeply nested structures Claude never uses. A well-shaped response is 60–80% smaller.

**Priority order for shaping:** Tools called by daily-rhythm skills first.
1. `planner.ts` — called by every day-starter
2. `wazuh.ts` — called by every day-starter and security posture
3. `defender-mde.ts` — called by posture and vuln-triage
4. `ninjaone.ts` — partially shaped; finish the remaining 12 raw returns
5. `ms-admin.ts` — service health called daily
6. Everything else — shape opportunistically when touching those files

---

### 2. `aaron-voice.md` loads every session

`aaron-voice.md` (~2.8k tokens) lives in `.claude/rules/` and loads into every session's system context — including debugging, investigations, and posture checks where no external communication is ever drafted.

The file was copied into `.claude/skills/draft/` but never removed from `rules/`. It's now in both places. The rules version loads unconditionally; the draft-skill version is redundant.

**Fix:** Delete `.claude/rules/aaron-voice.md`. The skill copy is sufficient — it loads only when `/draft` or a trigger phrase is used.

**Saving:** ~2.8k tokens on every non-drafting session.

---

### 3. Centralized config doesn't exist

The same values are hardcoded across skill files:

- `astevens@shoestringvalley.com` — in day-starter, week-starter, and others
- Planner board IDs (9 boards) — scattered across at least 3 skill files
- `/mnt/c/Users/astevens/vaults/OpsManVault/` — vault path
- IT Team group ID `1acb76b4-f2eb-42fc-8ae3-3b2262277516`

There are at least 10 hardcoded occurrences across skill files. A board ID change currently means hunting through multiple files.

**Fix:** Create `.claude/config.yaml` with named constants. Inject them via the session-start hook. Skill files reference `{{user.upn}}` or the hook-injected value instead of literals.

```yaml
user:
  upn: astevens@shoestringvalley.com
  entra_id: 5a637656-9bd4-4e0c-9a4e-ae52ee2fd15d
  it_group_id: 1acb76b4-f2eb-42fc-8ae3-3b2262277516

obsidian:
  vault: /mnt/c/Users/astevens/vaults/OpsManVault

planner:
  sysadmin: -aZEdilGAUqLC8B8GwOLfmQAAh9M
  recurring: ZTlTUrl1gUunMMwExKSDRWQABKjH
  management: e0-6qZKUSkyZJUQg9nNbzmQAEjoO
  overview: nyrAlo2ciUKVEv8GXUA78WQAG8mL
  office_network: E4PruQekE0K25KH40pWa9WQAAfAr
  bdr_testing: lJQrriNYnUuLKm5u485GX2QAE_WS
  isp: 2es7HS5UakyP3K6ZkwRfd2QAF3I_
  cmmc_l1: qxQKzAEGd0m3Q6EUysaGVmQADbmg
  copilot_audit: wP9PL7YWCEqGbG6o4aYVT2QADaLq
```

---

### 4. Session-start hook injects too little

The current hook outputs: branch, dirty-file count, ahead count, and BW status. Useful for dev sessions. In an ops session where the repo is clean, it's almost no information.

**What would actually help for ops:**

- **Day of week** — so Claude knows Monday = 72h lookback without a time-tool call
- **Today's briefing exists** — check `$VAULT/Briefings/Daily/YYYY-MM-DD.md`; if present, day-starter should offer append rather than regenerate
- **Open incident count** — `ls $VAULT/Incidents/Active/*.md 2>/dev/null | wc -l`; Claude immediately knows whether there's an active incident without being told
- **Last briefing date** — inject date of most recent daily file so Claude can compute the correct lookback on holidays and skip days

```bash
# Additions to session-start.sh
TODAY=$(date +%Y-%m-%d)
DOW=$(date +%A)
VAULT="/mnt/c/Users/astevens/vaults/OpsManVault"
BRIEFING_EXISTS=$([ -f "$VAULT/Briefings/Daily/$TODAY.md" ] && echo "yes" || echo "no")
OPEN_INCIDENTS=$(ls "$VAULT/Incidents/Active/"*.md 2>/dev/null | wc -l | tr -d ' ')
LAST_BRIEFING=$(ls "$VAULT/Briefings/Daily/"*.md 2>/dev/null | sort | tail -1 | xargs basename -s .md 2>/dev/null || echo "none")
```

---

### 5. Tool response TTL cache

Auth tokens are cached within a session (resolved, see above). Tool *responses* are not. In a day-starter run, Claude may call `ninja_list_servers` once for the briefing and again during a follow-up question about a specific server in the same session. The second call returns identical data.

**Fix:** Add a module-level `Map<string, { data: unknown; expires_at: number }>` in high-read tools with a 60-second TTL. The MCP server process stays alive for the session, so module-level objects persist across tool calls.

Good candidates: `ninja_list_servers`, `wazuh_list_agents`, `mde_list_devices`, `admin_get_service_health`.

This is lower priority than response shaping — you can't cache a raw 8k-token response and call it a win. Shape first, then cache.

---

### 6. Day-ender append fragility

The day-ender skill has a `CRITICAL: Always use mode: append` note and a workaround for the Obsidian MCP sometimes returning only metadata without body content. The workaround is in the skill instructions rather than fixed at the source.

**Fix options:**
- **Fix it in the MCP server** — the Obsidian tool returning metadata-only is a bug worth investigating. If it can be fixed upstream, the skill instruction workaround goes away entirely.
- **Structural separator** — day-starter ends its note with a `<!-- MORNING-END -->` marker; day-ender appends after it, bypassing any read-then-write logic entirely.
- **Separate files** — `YYYY-MM-DD-morning.md` and `YYYY-MM-DD-eod.md`; a Dataview query stitches them in the weekly note.

---

### 7. Reference file sync is manual

`CLAUDE.md` says to copy `references/` to `$VAULT/References/` so the Obsidian MCP can serve them in any session. This is a manual step that's easy to skip, and skills that embed those docs may be working from a stale copy.

**Fix:** Add to session-start hook:

```bash
rsync -a --delete ~/SVH-OpsMan/references/ "$VAULT/References/" 2>/dev/null || true
```

One line. The Obsidian MCP always has the latest versions. Zero manual steps.

---

### 8. Pre-aggregation script for day-starter

The day-starter skill makes 15+ sequential tool calls — each one adds API latency and tokens. A script that pre-fetches before you open Claude would eliminate most of that.

**Shape:** A shell script (or session-start hook extension) that calls NinjaOne, Wazuh, Defender, Entra, M365 health, Planner, and Calendar APIs directly and writes a single staging JSON file to the vault. Claude reads the file, skips all the fetching, and jumps straight to synthesis.

This is the highest-ROI item for the daily experience, but also the most work — it requires calling these APIs from bash or a small Node script outside Claude. Worth doing after response shaping is in place (so the pre-fetched data is already small).

---

## Priority table

| Priority | Item | Effort | Notes |
|----------|------|--------|-------|
| **Now** | Response shaping — `planner.ts`, `wazuh.ts`, `defender-mde.ts` | Medium | Biggest per-result saving; compounds across entire session |
| **Now** | Delete `aaron-voice.md` from `.claude/rules/` | Tiny | File already exists in draft skill; just remove the global copy |
| **Soon** | Finish response shaping — remaining 16 files | Medium | Do opportunistically when touching a file anyway |
| **Soon** | Centralize config into `.claude/config.yaml` | Small | Reduces skill-file maintenance burden significantly |
| **Soon** | Session-start hook improvements | Small | Day of week, briefing exists, open incidents, last briefing date |
| **Later** | Reference file auto-sync in session-start | Tiny | One rsync line |
| **Later** | TTL cache on tool responses | Small | Shape first — cache a small response, not a raw one |
| **Later** | Day-ender append fragility fix | Small | Investigate Obsidian MCP bug first before workarounds |
| **Later** | Pre-aggregation morning script | Medium | Highest daily-experience ROI but requires external API calls from bash |

---

## Data access model

A note on what "Claude has access to X" means in practice.

Every tool makes a targeted API call and returns only what was asked for. No tool fetches broadly and filters client-side:

- `teams_list_my_chats` → `GET /users/{graphUserId}/chats` — only Aaron's chats
- `teams_list_messages` → `GET /teams/{teamId}/channels/{channelId}/messages` — only the specific channel
- `mail_search` → `GET /users/{graphUserId}/messages` — scoped to one mailbox

The app registration permission determines what the credential *could* access. The query determines what *actually comes back*. Those are separate things.

**The gap between permission scope and query scope:** `Mail.ReadWrite` is a tenant-wide application permission. The server locks all mail and calendar calls to `GRAPH_USER_ID`, and an Exchange `ApplicationAccessPolicy` enforces the same restriction at the Exchange layer. For Teams, `ChannelMessage.Read.All` is tenant-wide but the server only queries IT Team channels and Aaron's own chats — enforced by code, not by the permission grant. RSC (`ChannelMessage.Read.Group`) is the right fix if that gap ever needs closing at the permission layer.
