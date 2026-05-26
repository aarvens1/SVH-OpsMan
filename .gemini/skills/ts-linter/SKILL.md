# Skill: TS Linter

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Runs the TypeScript compiler and linter to check for errors and style issues.

---

## Capabilities

Provides an interface to the TypeScript compiler (`tsc`) and any configured linter (like ESLint) to perform static analysis on the codebase.

**Primary Workflow:**

1.  **Target Selection:** User specifies a target to lint (a specific file, a directory like `collector/src`, or the entire project).
2.  **Command Execution:** The skill runs the appropriate command. For TypeScript files, this would be `npx tsc --noEmit --project <path/to/tsconfig>` or `npx eslint <path>`.
3.  **Output Parsing:** It captures the output from the tool.
4.  **Problem Summary:** It summarizes the findings, grouping errors and warnings and presenting them in a readable format. For common, fixable errors, it may suggest the fix.
5.  **Applying Fixes (Optional):** If the linter supports automatic fixing (`eslint --fix`), it can offer to run the command for the user.

---

## Invocation Phrases

- "Lint this file."
- "Check the collector for TypeScript errors."
- "Run the linter on the mcp-server."
- "Are there any type errors in the project?"

---

## Tools

- **`run_shell_command`**: To execute `tsc` and `eslint`.
- **`ask_user`**: To confirm before applying automatic fixes.
