# SVH.Azure.psm1 — Azure Resource Manager + Microsoft Defender for Endpoint
# Requires: SVH.Core
# ARM service principal owner: aa_stevens@shoestringvalley.com (Reader + Cost Mgmt Reader)
# MDE app registration owner: ma_stevens@shoestringvalley.com (WindowsDefenderATP perms)

Set-StrictMode -Version Latest

function script:Get-ArmToken {
    Get-SVHOAuth2Token -CacheKey 'ARM' `
        -TenantId     (Get-SVHCredential 'AZURE_TENANT_ID') `
        -ClientId     (Get-SVHCredential 'AZURE_CLIENT_ID') `
        -ClientSecret (Get-SVHCredential 'AZURE_CLIENT_SECRET') `
        -Scope        'https://management.azure.com/.default'
}

function script:Get-MdeToken {
    Get-SVHOAuth2Token -CacheKey 'MDE' `
        -TenantId     (Get-SVHCredential 'MDE_TENANT_ID') `
        -ClientId     (Get-SVHCredential 'MDE_CLIENT_ID') `
        -ClientSecret (Get-SVHCredential 'MDE_CLIENT_SECRET') `
        -Scope        'https://api.securitycenter.microsoft.com/.default'
}

function script:subId { Get-SVHCredential 'AZURE_SUBSCRIPTION_ID' }

function script:armGet  { param($p, $v, $q = @{}) Invoke-SVHRest -Uri "https://management.azure.com${p}" -Headers @{ Authorization = "Bearer $(Get-ArmToken)" } -Query ($q + @{ 'api-version' = $v }) }
function script:armPost { param($p, $v, $b = @{}) Invoke-SVHRest -Method POST  -Uri "https://management.azure.com${p}?api-version=$v" -Headers @{ Authorization = "Bearer $(Get-ArmToken)" } -Body $b }
function script:armPatch{ param($p, $v, $b)       Invoke-SVHRest -Method PATCH -Uri "https://management.azure.com${p}?api-version=$v" -Headers @{ Authorization = "Bearer $(Get-ArmToken)" } -Body $b }
function script:mdeGet  { param($p, $q = @{}) Invoke-SVHRest -Uri "https://api.securitycenter.microsoft.com/api$p" -Headers @{ Authorization = "Bearer $(Get-MdeToken)" } -Query $q }
function script:mdePost { param($p, $b)       Invoke-SVHRest -Method POST   -Uri "https://api.securitycenter.microsoft.com/api$p" -Headers @{ Authorization = "Bearer $(Get-MdeToken)" } -Body $b }
function script:mdeDel  { param($p)           Invoke-SVHRest -Method DELETE -Uri "https://api.securitycenter.microsoft.com/api$p" -Headers @{ Authorization = "Bearer $(Get-MdeToken)" } }

# ── VERIFY: Azure Resource Manager ────────────────────────────────────────────

function Get-SVHResourceGroups {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$Filter)
    $q = @{}
    if ($Filter) { $q['$filter'] = $Filter }
    (armGet "/subscriptions/$(subId)/resourcegroups" '2021-04-01' $q).value | ForEach-Object {
        [PSCustomObject]@{
            Name              = $_.name
            Location          = $_.location
            ProvisioningState = $_.properties.provisioningState
            Tags              = $_.tags
        }
    }
}
Export-ModuleMember -Function Get-SVHResourceGroups

function Get-SVHVMs {
    <#
    .SYNOPSIS  List VMs across the subscription or within a resource group.
    .EXAMPLE   Get-SVHVMs | Where-Object PowerState -ne 'VM running'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines"
    } else { "/subscriptions/$(subId)/providers/Microsoft.Compute/virtualMachines" }
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
    <#
    .SYNOPSIS  Get VM details with current power state.
    .EXAMPLE   Get-SVHVM -ResourceGroup RG-SVH -VMName SVH-SQL01
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    $vm    = armGet "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName" '2023-03-01' @{ '$expand' = 'instanceView' }
    $power = ($vm.properties.instanceView.statuses | Where-Object { $_.code -like 'PowerState/*' }).displayStatus
    $vm | Add-Member -NotePropertyName PowerState -NotePropertyValue $power -PassThru
}
Export-ModuleMember -Function Get-SVHVM

function Get-SVHStorageAccounts {
    <#
    .SYNOPSIS  List storage accounts — flags HTTPS-only and public blob access settings.
    .EXAMPLE   Get-SVHStorageAccounts | Where-Object PublicBlobAccess -eq $true
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts"
    } else { "/subscriptions/$(subId)/providers/Microsoft.Storage/storageAccounts" }
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
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Network/virtualNetworks"
    } else { "/subscriptions/$(subId)/providers/Microsoft.Network/virtualNetworks" }
    (armGet $path '2023-06-01').value
}
Export-ModuleMember -Function Get-SVHVNets

function Get-SVHNSGRules {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$NSGName
    )
    $nsg = armGet "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Network/networkSecurityGroups/$NSGName" '2023-06-01'
    $nsg.properties.securityRules | Sort-Object { $_.properties.priority }
}
Export-ModuleMember -Function Get-SVHNSGRules

function Get-SVHOpenInboundPorts {
    <#
    .SYNOPSIS  Find NSG rules allowing inbound traffic from any source (0.0.0.0/0 or *).
    .DESCRIPTION
        Flags rules with source address prefix '*' or 'Internet' — potential exposure.
    .EXAMPLE   Get-SVHOpenInboundPorts | Format-Table -AutoSize
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    Write-Verbose 'Scanning all NSGs for open inbound rules...'
    $nsgs = (armGet "/subscriptions/$(subId)/providers/Microsoft.Network/networkSecurityGroups" '2023-06-01').value
    foreach ($nsg in $nsgs) {
        $rg = $nsg.id -split '/' | Select-Object -Index 4
        foreach ($rule in $nsg.properties.securityRules) {
            $src = $rule.properties.sourceAddressPrefix
            if ($rule.properties.access -eq 'Allow' -and
                $rule.properties.direction -eq 'Inbound' -and
                ($src -eq '*' -or $src -eq 'Internet' -or $src -eq '0.0.0.0/0')) {
                [PSCustomObject]@{
                    NSG           = $nsg.name
                    ResourceGroup = $rg
                    RuleName      = $rule.name
                    Priority      = $rule.properties.priority
                    DestPorts     = $rule.properties.destinationPortRange ?? ($rule.properties.destinationPortRanges -join ',')
                    Source        = $src
                }
            }
        }
    }
}
Export-ModuleMember -Function Get-SVHOpenInboundPorts

function Get-SVHPublicIPs {
    <#
    .SYNOPSIS  List all public IP addresses in the subscription.
    .EXAMPLE   Get-SVHPublicIPs | Where-Object AssociatedResource -ne $null
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (armGet "/subscriptions/$(subId)/providers/Microsoft.Network/publicIPAddresses" '2023-06-01').value | ForEach-Object {
        [PSCustomObject]@{
            Name               = $_.name
            ResourceGroup      = $_.id -split '/' | Select-Object -Index 4
            IPAddress          = $_.properties.ipAddress
            AllocationMethod   = $_.properties.publicIPAllocationMethod
            AssociatedResource = $_.properties.ipConfiguration?.id -split '/' | Select-Object -Index 8
        }
    }
}
Export-ModuleMember -Function Get-SVHPublicIPs

function Get-SVHAppServices {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$ResourceGroup)
    $path = if ($ResourceGroup) {
        "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Web/sites"
    } else { "/subscriptions/$(subId)/providers/Microsoft.Web/sites" }
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

function Get-SVHActivityLog {
    <#
    .SYNOPSIS  Query the Azure control-plane audit trail.
    .EXAMPLE   Get-SVHActivityLog -Hours 24 -ResourceGroup RG-SVH
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
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
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('ResourceGroup','ServiceName','ResourceType')][string]$GroupBy = 'ResourceGroup',
        [string]$BillingMonth
    )
    if (-not $BillingMonth) { $BillingMonth = (Get-Date).ToString('yyyy-MM') }
    $start = "$BillingMonth-01"
    $end   = [datetime]::ParseExact($start, 'yyyy-MM-dd', $null).AddMonths(1).AddDays(-1).ToString('yyyy-MM-dd')
    armPost "/subscriptions/$(subId)/providers/Microsoft.CostManagement/query" '2023-03-01' @{
        type       = 'Usage'
        timeframe  = 'Custom'
        timePeriod = @{ from = $start; to = $end }
        dataset    = @{
            granularity = 'None'
            grouping    = @(@{ type = 'Dimension'; name = $GroupBy })
            aggregation = @{ totalCost = @{ name = 'Cost'; function = 'Sum' } }
        }
    }
}
Export-ModuleMember -Function Get-SVHCostSummary

function Get-SVHAdvisorRecommendations {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([ValidateSet('Cost','Security','HighAvailability','Performance','OperationalExcellence','all')][string]$Category = 'all')
    $q = @{}
    if ($Category -ne 'all') { $q['$filter'] = "Category eq '$Category'" }
    (armGet "/subscriptions/$(subId)/providers/Microsoft.Advisor/recommendations" '2023-01-01' $q).value
}
Export-ModuleMember -Function Get-SVHAdvisorRecommendations

# ── VERIFY: Defender for Endpoint ─────────────────────────────────────────────

function Get-SVHMDEDevices {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('Active','Inactive','ImpairedCommunication','NoSensorData','all')][string]$HealthStatus = 'all',
        [ValidateSet('None','Low','Medium','High','all')][string]$RiskScore = 'all',
        [int]$Top = 50
    )
    $filters = @()
    if ($HealthStatus -ne 'all') { $filters += "healthStatus eq '$HealthStatus'" }
    if ($RiskScore -ne 'all')    { $filters += "riskScore eq '$RiskScore'" }
    $q = @{ '$top' = $Top }
    if ($filters) { $q['$filter'] = $filters -join ' and ' }
    (mdeGet '/machines' $q).value
}
Export-ModuleMember -Function Get-SVHMDEDevices

function Get-SVHMDEDevice {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([Parameter(Mandatory, ValueFromPipelineByPropertyName)][Alias('id')][string]$MachineId)
    process { mdeGet "/machines/$MachineId" }
}
Export-ModuleMember -Function Get-SVHMDEDevice

function Get-SVHMDEDeviceVulns {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)][Alias('id')][string]$MachineId,
        [ValidateSet('Low','Medium','High','Critical','all')][string]$Severity = 'all',
        [int]$Top = 50
    )
    process {
        $q = @{ '$top' = $Top }
        if ($Severity -ne 'all') { $q['$filter'] = "severity eq '$Severity'" }
        (mdeGet "/machines/$MachineId/vulnerabilities" $q).value
    }
}
Export-ModuleMember -Function Get-SVHMDEDeviceVulns

function Get-SVHMDEAlerts {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('Informational','Low','Medium','High','all')][string]$Severity = 'all',
        [ValidateSet('New','InProgress','Resolved','all')][string]$Status = 'all',
        [int]$Top = 25
    )
    $filters = @()
    if ($Severity -ne 'all') { $filters += "severity eq '$Severity'" }
    if ($Status -ne 'all')   { $filters += "status eq '$Status'" }
    $q = @{ '$top' = $Top }
    if ($filters) { $q['$filter'] = $filters -join ' and ' }
    (mdeGet '/alerts' $q).value
}
Export-ModuleMember -Function Get-SVHMDEAlerts

function Get-SVHMDEIndicators {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('FileSha256','FileSha1','FileMd5','IpAddress','DomainName','Url','all')][string]$Type = 'all',
        [ValidateSet('Alert','Block','Allowed','all')][string]$Action = 'all',
        [int]$Top = 50
    )
    $filters = @()
    if ($Type -ne 'all')   { $filters += "indicatorType eq '$Type'" }
    if ($Action -ne 'all') { $filters += "action eq '$Action'" }
    $q = @{ '$top' = $Top }
    if ($filters) { $q['$filter'] = $filters -join ' and ' }
    (mdeGet '/indicators' $q).value
}
Export-ModuleMember -Function Get-SVHMDEIndicators

function Get-SVHTVMRecommendations {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 25)
    (mdeGet '/recommendations' @{ '$top' = $Top; '$orderby' = 'exposureLevel desc' }).value
}
Export-ModuleMember -Function Get-SVHTVMRecommendations

# ── ACT: Azure VMs ────────────────────────────────────────────────────────────

function Start-SVHVM {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    if ($PSCmdlet.ShouldProcess($VMName, 'Start VM')) {
        armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/start" '2023-03-01'
        Write-Verbose "Start command sent to $VMName"
    }
}
Export-ModuleMember -Function Start-SVHVM

function Stop-SVHVM {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName,
        [switch]$Deallocate
    )
    $action = if ($Deallocate) { 'deallocate' } else { 'powerOff' }
    if ($PSCmdlet.ShouldProcess($VMName, $action)) {
        armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/$action" '2023-03-01'
        Write-Verbose "$action sent to $VMName"
    }
}
Export-ModuleMember -Function Stop-SVHVM

function Restart-SVHVM {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$VMName
    )
    if ($PSCmdlet.ShouldProcess($VMName, 'Restart VM')) {
        armPost "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Compute/virtualMachines/$VMName/restart" '2023-03-01'
        Write-Verbose "Restart sent to $VMName"
    }
}
Export-ModuleMember -Function Restart-SVHVM

function Set-SVHStoragePublicAccess {
    <#
    .SYNOPSIS  Toggle public blob access on a storage account.
    .EXAMPLE   Set-SVHStoragePublicAccess -ResourceGroup RG-SVH -AccountName svhstore -Enabled $false
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$ResourceGroup,
        [Parameter(Mandatory)][string]$AccountName,
        [Parameter(Mandatory)][bool]$Enabled
    )
    if ($PSCmdlet.ShouldProcess($AccountName, "Set public blob access = $Enabled")) {
        armPatch "/subscriptions/$(subId)/resourceGroups/$ResourceGroup/providers/Microsoft.Storage/storageAccounts/$AccountName" '2023-01-01' @{
            properties = @{ allowBlobPublicAccess = $Enabled }
        }
        Write-Verbose "Storage account $AccountName public blob access set to $Enabled"
    }
}
Export-ModuleMember -Function Set-SVHStoragePublicAccess

function New-SVHResourceGroup {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Location,
        [hashtable]$Tags = @{}
    )
    if ($PSCmdlet.ShouldProcess($Name, "Create resource group in $Location")) {
        Invoke-SVHRest -Method PUT `
            -Uri "https://management.azure.com/subscriptions/$(subId)/resourcegroups/${Name}?api-version=2021-04-01" `
            -Headers @{ Authorization = "Bearer $(Get-ArmToken)" } `
            -Body @{ location = $Location; tags = $Tags }
    }
}
Export-ModuleMember -Function New-SVHResourceGroup

# ── ACT: Defender for Endpoint ────────────────────────────────────────────────

function Add-SVHMDEIndicator {
    <#
    .SYNOPSIS  Add a custom threat indicator (IOC) to Defender.
    .EXAMPLE   Add-SVHMDEIndicator -Value '8.8.8.8' -Type IpAddress -Action Block -Title 'Block test IP'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$Value,
        [Parameter(Mandatory)][ValidateSet('FileSha256','FileSha1','FileMd5','IpAddress','DomainName','Url')][string]$Type,
        [Parameter(Mandatory)][ValidateSet('Alert','AlertAndBlock','Block','Allowed')][string]$Action,
        [string]$Title       = '',
        [string]$Description = '',
        [ValidateSet('Informational','Low','Medium','High')][string]$Severity = 'Medium',
        [int]$ExpirationDays = 0
    )
    $body = @{ indicatorValue = $Value; indicatorType = $Type; action = $Action; title = $Title; description = $Description; severity = $Severity }
    if ($ExpirationDays -gt 0) { $body['expirationTime'] = (Get-Date).AddDays($ExpirationDays).ToUniversalTime().ToString('o') }
    if ($PSCmdlet.ShouldProcess("$Type $Value", "Add MDE indicator ($Action)")) {
        $r = mdePost '/indicators' $body
        Write-Verbose "IOC created: $Type $Value ($Action)"
        $r
    }
}
Export-ModuleMember -Function Add-SVHMDEIndicator

function Remove-SVHMDEIndicator {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$IndicatorId
    )
    process {
        if ($PSCmdlet.ShouldProcess($IndicatorId, 'Remove MDE indicator')) {
            mdeDel "/indicators/$IndicatorId"
            Write-Verbose "IOC $IndicatorId removed"
        }
    }
}
Export-ModuleMember -Function Remove-SVHMDEIndicator

function Invoke-SVHMDEIsolation {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)][Alias('id')][string]$MachineId,
        [ValidateSet('Selective','Full')][string]$IsolationType = 'Full',
        [string]$Comment = 'Isolated via SVH PowerShell'
    )
    process {
        if ($PSCmdlet.ShouldProcess($MachineId, "$IsolationType isolation")) {
            mdePost "/machines/$MachineId/isolate" @{ Comment = $Comment; IsolationType = $IsolationType }
            Write-Verbose "Isolation ($IsolationType) requested for $MachineId"
        }
    }
}
Export-ModuleMember -Function Invoke-SVHMDEIsolation

function Invoke-SVHMDEUnisolation {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)][Alias('id')][string]$MachineId,
        [string]$Comment = 'Released from isolation via SVH PowerShell'
    )
    process {
        if ($PSCmdlet.ShouldProcess($MachineId, 'Release from isolation')) {
            mdePost "/machines/$MachineId/unisolate" @{ Comment = $Comment }
            Write-Verbose "Machine $MachineId released from isolation"
        }
    }
}
Export-ModuleMember -Function Invoke-SVHMDEUnisolation

function Invoke-SVHMDEAVScan {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)][Alias('id')][string]$MachineId,
        [ValidateSet('Quick','Full')][string]$ScanType = 'Quick',
        [string]$Comment = 'Scan triggered via SVH PowerShell'
    )
    process {
        if ($PSCmdlet.ShouldProcess($MachineId, "$ScanType AV scan")) {
            mdePost "/machines/$MachineId/runAntiVirusScan" @{ Comment = $Comment; ScanType = $ScanType }
            Write-Verbose "$ScanType scan requested for $MachineId"
        }
    }
}
Export-ModuleMember -Function Invoke-SVHMDEAVScan
