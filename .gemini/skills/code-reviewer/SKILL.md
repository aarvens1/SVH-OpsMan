---
name: code-reviewer
description: Reviews TypeScript, PowerShell, or shell code for correctness, quality, and security issues. Operates on local files or git diffs — no private system data needed.
---

# Skill: Code Reviewer

- **Author:** Gemini
- **Version:** 1.0
- **Account:** Dev (Account A) or Docs (Account B for large PRs)
- **Description:** Reviews TypeScript, PowerShell, or shell code for correctness, quality, and security issues. Operates on local files or git diffs — no private system data needed.

---

## Capabilities

Reviews code purely from what's in the repository. Does not need live system access. Covers:

- **Correctness**: logic errors, off-by-one, unhandled edge cases, broken async/await patterns
- **TypeScript quality**: missing types, `any` usage, improper null handling, non-idiomatic patterns
- **PowerShell quality**: missing `[CmdletBinding()]`, no `try/catch`, output pollution, incorrect pipeline usage
- **Security**: command injection risk, hardcoded secrets, unsafe eval, unvalidated inputs at system boundaries
- **Test coverage gaps**: functions that have no corresponding test in `__tests__/`
- **Naming and structure**: inconsistency with conventions established elsewhere in the codebase

---

## Primary Workflow

1. **Get the scope**: user specifies a file, directory, or asks to review since last commit / a branch diff.
2. **Gather the code**:
   - For a file or directory: `read_file` the relevant files.
   - For a git diff: `run_shell_command` → `git diff main...HEAD` or `git diff --staged`.
3. **Analyze**: look for issues across all categories above.
4. **Report**: group findings by severity — Critical, Warning, Suggestion. One finding per bullet. Format:
   ```
   **[Severity]** `path/to/file.ts:42` — description of issue and why it matters.
   ```
5. **Fix offer**: for Critical and Warning findings, offer to apply the fix using `replace`.

---

## Invocation Phrases

- "Review this file"
- "Review my changes since main"
- "Code review for `path/to/file.ts`"
- "What issues do you see in this PR?"
- "code-reviewer"

---

## Tools

- **`read_file`**: To read source files.
- **`run_shell_command`**: To run `git diff`, `git log`, or `tsc --noEmit`.
- **`replace`**: To apply fixes.
- **`ask_user`**: To confirm scope and whether to apply fixes.
