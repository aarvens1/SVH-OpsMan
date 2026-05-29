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
- The task requires live MCP tool calls (NinjaOne, Defender, Wazuh, M365, Bitwarden, etc.)
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

## Lane 3: Gemini

**Route here only for public web research:**
- API docs lookups ("what's the Graph API endpoint for X")
- Package versions, npm registry info
- Error message research
- CVE public info
- General "look this up on the internet" tasks

Anything that gives Gemini access to ops data (real configs, alert text, private API responses) does not go here. Anything that's code work goes to Claude Dev instead — Gemini A (active coding) is retired; Claude Dev owns that lane now.

## When ops data needs to become a Dev task

The discipline: sanitize before crossing.

1. Extract the relevant spec from the private data (field names, types, error shapes — no real values, no real device names)
2. Paste the sanitized spec into a Claude Dev session
3. Receive the code back, integrate in Ops session if the integration needs live testing

There used to be a `/gemini-handoff` skill that wrote a sanitized spec to `.gemini/handoff.md` for an async cycle. The sanitization step is still valuable; the async cycle is not — Claude Dev is interactive. The handoff skills are pending a rewrite (see `TODO.md`); for now, do the sanitization manually when crossing from Ops to Dev.

## Quick Google

If the user says "quick Google", "look up", "what's the API for", "latest version of", or asks a public web question: this is Gemini's lane. Don't answer from training data alone when live search would give a better result.
