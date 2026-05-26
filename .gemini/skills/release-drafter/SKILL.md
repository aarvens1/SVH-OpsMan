# Skill: Release Drafter

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Drafts release notes based on git history.

---

## Capabilities

Automates the process of creating release notes. It inspects the git history since the last version tag and categorizes changes into sections like "New Features," "Bug Fixes," and "Refactoring."

**Primary Workflow:**

1.  **Version Input:** User specifies the new version number (e.g., v1.2.0). The skill will try to find the previous version tag automatically.
2.  **Git History Analysis:** It runs `git log <last-tag>..HEAD --pretty=format:"%s"` to get all commit messages since the last release.
3.  **Categorization:** It parses the commit messages, using conventions (like `feat:`, `fix:`, `refactor:`) to group them into categories.
4.  **Note Generation:** It generates a draft of the release notes in Markdown format.
5.  **Output:** It presents the drafted notes in a code block for the user to copy and edit.

---

## Invocation Phrases

- "Draft release notes for v2.1."
- "What has changed since the last release?"
- "Help me write the release notes."

---

## Tools

- **`run_shell_command`**: To execute `git log` and `git tag` commands.
- **`ask_user`**: To get the new version number if it can't be inferred.
