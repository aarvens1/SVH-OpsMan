# Skill: PowerShell Navigator

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Provides a conversational interface to find, understand, and execute commands from the SVH PowerShell modules.

---

## Capabilities

This skill acts as an intelligent wrapper around the project's PowerShell modules located in the `powershell/` directory. It helps the user discover and safely execute commands without needing to know the exact function names or parameters.

**Primary Workflow:**

1.  **Goal Identification:** The user states a goal (e.g., "I need to check the replication status on the domain controllers," "Disable a user account," "Find out which VMs are running on a Hyper-V host").
2.  **Module & Command Discovery:** The skill searches the `.psm1` files in the `powershell/modules/` directory, reading the comment-based help (`.SYNOPSIS`, `.DESCRIPTION`) to find functions that match the user's intent.
3.  **Command Suggestion:** It proposes one or more relevant commands to the user, explaining what each one does based on its help content.
4.  **Parameter Assistance:** Once a command is selected, the skill identifies the required parameters (using `Get-Help -Full` or parsing the `param()` block). It then asks the user for the necessary values, using `.PARAMETER` descriptions from the help content to clarify what each parameter means. It will use information from the conversation history to pre-fill parameters where possible.
5.  **Command Preview:** It constructs the final PowerShell command and shows it to the user for confirmation.
6.  **Safe Execution:** Upon approval, it executes the command using the `pwsh -c "..."` tool via `Desktop Commander`.
7.  **Output Display:** It returns the output from the PowerShell command to the user.

---

## Invocation Phrases

- "Navigate the PowerShell modules"
- "Help me with PowerShell"
- "I need to run a PowerShell command to..."
- "What SVH PowerShell function can..."
- "Find a PowerShell command for..."

---

## Tools

- **`powershell_discover_commands`**: To find relevant commands based on a topic.
- **`powershell_get_command_parameters`**: To get the parameters for a specific command.
- **`ask_user`**: To present command suggestions and ask for parameter values.
- **`Desktop Commander` (`run_shell_command`)**: To execute the final `pwsh` command.

---

## Example Session

**User:** "I need to check the AD replication status."

**Claude (using PowerShell Navigator):**
1.  **`powershell_discover_commands`** with `topic: "AD replication"`. It returns a list of commands, including `{ name: "Get-ADReplicationStatus", synopsis: "Checks the replication status across all domain controllers.", module: "SVH.AD.psm1" }`.
2.  **`powershell_get_command_parameters`** with `commandName: "Get-ADReplicationStatus"`. It returns an empty array `[]`.
3.  **`ask_user`**: "I found the command `Get-ADReplicationStatus` which 'Checks the replication status across all domain controllers.' It doesn't require any parameters. Would you like to run it?"
4.  **User:** "Yes"
5.  **`run_shell_command`**: `pwsh -c ". ./powershell/connect.ps1; Get-ADReplicationStatus | ConvertTo-Json"`
6.  Displays the formatted JSON output to the user.
