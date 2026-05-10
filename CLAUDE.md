# SVH OpsMan — Claude Code project context

This is a custom MCP server that gives Claude access to SVH's IT systems: Microsoft 365, Azure, Defender, NinjaOne, Wazuh, UniFi, PrinterLogic, and Confluence. The server is a TypeScript ESM Node.js process that communicates over stdio.

## Runtime

- **Platform:** WSL 2 (Ubuntu 22.04) on Windows, running in Windows Terminal
- **Client:** Claude Code CLI — `claude mcp add` registers MCPs, not Claude Desktop
- **Secrets:** Bitwarden CLI (`bw`) — unlock vault before starting: `export BW_SESSION=$(bw unlock --raw)`
- **Fallback:** `.env` file if `BW_SESSION` is not set

## Repo layout

```
.claude/
  settings.json         ← permissions + SessionStart hook
  hooks/session-start   ← injects git state + BW_SESSION status
  rules/                ← path-scoped conventions (TypeScript, Obsidian output)
  skills/               ← one directory per skill; Claude loads on demand
mcp-server/
  src/
    index.ts            ← entrypoint; registers all tool groups
    secrets.ts          ← Bitwarden + .env credential loader
    auth/               ← per-service token helpers
    tools/              ← one file per integrated system
    utils/http.ts       ← axios client factories + formatError
references/             ← triage and troubleshooting reference docs
```

## Key conventions

- **No autonomous actions.** Claude never sends Teams messages, emails, or Planner updates without an explicit user request in that session.
- **Obsidian first.** All skill output goes to Obsidian. External destinations (Teams, Confluence, Mail) are always staged for review.
- **No task deletion.** Mark Planner tasks complete at 100% instead. `planner_delete_task` does not exist.
- **Read-only defaults.** Most tools read only. Write-capable: Mail (send/draft), Teams (send message), Planner (create/update), To Do (create/update), OneDrive (create folder/link), Confluence (create/update pages and comments), Entra (dismiss risky user), Obsidian (read/write), Excalidraw (create/update diagrams).
- **Diagrams before descriptions.** For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than prose. Save to `Diagrams/<category>/` and embed with `![[filename.excalidraw]]`.
- **IR Triage only** sends non-draft Teams messages. Build it last for that reason.

## Work week

M–Thursday. Monday Day Starter covers the full weekend (last 72h, not 24h).

## Skills

Skills live in `.claude/skills/<name>/SKILL.md` and load on demand. Each skill defines its own allowed tools in frontmatter.

Invoke by name (`/day-starter`) or trigger phrase (e.g., "morning briefing", "X is broken", "write a ticket for this"). Skills are listed with trigger phrases in README.md.

## Adding a new tool

1. Create `mcp-server/src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Add to `mcp-server/src/index.ts` — import, add env-based `enabled` flag, call register
3. Add credentials to `mcp-server/.env.example`
4. Document in README.md under "What Claude has access to" and "Credential reference"
5. Add the tool name(s) to the `allowed-tools` frontmatter of any skill that uses it

## References

`references/` contains triage guides and SVH-specific failure patterns. Copy to `Obsidian/References/` so the Obsidian MCP can serve them in any Claude session, not just when this repo is open.
