# SVH.Azure.psm1 — Azure Resource Manager + Microsoft Defender for Endpoint

$script:ArmToken        = $null
$script:ArmTokenExpiry  = [DateTime]::MinValue
$script:MdeToken        = $null
$script:MdeTokenExpiry  = [DateTime]::MinValue

function script:Get-ArmToken {
    if ($script:ArmToken -and (Get-Date) -lt $script:ArmTokenExpiry) {
        return $script:ArmToken
    }
    $c    = $Global:SVHCreds
    $body = @{
        grant_type    = 'client_credentials'
        client_id     = $c['AZURE_CLIENT_ID']
        client_secret = $c['AZURE_CLIENT_SECRET']
        scope         = 'https://management.azure.com/.default'
    }
    $r = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$($c['AZURE_TENANT_ID'])/oauth2/v2.0/token" `
        -Body $body -ContentType 'application/x-www-form-urlencoded'
    $script:ArmToken       = $r.access_token
    $script:ArmTokenExpiry = (Get-Date).AddSeconds($r.expires_in - 60)
    return $script:ArmToken
}

function script:Get-MdeToken {
    if ($script:MdeToken -and (Get-Date) -lt $script:MdeTokenExpiry) {
        return $script:MdeToken
    }
    $c    = $Global:SVHCreds
    $body = @{
        grant_type    = 'client_credentials'
        client_id     = $c['MDE_CLIENT_ID']
        client_secret = $c['MDE_CLIENT_SECRET']
        scope         = 'https://api.securitycenter.microsoft.com/.default'
    }
    $r = Invoke-RestMethod -Method Post `
        -Uri "https://login.microsoftonline.com/$($c['MDE_TENANT_ID'])/oauth2/v2.0/token" `
        -Body $body -ContentType 'application/x-www-form-urlencoded'
    $script:MdeToken       = $r.access_token
    $script:MdeTokenExpiry = (Get-Date).AddSeconds($r.expires_in - 60)
    return $script:MdeToken
}

function script:subId { $Global:SVHCreds['AZURE_SUBSCRIPTION_ID'] }

function script:armGet($path, $apiVersion, $params = @{}) {
    $params['api-version'] = $apiVersion
    $uri = "https://management.azure.com$path"
    Invoke-RestMethod -Method Get -Uri $uri `
        -Headers @{ Authorization = "Bearer $(Get-ArmToken)" } `
        -Body $params
}

function script:armPost($path, $apiVersion, $body = @{}) {
    $uri = "https://management.azure.com${path}?api-version=$apiVersion"
    Invoke-RestMethod -Method Post -Uri $uri `
        -Headers @{ Authorization = "Bearer $(Get-ArmToken)"; 'Content-Type' = 'application/json' } `
        -Body ($body | ConvertTo-Json -Depth 10)
}

function script:armPatch($path, $apiVersion, $body) {
    $uri = "https://management.azure.com${path}?api-version=$apiVersion"
    Invoke-RestMethod -Method Patch -Uri $uri `
        -Headers @{ Authorization = "Bearer $(Get-ArmToken)"; 'Content-Type' = 'application/json' } `
        -Body ($body | ConvertTo-Json -Depth 10)
}

function script:mdeGet($path, $params = @{}) {
    Invoke-RestMethod -Method Get -Uri "https://api.securitycenter.microsoft.com/api$path" `
        -Headers @{ Authorization = "Bearer $(Get-MdeToken)" } `
        -Body $params
}

function script:mdePost($path, $body) {
    Invoke-RestMethod -Method Post -Uri "https://api.securitycenter.microsoft.com/api$path" `
        -Headers @{ Authorization = "Bearer $(Get-MdeToken)"; 'Content-Type' = 'application/json' } `
        -Body ($body | ConvertTo-Json -Depth 10)
}

function script:mdeDelete($path) {
    Invoke-RestMethod -Method Delete -Uri "https://api.securitycenter.microsoft.com/api$path" `
        -Headers @{ Authorization = "Bearer $(Get-MdeToken)" }
}

# ── VERIFY: Azure Resource Manager ────────────────────────────────────────────

function Get-SVHResourceGroups {
    param([string]$Filter)
    $params = @{}
    if ($Filter) { $params['$filter'] = $Filter }
    (armGet "/subscriptions/$(subId)/resourcegroups" '2021-04-01' $params).value
}
Export-ModuleMember -Function Get-SVHResourceGroups

function Get-SVHVMs {
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines"
    } else {
        "/subscriptions/$(subId)/providers/Microsoft.Compute/virtualMachines"
    }
    (armGet $path '2023-03-01').value | ForEach-Object {
        [PSCustomObject]@{
            Name          = $_.name
            ResourceGroup = $_.id -split '/' | Select-Object -Index 4
            Location      = $_.location
            Size          = $_.properties.hardwareProfile.vmSize
            OS            = $_.properties.storageProfile.osDisk.osType
        }
    }
}
Export-ModuleMember -Function Get-SVHVMs

function Get-SVHVM {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    $vm = armGet "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName" '2023-03-01' @{ '$expand' = 'instanceView' }
    $power = ($vm.properties.instanceView.statuses | Where-Object { $_.code -like 'PowerState/*' }).displayStatus
    $vm | Add-Member -NotePropertyName powerState -NotePropertyValue $power -PassThru
}
Export-ModuleMember -Function Get-SVHVM

function Get-SVHStorageAccounts {
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts"
    } else {
        "/subscriptions/$(subId)/providers/Microsoft.Storage/storageAccounts"
    }
    (armGet $path '2023-01-01').value | ForEach-Object {
        [PSCustomObject]@{
            Name             = $_.name
            ResourceGroup    = $_.id -split '/' | Select-Object -Index 4
            Location         = $_.location
            HttpsOnly        = $_.properties.supportsHttpsTrafficOnly
            PublicBlobAccess = $_.properties.allowBlobPublicAccess
            Sku              = $_.sku.name
        }
    }
}
Export-ModuleMember -Function Get-SVHStorageAccounts

function Get-SVHVNets {
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Network/virtualNetworks"
    } else {
        "/subscriptions/$(subId)/providers/Microsoft.Network/virtualNetworks"
    }
    (armGet $path '2023-06-01').value
}
Export-ModuleMember -Function Get-SVHVNets

function Get-SVHNSGRules {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$NSGName
    )
    $nsg = armGet "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Network/networkSecurityGroups/$NSGName" '2023-06-01'
    $nsg.properties.securityRules | Sort-Object { $_.properties.priority }
}
Export-ModuleMember -Function Get-SVHNSGRules

function Get-SVHActivityLog {
    param(
        [int]$Hours = 24,
        [string]$Caller,
        [string]$ResourceGroup
    )
    $since   = (Get-Date).AddHours(-$Hours).ToUniversalTime().ToString('o')
    $filters = @("eventTimestamp ge '$since'")
    if ($Caller)        { $filters += "caller eq '$Caller'" }
    if ($ResourceGroup) { $filters += "resourceGroupName eq '$ResourceGroup'" }

    (armGet "/subscriptions/$(subId)/providers/Microsoft.Insights/eventtypes/management/values" '2015-04-01' @{
        '$filter' = $filters -join ' and '
        '$select' = 'caller,operationName,status,eventTimestamp,resourceGroupName,resourceId,correlationId'
    }).value
}
Export-ModuleMember -Function Get-SVHActivityLog

function Get-SVHCostSummary {
    param(
        [ValidateSet('ResourceGroup','ServiceName','ResourceType')][string]$GroupBy = 'ResourceGroup',
        [string]$BillingMonth
    )
    if (-not $BillingMonth) { $BillingMonth = (Get-Date).ToString('yyyy-MM') }
    $start = "$BillingMonth-01"
    $end   = [datetime]::ParseExact($start, 'yyyy-MM-dd', $null).AddMonths(1).AddDays(-1).ToString('yyyy-MM-dd')

    $body = @{
        type       = 'Usage'
        timeframe  = 'Custom'
        timePeriod = @{ from = $start; to = $end }
        dataset    = @{
            granularity = 'None'
            grouping    = @(@{ type = 'Dimension'; name = $GroupBy })
            aggregation = @{ totalCost = @{ name = 'Cost'; function = 'Sum' } }
        }
    }
    armPost "/subscriptions/$(subId)/providers/Microsoft.CostManagement/query" '2023-03-01' $body
}
Export-ModuleMember -Function Get-SVHCostSummary

function Get-SVHAdvisorRecommendations {
    param([ValidateSet('Cost','Security','HighAvailability','Performance','OperationalExcellence','all')][string]$Category = 'all')
    $params = @{}
    if ($Category -ne 'all') { $params['$filter'] = "Category eq '$Category'" }
    (armGet "/subscriptions/$(subId)/providers/Microsoft.Advisor/recommendations" '2023-01-01' $params).value
}
Export-ModuleMember -Function Get-SVHAdvisorRecommendations

function Get-SVHAppServices {
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites"
    } else {
        "/subscriptions/$(subId)/providers/Microsoft.Web/sites"
    }
    (armGet $path '2023-01-01').value | ForEach-Object {
        [PSCustomObject]@{
            Name          = $_.name
            ResourceGroup = $_.id -split '/' | Select-Object -Index 4
            Kind          = $_.kind
            State         = $_.properties.state
            HostNames     = $_.properties.hostNames -join ', '
        }
    }
}
Export-ModuleMember -Function Get-SVHAppServices

# ── VERIFY: Defender for Endpoint ─────────────────────────────────────────────

function Get-SVHMDEDevices {
    param(
        [ValidateSet('Active','Inactive','ImpairedCommunication','NoSensorData','all')][string]$HealthStatus = 'all',
        [ValidateSet('None','Low','Medium','High','all')][string]$RiskScore = 'all',
        [int]$Top = 50
    )
    $filters = @()
    if ($HealthStatus -ne 'all') { $filters += "healthStatus eq '$HealthStatus'" }
    if ($RiskScore -ne 'all')    { $filters += "riskScore eq '$RiskScore'" }
    $params = @{ '$top' = $Top }
    if ($filters) { $params['$filter'] = $filters -join ' and ' }
    (mdeGet '/machines' $params).value
}
Export-ModuleMember -Function Get-SVHMDEDevices

function Get-SVHMDEDevice {
    param([Parameter(Mandatory)][string]$MachineId)
    mdeGet "/machines/$MachineId"
}
Export-ModuleMember -Function Get-SVHMDEDevice

function Get-SVHMDEDeviceVulns {
    param(
        [Parameter(Mandatory)][string]$MachineId,
        [ValidateSet('Low','Medium','High','Critical','all')][string]$Severity = 'all',
        [int]$Top = 50
    )
    $params = @{ '$top' = $Top }
    if ($Severity -ne 'all') { $params['$filter'] = "severity eq '$Severity'" }
    (mdeGet "/machines/$MachineId/vulnerabilities" $params).value
}
Export-ModuleMember -Function Get-SVHMDEDeviceVulns

function Get-SVHMDEAlerts {
    param(
        [ValidateSet('Informational','Low','Medium','High','all')][string]$Severity = 'all',
        [ValidateSet('New','InProgress','Resolved','all')][string]$Status = 'all',
        [int]$Top = 25
    )
    $filters = @()
    if ($Severity -ne 'all') { $filters += "severity eq '$Severity'" }
    if ($Status -ne 'all')   { $filters += "status eq '$Status'" }
    $params = @{ '$top' = $Top }
    if ($filters) { $params['$filter'] = $filters -join ' and ' }
    (mdeGet '/alerts' $params).value
}
Export-ModuleMember -Function Get-SVHMDEAlerts

function Get-SVHMDEIndicators {
    param(
        [ValidateSet('FileSha256','FileSha1','FileMd5','IpAddress','DomainName','Url','all')][string]$Type = 'all',
        [ValidateSet('Alert','Block','Allowed','all')][string]$Action = 'all',
        [int]$Top = 50
    )
    $filters = @()
    if ($Type -ne 'all')   { $filters += "indicatorType eq '$Type'" }
    if ($Action -ne 'all') { $filters += "action eq '$Action'" }
    $params = @{ '$top' = $Top }
    if ($filters) { $params['$filter'] = $filters -join ' and ' }
    (mdeGet '/indicators' $params).value
}
Export-ModuleMember -Function Get-SVHMDEIndicators

function Get-SVHTVMRecommendations {
    param([int]$Top = 25)
    (mdeGet '/recommendations' @{
        '$top'     = $Top
        '$orderby' = 'exposureLevel desc'
    }).value
}
Export-ModuleMember -Function Get-SVHTVMRecommendations

# ── ACT: Azure VMs ────────────────────────────────────────────────────────────

function Start-SVHVM {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/start" '2023-03-01'
    Write-Host "[svh] Start command sent to $VMName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Start-SVHVM

function Stop-SVHVM {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName,
        [switch]$Deallocate
    )
    $action = if ($Deallocate) { 'deallocate' } else { 'powerOff' }
    armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/$action" '2023-03-01'
    Write-Host "[svh] $action sent to $VMName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Stop-SVHVM

function Restart-SVHVM {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/restart" '2023-03-01'
    Write-Host "[svh] Restart sent to $VMName" -ForegroundColor Yellow
}
Export-ModuleMember -Function Restart-SVHVM

function Set-SVHVMSize {
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName,
        [Parameter(Mandatory)][string]$NewSize
    )
    armPatch "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName" '2023-03-01' @{
        properties = @{ hardwareProfile = @{ vmSize = $NewSize } }
    }
    Write-Host "[svh] $VMName size set to $NewSize (VM must be stopped first)" -ForegroundColor Yellow
}
Export-ModuleMember -Function Set-SVHVMSize

# ── ACT: Defender for Endpoint ────────────────────────────────────────────────

function Add-SVHMDEIndicator {
    param(
        [Parameter(Mandatory)][string]$IndicatorValue,
        [Parameter(Mandatory)][ValidateSet('FileSha256','FileSha1','FileMd5','IpAddress','DomainName','Url')][string]$IndicatorType,
        [Parameter(Mandatory)][ValidateSet('Alert','AlertAndBlock','Block','Allowed')][string]$Action,
        [string]$Title = '',
        [string]$Description = '',
        [ValidateSet('Informational','Low','Medium','High')][string]$Severity = 'Medium',
        [int]$ExpirationDays = 0
    )
    $body = @{
        indicatorValue = $IndicatorValue
        indicatorType  = $IndicatorType
        action         = $Action
        title          = $Title
        description    = $Description
        severity       = $Severity
    }
    if ($ExpirationDays -gt 0) {
        $body['expirationTime'] = (Get-Date).AddDays($ExpirationDays).ToUniversalTime().ToString('o')
    }
    $result = mdePost '/indicators' $body
    Write-Host "[svh] IOC created: $IndicatorType $IndicatorValue ($Action)" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Add-SVHMDEIndicator

function Remove-SVHMDEIndicator {
    param([Parameter(Mandatory)][string]$IndicatorId)
    mdeDelete "/indicators/$IndicatorId"
    Write-Host "[svh] IOC $IndicatorId removed" -ForegroundColor Yellow
}
Export-ModuleMember -Function Remove-SVHMDEIndicator

function Invoke-SVHMDEIsolation {
    param(
        [Parameter(Mandatory)][string]$MachineId,
        [ValidateSet('Selective','Full')][string]$IsolationType = 'Full',
        [string]$Comment = 'Isolated via SVH PowerShell'
    )
    mdePost "/machines/$MachineId/isolate" @{
        Comment       = $Comment
        IsolationType = $IsolationType
    }
    Write-Host "[svh] Isolation ($IsolationType) requested for machine $MachineId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Invoke-SVHMDEIsolation

function Invoke-SVHMDEUnisolation {
    param(
        [Parameter(Mandatory)][string]$MachineId,
        [string]$Comment = 'Released from isolation via SVH PowerShell'
    )
    mdePost "/machines/$MachineId/unisolate" @{ Comment = $Comment }
    Write-Host "[svh] Machine $MachineId released from isolation" -ForegroundColor Yellow
}
Export-ModuleMember -Function Invoke-SVHMDEUnisolation

function Invoke-SVHMDEAVScan {
    param(
        [Parameter(Mandatory)][string]$MachineId,
        [ValidateSet('Quick','Full')][string]$ScanType = 'Quick',
        [string]$Comment = 'AV scan triggered via SVH PowerShell'
    )
    mdePost "/machines/$MachineId/runAntiVirusScan" @{
        Comment  = $Comment
        ScanType = $ScanType
    }
    Write-Host "[svh] $ScanType AV scan requested for machine $MachineId" -ForegroundColor Yellow
}
Export-ModuleMember -Function Invoke-SVHMDEAVScan
