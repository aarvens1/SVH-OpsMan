# SVH OpsMan

SVH OpsMan is a purpose-built command station for SVH IT operations, providing a unified interface to all connected systems. It uses an AI-powered engine to streamline everything from daily briefings to incident response.

This README provides a high-level overview of the project. For detailed information, please refer to the documents in the `docs/` directory.

## Core Concepts

The project is built on a few core components:

- **AI Assistants**:
    - **Claude**: The primary "Ops Expert" for interacting with live systems, running investigations, and performing operational tasks.
    - **Gemini**: The "Dev Assistant" for code generation, refactoring, and development support.
- **MCP Server**: A custom Model Context Protocol (MCP) server that exposes tools for interacting with all integrated IT systems.
- **Collector**: An on-demand data gathering engine that collects bulk data from various sources into a `staging` directory.
- **Obsidian Vault**: The primary "staging area" for all output. All reports, drafts, and notes are generated here before being actioned.
- **PowerShell Modules**: A comprehensive suite of PowerShell modules for performing write operations and interacting with on-premise systems.

## Quick Start

For users who have already completed the setup, the daily workflow starts with:

1.  **Unlock Bitwarden:**
    ```bash
    export BW_SESSION=$(bw unlock --raw)
    ```
2.  **Start the OpsMan CLI:**
    ```bash
    opsman
    ```
3.  **Request a briefing:**
    ```
    /day-starter
    ```

## Documentation

All detailed documentation has been moved to the `docs/` directory to keep the project root clean.

- **[Getting Started (`docs/getting_started.md`)](./docs/getting_started.md)**: A full, end-to-end setup guide for new users on a fresh workstation.
- **[User Guide (`docs/user_guide.md`)](./docs/user_guide.md)**: A guide to the daily workflow, available skills, and how to interact effectively with the AI.
- **[Architecture (`docs/architecture.md`)](./docs/architecture.md)**: A deep dive into the system's architecture, technology stack, and design decisions.
- **[Development Guide (`docs/development.md`)](./docs/development.md)**: Information for developers contributing to the project, including repository structure and how to add new tools or skills.
- **Reference Guides**:
    - **[Credentials (`docs/reference/credentials.md`)](./docs/reference/credentials.md)**: Detailed reference for all required credentials.
    - **[PowerShell (`docs/reference/powershell.md`)](./docs/reference/powershell.md)**: Guide to the PowerShell module suite.
    - **[Staging Data (`docs/reference/staging_data.md`)](./docs/reference/staging_data.md)**: Reference for the data format of files produced by the collector.
- **[Runtime References (`references/`)](./references/)**: Triage guides and failure patterns used by the AI at runtime.

