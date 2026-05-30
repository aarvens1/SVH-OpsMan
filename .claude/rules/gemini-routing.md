# Routing — Claude (Ops + Dev) and Gemini

There are three places work can go. The routing decision is about **which quota pool, which data exposure, and which tool's strengths** — not about which model is "smarter."

## The three lanes

| Lane | Account | Launch | Has MCP / live data? | Owns |
|---|---|---|---|---|
| **Claude Ops** | `aa_stevens@shoestringvalley.com` | `opsman` / `opsman-dev` | Yes — full MCP, BW_SESSION required | Incidents, briefings, posture, investigations, all vault writes on real data, all messages to Teams/Planner/Confluence |
| **Claude Dev** | `astevens2694@gmail.com` | `claude-dev` | No (by design, no BW_SESSION) | Most OpsMan code work: skills, hooks, MCP server, collector, PowerShell modules, TUI apps, tests, type generation, refactors |
| **Gemini** | (your existing Gemini login) | Gemini CLI / web | No | Public web research only — quick Google lookups |

## Lane 1: Claude Ops

**Route here when:**
- The task requires live MCP tool calls (NinjaOne, Defender, M365, Bitwarden, etc.)
- The output goes to Obsidian, Planner, Teams, or Confluence
- The task involves private system data — investigations, audits, incident response
- The work is part of an active ops thread you're already in

**`opsman-dev` mode** (still Account 1, with `CLAUDE_DEV_MODE=1`): use for mid-session OpsMan-codebase fixes that need live ops context to do correctly — e.g., you discovered a bug in a collector job while running a briefing and want to fix it without losing the thread. The git workflow blocks relax; the data and hook enforcement stays.

## Lane 2: Claude Dev

**Route here for most code work:**
- Skill authoring and edits
- Hook changes
- MCP server (`mcp-server/`) work — new tools, refactors, type fixes
- Collector job authoring
- PowerShell module work
- TUI app work
- Test suites and test fixes
- Type generation, lint/type-check fixes
- Bulk refactors and documentation passes across many files
- npm dependency audits and upgrades

The Dev account is structurally isolated: no `BW_SESSION` (the MCP server fails to start, which is the point), separate `CLAUDE_CONFIG_DIR` so session state doesn't bleed across accounts, and the same hook guards on destructive commands.

**The data boundary is the rule that matters:** real device names, hostnames, IPs, UPNs, credentials, and alert content must not cross into a Dev session. When ops context is live in a Claude Ops session and the next step is code work, sanitize the spec before pasting across — extract field names and types only.

## Lane 3: Gemini — Three search tiers

Gemini does Google-grounded web research with cited sources across three depths. Pick the tier by what the question actually needs. All three accept image input.

| Tier | Gemini skill | Sources | When to recommend |
|---|---|---|---|
| Quick | `web-research` | 1–3 | Single-fact lookup: API docs, package versions, error messages, CVE summaries |
| Deep | `deep-search` | 5–10 | Multi-source synthesis: comparisons, consensus checks, multi-faceted questions |
| Research | `research` | 10–30 | Structured deliverable: vendor briefs, technology surveys, decision-support docs |

When Claude is in an Ops session and the user asks a public web question, suggest the appropriate tier:

- "Quick Google" / "look up X" / "what's the version of Y" → quick (`web-research`)
- "Compare X vs Y" / "what's the consensus on Z" → deep (`deep-search`)
- "Research brief on …" / "comprehensive look at …" / "write me a brief" → research (`research`)

Don't answer from training data alone when grounded search would be better. Don't paste private data into a Gemini session — sanitize first if the question started in an ops context. Anything that's code work goes to Claude Dev instead — Gemini's dev skills (Account A) are retired.

## When ops data needs to become a Dev task

The discipline: sanitize before crossing.

1. Extract the relevant spec from the private data (field names, types, error shapes — no real values, no real device names)
2. Paste the sanitized spec into a Claude Dev session
3. Receive the code back, integrate in Ops session if the integration needs live testing

There used to be a `/gemini-handoff` skill that wrote a sanitized spec to `.gemini/handoff.md` for an async cycle. The sanitization step is still valuable; the async cycle is not — Claude Dev is interactive. The handoff skills are pending a rewrite (see `TODO.md`); for now, do the sanitization manually when crossing from Ops to Dev.

## Quick Google (and beyond)

If the user says "quick Google", "look up", "what's the API for", "latest version of", or asks a public web question: this is Gemini's quick tier (`search-up`). Suggest it.

If the question is broader — comparisons, consensus, multi-faceted — suggest Gemini's `deep-search` (5–10 sources).

If the user wants a deliverable — "write me a brief", "research X", "structured report on Y" — suggest Gemini's `research` (10–30 sources, formal report).

All three tiers cite sources inline and accept image input. Don't answer from training data alone when grounded search would give a better, source-cited result.
