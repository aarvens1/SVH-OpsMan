# connect.ps1 — SVH credential loader and module bootstrapper
#
# Usage: . ./connect.ps1   (dot-source into your session)
#
# Requires BW_SESSION to be set: export BW_SESSION=$(bw unlock --raw)
# Credentials are loaded exclusively from Bitwarden ('SVH OpsMan' vault item).
#
# After loading, all SVH modules are imported into the global scope.
# Domain constants ($SVHMailDomain, $SVHOnPremDomain, $SVHOnPremNetBIOS) come from SVH.Core.
# Use Get-SVHTierUsername to look up the right account for each admin tier.

$ErrorActionPreference = 'Stop'

$VAULT_ITEM  = 'SVH OpsMan'
$MODULES_DIR = Join-Path $PSScriptRoot 'modules'

function script:Invoke-BitwardenLoad {
    $session = $env:BW_SESSION
    if (-not $session) {
        throw '[svh] BW_SESSION is not set — run: export BW_SESSION=$(bw unlock --raw)'
    }

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
    } catch {
        throw "[svh] Bitwarden fetch failed: $_ — ensure BW_SESSION is valid and the vault is unlocked."
    }
}

# Initialize credential store
$Global:SVHCreds = @{}
Invoke-BitwardenLoad

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
