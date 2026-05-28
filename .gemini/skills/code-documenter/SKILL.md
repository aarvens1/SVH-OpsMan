---
name: code-documenter
description: Adds documentation comments to code files.
---

# Skill: Code Documenter

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Adds documentation comments to code files.

---

## Capabilities

Analyzes a source code file (TypeScript or PowerShell) and adds documentation comments (JSDoc/TSDoc for TypeScript, Comment-Based Help for PowerShell) to functions, classes, and methods that lack them.

**Primary Workflow:**

1.  **File Input:** User provides the path to a file to document.
2.  **Code Analysis:** The skill reads the file and parses its structure to identify code elements (functions, classes, methods, parameters).
3.  **Documentation Generation:** For each element without documentation, it generates a descriptive comment, infers parameter types and descriptions from the code, and attempts to determine a return value.
4.  **Code Update:** It uses the `replace` tool to insert the generated documentation blocks above the corresponding code elements. It will do this one function at a time to ensure accuracy.

---

## Invocation Phrases

- "Document this file for me."
- "Add documentation to `collector/src/jobs/ninjaone.ts`."
- "Generate comments for this PowerShell module."

---

## Tools

- **`read_file`**: To read the source file.
- **`replace`**: To add the documentation comments to the file.
- **`ask_user`**: To ask for clarification if the purpose of a function is ambiguous.
