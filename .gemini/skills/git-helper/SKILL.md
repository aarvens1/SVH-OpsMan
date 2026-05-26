# Skill: Git Helper

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Provides a conversational interface for common Git operations.

---

## Capabilities

Simplifies Git workflows by translating natural language requests into `git` commands. It can handle staging, committing, branching, and inspecting repository history.

**Primary Workflow:**

1.  **Goal Identification:** User states a goal like "Create a new branch," "Commit my changes," or "What did I just change?"
2.  **Command Translation:** The skill translates the request into the appropriate `git` command(s). For complex requests, it may chain commands.
3.  **Information Gathering:** For actions like committing, it will first run `git status` and `git diff` to gather context and present it to the user.
4.  **Confirmation:** For any write operations (commit, branch, push, etc.), it will preview the command(s) and ask for confirmation.
5.  **Execution:** Runs the command via `run_shell_command`.

---

## Invocation Phrases

- "Git status"
- "Create a new branch named..."
- "Stage the README.md file"
- "Commit my changes with the message..."
- "Show me the log"
- "What's changed in the collector directory?"

---

## Tools

- **`run_shell_command`**: To execute `git` commands.
- **`ask_user`**: To confirm actions and get commit messages.
- **`read_file`**: To read `.gitignore` to provide better context on untracked files.
