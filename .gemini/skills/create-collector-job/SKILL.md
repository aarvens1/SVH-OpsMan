# Skill: Create Collector Job

- **Author:** Gemini
- **Version:** 1.0
- **Description:** Scaffolds a new collector job within the SVH-OpsMan project.

---

## Capabilities

This skill automates the creation of a new data collector job. It handles file creation, boilerplate code generation, and registration of the new job within the collector's planning and manifest systems.

**Primary Workflow:**

1.  **Job Name Input:** The user provides a name for the new job (e.g., `github-audit`, `cloudflare-logs`). The skill will camelCase the name for filenames and PascalCase for class names.
2.  **File Scaffolding:** It creates a new file `collector/src/jobs/<job-name>.ts`.
3.  **Boilerplate Generation:** It populates the new file with a standard `Job` class implementation. The boilerplate includes the basic structure with `name`, `schedule`, and `run` properties, and imports the necessary types.
4.  **Manifest Update:** It reads `collector/src/manifest.ts` and adds the new job's name to the `JobName` union type, ensuring it's a recognized job throughout the system.
5.  **Planner Registration:** It reads `collector/src/planner.ts`, adds an import statement for the new job class, and adds the new job to the `allJobs` and `defaultJobs` arrays.
6.  **Completion Summary:** It reports the files it created and modified.

---

## Invocation Phrases

- "Create a new collector job"
- "Scaffold a new job"
- "Add a collector for..."

---

## Tools

- **`ask_user`:** To get the name of the new job.
- **`write_file`:** To create the new `.../jobs/<job-name>.ts` file.
- **`read_file`:** To read the contents of `manifest.ts` and `planner.ts`.
- **`replace`:** To update `manifest.ts` and `planner.ts` with the new job information.

---

## Example Session

**User:** "Create a new collector job for Cloudflare."

**Gemini (using Create Collector Job):**
1.  **`ask_user`:** "What should the job be named? (e.g., `cloudflare-logs`)"
2.  **User:** "cloudflare-firewall-events"
3.  The skill determines the filename `cloudflare-firewall-events.ts` and the class name `CloudflareFirewallEventsJob`.
4.  **`write_file`:** Creates `collector/src/jobs/cloudflare-firewall-events.ts` with the boilerplate class.
5.  **`read_file`** `collector/src/manifest.ts`.
6.  **`replace`:** Adds `"cloudflare-firewall-events"` to the `JobName` type in `manifest.ts`.
7.  **`read_file`** `collector/src/planner.ts`.
8.  **`replace`:** Adds the import and registers the new job in `planner.ts`.
9.  **Output:** "I have created the `CloudflareFirewallEventsJob` and registered it. The following files were modified:
    - `collector/src/jobs/cloudflare-firewall-events.ts` (created)
    - `collector/src/manifest.ts` (updated)
    - `collector/src/planner.ts` (updated)"
