---
name: api-spec
description: Generates TypeScript interfaces and Zod schemas from a JSON example or field list. Typically used after Claude provides a sanitized API response shape.
---

# Skill: API Spec

- **Author:** Gemini
- **Version:** 1.0
- **Account:** Dev (Account A)
- **Description:** Generates TypeScript interfaces and Zod schemas from a JSON example or field list. Typically used after Claude provides a sanitized API response shape.

---

## Capabilities

Converts a JSON example, field description, or prose spec into ready-to-use TypeScript types. Common handoff pattern: Claude calls a private API (NinjaOne, Graph, Wazuh), extracts the response shape with no real data, and hands it to this skill to produce the type file.

Produces:
- TypeScript `interface` or `type` declarations
- Optional: Zod schema for runtime validation (ask the user)
- Optional: a `parse<Type>` helper function using Zod

---

## Primary Workflow

1. **Get the input**: JSON example, field list, or a `.gemini/handoff.md` spec from Claude.
2. **Infer types**: map JSON values to TypeScript types. Arrays → `T[]`, nullable fields → `T | null`, optional fields → `T?`.
3. **Name the types**: PascalCase, matching the entity name (e.g. `NinjaDevice`, `WazuhAlert`).
4. **Ask about Zod**: "Do you want a Zod schema alongside the interface?"
5. **Determine the output file**: check if a `types/` or `interfaces/` directory exists; otherwise ask where to put it.
6. **Write the file** with `write_file`. Include a single-line comment noting the source (e.g. `// Generated from NinjaOne /devices response shape`).
7. **Run the linter**: `run_shell_command` → `npx tsc --noEmit` to confirm no type errors.

---

## Invocation Phrases

- "Generate types for this JSON"
- "Create a TypeScript interface from this"
- "Turn this response shape into types"
- "api-spec"

---

## Tools

- **`read_file`**: To read `.gemini/handoff.md` or existing type files.
- **`write_file`**: To create the new type file.
- **`run_shell_command`**: To run `tsc --noEmit` to validate.
- **`ask_user`**: To confirm output location and Zod preference.
