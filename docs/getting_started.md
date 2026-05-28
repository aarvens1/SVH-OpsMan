# Getting Started

This guide provides a full, end-to-end setup for the SVH OpsMan project on a fresh Windows 11 workstation.

## Prerequisites

-   Windows 11 with WSL 2 enabled.
-   [Obsidian](https://obsidian.md) installed.
-   [Windows Terminal](https://www.microsoft.com/store/productId/9N0DX20HK701) installed.
-   A Bitwarden account with the **SVH OpsMan** vault item created (see [Credential Reference](./reference/credentials.md) for fields).

## 1. Enable WSL 2 and Install Ubuntu

From an elevated PowerShell prompt, run:

```powershell
wsl --install -d Ubuntu-24.04
```

Restart your machine when prompted and complete the initial Ubuntu user setup.

## 2. Clone the Repository

In your new Ubuntu environment (via Windows Terminal), clone the project:

```bash
cd ~
git clone https://github.com/aarvens1/svh-opsman SVH-OpsMan
cd SVH-OpsMan
```

## 3. Install Core Dependencies

### Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version # Verify v20.x.x or higher
```

### Bitwarden CLI

```bash
sudo npm install -g @bitwarden/cli
bw --version   # Verify install
bw login       # Log in for the first time
```

### Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc && source ~/.bashrc
which claude   # → e.g. /usr/local/bin/claude
claude login   # Authenticate with your Anthropic account
```

### 3a. Install Gemini CLI

```bash
sudo npm install -g @google/gemini-cli
gemini login
gemini git host add
```

## 4. Configure WSL Shell Environment

This project includes a setup script to configure the WSL shell with `zsh`, `systemd`, and a suite of useful tools.

```bash
chmod +x ~/SVH-OpsMan/scripts/wsl-shell-setup.sh
~/SVH-OpsMan/scripts/wsl-shell-setup.sh
```

After the script finishes, **shut down WSL from Windows PowerShell** to apply the changes:

```powershell
wsl --shutdown
```

Reopen your terminal. You should now have a `zsh` shell with the Starship prompt.

## 5. Build Project Components

Build the two main Node.js applications: the MCP Server and the Collector.

```bash
# Build the MCP Server
cd ~/SVH-OpsMan/mcp-server
npm install
npm run build

# Build the Collector
cd ~/SVH-OpsMan/collector
npm install
npm run build
```

To keep OpsMan current after initial setup, use `opsman-update` — it pulls, rebuilds both packages only if dependencies changed, and restarts the MCP service. See the [User Guide](./user_guide.md#keeping-opsman-updated) for details.

## 6. Configure Obsidian

1.  Open Obsidian and use "Open folder as vault" to select or create your `OpsManVault`.
2.  Go to `Settings` > `Community plugins` > `Browse` and install the **Local REST API** plugin.
3.  Enable the plugin and note the API key shown in its settings. You will need this for both Bitwarden and the MCP registration.

## 7. Set Up Credentials

All credentials for the project are managed in a single Bitwarden item named **SVH OpsMan**.

1.  Populate the Bitwarden item with all required fields as specified in the **[Credential Reference](./reference/credentials.md)**. This includes API keys, client secrets, and the Obsidian API key from the previous step.
2.  For the systemd auto-unlock feature, store your Bitwarden master password in the Windows Credential Manager:
    ```powershell
    # Run once from Windows PowerShell
    $cred = Get-Credential -UserName "svh-opsman" -Message "Enter Bitwarden master password"
    New-StoredCredential -Target svh-opsman -UserName svh-opsman `
      -Password $cred.GetNetworkCredential().Password -Persist LocalMachine
    ```

## 8. Register App Registrations in Azure

You need to create App Registrations in Entra ID (Azure AD) for the services the MCP server will access.

-   **Microsoft Graph**: One app for all M365 services.
-   **Defender for Endpoint**: A separate app for the security API.
-   **Azure Resource Manager**: A service principal for Azure resources.

Follow the detailed instructions in the **[Credential Reference](./reference/credentials.md)** to create these and grant the necessary permissions.

After creating the apps, add their Client IDs and Secrets to your **SVH OpsMan** item in Bitwarden.

## 9. Register MCPs with Claude Code

Before starting, unlock your Bitwarden vault to make the session available to the environment:

```bash
export BW_SESSION=$(bw unlock --raw)
```

Now, register the custom MCP server and the external MCPs:

```bash
# Custom server
claude mcp add svh-opsman -- node ~/SVH-OpsMan/mcp-server/dist/index.js

# External MCPs
claude mcp add obsidian -e OBSIDIAN_API_KEY=<key-from-obsidian> -- npx -y mcp-obsidian http://127.0.0.1:27123
claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=<your-pat> -- npx -y @modelcontextprotocol/server-github
claude mcp add fathom -e FATHOM_API_KEY=<key> -- npx -y fathom-mcp
claude mcp add firecrawl -e FIRECRAWL_API_KEY=<key> -- npx -y @mendableai/firecrawl-mcp-server
claude mcp add desktop-commander -- npx -y @wonderwhy-er/desktop-commander
claude mcp add bitwarden -- npx -y @bitwarden/mcp
claude mcp add time -- npx -y @modelcontextprotocol/server-time
```

Verify the registration with `claude mcp list`.

## 10. Install Systemd Services & Windows Terminal Environment

The project uses `systemd` user services to auto-start components and provides a pre-configured Windows Terminal setup for a better workflow.

### Systemd Services (WSL)

Run the setup script to install and enable the user services for auto-unlocking Bitwarden and running the MCP server.

```bash
~/SVH-OpsMan/scripts/setup.sh
```

### Windows Terminal (Windows)

From a PowerShell terminal, run the Windows-side installer. This installs the required font, sets up a PowerShell profile, and imports the Windows Terminal settings.

```powershell
# From the project root (e.g., C:\Users\user\SVH-OpsMan)
.\dotfiles\install-windows.ps1
```

### Windows Login Task

To ensure WSL services start when you log into Windows, create a scheduled task:

```powershell
schtasks.exe /Create /TN "SVH OpsMan WSL Services" `
  /TR "powershell.exe -NonInteractive -WindowStyle Hidden -File `"$env:USERPROFILE\SVH-OpsMan\powershell\Start-WSLServices.ps1`"" `
  /SC ONLOGON /RU "$env:USERNAME" /F
```

## 11. Install Tailscale for Remote Access

Tailscale provides secure remote access to your lab environment. The setup script requires `systemd` to be active.

```bash
~/SVH-OpsMan/scripts/tailscale-wsl-setup.sh
```

Authenticate via the URL that appears. In the Tailscale admin console, be sure to **disable key expiry** for this new node. For guidance on setting up subnet routers for full site access, see `docs/setup/tailscale-udm.md`.

## 12. PowerShell for On-Premise Management

The project includes a powerful suite of PowerShell modules for managing on-premise systems via PSRemoting. This is used for actions that require direct operator control, such as rebooting servers or modifying AD objects.

A one-time setup is required to configure WinRM for PSRemoting from WSL to your Windows servers. For detailed instructions on this and how to use the modules, refer to the **[PowerShell Modules Guide](./reference/powershell.md)**.

## 13. PowerShell TUIs

For hands-on administrative tasks, the project includes five Textual User Interface (TUI) applications built with Python's Textual framework. They provide a searchable, form-based interface for the underlying PowerShell modules. An active Bitwarden session is required.

-   **Main TUI:** `tui`
    -   A general-purpose interface for browsing and executing over 200+ functions from the PowerShell module suite. Features risk color-coding and a command previewer.
-   **Active Directory TUI:** `tui-ad`
    -   Specialized for user and group management in Active Directory.
-   **Alerts TUI:** `tui-alerts`
    -   For viewing and managing alerts from Defender and Wazuh.
-   **Network TUI:** `tui-net`
    -   Focused on network diagnostics and UniFi device management.
-   **Patching TUI:** `tui-patches`
    -   For reviewing and approving pending system patches.

Launch them using their respective alias after unlocking Bitwarden (`bwu`). For example:

```bash
bwu
tui-ad
```

## 14. Final Verification

Your setup should now be complete. Launch the main `opsman` environment:

```bash
opsman
```

This will start the session hooks and drop you into a Claude Code prompt. You should see log output confirming that credentials were loaded from Bitwarden and the server is ready. If not, retrace the credential setup steps.

You can now run your first briefing:
```
/day-starter
```
