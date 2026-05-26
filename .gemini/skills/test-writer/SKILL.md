# Skill: Test Writer

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Scaffolds test files for existing source code.

---

## Capabilities

Automates the creation of unit test files. It recognizes the project's testing framework (`vitest`, based on `mcp-server/vitest.config.ts`) and generates boilerplate test code.

**Primary Workflow:**

1.  **Source File Input:** The user specifies a source file to create tests for (e.g., `mcp-server/src/utils/time.ts`).
2.  **Test File Path Generation:** The skill determines the correct location and name for the test file (e.g., `mcp-server/src/__tests__/utils/time.test.ts`).
3.  **Boilerplate Generation:** It creates the test file with the necessary imports from `vitest` (`describe`, `it`, `expect`) and imports the functions/classes from the source file.
4.  **Test Case Scaffolding:** It analyzes the source file and creates empty `it(...)` blocks for each exported function or method, suggesting what should be tested (e.g., "should handle null inputs," "should return the correct value for a standard case").

---

## Invocation Phrases

- "Write tests for this file."
- "Create a test file for..."
- "Scaffold unit tests for `mcp-server/src/secrets.ts`"

---

## Tools

- **`read_file`**: To analyze the source file.
- **`write_file`**: To create the new test file.
- **`ask_user`**: To confirm the target source file.
