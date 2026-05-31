# Development Guide

This guide is for developers contributing to the SVH OpsMan project. It covers the repository structure, conventions, and instructions for extending the system.

## Three-layer mental model

The repo is organized in three layers. Understanding which layer something belongs to keeps the structure clean as the project grows.

**Layer 1 — Environment:** WSL shell, dotfiles, WinRM trust, Tailscale, systemd services. The foundation. If it's about setting up or configuring the WSL machine itself, it lives here.

**Layer 2 — OpsMan:** The MCP server, collector, PowerShell modules, and TUI. The operational tooling built on top of that foundation.

**Layer 3 — AI Context:** `.claude/`, `.gemini/`, `references/`, and the skill definitions. Everything the AI reads at runtime.

## Repository Layout

```
.claude/
  config.yaml              ← Centralized config for UPNs, group IDs, etc.
  settings.json            ← Claude Code permissions & session hook definition
  hooks/session-start.sh   ← Injects dynamic context at the start of each session
  rules/                   ← Scoped conventions for TypeScript and Obsidian output
  skills/                  ← Skill definitions, loaded on-demand by Claude
.gemini/
  GEMINI.md                ← Gemini profile and account strategy
  skills/                  ← Gemini skill definitions
collector/
  src/                     ← The on-demand bulk data collector
docs/
  setup/                   ← One-time environment config guides (Layer 1)
  reference/               ← Human reference material (credentials, PS modules, staging data)
  architecture.md          ← System design and data flow
  development.md           ← This file
  getting_started.md       ← End-to-end setup guide
  user_guide.md            ← Daily workflow and skills reference
dotfiles/                  ← Shell aliases, Windows Terminal settings, etc.
mcp-server/
  src/                     ← The custom MCP server that exposes tools to Claude
powershell/
  modules/                 ← The PowerShell module suite for write ops
  connect.ps1              ← Script to load all PS modules and credentials
  README.md                ← Full module reference with example commands
references/                ← AI runtime lookups: triage gates, failure patterns, creds
scripts/                   ← Setup and utility scripts
systemd/
  user/                    ← systemd service and timer files for automation
staging/                   ← (gitignored) Output of the Collector
db/                        ← (gitignored) SQLite databases for metrics and run logs
tui/
  apps/
    main/                  ← PowerShell Navigator TUI (reference implementation)
    ad/                    ← Active Directory TUI
    alerts/                ← Alerts TUI
    net/                   ← Network TUI
    patches/               ← Patch management TUI
  base.tcss                ← Shared Gruvbox styles
  STYLE_GUIDE.md           ← TUI design system
  run-tui.sh               ← Launcher script
```

## Key Conventions

-   **No Autonomous Actions:** The AI never performs a write action (sending a message, creating a task) without explicit, in-session confirmation from the user.
-   **Obsidian First:** All skill output is staged in Obsidian for user review before any further action is taken.
-   **Read-Only by Default:** Most MCP tools are read-only. Write-capable tools are clearly defined and limited.
-   **Diagrams over Prose:** For complex relationships (network topology, change impact), skills should generate an Excalidraw diagram.
-   **Check the Manifest:** Before using data from the collector, skills must check `manifest.json` to ensure the data is fresh and the collection job did not fail silently.

## Extending the System

### Adding a new Collector Job

1.  Create a new job file in `collector/src/jobs/` that implements the `Job` interface from `jobs/base.ts`.
2.  Add your new job to the `ALL_JOBS` array in `collector/src/index.ts`.
3.  If the job produces data for time-series metrics, add the extraction logic in `collector/src/watch/index.ts`.
4.  Add any new required credentials to the **SVH OpsMan** Bitwarden item.
5.  Document the new staging file in `docs/reference/staging_data.md`.

### Adding a new MCP Tool

1.  Create the tool logic in a new file under `mcp-server/src/tools/`. It should export a `register<Service>Tools` function.
2.  Import and call your new registration function in `mcp-server/src/index.ts`. Use an environment variable to allow the tool to be enabled or disabled.
3.  Add any new credentials to the Bitwarden item.
4.  Run `npm run build` in the `mcp-server` directory.
5.  Document the new tool and add its name to the `allowed-tools` frontmatter of any skill that should use it.

### Adding a new Skill

1.  Create a new directory ` .claude/skills/<your-skill-name>/`.
2.  Inside, create a `SKILL.md` file.
3.  Define the skill's name, description, allowed tools, and trigger phrases in the frontmatter.
4.  Write the instructions for the AI in the body of the markdown file, explaining the workflow, which tools to call, and the desired output format.

### Developing TUI Applications

The five TUI applications are built with Python and the [Textual](https://textual.textualize.io/) framework. Each lives in its own directory: `tui/`, `tui_ad/`, `tui_alerts/`, `tui_net/`, and `tui_patches/`.

The main `tui/` app is the most complex, providing a generic interface to the entire PowerShell module suite. The others are special-purpose, focused on a specific domain.

**Setup:**
The Python dependencies are managed with [Poetry](https://python-poetry.org/).

```bash
# Install poetry
curl -sSL https://install.python-poetry.org | python3 -

# Navigate to a TUI directory and install dependencies
cd tui/
poetry install

# Run the app
poetry run python app.py
```

Each TUI directory is a self-contained application. They share a common pattern but have no shared library code, allowing them to be developed and deployed independently.

## Testing

The MCP server has a [Vitest](https://vitest.dev/) unit test suite covering utilities and tool logic.

```bash
cd mcp-server
npm test            # single run
npm run test:watch  # watch mode
npm run typecheck   # TypeScript check without building
```

Test files live under `mcp-server/src/__tests__/`. When adding a new tool, add a corresponding test file under `__tests__/tools/`. When adding a utility, add tests under `__tests__/utils/`. Run `npm run typecheck` before committing — test files are excluded from the build but the source files they import are not.

## Dev Assistant: Claude Dev

Code work belongs in **Claude Dev** — account `astevens2694@gmail.com`, launched via `claude-dev`. This account has no Bitwarden session and no MCP access by design, keeping the data boundary clean.

```bash
claude-dev   # launches Claude with isolated config at $HOME/.claude-dev
```

Claude Dev owns: skills, hooks, MCP server changes, collector jobs, PowerShell modules, TUI apps, test suites, type generation, refactors.

### Sanitization before crossing sessions

Private system data must not enter a Dev session. Before describing a task to Claude Dev, strip all private values from any ops context — real device names, hostnames, IPs, UPNs, credentials, and alert content are not permitted across the boundary.

Use `/code-handoff` in an Ops session to create a sanitized spec note in `Handoffs/`. Review it in the vault, then paste the spec into a `claude-dev` session.

### Gemini: web research only

Gemini's role is public web research — four tiers (instant · quick · deep · research), cited sources, image input. It is not a code assistant. See `.gemini/GEMINI.md` for tier descriptions and `.claude/rules/gemini-routing.md` for the routing table.

## Dev Tools

You can browse all registered MCP tools and their schemas without starting a full Claude session by using the MCP Inspector:

```bash
# From the mcp-server directory after a build
npx @modelcontextprotocol/inspector node dist/index.js
```

This is useful for verifying that a new tool has registered correctly before testing it end-to-end.
