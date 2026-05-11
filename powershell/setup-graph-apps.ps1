# setup-graph-apps.ps1 -- STEP 1 of 2
#
# Creates the Microsoft Graph and MDE app registrations and configures
# the Exchange ApplicationAccessPolicy. Run this first in a fresh
# PowerShell window, then run setup-azure-arm.ps1 in a NEW window.
#
# Sign in as your ma_ account (needs Global Administrator activated in PIM).
#
# Saves state to $env:TEMP\svh-opsman-state.json for setup-azure-arm.ps1 to read.

$ErrorActionPreference = 'Stop'

$OWNER_UPN = 'astevens@shoestringvalley.com'

function Write-Step ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }

function New-AppSecret {
    param([string]$AppObjectId, [string]$Label)
    $cred = Add-MgApplicationPassword -ApplicationId $AppObjectId `
        -PasswordCredential @{ DisplayName = $Label; EndDateTime = (Get-Date).AddYears(2) }
    return $cred.SecretText
}

# ── 0. Modules ────────────────────────────────────────────────────────────────
Write-Step "Checking modules (Graph and Exchange only -- no Az)"
$required = @(
    'Microsoft.Graph.Applications',
    'Microsoft.Graph.Identity.DirectoryManagement',
    'ExchangeOnlineManagement'
)
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

# ── 1. Connect to Graph ───────────────────────────────────────────────────────
Write-Step "Connecting to Microsoft Graph (device code -- ma_ account)"
$ProgressPreference = 'SilentlyContinue'
Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.Read.All" -UseDeviceCode -NoWelcome
# Brief pause -- device code token sometimes needs a moment to fully initialize
Start-Sleep -Seconds 3
$tenantId = (Get-MgContext).TenantId
Write-Ok "Connected -- tenant: $tenantId"

# ── 2. Graph app registration ─────────────────────────────────────────────────
Write-Step "Graph app registration: SVH OpsMan (Aaron Stevens)"

$graphPermNames = @(
    'Tasks.ReadWrite', 'Tasks.ReadWrite.All',
    'Group.Read.All', 'ChannelMessage.Send', 'TeamMember.ReadWrite.All',
    'Files.ReadWrite.All', 'Sites.Read.All',
    'Mail.ReadWrite', 'Mail.Send',
    'Calendars.ReadWrite', 'MailboxSettings.ReadWrite', 'Place.Read.All',
    'Policy.Read.All', 'Application.Read.All', 'RoleManagement.Read.Directory',
    'IdentityRiskyUser.ReadWrite.All', 'UserAuthenticationMethod.Read.All', 'AuditLog.Read.All',
    'DeviceManagementManagedDevices.Read.All', 'DeviceManagementConfiguration.Read.All',
    'DeviceManagementApps.Read.All',
    'ServiceHealth.Read.All', 'Organization.Read.All', 'Directory.Read.All', 'Reports.Read.All'
)

$graphSpId = '00000003-0000-0000-c000-000000000000'
$graphSp   = Get-MgServicePrincipal -Filter "appId eq '$graphSpId'"

$resolvedPerms = [System.Collections.Generic.List[hashtable]]::new()
foreach ($name in $graphPermNames) {
    $role = $graphSp.AppRoles | Where-Object { $_.Value -eq $name }
    if (-not $role) { Write-Warn "Permission not found: $name -- skipping"; continue }
    $resolvedPerms.Add(@{ id = $role.Id; type = 'Role' })
}

# Idempotent -- reuse existing app reg if it was already created
$graphApp = Get-MgApplication -Filter "displayName eq 'SVH OpsMan (Aaron Stevens)'" |
    Select-Object -First 1
if ($graphApp) {
    Write-Ok "App already exists -- reusing (app ID: $($graphApp.AppId))"
} else {
    $graphApp = New-MgApplication -DisplayName "SVH OpsMan (Aaron Stevens)" `
        -RequiredResourceAccess @{
            resourceAppId  = $graphSpId
            resourceAccess = $resolvedPerms.ToArray()
        }
    Write-Ok "App created -- app ID: $($graphApp.AppId)"
}

$graphSvc = Get-MgServicePrincipal -Filter "appId eq '$($graphApp.AppId)'" |
    Select-Object -First 1
if (-not $graphSvc) {
    $graphSvc = New-MgServicePrincipal -AppId $graphApp.AppId
}

Write-Warn "Granting admin consent for all Graph permissions..."
foreach ($p in $resolvedPerms) {
    try {
        New-MgServicePrincipalAppRoleAssignment `
            -ServicePrincipalId $graphSvc.Id `
            -PrincipalId        $graphSvc.Id `
            -ResourceId         $graphSp.Id `
            -AppRoleId          $p.id | Out-Null
    } catch {
        # Ignore duplicate assignment errors
        if ($_ -notmatch 'Permission being assigned already exists') {
            Write-Warn "  Could not grant $($p.id): $_"
        }
    }
}
Write-Ok "Admin consent granted"

# Only create a new secret if we don't already have one stored in state
$stateFile = Join-Path $env:TEMP "svh-opsman-state.json"
$existingState = if (Test-Path $stateFile) { Get-Content $stateFile | ConvertFrom-Json } else { $null }
if ($existingState -and $existingState.graphSecret) {
    $graphSecret = $existingState.graphSecret
    Write-Ok "Reusing existing client secret from previous run"
} else {
    $graphSecret = New-AppSecret -AppObjectId $graphApp.Id -Label "OpsMan MCP server"
    Write-Ok "Client secret created (expires 2 years)"
}

# ── 3. MDE app registration ───────────────────────────────────────────────────
Write-Step "MDE app registration: SVH OpsMan MDE"

$mdeSp = Get-MgServicePrincipal -Filter "displayName eq 'WindowsDefenderATP'" |
    Select-Object -First 1

$mdeAppId  = '(skipped)'
$mdeSecret = '(skipped -- WindowsDefenderATP not found)'

if (-not $mdeSp) {
    Write-Warn "WindowsDefenderATP service principal not found -- Defender may not be licensed"
} else {
    $mdePermNames = @(
        'Machine.Read.All', 'Alert.Read.All', 'Ti.Read',
        'Vulnerability.Read.All', 'Software.Read.All', 'AdvancedQuery.Read.All'
    )
    $resolvedMdePerms = [System.Collections.Generic.List[hashtable]]::new()
    foreach ($name in $mdePermNames) {
        $role = $mdeSp.AppRoles | Where-Object { $_.Value -eq $name }
        if (-not $role) { Write-Warn "MDE permission not found: $name -- skipping"; continue }
        $resolvedMdePerms.Add(@{ id = $role.Id; type = 'Role' })
    }

    $mdeApp = Get-MgApplication -Filter "displayName eq 'SVH OpsMan MDE'" |
        Select-Object -First 1
    if ($mdeApp) {
        Write-Ok "MDE app already exists -- reusing (app ID: $($mdeApp.AppId))"
    } else {
        $mdeApp = New-MgApplication -DisplayName "SVH OpsMan MDE" `
            -RequiredResourceAccess @{
                resourceAppId  = $mdeSp.AppId
                resourceAccess = $resolvedMdePerms.ToArray()
            }
        Write-Ok "MDE app created -- app ID: $($mdeApp.AppId)"
    }

    $mdeSvc = Get-MgServicePrincipal -Filter "appId eq '$($mdeApp.AppId)'" |
        Select-Object -First 1
    if (-not $mdeSvc) { $mdeSvc = New-MgServicePrincipal -AppId $mdeApp.AppId }

    foreach ($p in $resolvedMdePerms) {
        try {
            New-MgServicePrincipalAppRoleAssignment `
                -ServicePrincipalId $mdeSvc.Id `
                -PrincipalId        $mdeSvc.Id `
                -ResourceId         $mdeSp.Id `
                -AppRoleId          $p.id | Out-Null
        } catch {
            if ($_ -notmatch 'Permission being assigned already exists') {
                Write-Warn "  Could not grant $($p.id): $_"
            }
        }
    }
    Write-Ok "MDE admin consent granted"

    if ($existingState -and $existingState.mdeSecret -and $existingState.mdeSecret -ne '(skipped)') {
        $mdeSecret = $existingState.mdeSecret
        Write-Ok "Reusing existing MDE secret from previous run"
    } else {
        $mdeSecret = New-AppSecret -AppObjectId $mdeApp.Id -Label "OpsMan MCP server"
        Write-Ok "MDE client secret created"
    }
    $mdeAppId = $mdeApp.AppId
}

# ── 4. Exchange ApplicationAccessPolicy ───────────────────────────────────────
Write-Step "Configuring Exchange ApplicationAccessPolicy (restricts mail to $OWNER_UPN)"
Write-Warn "Connecting to Exchange Online (device code -- same ma_ account)"

Connect-ExchangeOnline -Device -ShowProgress $false

$groupAlias = "svh-opsman-mailbox"
$groupName  = "SVH OpsMan Mailbox Access"

if (-not (Get-DistributionGroup -Identity $groupAlias -ErrorAction SilentlyContinue)) {
    New-DistributionGroup -Name $groupName -Alias $groupAlias -Type Security | Out-Null
    Write-Ok "Security group created: $groupName"
} else {
    Write-Ok "Security group already exists"
}

Add-DistributionGroupMember -Identity $groupAlias -Member $OWNER_UPN -ErrorAction SilentlyContinue
Write-Ok "$OWNER_UPN added to group"

if (-not (Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue |
        Where-Object { $_.AppId -eq $graphApp.AppId })) {
    New-ApplicationAccessPolicy `
        -AppId              $graphApp.AppId `
        -PolicyScopeGroupId $groupAlias `
        -AccessRight        RestrictAccess `
        -Description        "Limit Claude OpsMan mail access to ${OWNER_UPN} only" | Out-Null
    Write-Ok "ApplicationAccessPolicy created"
} else {
    Write-Ok "ApplicationAccessPolicy already exists"
}

Write-Warn "Waiting 30s for policy to propagate..."
Start-Sleep -Seconds 30

$grantedTest = Test-ApplicationAccessPolicy -AppId $graphApp.AppId -Identity $OWNER_UPN
Write-Ok "Policy test -- ${OWNER_UPN}: $($grantedTest.AccessCheckResult)"

$deniedTest = Test-ApplicationAccessPolicy -AppId $graphApp.AppId `
    -Identity "bbates@shoestringvalley.com" -ErrorAction SilentlyContinue
if ($deniedTest) { Write-Ok "Policy test -- bbates: $($deniedTest.AccessCheckResult)" }

Disconnect-ExchangeOnline -Confirm:$false

# ── 5. Save state for setup-azure-arm.ps1 ────────────────────────────────────
$stateFile = Join-Path $env:TEMP "svh-opsman-state.json"
@{
    tenantId      = $tenantId
    graphClientId = $graphApp.AppId
    graphSecret   = $graphSecret
    graphUserId   = $OWNER_UPN
    mdeClientId   = $mdeAppId
    mdeSecret     = $mdeSecret
} | ConvertTo-Json | Set-Content $stateFile
Write-Ok "State saved to $stateFile"

# ── 6. Summary ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Step 1 complete. Graph credentials:" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ("  {0,-28} = {1}" -f "GRAPH_TENANT_ID",     $tenantId)
Write-Host ("  {0,-28} = {1}" -f "GRAPH_CLIENT_ID",     $graphApp.AppId)
Write-Host ("  {0,-28} = {1}" -f "GRAPH_CLIENT_SECRET", $graphSecret)
Write-Host ("  {0,-28} = {1}" -f "GRAPH_USER_ID",       $OWNER_UPN)
Write-Host ("  {0,-28} = {1}" -f "MDE_TENANT_ID",       $tenantId)
Write-Host ("  {0,-28} = {1}" -f "MDE_CLIENT_ID",       $mdeAppId)
Write-Host ("  {0,-28} = {1}" -f "MDE_CLIENT_SECRET",   $mdeSecret)
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Now open a NEW PowerShell window and run setup-azure-arm.ps1" -ForegroundColor Cyan
