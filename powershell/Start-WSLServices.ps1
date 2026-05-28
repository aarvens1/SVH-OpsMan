# Start-WSLServices.ps1
# Runs at Windows login via Task Scheduler.
# Ensures WSL Ubuntu is running, then triggers BW unlock and MCP server startup.
#
# Register with Task Scheduler (run once from an elevated PowerShell prompt):
#   schtasks.exe /Create /TN "SVH OpsMan WSL Services" /TR "powershell.exe -NonInteractive -WindowStyle Hidden -File \"%USERPROFILE%\SVH-OpsMan\powershell\Start-WSLServices.ps1\"" /SC ONLOGON /RU "%USERNAME%" /F

# Ensure WSL Ubuntu is running
wsl -d Ubuntu echo ok | Out-Null

# Trigger BW unlock service (starts MCP server via After= dependency)
wsl --exec systemctl --user start svh-opsman-bw-unlock
