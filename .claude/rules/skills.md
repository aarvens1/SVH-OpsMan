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
- `allowed-tools` — space-separated MCP tool names in a **single quoted string**. Use `mcp__<server>__<tool>` format. Wildcards are supported: `mcp__obsidian__*`. Include every tool the skill needs; Claude will not use tools not listed here.

## allowed-tools format

```yaml
allowed-tools: "mcp__svh-opsman__ninja_list_servers mcp__svh-opsman__mde_list_alerts mcp__obsidian__* mcp__time__*"
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

## Adding a new skill

1. Create `.claude/skills/<name>/SKILL.md` with the required frontmatter
2. Add the skill name and trigger phrases to `README.md`
3. Add tool names to `allowed-tools` — include `mcp__obsidian__*` and `mcp__time__*` for any skill that writes a note
4. Add the skill name to the `allowed-tools` list of any higher-level skill that invokes it (rare)
