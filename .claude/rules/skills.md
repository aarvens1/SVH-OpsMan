---
paths:
  - ".claude/skills/**"
---

# Skill authoring conventions

## File layout

Each skill lives in its own directory: `.claude/skills/<name>/SKILL.md`

To disable a skill without deleting it, rename the file to `SKILL.md.disabled`.

## Required frontmatter

Every `SKILL.md` must have all four fields:

```yaml
---
name: skill-name
description: One sentence covering what it does and the trigger phrases.
when_to_use: One sentence on when to invoke it vs. alternatives.
allowed-tools: "tool_a tool_b tool_c"
---
```

- `name` — kebab-case, matches directory name
- `description` — include trigger phrases here so the skill list in README stays in sync
- `allowed-tools` — space-separated MCP tool names in a **single quoted string**. Use `mcp__<server>__<tool>` format. Wildcards are supported: `mcp__claude_ai_Fathom__*`. Include every tool the skill needs; Claude will not use tools not listed here.

## allowed-tools format

```yaml
allowed-tools: "mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__mde_list_alerts mcp__claude_ai_Microsoft_365__* mcp__claude_ai_Fathom__*"
```

Keep tools on one line — the value is a single quoted string, not a YAML list.

## Trigger phrases

List trigger phrases in the `description` frontmatter field and in `README.md`. Users can invoke a skill by:
- Typing `/<name>` as a slash command
- Using a natural-language trigger phrase Claude recognises from the description

## Skill body

The skill body is a prompt that runs when the skill is invoked. Write it as imperative instructions to Claude, not as documentation for a human reader.

Structure for most skills:
1. **Step N** sections in execution order, with parallel steps called out explicitly ("Run these in parallel:")
2. **Output** section at the end — vault path, note structure, frontmatter

## Referencing config values

Do not hardcode UPNs, plan IDs, group IDs, or vault paths in skill files. These canonical values live in `.claude/config.yaml` and are injected at session start. If a skill currently has a hardcoded value that conflicts with `config.yaml`, the `config.yaml` value takes precedence.

## Skill usage log

Every skill that produces an Obsidian note must append one line to `System/skill-log.md` in the vault as its final step. This is the skill execution record — it answers "which skills ran this week and what did they produce."

Format (one line per run):
```
YYYY-MM-DD HH:MM | skill-name | path/to/output-note.md | one-line summary
```

For skills that produce inline output only (no dedicated note): use `inline` as the path:
```
YYYY-MM-DD HH:MM | license-count | inline | E1: 4 avail, E3: 12 avail
```

Use `edit_block` (append) so log entries accumulate rather than overwrite.

## Note attribution

All skill-produced notes already carry `skill: <name>` in their frontmatter. This is the canonical attribution field. To find every note a specific skill has produced, use an Obsidian Dataview query:

```dataview
TABLE date, file.path FROM ""
WHERE skill = "troubleshoot"
SORT date DESC
```

No backlinks or separate index files are needed — the `skill:` frontmatter field is the source of truth.

## PowerShell companion rule

**Check existing coverage first.** Before writing a new function, grep the `powershell/modules/` directory for functions that already read the same data. `SVH.Entra` covers all M365/Entra identity and licensing; `SVH.NinjaOne` covers all RMM data; `SVH.Azure` covers ARM + Defender; etc. Build on what's there rather than duplicating.

Every new skill should have matching PowerShell functions that cover the same ground. This is not optional — a skill without a PS companion means operators can't script or schedule the same operation without Claude.

**The two directions:**

| Skill type | Required PS coverage |
|---|---|
| Skill reads/aggregates data | `Get-SVH*` function returning the same data as a pipeline-friendly PSCustomObject |
| Skill creates or modifies something | Both `Get-SVH*` (to check current state) and `New-SVH*` / `Set-SVH*` (to make the change) |
| Skill applies threshold/alert logic | Add a `Get-SVH*Alert` wrapper that applies the threshold and returns only flagged items |

**Style requirements** — every companion function must have:
- `Verb-SVH<Noun>` naming (TUI auto-discovers from this pattern)
- `<# .SYNOPSIS ... .EXAMPLE ... #>` comment-based help block
- `[CmdletBinding()]` + `[OutputType([PSObject])]`
- `Export-ModuleMember -Function` at the end
- Parameters with `[Parameter(Mandatory)]` and `[Alias(...)]` where appropriate

**Where to add:** Match the module to the data domain — licenses → `SVH.Entra`, network → `SVH.Network`, on-prem servers → `SVH.OnPrem`, etc. See `.claude/rules/powershell.md` for the module coverage table.

**TUI coverage is automatic:** The TUI parser auto-discovers all exported functions from `SVH.*.psm1`. No extra registration step needed. Just export the function.

**Document the relationship:** Reference the PS companions in the skill's Obsidian page (`Skills/[skill-name].md`).

## Skill page rule

Every new skill needs a reference page at `Skills/[skill-name].md` in the Obsidian vault. This is a persistent, in-place-updated card — the canonical reference for what the skill does, where it writes, and what PS functions complement it.

**Required sections:**
```
# /skill-name
One-sentence description.

## Invoke
`/skill-name` · "trigger phrase" · "another trigger"

## Output
| | |
|---|---|
| Dedicated note | `Path/YYYY-MM-DD.md` |
| Updates Activity Log | Yes / No |

## PowerShell companions
| Function | Module | Description |
|----------|--------|-------------|
| `Get-SVHFoo` | SVH.Entra | ... |

## When to use
vs. alternatives, one or two sentences.
```

**Frontmatter:**
```yaml
---
date: YYYY-MM-DD
type: skill-reference
status: current
tags: [skill, reference]
---
```

## Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md` with the required frontmatter
2. Add the skill name and trigger phrases to `README.md`
3. Add tool names to `allowed-tools` — include every MCP tool the skill calls, using the `mcp__<server>__<tool>`
  format (e.g. `mcp__svh-opsman__*`, `mcp__claude_ai_Microsoft_365__*`)
4. Add the skill name to the `allowed-tools` list of any higher-level skill that invokes it (rare)
5. Add a `## Skill log` section at the end of the skill body with the append instruction
6. Add or verify PowerShell companion functions per the PowerShell companion rule above
7. Create `Skills/[skill-name].md` in the Obsidian vault per the skill page rule above
