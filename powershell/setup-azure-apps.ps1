# setup-azure-apps.ps1 — Create Azure app registrations and service principal for SVH OpsMan
#
# Creates:
#   1. Microsoft Graph app registration  "SVH OpsMan (Aaron Stevens)" — M365, Entra, Exchange, Intune
#   2. Defender for Endpoint app reg     "SVH OpsMan MDE"
#   3. Azure ARM service principal       "SVH OpsMan ARM"
#   4. Exchange ApplicationAccessPolicy  restricts mail to astevens only
#
# Run as your aa_ app-tier account for the app registrations (needs Application Administrator).
# The Exchange policy step connects as your ma_ account (needs Exchange Administrator).
#
# Usage:
#   Connect-AzAccount                          # sign in first if not already connected
#   .\setup-azure-apps.ps1
#
# Output: prints all credential values at the end — paste them into Bitwarden as
#         custom fields on the "SVH OpsMan" vault item.

#Requires -Modules Az.Accounts, Az.Resources, Microsoft.Graph.Applications, Microsoft.Graph.Identity.DirectoryManagement

$ErrorActionPreference = 'Stop'

$OWNER_UPN       = 'astevens@shoestringvalley.com'
$SUBSCRIPTION_ID = ''   # fill in before running, or script will prompt

# ── helpers ───────────────────────────────────────────────────────────────────
function Write-Step ($msg) { Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }

function New-AppSecret {
    param([string]$AppObjectId, [string]$Label)
    $cred = Add-MgApplicationPassword -ApplicationId $AppObjectId `
        -PasswordCredential @{ DisplayName = $Label; EndDateTime = (Get-Date).AddYears(2) }
    return $cred.SecretText
}

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
Write-Step "Checking required modules"
$required = @(
    'Az.Accounts',
    'Az.Resources',
    'Microsoft.Graph.Applications',
    'Microsoft.Graph.Identity.DirectoryManagement',
    'ExchangeOnlineManagement'
)
foreach ($mod in $required) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
        Write-Warn "$mod not found — installing..."
        Install-Module $mod -Scope CurrentUser -Force -AllowClobber
    }
    Write-Ok "$mod available"
}

# ── 1. Connect ────────────────────────────────────────────────────────────────
Write-Step "Connecting to Microsoft Graph and Azure"

# Graph — needs Application.ReadWrite.All to create app registrations
Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.Read.All" -NoWelcome
Write-Ok "Microsoft Graph connected"

# Azure — for ARM service principal
if (-not (Get-AzContext)) {
    Connect-AzAccount
}
$azContext = Get-AzContext
Write-Ok "Azure connected as $($azContext.Account.Id) — subscription: $($azContext.Subscription.Name)"

if (-not $SUBSCRIPTION_ID) {
    $SUBSCRIPTION_ID = $azContext.Subscription.Id
    Write-Ok "Using subscription: $SUBSCRIPTION_ID"
}

# ── 2. Graph app registration ─────────────────────────────────────────────────
Write-Step "Creating Graph app registration: SVH OpsMan (Aaron Stevens)"

$graphPerms = @(
    # Planner / To Do
    @{ id = 'Tasks.ReadWrite';                                    type = 'Role' }
    @{ id = 'Tasks.ReadWrite.All';                                type = 'Role' }
    # Teams / Groups
    @{ id = 'Group.Read.All';                                     type = 'Role' }
    @{ id = 'ChannelMessage.Send';                                type = 'Role' }
    @{ id = 'TeamMember.ReadWrite.All';                           type = 'Role' }
    # OneDrive / SharePoint
    @{ id = 'Files.ReadWrite.All';                                type = 'Role' }
    @{ id = 'Sites.Read.All';                                     type = 'Role' }
    # Mail
    @{ id = 'Mail.ReadWrite';                                     type = 'Role' }
    @{ id = 'Mail.Send';                                          type = 'Role' }
    # Calendar
    @{ id = 'Calendars.ReadWrite';                                type = 'Role' }
    @{ id = 'MailboxSettings.ReadWrite';                          type = 'Role' }
    @{ id = 'Place.Read.All';                                     type = 'Role' }
    # Entra ID
    @{ id = 'Policy.Read.All';                                    type = 'Role' }
    @{ id = 'Application.Read.All';                               type = 'Role' }
    @{ id = 'RoleManagement.Read.Directory';                      type = 'Role' }
    @{ id = 'IdentityRiskyUser.ReadWrite.All';                    type = 'Role' }
    @{ id = 'UserAuthenticationMethod.Read.All';                  type = 'Role' }
    @{ id = 'AuditLog.Read.All';                                  type = 'Role' }
    # Intune
    @{ id = 'DeviceManagementManagedDevices.Read.All';            type = 'Role' }
    @{ id = 'DeviceManagementConfiguration.Read.All';             type = 'Role' }
    @{ id = 'DeviceManagementApps.Read.All';                      type = 'Role' }
    # MS Admin / Org
    @{ id = 'ServiceHealth.Read.All';                             type = 'Role' }
    @{ id = 'Organization.Read.All';                              type = 'Role' }
    @{ id = 'Directory.Read.All';                                 type = 'Role' }
    @{ id = 'Reports.Read.All';                                   type = 'Role' }
)

# Resolve permission names to GUIDs using the Graph service principal
$graphSp = Get-MgServicePrincipal -Filter "appId eq '00000003-0000-0000-c000-000000000000'"
$resolvedPerms = foreach ($p in $graphPerms) {
    $appRole = $graphSp.AppRoles | Where-Object { $_.Value -eq $p.id }
    if (-not $appRole) { Write-Warn "Permission not found: $($p.id) — skipping"; continue }
    @{
        id   = $appRole.Id
        type = $p.type
    }
}

$graphApp = New-MgApplication -DisplayName "SVH OpsMan (Aaron Stevens)" `
    -RequiredResourceAccess @{
        resourceAppId  = '00000003-0000-0000-c000-000000000000'
        resourceAccess = $resolvedPerms
    }

Write-Ok "App created — object ID: $($graphApp.Id)"

# Create service principal so admin consent and ApplicationAccessPolicy work
$graphSvc = New-MgServicePrincipal -AppId $graphApp.AppId
Write-Ok "Service principal created"

# Grant admin consent
Write-Warn "Granting admin consent for all Graph permissions (this may take a few seconds)..."
foreach ($p in $resolvedPerms) {
    try {
        New-MgServicePrincipalAppRoleAssignment `
            -ServicePrincipalId $graphSvc.Id `
            -PrincipalId        $graphSvc.Id `
            -ResourceId         $graphSp.Id `
            -AppRoleId          $p.id | Out-Null
    } catch {
        Write-Warn "  Could not grant $($p.id): $_"
    }
}
Write-Ok "Admin consent granted"

# Create client secret
$graphSecret = New-AppSecret -AppObjectId $graphApp.Id -Label "OpsMan MCP server"
Write-Ok "Client secret created (expires 2 years)"

# ── 3. Defender for Endpoint app registration ─────────────────────────────────
Write-Step "Creating MDE app registration: SVH OpsMan MDE"

$mdeSp = Get-MgServicePrincipal -Filter "appId eq 'fc780465-2017-40d4-a0c5-307022471b92'" -ErrorAction SilentlyContinue
if (-not $mdeSp) {
    # WindowsDefenderATP app ID
    $mdeSp = Get-MgServicePrincipal -Filter "displayName eq 'WindowsDefenderATP'"
}

$mdePerms = @('Machine.Read.All','Alert.Read.All','Ti.Read','Vulnerability.Read.All','Software.Read.All','AdvancedQuery.Read.All')

$resolvedMdePerms = foreach ($name in $mdePerms) {
    $role = $mdeSp.AppRoles | Where-Object { $_.Value -eq $name }
    if (-not $role) { Write-Warn "MDE permission not found: $name — skipping"; continue }
    @{ id = $role.Id; type = 'Role' }
}

$mdeApp = New-MgApplication -DisplayName "SVH OpsMan MDE" `
    -RequiredResourceAccess @{
        resourceAppId  = $mdeSp.AppId
        resourceAccess = $resolvedMdePerms
    }

$mdeSvc = New-MgServicePrincipal -AppId $mdeApp.AppId
Write-Ok "MDE app created — object ID: $($mdeApp.Id)"

foreach ($p in $resolvedMdePerms) {
    try {
        New-MgServicePrincipalAppRoleAssignment `
            -ServicePrincipalId $mdeSvc.Id `
            -PrincipalId        $mdeSvc.Id `
            -ResourceId         $mdeSp.Id `
            -AppRoleId          $p.id | Out-Null
    } catch {
        Write-Warn "  Could not grant $($p.id): $_"
    }
}
Write-Ok "MDE admin consent granted"

$mdeSecret = New-AppSecret -AppObjectId $mdeApp.Id -Label "OpsMan MCP server"
Write-Ok "MDE client secret created"

# ── 4. Azure ARM service principal ────────────────────────────────────────────
Write-Step "Creating Azure ARM service principal: SVH OpsMan ARM"

$armSp = New-AzADServicePrincipal -DisplayName "SVH OpsMan ARM"
Write-Ok "Service principal created — app ID: $($armSp.AppId)"

# ARM secret
$armCred    = $armSp | New-AzADSpCredential
$armSecret  = $armCred.SecretText

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Reader role assigned"

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Cost Management Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Cost Management Reader role assigned"

# ── 5. Exchange ApplicationAccessPolicy ───────────────────────────────────────
Write-Step "Configuring Exchange ApplicationAccessPolicy (restricts mail to $OWNER_UPN only)"
Write-Warn "Connecting to Exchange Online — sign in as your ma_ account when prompted"

Connect-ExchangeOnline -ShowProgress $false

$groupName  = "SVH OpsMan Mailbox Access"
$groupAlias = "svh-opsman-mailbox"

if (-not (Get-DistributionGroup -Identity $groupAlias -ErrorAction SilentlyContinue)) {
    New-DistributionGroup -Name $groupName -Alias $groupAlias -Type Security | Out-Null
    Write-Ok "Security group created: $groupName"
} else {
    Write-Ok "Security group already exists: $groupName"
}

Add-DistributionGroupMember -Identity $groupAlias -Member $OWNER_UPN -ErrorAction SilentlyContinue
Write-Ok "$OWNER_UPN added to group"

$existingPolicy = Get-ApplicationAccessPolicy -ErrorAction SilentlyContinue |
    Where-Object { $_.AppId -eq $graphApp.AppId }

if (-not $existingPolicy) {
    New-ApplicationAccessPolicy `
        -AppId              $graphApp.AppId `
        -PolicyScopeGroupId $groupAlias `
        -AccessRight        RestrictAccess `
        -Description        "Limit Claude OpsMan mail access to $OWNER_UPN only" | Out-Null
    Write-Ok "ApplicationAccessPolicy created"
} else {
    Write-Ok "ApplicationAccessPolicy already exists"
}

Write-Warn "Waiting 30s for policy to propagate before testing..."
Start-Sleep -Seconds 30

$grantedTest = Test-ApplicationAccessPolicy -AppId $graphApp.AppId -Identity $OWNER_UPN
$deniedTest  = Test-ApplicationAccessPolicy -AppId $graphApp.AppId -Identity "bbates@shoestringvalley.com" -ErrorAction SilentlyContinue

if ($grantedTest.AccessCheckResult -eq 'Granted') {
    Write-Ok "Policy test PASSED — $OWNER_UPN: Granted"
} else {
    Write-Warn "Policy test result for $OWNER_UPN`: $($grantedTest.AccessCheckResult) (may need more time to propagate)"
}
if ($deniedTest -and $deniedTest.AccessCheckResult -eq 'Denied') {
    Write-Ok "Policy test PASSED — bbates: Denied"
} else {
    Write-Warn "Policy test result for bbates: $($deniedTest.AccessCheckResult)"
}

Disconnect-ExchangeOnline -Confirm:$false

# ── 6. Summary ────────────────────────────────────────────────────────────────
$tenantId = (Get-MgContext).TenantId

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "  SVH OpsMan — Bitwarden vault fields" -ForegroundColor Green
Write-Host "  Add these as custom fields on the 'SVH OpsMan' item" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green

$output = [ordered]@{
    GRAPH_TENANT_ID       = $tenantId
    GRAPH_CLIENT_ID       = $graphApp.AppId
    GRAPH_CLIENT_SECRET   = $graphSecret
    GRAPH_USER_ID         = $OWNER_UPN
    MDE_TENANT_ID         = $tenantId
    MDE_CLIENT_ID         = $mdeApp.AppId
    MDE_CLIENT_SECRET     = $mdeSecret
    AZURE_TENANT_ID       = $tenantId
    AZURE_CLIENT_ID       = $armSp.AppId
    AZURE_CLIENT_SECRET   = $armSecret
    AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID
}

foreach ($kv in $output.GetEnumerator()) {
    Write-Host ("  {0,-28} = {1}" -f $kv.Key, $kv.Value)
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Green
Write-Host "Next: paste these into Bitwarden, then run:" -ForegroundColor Cyan
Write-Host "  export BW_SESSION=`$(bw unlock --raw)" -ForegroundColor White
Write-Host "  cd ~/SVH-OpsMan/mcp-server && npm start" -ForegroundColor White
