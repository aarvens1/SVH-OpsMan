# Gemini routing

## Session mode first

Before routing to Gemini, check which Claude mode applies:

- **`opsman`** (normal): Full MCP access, hooks enforced. For ops work — investigations, briefings, incidents, anything reading live system data.
- **`opsman-dev`** (`CLAUDE_DEV_MODE=1`): Workflow hooks relaxed. For dev work on OpsMan itself — skills, hooks, settings, MCP tools — especially mid-session when context-switching would break flow.

**Do dev work in `opsman-dev` before routing to Gemini** when: the task is small, tied to the current session's context, or requires understanding ops state to do correctly.

## Route to Gemini when:

- Scaffolding new files (collector jobs, test files, TypeScript interfaces) — separable, reviewable as a PR
- Bulk refactoring or documentation passes across many files
- Writing test suites
- Running the linter, type checker, or npm audit
- Public web lookups (API docs, package versions, error messages, CVE public info)
- Large-file analysis where Gemini's longer context window is an advantage
- Any work where you want a clean context with no ops data present

## Keep in Claude (`opsman` or `opsman-dev`) when:

- The task requires live MCP tool calls (NinjaOne, Defender, Wazuh, M365, Bitwarden)
- The output will go to Obsidian, Planner, Teams, or Confluence
- The task involves private system data even if the *output* is clean code
- You're mid-investigation and switching tools would break flow
- The fix is small and directly caused by something you just discovered in the current session

## The real boundary: data contamination, not capability

The Gemini separation exists to prevent ops data (real device names, hostnames, IPs, user data, alert content) from leaking into committed code. When ops context is in the session and code is being written, that data can end up in commit messages, comments, or variable names.

The discipline: if ops data is live in the session and you're about to write code, use `/gemini-handoff` to sanitize before crossing the boundary — regardless of which session mode you're in.

## Handoff pattern (Claude → Gemini):
1. Extract the relevant spec from the private data (field names and types only — no real values)
2. Use `/gemini-handoff` to write the spec to `.gemini/handoff.md`
3. Tell the user which account and Gemini skill to use
4. When Gemini writes `.gemini/to-claude.md`, pick it up and integrate

## Account routing (remind the user when relevant):
- **Account A (Dev)**: active coding, scaffolding, refactoring, test writing
- **Account B (Docs)**: large-file reads, bulk documentation passes
- **Account C (Research)**: quick Google lookups — "quick Google" or "look up X" → Account C `web-research`

## Quick Google
If the user says "quick Google", "look up", "what's the API for", "latest version of", or asks a public web question: remind them this is Gemini Account C's lane. Do not attempt to answer from training data alone when live search would give a better result.
