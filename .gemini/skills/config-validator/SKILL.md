---
name: config-validator
description: Validates project configuration files.
---

# Skill: Config Validator

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Validates project configuration files.

---

## Capabilities

Checks various project configuration files for correctness, consistency, and adherence to best practices.

**Primary Workflow:**

1.  **File Input:** User provides a path to a config file (e.g., `package.json`, `tsconfig.json`, `.claude/config.yaml`, `.gitignore`).
2.  **Validation Logic:** The skill applies a set of rules specific to the file type:
    -   **`package.json`**: Checks for missing scripts, mismatched dependency versions, etc.
    -   **`tsconfig.json`**: Checks for recommended compiler options (`strict`, `forceConsistentCasingInFileNames`).
    -   **`.claude/config.yaml`**: Validates the YAML syntax and structure.
    -   **`.gitignore`**: Looks for common patterns that should be ignored (like `.env`, `node_modules`).
3.  **Report:** It reports any findings or suggestions for improvement.

---

## Invocation Phrases

- "Validate my tsconfig."
- "Is this package.json correct?"
- "Check the .claude config."
- "What else should I add to my .gitignore?"

---

## Tools

- **`read_file`**: To read the configuration files.
- **`google_web_search`**: To look up best practices for specific configuration files.
