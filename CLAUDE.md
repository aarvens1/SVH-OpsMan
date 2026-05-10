# SVH OpsMan — Claude Code project context

This is a custom MCP server that gives Claude access to SVH's IT systems: Microsoft 365, Azure, Defender, NinjaOne, Wazuh, UniFi, PrinterLogic, and Confluence. The server is a TypeScript ESM Node.js process that communicates over stdio.

## Runtime

- **Platform:** WSL 2 (Ubuntu 22.04) on Windows, running in Windows Terminal
- **Client:** Claude Code CLI — `claude mcp add` registers MCPs, not Claude Desktop
- **Secrets:** Bitwarden CLI (`bw`) — unlock vault before starting: `export BW_SESSION=$(bw unlock --raw)`
- **Fallback:** `.env` file if `BW_SESSION` is not set

## Repo layout

```
mcp-server/
  src/
    index.ts          ← entrypoint; registers all tool groups
    secrets.ts        ← Bitwarden + .env credential loader
    auth/             ← per-service token helpers (graph, mde, ninja, unifi)
    tools/            ← one file per integrated system
    utils/http.ts     ← axios client factories + formatError
references/           ← triage and troubleshooting reference docs
```

## Key conventions

- **No autonomous actions.** Claude never sends Teams messages, emails, or Planner updates without an explicit user request in that session.
- **Write to Obsidian first.** All skill output (briefings, incident notes, change records, etc.) goes to Obsidian. External destinations (Teams, Confluence, Mail) are always staged for review.
- **No task deletion.** Mark Planner tasks complete at 100% instead. `planner_delete_task` does not exist.
- **No space/plan destruction.** No Confluence space creation or deletion, no Planner plan deletion.
- **Read-only defaults.** Most tools are read-only. Write-capable tools: Mail (send, draft), Teams (send message), Planner (create/update tasks), To Do (create/update), OneDrive (create folder, generate link), Confluence (create/update pages and comments), Entra (dismiss risky user), Obsidian (read/write notes), Excalidraw (create/update diagrams).
- **Diagrams before descriptions.** For network topology, attack paths, asset network position, change impact scope, and project WBS — produce an Excalidraw diagram rather than a prose description when the information is inherently spatial or relational. Save to `Obsidian/Diagrams/<category>/` and embed in the parent note with `![[filename.excalidraw]]`.

## Work week

M–Thursday. Monday Day Starter covers the full weekend (last 72h, not 24h).

## Build sequence

Skills should be validated in order: read-only monitoring first (Day Starter), then write-side actions last (IR Triage — the only skill that sends non-draft Teams messages).

## Adding a new tool

1. Create `src/tools/<service>.ts` — export `register<Service>Tools(server, enabled)`
2. Add the tool group to `src/index.ts` — import, add env-based `enabled` flag, call register
3. Add credentials to `mcp-server/.env.example`
4. Document in README.md under "What Claude has access to" and "Credential reference"

## References

`references/` contains triage guides and SVH-specific failure patterns Claude uses during skills. These should also be copied to `Obsidian/References/` so the Obsidian MCP can serve them in any Claude session, not just when this repo is open.
