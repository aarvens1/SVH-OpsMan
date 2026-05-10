# SVH.PrinterLogic.psm1 — Vasion / PrinterLogic REST API
# Requires: SVH.Core
# Auth: Token <api_token> header

Set-StrictMode -Version Latest

function script:plHeaders {
    @{
        Authorization = "Token $(Get-SVHCredential 'PRINTERLOGIC_API_TOKEN')"
        Accept        = 'application/json'
    }
}

function script:plBase { Get-SVHCredential 'PRINTERLOGIC_URL' }

function script:plGet($path, $query = @{}) {
    Invoke-SVHRest -Uri "$(plBase)$path" -Headers (plHeaders) -Query $query
}

function script:plPost($path, $body) {
    Invoke-SVHRest -Method POST -Uri "$(plBase)$path" -Headers (plHeaders) -Body $body
}

function script:plPut($path, $body) {
    Invoke-SVHRest -Method PUT -Uri "$(plBase)$path" -Headers (plHeaders) -Body $body
}

# ── VERIFY ────────────────────────────────────────────────────────────────────

function Get-SVHPrinters {
    <#
    .SYNOPSIS  List printers managed by PrinterLogic.
    .EXAMPLE   Get-SVHPrinters -Search 'Main Office'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$Search,
        [string]$FolderId,
        [int]$Limit  = 100,
        [int]$Offset = 0
    )
    $query = @{ limit = $Limit; offset = $Offset }
    if ($Search)   { $query['search']    = $Search }
    if ($FolderId) { $query['folder_id'] = $FolderId }
    plGet '/api/v1/printers' $query
}
Export-ModuleMember -Function Get-SVHPrinters

function Get-SVHPrinter {
    <#
    .SYNOPSIS  Get details and deployments for a single printer.
    .EXAMPLE   Get-SVHPrinter -PrinterId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PrinterId
    )
    process {
        $details     = plGet "/api/v1/printers/$PrinterId"
        $deployments = plGet "/api/v1/printers/$PrinterId/deployments"
        $details | Add-Member -NotePropertyName deployments -NotePropertyValue $deployments -Force -PassThru
    }
}
Export-ModuleMember -Function Get-SVHPrinter

function Get-SVHPrintDrivers {
    <#
    .SYNOPSIS  List available print drivers.
    .EXAMPLE   Get-SVHPrintDrivers -OsFilter 'win10'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$Search,
        [string]$OsFilter,
        [int]$Limit = 50
    )
    $query = @{ limit = $Limit }
    if ($Search)   { $query['search'] = $Search }
    if ($OsFilter) { $query['os']     = $OsFilter }
    plGet '/api/v1/drivers' $query
}
Export-ModuleMember -Function Get-SVHPrintDrivers

function Get-SVHPrinterDeploymentProfiles {
    <#
    .SYNOPSIS  List deployment profiles used for printer push.
    .EXAMPLE   Get-SVHPrinterDeploymentProfiles
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Limit = 50)
    plGet '/api/v1/profiles' @{ limit = $Limit }
}
Export-ModuleMember -Function Get-SVHPrinterDeploymentProfiles

function Get-SVHPrinterDeploymentStatus {
    <#
    .SYNOPSIS  Get deployment status for a printer.
    .EXAMPLE   Get-SVHPrinterDeploymentStatus -PrinterId 'abc123'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PrinterId
    )
    process { plGet "/api/v1/printers/$PrinterId/deployment-status" }
}
Export-ModuleMember -Function Get-SVHPrinterDeploymentStatus

function Get-SVHPrinterLogicAudit {
    <#
    .SYNOPSIS  Query the PrinterLogic audit log.
    .EXAMPLE   Get-SVHPrinterLogicAudit -StartDate '2026-05-01' -EventType 'install'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [string]$StartDate,
        [string]$EndDate,
        [string]$EventType,
        [string]$User,
        [int]$Limit = 100
    )
    $query = @{ limit = $Limit }
    if ($StartDate) { $query['start_date'] = $StartDate }
    if ($EndDate)   { $query['end_date']   = $EndDate }
    if ($EventType) { $query['event_type'] = $EventType }
    if ($User)      { $query['user']       = $User }
    plGet '/api/v1/audit-logs' $query
}
Export-ModuleMember -Function Get-SVHPrinterLogicAudit

function Get-SVHPrintQuota {
    <#
    .SYNOPSIS  Get the print quota for a user or group.
    .EXAMPLE   Get-SVHPrintQuota -UserOrGroup 'jdoe@shoestringvalley.com'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [string]$UserOrGroup
    )
    process { plGet "/api/v1/quotas/$([uri]::EscapeDataString($UserOrGroup))" }
}
Export-ModuleMember -Function Get-SVHPrintQuota

function Get-SVHPrintUsage {
    <#
    .SYNOPSIS  Pull print usage reports — by user, printer, or department.
    .EXAMPLE   Get-SVHPrintUsage -ReportType by_user -StartDate '2026-05-01' -EndDate '2026-05-10'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [ValidateSet('by_user','by_printer','by_department')]
        [string]$ReportType = 'by_user',
        [string]$StartDate,
        [string]$EndDate,
        [int]$Limit = 100
    )
    $query = @{ limit = $Limit; type = $ReportType }
    if ($StartDate) { $query['start_date'] = $StartDate }
    if ($EndDate)   { $query['end_date']   = $EndDate }
    plGet '/api/v1/reports/usage' $query
}
Export-ModuleMember -Function Get-SVHPrintUsage

# ── ACT ───────────────────────────────────────────────────────────────────────

function Deploy-SVHPrinter {
    <#
    .SYNOPSIS  Push a printer installation to a user or computer.
    .EXAMPLE   Deploy-SVHPrinter -PrinterId 'abc123' -UserId 'jdoe@shoestringvalley.com'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$PrinterId,
        [string]$UserId,
        [string]$ComputerId
    )
    $target = if ($UserId) { $UserId } elseif ($ComputerId) { $ComputerId } else { $PrinterId }
    if ($PSCmdlet.ShouldProcess($target, "Deploy printer $PrinterId")) {
        $body = @{ printer_id = $PrinterId }
        if ($UserId)     { $body['user_id']     = $UserId }
        if ($ComputerId) { $body['computer_id'] = $ComputerId }
        $result = plPost "/api/v1/printers/$PrinterId/deploy" $body
        Write-Verbose "[PrinterLogic] Printer $PrinterId deploy requested for $target"
        $result
    }
}
Export-ModuleMember -Function Deploy-SVHPrinter

function Set-SVHPrintQuota {
    <#
    .SYNOPSIS  Set the print quota (page limit) for a user or group.
    .EXAMPLE   Set-SVHPrintQuota -UserOrGroup 'jdoe@shoestringvalley.com' -PageLimit 500
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserOrGroup,
        [Parameter(Mandatory)][int]$PageLimit,
        [string]$ResetPeriod = 'monthly'
    )
    if ($PSCmdlet.ShouldProcess($UserOrGroup, "Set print quota to $PageLimit pages ($ResetPeriod)")) {
        $result = plPut "/api/v1/quotas/$([uri]::EscapeDataString($UserOrGroup))" @{
            page_limit   = $PageLimit
            reset_period = $ResetPeriod
        }
        Write-Verbose "[PrinterLogic] Print quota for '$UserOrGroup' set to $PageLimit pages ($ResetPeriod)"
        $result
    }
}
Export-ModuleMember -Function Set-SVHPrintQuota
