# Gemini routing

When a task is pure code work with no private system data requirement, proactively suggest routing it to Gemini rather than doing it inline.

## Route to Gemini when:
- Scaffolding new files (collector jobs, test files, TypeScript interfaces)
- Refactoring or documenting existing code without needing live system state
- Running the linter, type checker, or npm audit
- Git operations (status, diff, commit drafts)
- Public web lookups (API docs, package versions, error messages, CVE public info)
- Large-file analysis where Gemini's longer context window is an advantage

## Keep in Claude when:
- The task requires live MCP tool calls (NinjaOne, Defender, Wazuh, M365, Bitwarden)
- The output will go to Obsidian, Planner, Teams, or Confluence
- The task involves private system data even if the *output* is clean code
- The user is mid-investigation and switching tools would break flow

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
