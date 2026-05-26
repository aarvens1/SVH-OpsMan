# Skill: PowerShell Refactorer

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Analyzes and refactors PowerShell modules (`.psm1` files).

---

## Capabilities

Improves the quality and consistency of PowerShell code in the `powershell/modules` directory. It can identify and apply several types of refactoring.

**Primary Workflow:**

1.  **File Input:** The user specifies which `.psm1` file they want to refactor.
2.  **Refactoring Goal:** The user states a high-level goal, or asks the skill to propose improvements. Goals could include: "add comment-based help," "convert functions to a class-based module," "improve error handling."
3.  **Code Analysis:** The skill reads and parses the PowerShell script's Abstract Syntax Tree (AST) to understand its structure.
4.  **Refactoring Plan:** It identifies opportunities for improvement and presents a plan to the user (e.g., "I will add a `[CmdletBinding()]` attribute to 3 functions," "I will wrap the content of `Invoke-MyRequest` in a `try/catch` block").
5.  **Execution:** Upon approval, it uses the `replace` tool to apply the changes to the file.

---

## Invocation Phrases

- "Refactor this PowerShell module."
- "How can we improve `SVH.Core.psm1`?"
- "Add error handling to this PowerShell script."
- "Convert this module to use a class."

---

## Tools

- **`read_file`**: To read the `.psm1` file.
- **`replace`**: To apply refactoring changes.
- **`ask_user`**: To confirm the refactoring plan.
- **`run_shell_command`**: To potentially use PowerShell's own parser (`Parser::ParseFile`) to get the AST for more advanced analysis.
