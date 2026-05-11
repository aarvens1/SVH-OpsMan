# setup-azure-arm.ps1 -- STEP 2 of 2
#
# Creates the Azure ARM service principal and assigns Reader roles.
# Run this in a FRESH PowerShell window after setup-graph-apps.ps1 completes.
#
# Reads state from $env:TEMP\svh-opsman-state.json written by step 1.
# Sign in as your ma_ account (needs Global Administrator activated in PIM).

$ErrorActionPreference = 'Stop'

$SUBSCRIPTION_ID = ''   # leave blank to use the subscription from your az login

function Write-Step ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }

# ── 0. Modules ────────────────────────────────────────────────────────────────
Write-Step "Checking modules (Az only -- no Microsoft.Graph)"
$required = @('Az.Accounts', 'Az.Resources')
$needsRestart = $false
foreach ($mod in $required) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
        Write-Warn "$mod not found -- installing..."
        Install-Module $mod -Scope CurrentUser -Force -AllowClobber
        $needsRestart = $true
        Write-Ok "$mod installed"
    } else {
        Update-Module $mod -Force -ErrorAction SilentlyContinue
        Write-Ok "$mod up to date"
    }
}
if ($needsRestart) {
    Write-Host "`n  New modules installed. Close this window, open a fresh PowerShell, and run again." -ForegroundColor Yellow
    exit
}

# ── 1. Load state from step 1 ─────────────────────────────────────────────────
$stateFile = Join-Path $env:TEMP "svh-opsman-state.json"
if (-not (Test-Path $stateFile)) {
    Write-Host "`n  State file not found at $stateFile" -ForegroundColor Red
    Write-Host "  Run setup-graph-apps.ps1 first." -ForegroundColor Red
    exit 1
}
$state = Get-Content $stateFile | ConvertFrom-Json
Write-Ok "State loaded from step 1 (tenant: $($state.tenantId))"

# ── 2. Connect to Azure ───────────────────────────────────────────────────────
Write-Step "Connecting to Azure (device code -- ma_ account)"
Connect-AzAccount -UseDeviceAuthentication -TenantId $state.tenantId | Out-Null
$azContext = Get-AzContext
Write-Ok "Connected as $($azContext.Account.Id) -- subscription: $($azContext.Subscription.Name)"

if (-not $SUBSCRIPTION_ID) {
    $SUBSCRIPTION_ID = $azContext.Subscription.Id
    Write-Ok "Using subscription: $SUBSCRIPTION_ID"
}

# ── 3. ARM service principal ──────────────────────────────────────────────────
Write-Step "Creating Azure ARM service principal: SVH OpsMan ARM"

$armSp     = New-AzADServicePrincipal -DisplayName "SVH OpsMan ARM"
$armCred   = $armSp | New-AzADSpCredential
$armSecret = $armCred.SecretText
Write-Ok "Service principal created -- app ID: $($armSp.AppId)"

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Reader role assigned"

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Cost Management Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Cost Management Reader role assigned"

# ── 4. Clean up state file ────────────────────────────────────────────────────
Remove-Item $stateFile -Force
Write-Ok "State file removed"

# ── 5. Final summary -- all Bitwarden fields ──────────────────────────────────
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  SVH OpsMan -- complete Bitwarden vault fields" -ForegroundColor Green
Write-Host "  Add these as custom fields on the 'SVH OpsMan' item" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

$allCreds = [ordered]@{
    GRAPH_TENANT_ID       = $state.tenantId
    GRAPH_CLIENT_ID       = $state.graphClientId
    GRAPH_CLIENT_SECRET   = $state.graphSecret
    GRAPH_USER_ID         = $state.graphUserId
    MDE_TENANT_ID         = $state.tenantId
    MDE_CLIENT_ID         = $state.mdeClientId
    MDE_CLIENT_SECRET     = $state.mdeSecret
    AZURE_TENANT_ID       = $state.tenantId
    AZURE_CLIENT_ID       = $armSp.AppId
    AZURE_CLIENT_SECRET   = $armSecret
    AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID
}

foreach ($kv in $allCreds.GetEnumerator()) {
    Write-Host ("  {0,-28} = {1}" -f $kv.Key, $kv.Value)
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: add the above fields to the 'SVH OpsMan' Bitwarden item," -ForegroundColor Cyan
Write-Host "then from WSL run:" -ForegroundColor Cyan
Write-Host "  export BW_SESSION=`$(bw unlock --raw)" -ForegroundColor White
Write-Host "  cd ~/SVH-OpsMan/mcp-server && npm start" -ForegroundColor White
