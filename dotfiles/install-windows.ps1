# SVH OpsMan — Windows-side setup
# Run once from Windows Terminal (PowerShell or pwsh) on a new machine.
# Safe to re-run (idempotent checks throughout).
#
# Usage:  .\dotfiles\install-windows.ps1
#         from the repo root — or double-click in Explorer if PS execution policy allows.
#
# What this does:
#   1. Installs WezTerm (via winget)
#   2. Installs Cascadia Code NF font (Nerd Fonts — used by the status bar)
#   3. Creates %USERPROFILE%\.config\wezterm\wezterm.lua → WSL repo symlink
#      so edits to dotfiles\wezterm.lua take effect on the next WezTerm reload

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot  = Split-Path -Parent $PSScriptRoot
$WslDistro = (wsl.exe -l -q 2>$null | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim()
if (-not $WslDistro) { $WslDistro = 'Ubuntu' }

# ── Helpers ───────────────────────────────────────────────────────────────────
function Step   { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Ok     { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn   { param($msg) Write-Host "  ⚠  $msg" -ForegroundColor Yellow }
function Bail   { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

function Test-WingetInstalled {
    param([string]$Id)
    $out = winget list --id $Id --accept-source-agreements 2>$null
    return ($out -match [regex]::Escape($Id))
}

# ── 1. WezTerm ────────────────────────────────────────────────────────────────
Step "WezTerm"
$wezId = 'wez.wezterm'
if (-not (Get-Command 'wezterm.exe' -ErrorAction SilentlyContinue)) {
    if (Get-Command 'winget' -ErrorAction SilentlyContinue) {
        Write-Host "  Installing WezTerm via winget…"
        winget install --id $wezId --accept-package-agreements --accept-source-agreements -e
        Ok "WezTerm installed"
    } else {
        Warn "winget not found — download WezTerm manually from https://wezfurlong.org/wezterm/installation.html"
        Warn "After installing, re-run this script to complete setup."
    }
} else {
    $wezVer = (Get-Command 'wezterm.exe').Version
    Ok "WezTerm $wezVer already installed"
}

# ── 2. Cascadia Code NF font ──────────────────────────────────────────────────
# Required for Nerd Font glyphs in the status bar (✓, ⚠, etc.)
Step "Cascadia Code NF font"
$fontName = 'Cascadia Code NF'
$fontDir  = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
$fontFile = "$fontDir\CascadiaCodeNF.ttf"

$installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families | Where-Object { $_.Name -like "*$fontName*" }
if ($installed) {
    Ok "$fontName already installed"
} else {
    try {
        # Download from GitHub releases
        $tag      = 'v2407.24'
        $dlUrl    = "https://github.com/microsoft/cascadia-code/releases/download/$tag/CascadiaCode-$($tag.TrimStart('v')).zip"
        $tmpZip   = "$env:TEMP\CascadiaCode.zip"
        $tmpDir   = "$env:TEMP\CascadiaCode"

        Write-Host "  Downloading $fontName from GitHub…"
        Invoke-WebRequest -Uri $dlUrl -OutFile $tmpZip -UseBasicParsing

        Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
        $nfFile = Get-ChildItem -Path $tmpDir -Filter '*NF*.ttf' -Recurse | Select-Object -First 1
        if (-not $nfFile) { Warn "NF variant not found in archive — install font manually"; goto skip_font }

        # Install for current user (no admin needed)
        New-Item -ItemType Directory -Path $fontDir -Force | Out-Null
        Copy-Item -Path $nfFile.FullName -Destination $fontFile -Force

        # Register in user font registry
        $regPath = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
        Set-ItemProperty -Path $regPath -Name "$fontName (TrueType)" -Value $fontFile

        Remove-Item $tmpZip, $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        Ok "$fontName installed (user fonts)"
    } catch {
        Warn "Font download failed: $_"
        Warn "Download manually: https://github.com/microsoft/cascadia-code/releases"
        Warn "Install the *NF* (Nerd Fonts) variant, then update font_name in dotfiles/wezterm.lua if needed."
    }
}
:skip_font

# ── 3. wezterm.lua symlink ────────────────────────────────────────────────────
Step "wezterm.lua config symlink"

$configDir  = "$env:USERPROFILE\.config\wezterm"
$configFile = "$configDir\wezterm.lua"

# UNC path into the WSL filesystem so WezTerm (a Windows app) can read it
$wslUser    = (wsl.exe -e bash -c 'echo $USER' 2>$null).Trim()
if (-not $wslUser) { $wslUser = 'astevens' }
$uncTarget  = "\\wsl$\$WslDistro\home\$wslUser\SVH-OpsMan\dotfiles\wezterm.lua"

if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

if (Test-Path $configFile) {
    $existing = Get-Item $configFile -ErrorAction SilentlyContinue
    if ($existing.LinkType -eq 'SymbolicLink') {
        Ok "Symlink already exists → $($existing.Target)"
    } else {
        Warn "$configFile already exists and is not a symlink."
        Warn "Rename or delete it, then re-run this script."
    }
} else {
    try {
        # Symlink requires Developer Mode (Windows 11) or elevation
        New-Item -ItemType SymbolicLink -Path $configFile -Target $uncTarget -Force | Out-Null
        Ok "Symlink created: $configFile → $uncTarget"
        Ok "Edits to dotfiles/wezterm.lua reload automatically (CTRL+SHIFT+R in WezTerm)"
    } catch {
        # Fall back to copy if symlink is denied
        $wslLuaPath = "\\wsl$\$WslDistro\home\$wslUser\SVH-OpsMan\dotfiles\wezterm.lua"
        if (Test-Path $wslLuaPath) {
            Copy-Item -Path $wslLuaPath -Destination $configFile -Force
            Ok "wezterm.lua copied (symlink needs Developer Mode or elevation)"
            Warn "Run 'wez-sync' from WSL after editing dotfiles/wezterm.lua, or re-run this script."
        } else {
            Warn "Could not create symlink or locate wezterm.lua in WSL."
            Warn "Manually copy dotfiles\wezterm.lua to: $configFile"
        }
    }
}

# ── 4. PowerShell profile — dot-source stub ───────────────────────────────────
# $PROFILE becomes a thin stub that loads dotfiles/profile.ps1 from the WSL
# repo (GitHub-backed). The real content lives in the repo, not OneDrive.
Step "PowerShell profile stub"

$stub = @'
# SVH OpsMan — stub: real profile lives in the GitHub repo
# Edit dotfiles/profile.ps1 in SVH-OpsMan; changes apply on next PS start.
$_d = (wsl.exe -l -q 2>$null | Where-Object { $_ -match '\S' } | Select-Object -First 1).Trim() -replace '\x00', ''
$_p = if ($_d) { "\\wsl`$$_d\home\wsl_stevens\SVH-OpsMan\dotfiles\profile.ps1" } else { $null }
if ($_p -and (Test-Path $_p)) { . $_p }
else { Write-Warning 'SVH profile not found — is WSL running? (git clone SVH-OpsMan into ~/SVH-OpsMan)' }
Remove-Variable _d, _p -ErrorAction SilentlyContinue
'@

foreach ($prof in @($PROFILE, ($PROFILE -replace '\\PowerShell\\', '\WindowsPowerShell\'))) {
    $dir = Split-Path $prof
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $existing = Get-Content $prof -Raw -ErrorAction SilentlyContinue
    if ($existing -match 'dotfiles/profile\.ps1') {
        Ok "Profile stub already in place: $prof"
    } else {
        Set-Content -Path $prof -Value $stub -Encoding UTF8
        Ok "Profile stub written: $prof"
    }
}
Ok "Edit dotfiles/profile.ps1 in the repo — changes apply on next PS start"

# ── 5. Verify WezTerm can see the config ──────────────────────────────────────
Step "Config file check"
if (Test-Path $configFile) {
    Ok "WezTerm config readable at $configFile"
} else {
    Warn "Config not found — WezTerm will use defaults until wezterm.lua is in place."
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "`n" -NoNewline
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Reload your PowerShell profile: " -NoNewline
Write-Host ". `$PROFILE" -ForegroundColor Cyan
Write-Host "     then run: " -NoNewline
Write-Host "opsman" -ForegroundColor Cyan
Write-Host "     (or just open a new PowerShell window and type opsman)"
Write-Host "  2. Or from WSL, run: " -NoNewline
Write-Host "opsman" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Leader key: CTRL+\  |  Day Starter: LEADER+d  |  Skills: LEADER+[d e w p t n c v a x]"
Write-Host "  New Claude tab: LEADER+C  |  New pwsh tab: LEADER+P  |  Rename tab: LEADER+r"
Write-Host "  2-pane split: LEADER+2   |  3-pane split: LEADER+3  |  Navigate: LEADER+hjkl"
Write-Host "  Open Obsidian note: LEADER+o  |  Force status refresh: LEADER+u"
