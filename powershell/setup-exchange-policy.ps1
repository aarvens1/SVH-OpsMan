# setup-exchange-policy.ps1 -- STEP 2 of 3
#
# Creates the Exchange ApplicationAccessPolicy that restricts the Graph app
# to astevens's mailbox only. Run in a FRESH PowerShell window (no other
# modules loaded) after setup-graph-apps.ps1 completes.
#
# Reads state from $env:TEMP\svh-opsman-state.json written by step 1.
# Sign in as your ma_ account (Exchange Administrator activated in PIM).

$ErrorActionPreference = 'Stop'

$OWNER_UPN = 'astevens@shoestringvalley.com'

function Write-Step ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }

# ── 0. Module ─────────────────────────────────────────────────────────────────
Write-Step "Checking ExchangeOnlineManagement (only module loaded in this session)"
if (-not (Get-Module -ListAvailable -Name ExchangeOnlineManagement)) {
    Install-Module ExchangeOnlineManagement -Scope CurrentUser -Force -AllowClobber
    Write-Host "`n  Module installed. Close this window, open a fresh PowerShell, and run again." -ForegroundColor Yellow
    exit
}
Update-Module ExchangeOnlineManagement -Force -ErrorAction SilentlyContinue
Write-Ok "ExchangeOnlineManagement up to date"

# ── 1. Load state ─────────────────────────────────────────────────────────────
$stateFile = Join-Path $env:TEMP "svh-opsman-state.json"
if (-not (Test-Path $stateFile)) {
    Write-Host "`n  State file not found. Run setup-graph-apps.ps1 first." -ForegroundColor Red
    exit 1
}
$state = Get-Content $stateFile | ConvertFrom-Json
Write-Ok "State loaded -- Graph app ID: $($state.graphClientId)"

# ── 2. Connect to Exchange Online ─────────────────────────────────────────────
Write-Step "Connecting to Exchange Online -- ma_ account"
Write-Host "  A browser window will open. Sign in with your passkey." -ForegroundColor Cyan
Connect-ExchangeOnline -ShowProgress $false
Write-Ok "Connected"

# ── 3. Distribution group ─────────────────────────────────────────────────────
Write-Step "Creating mail-enabled security group"
$groupAlias = "svh-opsman-mailbox"
$groupName  = "SVH OpsMan Mailbox Access"

if (-not (Get-DistributionGroup -Identity $groupAlias -ErrorAction SilentlyContinue)) {
    New-DistributionGroup -Name $groupName -Alias $groupAlias -Type Security | Out-Null
    Write-Ok "Group created: $groupName"
} else {
    Write-Ok "Group already exists: $groupName"
}

Add-DistributionGroupMember -Identity $groupAlias -Member $OWNER_UPN -ErrorAction SilentlyContinue
Write-Ok "$OWNER_UPN added to group"

# ── 4. ApplicationAccessPolicy ────────────────────────────────────────────────
Write-Step "Creating ApplicationAccessPolicy"

$existing = Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue |
    Where-Object { $_.AppId -eq $state.graphClientId }

if (-not $existing) {
    New-ApplicationAccessPolicy `
        -AppId              $state.graphClientId `
        -PolicyScopeGroupId $groupAlias `
        -AccessRight        RestrictAccess `
        -Description        "Limit Claude OpsMan mail access to ${OWNER_UPN} only" | Out-Null
    Write-Ok "Policy created"
} else {
    Write-Ok "Policy already exists"
}

Write-Warn "Waiting 30s for policy to propagate..."
Start-Sleep -Seconds 30

$grantedTest = Test-ApplicationAccessPolicy -AppId $state.graphClientId -Identity $OWNER_UPN
Write-Ok "Policy test -- ${OWNER_UPN}: $($grantedTest.AccessCheckResult)"

$deniedTest = Test-ApplicationAccessPolicy -AppId $state.graphClientId `
    -Identity "bbates@shoestringvalley.com" -ErrorAction SilentlyContinue
if ($deniedTest) { Write-Ok "Policy test -- bbates: $($deniedTest.AccessCheckResult)" }

Disconnect-ExchangeOnline -Confirm:$false

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Exchange policy configured." -ForegroundColor Green
Write-Host "  Now open a NEW PowerShell window and run:" -ForegroundColor Green
Write-Host "  .\setup-azure-arm.ps1" -ForegroundColor White
Write-Host "========================================================" -ForegroundColor Green
