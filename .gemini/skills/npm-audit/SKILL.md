# Skill: NPM Audit

- **Author:** Gemini
- **Version:** 1.0
- **Account:** Dev (Account A)
- **Description:** Runs npm audit across the project's packages, interprets the results, and proposes fixes.

---

## Capabilities

Identifies vulnerable dependencies in `mcp-server/` and `collector/` (the two npm workspaces in this project). Differentiates between dev-only and production vulnerabilities. Proposes the minimal fix (upgrade or override) rather than a wholesale dependency swap.

---

## Primary Workflow

1. **Discover workspaces**: check for `package.json` in `mcp-server/`, `collector/`, and project root.
2. **Run audit** in each workspace:
   ```
   npm audit --json
   ```
3. **Parse the JSON output**: group findings by severity (critical, high, moderate, low).
4. **Report**: one table per workspace — package name, severity, vulnerability description, affected version range, fix version.
5. **Propose fixes**:
   - If `npm audit fix` resolves it without breaking changes: say so and offer to run it.
   - If a breaking-change upgrade is needed: describe the breaking change and ask before proceeding.
   - If no fix exists (zero-day or abandoned package): flag it and suggest an alternative.
6. **Apply approved fixes**: run `npm audit fix` or update `package.json` version pins as agreed.
7. **Verify**: re-run `npm audit` and confirm the finding count dropped.

---

## Invocation Phrases

- "Run npm audit"
- "Check for vulnerable dependencies"
- "Any security issues in our packages?"
- "npm-audit"

---

## Tools

- **`run_shell_command`**: To run `npm audit`, `npm audit fix`, `npm install`.
- **`read_file`**: To read `package.json` and `package-lock.json`.
- **`replace`**: To update version pins in `package.json` if needed.
- **`ask_user`**: To confirm before applying breaking-change fixes.
