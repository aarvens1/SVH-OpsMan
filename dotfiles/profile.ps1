# SVH OpsMan — PowerShell profile
# Repo:    ~/SVH-OpsMan/dotfiles/profile.ps1
# Loaded by both $PROFILE paths via dot-source from the UNC path into WSL.
# Edit this file; changes apply on next PowerShell start (no re-install needed).

# ── WSL context (resolved once at load) ───────────────────────────────────────
$script:WslDistro = (wsl.exe -l -q 2>$null |
    Where-Object { $_ -match '\S' } | Select-Object -First 1
).Trim() -replace '\x00', ''
$script:OpsManUNC = if ($script:WslDistro) {
    "\\wsl`$$($script:WslDistro)\home\wsl_stevens\SVH-OpsMan"
} else { $null }

# ── Modules ───────────────────────────────────────────────────────────────────
$_mods = @('PSReadLine', 'PSWriteColor', 'SysInfo', 'SystemSplash')
foreach ($_m in $_mods) {
    if (-not (Get-Module -ListAvailable -Name $_m -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $_m..." -ForegroundColor Cyan
        Install-Module -Name $_m -Scope CurrentUser -Force -ErrorAction SilentlyContinue
    }
    Import-Module -Name $_m -ErrorAction SilentlyContinue
}
Remove-Variable _mods, _m -ErrorAction SilentlyContinue

# ── PSReadLine ────────────────────────────────────────────────────────────────
if (Get-Module PSReadLine -ErrorAction SilentlyContinue) {
    Set-PSReadLineOption -EditMode Windows
    Set-PSReadLineOption -PredictionSource History
    Set-PSReadLineOption -PredictionViewStyle ListView
    Set-PSReadLineOption -HistorySearchCursorMovesToEnd
    Set-PSReadLineKeyHandler -Key UpArrow   -Function HistorySearchBackward
    Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
    Set-PSReadLineKeyHandler -Key Tab       -Function MenuComplete
    Set-PSReadLineOption -Colors @{
        Command          = '#89b4fa'   # Catppuccin blue
        Parameter        = '#cba6f7'   # mauve
        String           = '#a6e3a1'   # green
        Comment          = '#6c7086'   # overlay0
        Keyword          = '#cba6f7'   # mauve
        Variable         = '#cdd6f4'   # text
        Error            = '#f38ba8'   # red
        InlinePrediction = '#585b70'   # surface2
    }
}

# ── Prompt ────────────────────────────────────────────────────────────────────
if     (Get-Command starship   -ErrorAction SilentlyContinue) { Invoke-Expression (&starship init powershell) }
elseif (Get-Command oh-my-posh -ErrorAction SilentlyContinue) { oh-my-posh init pwsh | Invoke-Expression }
else {
    function prompt {
        $loc   = $ExecutionContext.SessionState.Path.CurrentLocation.Path
        $short = $loc -replace [regex]::Escape($HOME), '~'
        $git   = ''
        if (Get-Command git -ErrorAction SilentlyContinue) {
            $branch = git rev-parse --abbrev-ref HEAD 2>$null
            if ($branch) {
                $dirty = (git status --porcelain 2>$null | Measure-Object).Count
                $git   = " ($branch$(if ($dirty) { '*' }))"
            }
        }
        Write-Host 'PS '  -NoNewline -ForegroundColor DarkGray
        Write-Host $short -NoNewline -ForegroundColor Cyan
        Write-Host $git   -NoNewline -ForegroundColor Yellow
        Write-Host ' >'   -NoNewline -ForegroundColor DarkGray
        ' '
    }
}

# ── Navigation ────────────────────────────────────────────────────────────────
function ops {
    if ($script:OpsManUNC) { Set-Location $script:OpsManUNC }
    else { Write-Warning 'WSL not available' }
}
function docs {
    Set-Location (Join-Path $env:USERPROFILE 'OneDrive - Andersen Construction\Documents')
}
function vault {
    $p = Join-Path $env:USERPROFILE 'vaults\OpsManVault'
    if (Test-Path $p) { Set-Location $p }
    else { Write-Warning "Vault not found at $p" }
}

# ── Git ───────────────────────────────────────────────────────────────────────
function gs { git status -sb @args }
function gl { git log --oneline --graph -20 @args }
function gd { git diff @args }

# ── Unix staples ──────────────────────────────────────────────────────────────
function which { (Get-Command $args[0] -ErrorAction SilentlyContinue)?.Source }
function unzip {
    param([string]$File)
    $dir = (Get-Item $File).BaseName
    New-Item -Force -ItemType Directory -Path $dir | Out-Null
    Expand-Archive $File -DestinationPath $dir -Force
    Write-Host "Extracted $File → $dir"
}
function touch {
    param([string]$Path)
    if (Test-Path $Path) { (Get-Item $Path).LastWriteTime = Get-Date }
    else { New-Item -ItemType File -Path $Path -Force | Out-Null }
}

# ── Network / sysinfo ─────────────────────────────────────────────────────────
function Get-PubIP  { (Invoke-WebRequest http://ifconfig.me/ip -UseBasicParsing).Content.Trim() }
function Get-Uptime {
    $os = Get-CimInstance Win32_OperatingSystem
    (Get-Date) - $os.LastBootUpTime
}

# ── WSL helpers ───────────────────────────────────────────────────────────────
function wsl-here { wsl.exe --cd (Get-Location).ProviderPath }

function Update-OpsMan {
    Write-Host 'Pulling SVH-OpsMan...' -ForegroundColor Cyan
    wsl.exe -e bash -lc 'cd ~/SVH-OpsMan && git pull --ff-only'
}

# ── Edit shortcuts ────────────────────────────────────────────────────────────
function Enter-NvimInit {
    if ($env:NVIMINIT) { nvim $env:NVIMINIT }
    else { Write-Warning '$NVIMINIT not set' }
}
function Enter-PSProfile {
    if ($script:OpsManUNC) { nvim "$script:OpsManUNC\dotfiles\profile.ps1" }
    else { Write-Warning 'WSL not available — edit dotfiles/profile.ps1 in the repo' }
}

# ── SVH account shortcuts ─────────────────────────────────────────────────────
$da_account       = 'da_stevens@shoestringvalley.com'
$ma_account       = 'ma_stevens@shoestringvalley.com'
$standard_account = 'astevens@shoestringvalley.com'

# ── opsman — launch the full ops workspace ────────────────────────────────────
function Invoke-OpsMan {
    $bwStatus = wsl.exe -e bash -c 'bw status 2>/dev/null' 2>$null
    if ($bwStatus -notmatch '"status":"unlocked"') {
        Write-Host '  Bitwarden locked -- run bwu in a WSL shell first' -ForegroundColor Yellow
        return
    }
    wsl.exe -e bash -c 'pgrep -f "status-refresh.sh" >/dev/null || { nohup bash ~/SVH-OpsMan/dotfiles/status-refresh.sh >/dev/null 2>&1 & disown; }'
    $wez = "$env:ProgramFiles\WezTerm\wezterm.exe"
    if (-not (Test-Path $wez)) { Write-Host "WezTerm not found at $wez" -ForegroundColor Red; return }
    Start-Process -FilePath $wez -ArgumentList @(
        'start', '--new-window', '--',
        'wsl.exe', '--exec', 'bash', '-l', '-c',
        'cd ~/SVH-OpsMan && exec claude'
    )
    Write-Host '  WezTerm launching with Claude Code' -ForegroundColor Green
    Write-Host '  Leader: CTRL+\  |  Day Starter: LEADER+d  |  New Claude tab: LEADER+C'
}

# ── Aliases (Set-Alias is idempotent — no errors on re-source) ────────────────
Set-Alias opsman        Invoke-OpsMan
Set-Alias update-opsman Update-OpsMan
Set-Alias nviminit      Enter-NvimInit
Set-Alias psprofile     Enter-PSProfile
Set-Alias neofetch      Get-SystemSplash
