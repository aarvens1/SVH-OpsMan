# setup-graph-apps.ps1 -- STEP 1 of 3
#
# Creates the Microsoft Graph and MDE app registrations.
# Run in a fresh PowerShell window as your ma_ account (GA activated in PIM).
#
# After this completes:
#   - Go to the Entra portal URL printed at the end and click Grant admin consent
#   - Run setup-exchange-policy.ps1 in a NEW PowerShell window
#   - Run setup-azure-arm.ps1 in another NEW PowerShell window

$ErrorActionPreference = 'Stop'

$OWNER_UPN = 'astevens@shoestringvalley.com'
$stateFile = Join-Path $env:TEMP "svh-opsman-state.json"

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
Write-Step "Checking modules"
$required = @('MSAL.PS', 'Microsoft.Graph.Applications', 'Microsoft.Graph.Identity.DirectoryManagement')
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

# ── 1. Connect to Graph via MSAL device code ──────────────────────────────────
Write-Step "Connecting to Microsoft Graph -- ma_ account"
Write-Host "  A code will appear below. Go to https://microsoft.com/devicelogin," -ForegroundColor Cyan
Write-Host "  enter the code, and sign in with your passkey." -ForegroundColor Cyan
$ProgressPreference = 'SilentlyContinue'
Import-Module MSAL.PS -Force

$msalToken = Get-MsalToken `
    -ClientId '14d82eec-204b-4c2f-b7e8-296a70dab67e' `
    -Scopes   'https://graph.microsoft.com/.default' `
    -DeviceCode

$secureToken = $msalToken.AccessToken | ConvertTo-SecureString -AsPlainText -Force
Connect-MgGraph -AccessToken $secureToken -NoWelcome
$tenantId = (Get-MgContext).TenantId
Write-Ok "Connected -- tenant: $tenantId"

# ── 2. Graph app registration ─────────────────────────────────────────────────
Write-Step "Graph app registration: SVH OpsMan (Aaron Stevens)"

$graphPermNames = @(
    # Planner / To Do
    'Tasks.ReadWrite.All',
    # Teams
    'Group.Read.All', 'ChannelMessage.ReadWrite.All', 'TeamMember.ReadWrite.All',
    # OneDrive / SharePoint
    'Files.ReadWrite.All', 'Sites.Read.All',
    # Mail
    'Mail.ReadWrite', 'Mail.Send',
    # Calendar
    'Calendars.ReadWrite', 'MailboxSettings.ReadWrite', 'Place.Read.All',
    # Entra ID
    'Application.Read.All', 'AuditLog.Read.All', 'Directory.Read.All',
    'IdentityRiskyUser.ReadWrite.All', 'Policy.Read.All',
    'RoleManagement.Read.Directory', 'UserAuthenticationMethod.Read.All',
    # Intune
    'DeviceManagementApps.Read.All', 'DeviceManagementConfiguration.Read.All',
    'DeviceManagementManagedDevices.Read.All',
    # MS Admin / Org
    'Organization.Read.All', 'Reports.Read.All', 'ServiceHealth.Read.All'
)

$graphSpId = '00000003-0000-0000-c000-000000000000'
$graphSp   = Get-MgServicePrincipal -Filter "appId eq '$graphSpId'"

$resolvedPerms = [System.Collections.Generic.List[hashtable]]::new()
foreach ($name in $graphPermNames) {
    $role = $graphSp.AppRoles | Where-Object { $_.Value -eq $name }
    if (-not $role) { Write-Warn "Permission not found: $name -- skipping"; continue }
    $resolvedPerms.Add(@{ id = $role.Id; type = 'Role' })
}

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

if (-not (Get-MgServicePrincipal -Filter "appId eq '$($graphApp.AppId)'" | Select-Object -First 1)) {
    New-MgServicePrincipal -AppId $graphApp.AppId | Out-Null
}

# ── 3. Graph client secret ────────────────────────────────────────────────────
$existingState = if (Test-Path $stateFile) { Get-Content $stateFile | ConvertFrom-Json } else { $null }
if ($existingState -and $existingState.graphSecret) {
    $graphSecret = $existingState.graphSecret
    Write-Ok "Reusing Graph secret from previous run"
} else {
    $graphSecret = New-AppSecret -AppObjectId $graphApp.Id -Label "OpsMan MCP server"
    Write-Ok "Graph client secret created (expires 2 years)"
}

# ── 4. MDE app registration ───────────────────────────────────────────────────
Write-Step "MDE app registration: SVH OpsMan MDE"

$mdeSp     = Get-MgServicePrincipal -Filter "displayName eq 'WindowsDefenderATP'" | Select-Object -First 1
$mdeAppId  = '(skipped)'
$mdeSecret = '(skipped -- WindowsDefenderATP not found)'

if (-not $mdeSp) {
    Write-Warn "WindowsDefenderATP not found -- Defender may not be licensed"
} else {
    $mdePermNames = @('Machine.Read.All','Alert.Read.All','Vulnerability.Read.All','Software.Read.All','AdvancedQuery.Read.All')
    $resolvedMdePerms = [System.Collections.Generic.List[hashtable]]::new()
    foreach ($name in $mdePermNames) {
        $role = $mdeSp.AppRoles | Where-Object { $_.Value -eq $name }
        if (-not $role) { Write-Warn "MDE permission not found: $name -- skipping"; continue }
        $resolvedMdePerms.Add(@{ id = $role.Id; type = 'Role' })
    }

    $mdeApp = Get-MgApplication -Filter "displayName eq 'SVH OpsMan MDE'" | Select-Object -First 1
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

    if (-not (Get-MgServicePrincipal -Filter "appId eq '$($mdeApp.AppId)'" | Select-Object -First 1)) {
        New-MgServicePrincipal -AppId $mdeApp.AppId | Out-Null
    }

    if ($existingState -and $existingState.mdeSecret -and $existingState.mdeSecret -notmatch 'skipped') {
        $mdeSecret = $existingState.mdeSecret
        Write-Ok "Reusing MDE secret from previous run"
    } else {
        $mdeSecret = New-AppSecret -AppObjectId $mdeApp.Id -Label "OpsMan MCP server"
        Write-Ok "MDE client secret created"
    }
    $mdeAppId = $mdeApp.AppId
}

# ── 5. Save state ─────────────────────────────────────────────────────────────
@{
    tenantId      = $tenantId
    graphClientId = $graphApp.AppId
    graphSecret   = $graphSecret
    graphUserId   = $OWNER_UPN
    mdeClientId   = $mdeAppId
    mdeSecret     = $mdeSecret
} | ConvertTo-Json | Set-Content $stateFile
Write-Ok "State saved to $stateFile"

# ── 6. Summary and next steps ─────────────────────────────────────────────────
$portalUrl = "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/CallAnAPI/appId/$($graphApp.AppId)"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  Step 1 complete. Credentials so far:" -ForegroundColor Green
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
Write-Host "NEXT STEPS (in order):" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Grant admin consent -- open this URL in your browser," -ForegroundColor Cyan
Write-Host "     then click 'Grant admin consent for Shoestring Valley Holdings':" -ForegroundColor Cyan
Write-Host "     $portalUrl" -ForegroundColor White
Write-Host ""
Write-Host "  2. Open a NEW PowerShell window and run:" -ForegroundColor Cyan
Write-Host "     .\setup-exchange-policy.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  3. Open another NEW PowerShell window and run:" -ForegroundColor Cyan
Write-Host "     .\setup-azure-arm.ps1" -ForegroundColor White
