# setup-azure-apps.ps1 -- Create Azure app registrations and service principal for SVH OpsMan
#
# Creates:
#   1. Microsoft Graph app registration  "SVH OpsMan (Aaron Stevens)" -- M365, Entra, Exchange, Intune
#   2. Defender for Endpoint app reg     "SVH OpsMan MDE"
#   3. Azure ARM service principal       "SVH OpsMan ARM"
#   4. Exchange ApplicationAccessPolicy  restricts mail to astevens only
#
# Run as your ma_ account throughout. Required Entra roles on that account:
#   - Application Administrator  (create app regs + grant admin consent)
#   - Exchange Administrator      (ApplicationAccessPolicy step)
#   - User Access Administrator   (assign Reader roles on the Azure subscription)
#     OR Owner on the subscription -- whichever is already assigned
#
# Usage:
#   Connect-AzAccount                   # sign in first if not already connected
#   .\setup-azure-apps.ps1
#
# Output: prints all credential values at the end -- paste into Bitwarden as
#         custom fields on the "SVH OpsMan" vault item.

$ErrorActionPreference = 'Stop'

$OWNER_UPN       = 'astevens@shoestringvalley.com'
$SUBSCRIPTION_ID = ''   # fill in before running, or leave blank to use current az context

# ── helpers ───────────────────────────────────────────────────────────────────
function Write-Step ($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   ($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn ($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }

function New-AppSecret {
    param([string]$AppObjectId, [string]$Label)
    $cred = Add-MgApplicationPassword -ApplicationId $AppObjectId `
        -PasswordCredential @{ DisplayName = $Label; EndDateTime = (Get-Date).AddYears(2) }
    return $cred.SecretText
}

# ── 0. Prerequisites ──────────────────────────────────────────────────────────
Write-Step "Checking and updating required modules"
$required = @(
    'Az.Accounts',
    'Az.Resources',
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
        # Keep modules current to avoid Azure.Identity version conflicts
        Update-Module $mod -Force -ErrorAction SilentlyContinue
        Write-Ok "$mod up to date"
    }
}
if ($needsRestart) {
    Write-Host "`n  Modules were just installed. Please close and reopen PowerShell, then run the script again." -ForegroundColor Yellow
    exit
}

# ── 1. Connect ────────────────────────────────────────────────────────────────
# Device code flow is used throughout -- it opens microsoft.com/devicelogin in
# your normal browser, where passkeys work. Follow the prompt in each step.

Write-Step "Connecting to Microsoft Graph (device code -- sign in as your ma_ account)"
$ProgressPreference = 'SilentlyContinue'
Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.Read.All" -UseDeviceCode -NoWelcome
Write-Ok "Microsoft Graph connected"

Write-Step "Connecting to Azure (device code -- same ma_ account)"
Connect-AzAccount -UseDeviceAuthentication | Out-Null
$azContext = Get-AzContext
Write-Ok "Azure connected as $($azContext.Account.Id) -- subscription: $($azContext.Subscription.Name)"

if (-not $SUBSCRIPTION_ID) {
    $SUBSCRIPTION_ID = $azContext.Subscription.Id
    Write-Ok "Using subscription: $SUBSCRIPTION_ID"
}

# ── 2. Graph app registration ─────────────────────────────────────────────────
Write-Step "Creating Graph app registration: SVH OpsMan (Aaron Stevens)"

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

$graphApp = New-MgApplication -DisplayName "SVH OpsMan (Aaron Stevens)" `
    -RequiredResourceAccess @{
        resourceAppId  = $graphSpId
        resourceAccess = $resolvedPerms.ToArray()
    }

$graphSvc = New-MgServicePrincipal -AppId $graphApp.AppId
Write-Ok "App created -- app ID: $($graphApp.AppId)"

Write-Warn "Granting admin consent for all Graph permissions..."
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

$graphSecret = New-AppSecret -AppObjectId $graphApp.Id -Label "OpsMan MCP server"
Write-Ok "Client secret created (expires 2 years)"

# ── 3. Defender for Endpoint app registration ─────────────────────────────────
Write-Step "Creating MDE app registration: SVH OpsMan MDE"

$mdeSp = Get-MgServicePrincipal -Filter "displayName eq 'WindowsDefenderATP'" |
    Select-Object -First 1
if (-not $mdeSp) {
    Write-Warn "WindowsDefenderATP service principal not found -- Defender may not be licensed"
    $mdeApp    = $null
    $mdeSecret = '(skipped -- WindowsDefenderATP not found)'
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

    $mdeApp = New-MgApplication -DisplayName "SVH OpsMan MDE" `
        -RequiredResourceAccess @{
            resourceAppId  = $mdeSp.AppId
            resourceAccess = $resolvedMdePerms.ToArray()
        }

    $mdeSvc = New-MgServicePrincipal -AppId $mdeApp.AppId
    Write-Ok "MDE app created -- app ID: $($mdeApp.AppId)"

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
}

# ── 4. Azure ARM service principal ────────────────────────────────────────────
Write-Step "Creating Azure ARM service principal: SVH OpsMan ARM"

$armSp     = New-AzADServicePrincipal -DisplayName "SVH OpsMan ARM"
$armCred   = $armSp | New-AzADSpCredential
$armSecret = $armCred.SecretText

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Reader role assigned"

New-AzRoleAssignment -ApplicationId $armSp.AppId `
    -RoleDefinitionName "Cost Management Reader" `
    -Scope "/subscriptions/$SUBSCRIPTION_ID" | Out-Null
Write-Ok "Cost Management Reader role assigned"

Write-Ok "ARM service principal created -- app ID: $($armSp.AppId)"

# ── 5. Exchange ApplicationAccessPolicy ───────────────────────────────────────
Write-Step "Configuring Exchange ApplicationAccessPolicy"
Write-Warn "Connecting to Exchange Online (device code -- same ma_ account)"

Connect-ExchangeOnline -Device -ShowProgress $false

$groupAlias = "svh-opsman-mailbox"
$groupName  = "SVH OpsMan Mailbox Access"

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
        -Description        "Limit Claude OpsMan mail access to ${OWNER_UPN} only" | Out-Null
    Write-Ok "ApplicationAccessPolicy created"
} else {
    Write-Ok "ApplicationAccessPolicy already exists"
}

Write-Warn "Waiting 30s for policy to propagate before testing..."
Start-Sleep -Seconds 30

$grantedTest = Test-ApplicationAccessPolicy -AppId $graphApp.AppId -Identity $OWNER_UPN
Write-Ok "Policy test -- ${OWNER_UPN}: $($grantedTest.AccessCheckResult)"

$deniedTest = Test-ApplicationAccessPolicy -AppId $graphApp.AppId `
    -Identity "bbates@shoestringvalley.com" -ErrorAction SilentlyContinue
if ($deniedTest) {
    Write-Ok "Policy test -- bbates: $($deniedTest.AccessCheckResult)"
}

Disconnect-ExchangeOnline -Confirm:$false

# ── 6. Summary ────────────────────────────────────────────────────────────────
$tenantId = (Get-MgContext).TenantId

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  SVH OpsMan -- Bitwarden vault fields" -ForegroundColor Green
Write-Host "  Add these as custom fields on the 'SVH OpsMan' item" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green

$output = [ordered]@{
    GRAPH_TENANT_ID       = $tenantId
    GRAPH_CLIENT_ID       = $graphApp.AppId
    GRAPH_CLIENT_SECRET   = $graphSecret
    GRAPH_USER_ID         = $OWNER_UPN
    MDE_TENANT_ID         = $tenantId
    MDE_CLIENT_ID         = if ($mdeApp) { $mdeApp.AppId } else { '(skipped)' }
    MDE_CLIENT_SECRET     = $mdeSecret
    AZURE_TENANT_ID       = $tenantId
    AZURE_CLIENT_ID       = $armSp.AppId
    AZURE_CLIENT_SECRET   = $armSecret
    AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID
}

foreach ($kv in $output.GetEnumerator()) {
    Write-Host ("  {0,-28} = {1}" -f $kv.Key, $kv.Value)
}

Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next: paste the above into Bitwarden, then from WSL run:" -ForegroundColor Cyan
Write-Host "  export BW_SESSION=`$(bw unlock --raw)" -ForegroundColor White
Write-Host "  cd ~/SVH-OpsMan/mcp-server && npm start" -ForegroundColor White
