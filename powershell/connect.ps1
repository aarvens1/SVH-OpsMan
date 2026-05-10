# connect.ps1 — SVH credential loader and module bootstrapper
# Usage: . ./connect.ps1   (dot-source to populate $Global:SVHCreds in the caller's session)
#
# Credential priority:
#   1. Bitwarden CLI — if $env:BW_SESSION is set, pulls from the "SVH OpsMan" vault item
#   2. .env file    — reads KEY=VALUE pairs from powershell/.env (same field names as Bitwarden)

$ErrorActionPreference = 'Stop'

$VAULT_ITEM  = 'SVH OpsMan'
$ENV_FILE    = Join-Path $PSScriptRoot '.env'
$MODULES_DIR = Join-Path $PSScriptRoot 'modules'

function script:Load-FromBitwarden {
    $session = $env:BW_SESSION
    if (-not $session) { return $false }

    try {
        $raw  = bw get item $VAULT_ITEM --session $session 2>$null
        $item = $raw | ConvertFrom-Json
        $fields = $item.fields ?? @()
        $loaded = 0
        foreach ($f in $fields) {
            if ($f.name -and $f.value -and -not $Global:SVHCreds.ContainsKey($f.name)) {
                $Global:SVHCreds[$f.name] = $f.value
                $loaded++
            }
        }
        Write-Host "[svh] Loaded $loaded credential(s) from Bitwarden." -ForegroundColor Green
        return $true
    }
    catch {
        Write-Warning "[svh] Bitwarden fetch failed: $_"
        return $false
    }
}

function script:Load-FromEnv {
    if (-not (Test-Path $ENV_FILE)) {
        Write-Warning "[svh] No .env file found at $ENV_FILE"
        return
    }
    $loaded = 0
    foreach ($line in Get-Content $ENV_FILE) {
        $line = $line.Trim()
        if (-not $line -or $line.StartsWith('#')) { continue }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key   = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
        if ($key -and -not $Global:SVHCreds.ContainsKey($key)) {
            $Global:SVHCreds[$key] = $value
            $loaded++
        }
    }
    Write-Host "[svh] Loaded $loaded credential(s) from .env file." -ForegroundColor Cyan
}

$Global:SVHCreds = @{}

$bwOk = Load-FromBitwarden
if (-not $bwOk) { Load-FromEnv }

# Import all SVH modules
foreach ($mod in Get-ChildItem -Path $MODULES_DIR -Filter 'SVH.*.psm1') {
    Import-Module $mod.FullName -Force -Global
}

$loaded = ($Global:SVHCreds.Keys | Measure-Object).Count
Write-Host "[svh] Session ready — $loaded credential(s) loaded, $(
    (Get-Module SVH.* | Measure-Object).Count
) module(s) imported." -ForegroundColor Green
