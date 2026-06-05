@echo off
REM SVH OpsMan — workspace launcher
REM 6 tabs: Claude Ops (teal) · Claude Dev (yellow) · Gemini (blue) · PowerShell (purple) · WSL Zsh (green) · Helix (cyan)
REM Pin the Start Menu shortcut to this batch file, or remap the Copilot key to it via PowerToys.
wt.exe new-tab --profile "Claude Ops" --title "Ops" ; new-tab --profile "Claude Dev" --title "Dev" ; new-tab --profile "Gemini" --title "Gemini" ; new-tab --profile "PowerShell (OpsMan)" --title "PS" ; new-tab --profile "WSL Zsh" --title "Zsh" ; new-tab --profile "Helix" --title "Helix"
