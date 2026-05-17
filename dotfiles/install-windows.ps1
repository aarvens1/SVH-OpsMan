# SVH OpsMan — Windows-side setup
# Run once from Windows Terminal (PowerShell or pwsh) on a new machine.
# Safe to re-run (idempotent checks throughout).
#
# Usage:  .\dotfiles\install-windows.ps1
#         from the repo root — or double-click in Explorer if PS execution policy allows.
#
# What this does:
#   1. Installs Cascadia Code NF font (used by the terminal status line and icons)
#   2. Writes a PowerShell profile stub that loads dotfiles/profile.ps1 from the repo
#   3. Installs Windows Terminal settings (Gruvbox Dark, colour-coded profiles, skill shortcuts)

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

# ── 1. Cascadia Code NF font ──────────────────────────────────────────────────
# Required for Nerd Font glyphs used in the terminal prompt and status line
Step "Cascadia Code NF font"
$fontName = 'Cascadia Code NF'
$fontDir  = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
$fontFile = "$fontDir\CascadiaCodeNF.ttf"

$installed = (New-Object System.Drawing.Text.InstalledFontCollection).Families | Where-Object { $_.Name -like "*$fontName*" }
if ($installed) {
    Ok "$fontName already installed"
} else {
    try {
        $tag      = 'v2407.24'
        $dlUrl    = "https://github.com/microsoft/cascadia-code/releases/download/$tag/CascadiaCode-$($tag.TrimStart('v')).zip"
        $tmpZip   = "$env:TEMP\CascadiaCode.zip"
        $tmpDir   = "$env:TEMP\CascadiaCode"

        Write-Host "  Downloading $fontName from GitHub…"
        Invoke-WebRequest -Uri $dlUrl -OutFile $tmpZip -UseBasicParsing

        Expand-Archive -Path $tmpZip -DestinationPath $tmpDir -Force
        $nfFile = Get-ChildItem -Path $tmpDir -Filter '*NF*.ttf' -Recurse | Select-Object -First 1
        if (-not $nfFile) { Warn "NF variant not found in archive — install font manually"; goto skip_font }

        New-Item -ItemType Directory -Path $fontDir -Force | Out-Null
        Copy-Item -Path $nfFile.FullName -Destination $fontFile -Force

        $regPath = 'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
        Set-ItemProperty -Path $regPath -Name "$fontName (TrueType)" -Value $fontFile

        Remove-Item $tmpZip, $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
        Ok "$fontName installed (user fonts)"
    } catch {
        Warn "Font download failed: $_"
        Warn "Download manually: https://github.com/microsoft/cascadia-code/releases"
        Warn "Install the *NF* (Nerd Fonts) variant."
    }
}
:skip_font

# ── 2. PowerShell profile — dot-source stub ───────────────────────────────────
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

# ── 3. Windows Terminal settings ──────────────────────────────────────────────
Step "Windows Terminal settings"

$wtDirs = @(
    "$env:LOCALAPPDATA\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState",
    "$env:LOCALAPPDATA\Packages\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\LocalState"
)
$wtSettingsPath = $null
foreach ($d in $wtDirs) {
    if (Test-Path $d) { $wtSettingsPath = "$d\settings.json"; break }
}

$src = "$PSScriptRoot\windows-terminal-settings.json"
if (-not (Test-Path $src)) {
    Warn "windows-terminal-settings.json not found at $src — skipping"
} elseif (-not $wtSettingsPath) {
    Warn "Windows Terminal not found — install from the Microsoft Store, then re-run."
    Warn "Settings file is ready at: $src"
} else {
    if (Test-Path $wtSettingsPath) {
        $backup = "$wtSettingsPath.bak"
        Copy-Item -Path $wtSettingsPath -Destination $backup -Force
        Ok "Existing settings backed up → $backup"
    }
    Copy-Item -Path $src -Destination $wtSettingsPath -Force
    Ok "Windows Terminal settings installed"
    Ok "Profiles: Claude Code (teal tab), PowerShell OpsMan (yellow), WSL Bash (green)"
    Ok "Skills: Ctrl+Alt+[D/E/W/P/T/N/C/V/A/X]  |  New Claude tab: Ctrl+Shift+Alt+C"
    Warn "Restart Windows Terminal for changes to take effect"
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
Write-Host "  2. Restart Windows Terminal to apply the new settings"
Write-Host "  3. From WSL, run: " -NoNewline
Write-Host "opsman" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Skills: Ctrl+Alt+[D/E/W/P/T/N/C/V/A/X]"
Write-Host "  New Claude tab: Ctrl+Shift+Alt+C  |  New pwsh tab: Ctrl+Shift+Alt+P"
Write-Host "  Split pane: Ctrl+Alt+2  |  Navigate: Ctrl+Alt+H/J/K/L"
Write-Host "  Rename tab: Ctrl+Alt+R"
