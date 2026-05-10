# connect.ps1 — SVH credential loader and module bootstrapper
#
# Usage: . ./connect.ps1   (dot-source into your session)
#
# Credential priority:
#   1. Bitwarden CLI — if $env:BW_SESSION is set, pulls from 'SVH OpsMan' vault item
#   2. .env file    — KEY=VALUE pairs from powershell/.env (same names as Bitwarden fields)
#
# After loading, all SVH modules are imported into the global scope.
# Domain constants ($SVHMailDomain, $SVHOnPremDomain, $SVHOnPremNetBIOS) come from SVH.Core.
# Use Get-SVHTierUsername to look up the right account for each admin tier.

$ErrorActionPreference = 'Stop'

$VAULT_ITEM  = 'SVH OpsMan'
$ENV_FILE    = Join-Path $PSScriptRoot '.env'
$MODULES_DIR = Join-Path $PSScriptRoot 'modules'

function script:Invoke-BitwardenLoad {
    $session = $env:BW_SESSION
    if (-not $session) { return $false }

    try {
        $raw    = bw get item $VAULT_ITEM --session $session 2>$null
        $item   = $raw | ConvertFrom-Json
        $fields = $item.fields ?? @()
        $count  = 0
        foreach ($f in $fields) {
            if ($f.name -and $f.value -and -not $Global:SVHCreds.ContainsKey($f.name)) {
                $Global:SVHCreds[$f.name] = $f.value
                $count++
            }
        }
        Write-Host "[svh] Loaded $count credential(s) from Bitwarden." -ForegroundColor Green
        return $true
    } catch {
        Write-Warning "[svh] Bitwarden fetch failed: $_ — falling back to .env"
        return $false
    }
}

function script:Invoke-EnvFileLoad {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Warning "[svh] No .env file at $ENV_FILE — some modules may not function."
        return
    }
    $count = 0
    foreach ($line in Get-Content $ENV_FILE) {
        $line = $line.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key   = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
        if ($key -and -not $Global:SVHCreds.ContainsKey($key)) {
            $Global:SVHCreds[$key] = $value
            $count++
        }
    }
    Write-Host "[svh] Loaded $count credential(s) from .env file." -ForegroundColor Cyan
}

# Initialize credential store
$Global:SVHCreds = @{}

$bwOk = Invoke-BitwardenLoad
if (-not $bwOk) { Invoke-EnvFileLoad }

# Import SVH.Core first — it exports domain constants and shared functions
# that all other modules depend on.
$coreMod = Join-Path $MODULES_DIR 'SVH.Core.psm1'
if (Test-Path $coreMod) {
    Import-Module $coreMod -Force -Global
} else {
    Write-Warning "[svh] SVH.Core.psm1 not found at $coreMod"
}

# Import remaining modules (alphabetical — Core is already loaded above)
$imported = 0
foreach ($mod in Get-ChildItem -Path $MODULES_DIR -Filter 'SVH.*.psm1' |
         Where-Object { $_.Name -ne 'SVH.Core.psm1' } |
         Sort-Object Name) {
    Import-Module $mod.FullName -Force -Global
    $imported++
}

$credCount = ($Global:SVHCreds.Keys | Measure-Object).Count
Write-Host "[svh] Ready — $credCount credential(s), $($imported + 1) module(s) loaded." -ForegroundColor Green
Write-Host "[svh] Mail: @$SVHMailDomain  |  On-prem: $SVHOnPremDomain ($SVHOnPremNetBIOS)" -ForegroundColor DarkGray
Write-Host "[svh] Run Get-SVHTierUsername -Tier <standard|server|m365|app|domain> to look up admin accounts." -ForegroundColor DarkGray
