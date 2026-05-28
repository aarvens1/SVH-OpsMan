# Skill: Dependency Manager

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Manages project dependencies via npm.

---

## Capabilities

Acts as a wrapper around the `npm` command-line tool to manage dependencies in `package.json` files. It can add, remove, and inspect packages. This skill is aware of the multiple `package.json` files in the monorepo (`.`, `collector/`, `mcp-server/`).

**Primary Workflow:**

1.  **Goal & Location:** User specifies what they want to do and where (e.g., "Add 'axios' to the collector," "Show me outdated packages in the mcp-server"). If location is omitted, it will ask.
2.  **Command Formulation:** The skill forms the correct `npm` command, including the `--prefix` flag to target the correct subdirectory.
3.  **Execution & Confirmation:** For adding or removing packages, it previews the command before running. For inspection commands, it runs them directly.
4.  **Output Parsing:** It parses the `npm` output to provide a clean summary to the user, such as a list of outdated packages or the reason a package is in the dependency tree.

---

## Invocation Phrases

- "Add a dependency to..."
- "Remove a package from..."
- "Are there any outdated packages?"
- "Why is 'lodash' installed in the mcp-server?"
- "Install dependencies for the collector"

---

## Tools

- **`run_shell_command`**: To execute `npm` commands.
- **`ask_user`**: To clarify which `package.json` to operate on.
- **`read_file`**: To inspect `package.json` and `package-lock.json` files directly.
