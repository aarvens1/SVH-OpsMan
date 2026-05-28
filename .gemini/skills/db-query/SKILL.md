---
name: db-query
description: Runs SQL queries against the project's SQLite database.
---

# Skill: DB Query

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Runs SQL queries against the project's SQLite database.

---

## Capabilities

Provides a conversational interface for querying the `db/metrics.db` SQLite database. It can translate natural language questions into SQL or execute raw SQL queries.

**Primary Workflow:**

1.  **Question/Query Input:** User asks a question in natural language ("How long did the last 5 collector runs take?") or provides a raw SQL query.
2.  **Schema Discovery:** The skill can use `.schema` command to understand the database structure (`runs`, `disk_usage`, `alert_count` tables).
3.  **SQL Translation:** For natural language, it translates the question into a valid SQL query.
4.  **Execution:** It uses the `sqlite3` command-line tool to execute the query against `db/metrics.db`.
5.  **Result Formatting:** It parses the output (e.g., CSV or table format) and presents it to the user in a clean, readable way.

---

## Invocation Phrases

- "Query the database."
- "How many collector runs failed yesterday?"
- "Show me the disk usage trend for the C: drive on server X."
- "Run this SQL query: SELECT * FROM runs ORDER BY timestamp DESC LIMIT 1;"

---

## Tools

- **`run_shell_command`**: To execute `sqlite3` commands.
- **`ask_user`**: To clarify ambiguous questions.
