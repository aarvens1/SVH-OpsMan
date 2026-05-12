# SVH OpsMan — Token Cost & Design Notes

Observations on architectural decisions that affect how many tokens Claude consumes
per session, with recommendations for each. Ordered roughly by impact.

---

## 1. All 140 tool schemas sent on every session — **fixed in this branch**

**Was:** Every `registerXxxTools()` call ran unconditionally. Even when a service had
no credentials, its tool schemas were sent to Claude on every API call.

**Fix applied:** Each register function now returns early when `!enabled`, so disabled
services contribute zero schema tokens.

**Remaining exposure:** All 140 tools are still registered when all services are
configured. Claude receives the full schema list on every turn, even turns where
only one system is relevant (e.g., a mail-only query still loads Wazuh, UniFi,
Azure, etc.). See item 2 for the architectural fix.

---

## 2. Single monolithic MCP server (biggest scaling bottleneck)

All tools live in one MCP server process. Claude Code / the MCP client has no way
to load a subset — it's all or nothing.

**Token cost:** ~140 tools × ~120 tokens/tool ≈ 17,000 tokens sent to Claude on
every single API call, regardless of what the user actually needs.

**Fix options (pick one):**
- **Split into service-specific MCP servers** (Graph, Infrastructure, Security,
  Productivity). Register only the relevant servers for each skill. A Wazuh alert
  investigation doesn't need Planner tool schemas.
- **Tool filtering at registration** — pass a `toolFilter` set to each register
  function and only register the tools a given skill will use. Requires the MCP
  client to support re-initializing tools per conversation.

The split-server approach is the cleanest and maps directly to Claude Code's
`claude mcp add` model: add only the servers a session needs.

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

| Impact | Item | Effort |
|--------|------|--------|
| High | Split into service-specific MCP servers | Large |
| High | Shape responses on top-10 most-called tools | Medium |
| Medium | Minify JSON responses (`JSON.stringify(data)`) | Tiny |
| Medium | Strip inline examples from tool descriptions | Small |
| Medium | TTL cache for high-read list tools | Small |
| Low | Deduplicate Zod descriptions for common fields | Small |
| Low | Slim down skill SKILL.md files | Small |
