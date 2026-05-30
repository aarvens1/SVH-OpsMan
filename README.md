# SVH OpsMan

This repository is Aaron's WSL 2 environment — the shell configuration, IT ops tooling, and AI assistant setup that run on a Windows 11 workstation. It's organized in three layers.

## Layers

**Layer 1 — Environment**
WSL shell, dotfiles, WinRM trust, Tailscale subnet routing, and systemd services. The foundation everything else runs on. See `docs/setup/` for one-time configuration guides and `scripts/` for setup automation.

**Layer 2 — OpsMan**
A custom MCP server that connects Claude to all managed IT systems (NinjaOne, Defender, M365, Azure, UniFi, Confluence, and more), an on-demand data collector for bulk pulls, a PowerShell module suite for write operations, and five TUI applications for interactive administration.

**Layer 3 — AI Context**
Claude and Gemini configuration, skill definitions, and runtime reference files the AI reads during operations. Claude is the Ops Expert — full MCP access, owns incident response and all reporting. Claude Dev (`astevens2694@gmail.com`) owns the development lifecycle. Gemini does public web research only — three depth tiers, cited sources, no MCP access.

## Quick Start

```bash
# 1. Unlock Bitwarden
bwu

# 2. Launch OpsMan
opsman
```

## Documentation

- **[Getting Started](./docs/getting_started.md)** — end-to-end setup on a fresh workstation
- **[User Guide](./docs/user_guide.md)** — daily workflow, skills reference, Gemini accounts
- **[Architecture](./docs/architecture.md)** — system design, data flow, technology decisions
- **[Development Guide](./docs/development.md)** — repo layout, conventions, extending the system

**Setup guides** (`docs/setup/`):
- [Backup](./docs/setup/backup.md) — rclone setup, OneDrive + Google Drive, systemd timer
- [WinRM](./docs/setup/winrm.md) — PSRemoting from WSL to Windows servers
- [Tailscale on UDM](./docs/setup/tailscale-udm.md) — subnet router setup per site

**Reference** (`docs/reference/`):
- [Credentials](./docs/reference/credentials.md) — app registration setup and required permissions
- [PowerShell Modules](./docs/reference/powershell.md) — module suite reference
- [Staging Data](./docs/reference/staging_data.md) — collector output format

**AI runtime references** (`references/`):
- Triage gates, failure patterns, event clusters, hypothesis patterns — consumed by skills at runtime
- [Credential field names](./references/credentials.md) — Bitwarden field inventory and pending items
