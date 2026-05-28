---
name: log-analyzer
description: Analyzes structured and unstructured log files.
---

# Skill: Log Analyzer

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Analyzes structured and unstructured log files.

---

## Capabilities

A general-purpose tool to ingest and analyze log files. It can parse common formats (JSON, CSV, plain text) and extract meaningful information.

**Primary Workflow:**

1.  **File Input:** User provides the path to one or more log files.
2.  **Analysis Goal:** User specifies what to look for (e.g., "find all errors," "count the occurrences of each message," "show me logs from a specific time range").
3.  **File Parsing:** The skill reads the log file and attempts to parse it line by line.
4.  **Data Extraction:** It filters and processes the log entries based on the user's goal.
5.  **Summarization:** It presents the findings in a structured format, such as a table of errors, a chart of message frequency, or a timeline of events.

---

## Invocation Phrases

- "Analyze this log file."
- "Count the errors in `staging/2026-05-26/collector.log`."
- "What are the most common messages in this log?"
- "Show me all log entries from yesterday."

---

## Tools

- **`read_file`**: To read the log file(s).
- **`ask_user`**: To clarify the analysis goal.
- **`run_shell_command`**: For using tools like `grep`, `awk`, or `jq` for very large files.
