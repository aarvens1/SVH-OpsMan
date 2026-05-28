---
name: shell-script-converter
description: Converts simple shell scripts to PowerShell or TypeScript.
---

# Skill: Shell Script Converter

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Converts simple shell scripts to PowerShell or TypeScript.

---

## Capabilities

Helps modernize the project by converting legacy shell scripts from the `scripts/` directory into either PowerShell or TypeScript, which are the primary languages of the repository.

**Primary Workflow:**

1.  **Script Input:** User provides the path to a shell script to be converted.
2.  **Target Language:** User specifies the target language (PowerShell or TypeScript).
3.  **Script Analysis:** The skill reads the shell script and parses its commands, variables, and logic.
4.  **Code Conversion:** It translates the shell script line-by-line, command-by-command, into the equivalent constructs in the target language. It will handle common commands like `echo`, `cd`, `ls`, `grep`, `cat`, and variable assignments.
5.  **Output:** It provides the converted script as a code block. It will not write the file automatically, allowing the user to review it first.

---

## Invocation Phrases

- "Convert this shell script to PowerShell."
- "Translate `scripts/health.sh` to TypeScript."
- "How would I write this shell script in PowerShell?"

---

## Tools

- **`read_file`**: To read the source shell script.
- **`ask_user`**: To select the target language.
