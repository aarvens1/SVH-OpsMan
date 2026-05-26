# Development Guide

This guide is for developers contributing to the SVH OpsMan project. It covers the repository structure, conventions, and instructions for extending the system.

## Repository Layout

```
.claude/
  config.yaml              ← Centralized config for UPNs, group IDs, etc.
  settings.json            ← Claude Code permissions & session hook definition
  hooks/session-start.sh   ← Injects dynamic context at the start of each session
  rules/                   ← Scoped conventions for TypeScript and Obsidian output
  skills/                  ← Skill definitions, loaded on-demand by Claude
collector/
  src/                     ← The on-demand bulk data collector
mcp-server/
  src/                     ← The custom MCP server that exposes tools to Claude
systemd/
  user/                    ← systemd service and timer files for automation
powershell/
  modules/                 ← The PowerShell module suite for write ops
  connect.ps1              ← Script to load all PS modules and credentials
references/                ← Triage guides and failure patterns used by skills at runtime
scripts/                   ← Setup and utility scripts
dotfiles/                  ← Shell aliases, Windows Terminal settings, etc.
staging/                   ← (gitignored) Output of the Collector
db/                        ← (gitignored) SQLite databases for metrics and run logs
tui/                       ← The PowerShell TUI application
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

## Testing

The MCP server has a [Vitest](https://vitest.dev/) unit test suite covering utilities and tool logic.

```bash
cd mcp-server
npm test            # single run
npm run test:watch  # watch mode
npm run typecheck   # TypeScript check without building
```

Test files live under `mcp-server/src/__tests__/`. When adding a new tool, add a corresponding test file under `__tests__/tools/`. When adding a utility, add tests under `__tests__/utils/`. Run `npm run typecheck` before committing — test files are excluded from the build but the source files they import are not.

## Using Gemini for Development

While Claude is the "Ops Expert," Gemini's role is the **Dev Assistant**. It is ideal for:

-   **Code Generation & Refactoring:** Creating new scripts, refactoring `mcp-server` tools, or improving PowerShell modules.
-   **Development & Debugging:** Helping to debug code, explaining complex logic, or writing unit tests.

### How Gemini Accesses Project Data

Gemini cannot use the MCP tools directly, but it can access project data and run tasks via the shell aliases and command-line tools:

-   **Collector Data:** `staging-cat <job_name>` (e.g., `staging-cat ninja-devices`)
-   **Run Collector Jobs:** `gather` or `gather-<job_name>`
-   **Metrics:** `runs`, `disk-trend`, and `alert-trend`
-   **PowerShell:** `pwsh -c "..."`

You can prompt Gemini like this:
> "Run the ninja collector, then show me all offline devices that are not in maintenance mode."

Gemini will then use the available shell commands (`gather-ninja`, `staging-cat ninja-devices`, and `jq`) to fulfill the request.

### GitHub Integration

Gemini uses a repository-specific **SSH Deploy Key** (`~/.ssh/svh_opsman_gemini_github_key`) for `git` operations, which is configured automatically in `~/.ssh/config`.

### Multiple Gemini Accounts

The `dotfiles/bashrc.sh` file includes aliases for managing multiple Gemini accounts (e.g., `gemini-work`, `gemini-personal`) by using different configuration directories.

## Dev Tools

You can browse all registered MCP tools and their schemas without starting a full Claude session by using the MCP Inspector:

```bash
# From the mcp-server directory after a build
npx @modelcontextprotocol/inspector node dist/index.js
```

This is useful for verifying that a new tool has registered correctly before testing it end-to-end.
