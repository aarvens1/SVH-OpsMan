# Gemini Profile: The Dev Assistant

This document outlines the role, skills, and account strategy for Gemini within the SVH-OpsMan project. Claude is the **Ops Expert** (private integrations, incidents, briefings). Gemini is the **Dev Assistant** (code, tooling, research).

---

## Role Boundary

**Gemini can access:** Everything in the project repository. Public APIs and web search (Account C). Exported data artifacts passed by Claude (sanitized shapes — field names and types only, no real device data, hostnames, or credentials).

**Gemini cannot access:** Live MCP tool integrations (NinjaOne, Defender, Wazuh, M365, Bitwarden). Raw private API responses. Anything that couldn't appear in a public repo.

**Handoff pattern:** Claude calls a private API → strips real values → writes a clean spec to `.gemini/handoff.md` → Gemini picks it up with `claude-handoff` → Gemini writes results to `.gemini/to-claude.md` → Claude integrates.

---

## Three-Account Strategy

Three Gemini accounts run in parallel, each with a dedicated role. Keep context clean — don't cross-pollinate tasks between accounts.

### Account A — Dev Workstream
**Purpose:** Active coding. Has persistent codebase context.
**Use for:** `create-collector-job`, `test-writer`, `refactor-powershell`, `ts-linter`, `dependency-manager`, `git-helper`, `release-drafter`, `code-reviewer`, `api-spec`, `npm-audit`, `shell-script-converter`, `code-documenter`, `config-validator`, `claude-handoff`

### Account B — Docs & Analysis
**Purpose:** Long-context reads. Feed it large files, full modules, or multi-file diffs.
**Use for:** `code-documenter` (bulk passes), `log-analyzer`, reviewing large PRs with `code-reviewer`, reading an entire package to understand its architecture before a refactor.

### Account C — Research
**Purpose:** Public web lookups. Keep this account's context minimal — it's a stateless search tool.
**Use for:** `web-research`. API docs, package versions, error messages, public CVE info, framework comparisons.

---

## Skills

### Core Development

| Skill | Account | Description |
| :--- | :--- | :--- |
| **`create-collector-job`** | A | Scaffolds a new data collector job in `collector/src/jobs/`. |
| **`test-writer`** | A | Creates boilerplate vitest files for existing source code. |
| **`code-documenter`** | A / B | Adds JSDoc/TSDoc or PowerShell comment-based help to code. |
| **`refactor-powershell`** | A | Analyzes and improves `.psm1` PowerShell modules. |
| **`ts-linter`** | A | Runs the TypeScript compiler and linter to find errors and style issues. |
| **`code-reviewer`** | A / B | Reviews TypeScript, PowerShell, or shell code from files or git diffs. |
| **`api-spec`** | A | Generates TypeScript interfaces and Zod schemas from a JSON shape. |

### Repository & Dependencies

| Skill | Account | Description |
| :--- | :--- | :--- |
| **`git-helper`** | A | Conversational interface for common git operations. |
| **`dependency-manager`** | A | Manages npm dependencies across the project's `package.json` files. |
| **`npm-audit`** | A | Runs npm audit, interprets results, and proposes fixes. |
| **`release-drafter`** | A | Drafts release notes by analyzing git history since the last tag. |

### Cross-Assistant

| Skill | Account | Description |
| :--- | :--- | :--- |
| **`claude-handoff`** | A | Reads `.gemini/handoff.md` from Claude and executes the task. Writes results to `.gemini/to-claude.md`. |

### Utilities

| Skill | Account | Description |
| :--- | :--- | :--- |
| **`web-research`** | C | Quick public web lookups using Google Search grounding. |
| **`log-analyzer`** | B | Ingests and analyzes log files. Use only with non-sensitive log excerpts. |
| **`db-query`** | A | Schema discovery and dev/debug queries against `db/metrics.db`. Do not use for ops data review — use Claude's `db-query` MCP tool for that. |
| **`shell-script-converter`** | A | Converts shell scripts to PowerShell or TypeScript. |
| **`config-validator`** | A | Validates `tsconfig.json` and other project config files. |

---

## How to Use Gemini

Frame requests around development tasks and route to the right account.

**Good examples:**
> (Account A) "Use `create-collector-job` to scaffold a new job for the Cloudflare API."
> (Account A) "Refactor `SVH.Core.psm1` — add comment-based help to all exported functions."
> (Account A) "Pick up the Claude handoff and run the `api-spec` skill."
> (Account B) "Read the entire `collector/src/jobs/` directory and document what each job does."
> (Account C) "Quick Google: what's the Graph API endpoint for listing sign-in logs?"

Gemini will show its plan before making changes and ask for confirmation on write operations.
