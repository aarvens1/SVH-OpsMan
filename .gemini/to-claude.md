# Handoff to Claude

## Task

The overall goal is to fix the failing `vitest` tests in the `mcp-server` project. The tests were initially scaffolded, but many are failing or empty.

## Progress

*   I identified several categories of test failures, with the most immediate issue being numerous empty test files.
*   To address this efficiently, I created a custom skill named `test-writer-mcp-server` that automates the generation of test files based on the project's conventions.
*   I have successfully used this skill to generate tests for the following files:
    *   `mcp-server/src/__tests__/tools/onedrive.test.ts`
    *   `mcp-server/src/__tests__/tools/outlook-calendar.test.ts`
    *   `mcp-server/src/__tests__/tools/printerlogic.test.ts`
    *   `mcp-server/src/__tests__/tools/outlook-mail.test.ts`
    *   `mcp-server/src/__tests__/tools/sharepoint.test.ts`
    *   `mcp-server/src/__tests__/tools/unifi-network.test.ts`
    *   `mcp-server/src/__tests__/tools/unifi-cloud.test.ts`

## Next Steps for Claude

1.  **Continue Fixing Empty Test Suites**: There are two remaining empty test files:
    *   `mcp-server/src/tools/teams.ts`
    *   `mcp-server/src/tools/wazuh.ts`

    To fix these, use the `test-writer-mcp-server` skill I created. The workflow is:
    a.  Run `node .gemini/skills/test-writer-mcp-server/scripts/generate-test-prompt.js <path_to_source_file>` to get a detailed prompt.
    b.  Invoke the `generalist` agent with the generated prompt.
    c.  Write the returned code to the corresponding test file in `mcp-server/src/__tests__/tools/`.

2.  **Address Other Test Failures**: Once the empty suites are filled, run `npx vitest run` in the `mcp-server` directory to see the remaining errors. The main categories of failures I identified are:
    *   **Mocking Issues**: Look for errors related to `formatError` not being defined in mocks. The `http-mock-pattern.ts` in the skill's references has the fix for this.
    *   **Import Issues**: Some older test files might use `require()` instead of `import`, causing errors.
    *   **Assertion Errors**: Some tests have incorrect assertions (e.g., `expected true to be undefined`).

3.  **Final Verification**: Run the tests one last time to ensure everything passes.

4.  **Cleanup**: After the task is complete, the temporary copy of the `test-writer-mcp-server` skill in the workspace (`.gemini/skills/`) should be removed.
