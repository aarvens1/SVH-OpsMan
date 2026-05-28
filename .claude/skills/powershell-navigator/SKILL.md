---
name: powershell-navigator
description: Conversational interface for discovering and safely executing commands from the SVH PowerShell modules. Reads module .psm1 files to match user intent to available functions, walks through parameters, previews the command, and executes via Desktop Commander on approval. Trigger phrases: "navigate the PowerShell modules", "help me with PowerShell", "I need to run a PowerShell command to...", "what SVH PowerShell function can...", "find a PowerShell command for...".
when_to_use: Use when Aaron wants to run a PowerShell operation but doesn't know the exact function name or parameters — avoids raw pwsh guesswork and surfaces the right module function with safe confirmation before execution.
allowed-tools: "Read(powershell/**) mcp__desktop-commander__*"
---

Help Aaron find and execute the right SVH PowerShell command for his stated goal.

## Step 1 — Identify the goal

Ask Aaron what he wants to accomplish if it isn't clear. Example goals: "check AD replication", "disable a user account", "find VMs on a Hyper-V host".

## Step 2 — Discover matching commands

Read the `.psm1` files in `powershell/modules/` (`SVH.AD.psm1`, `SVH.Entra.psm1`, `SVH.Exchange.psm1`, `SVH.OnPrem.psm1`). Scan `.SYNOPSIS` and `.DESCRIPTION` comment blocks to find functions that match Aaron's intent. Identify 1–3 candidates.

## Step 3 — Suggest a command

Present the best match (or short-list if ambiguous): function name, module, and one-line synopsis. Ask Aaron to confirm which one to use.

## Step 4 — Collect parameters

Parse the selected function's `param()` block and `.PARAMETER` help entries. For each required parameter, ask Aaron for the value — use `.PARAMETER` descriptions to explain what's needed. Pre-fill any values evident from conversation context.

## Step 5 — Preview and confirm

Construct the full `pwsh` command and show it to Aaron before running. Do not execute until Aaron confirms.

## Step 6 — Execute

Run via Desktop Commander:
```
pwsh -c ". ./powershell/connect.ps1; <FunctionName> <params> | ConvertTo-Json -Depth 5"
```

## Step 7 — Display output

Format the JSON output legibly. Flag errors or unexpected empty results and suggest next steps.
