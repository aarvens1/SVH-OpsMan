# SVH.PrinterLogic.psm1 — Vasion / PrinterLogic REST API
# Auth: Token <api_token> header

function script:plHeader {
    @{
        Authorization = "Token $($Global:SVHCreds['PRINTERLOGIC_API_TOKEN'])"
        Accept        = 'application/json'
    }
}

function script:plBase { $Global:SVHCreds['PRINTERLOGIC_URL'] }

function script:plGet($path, $params = @{}) {
    $uri = "$(plBase)$path"
    if ($params.Count -gt 0) {
        $qs  = ($params.GetEnumerator() | ForEach-Object { "$($_.Key)=$([uri]::EscapeDataString([string]$_.Value))" }) -join '&'
        $uri = "$uri?$qs"
    }
    Invoke-RestMethod -Method Get -Uri $uri -Headers (plHeader)
}

function script:plPost($path, $body) {
    Invoke-RestMethod -Method Post `
        -Uri "$(plBase)$path" `
        -Headers (plHeader) `
        -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

function script:plPut($path, $body) {
    Invoke-RestMethod -Method Put `
        -Uri "$(plBase)$path" `
        -Headers (plHeader) `
        -Body ($body | ConvertTo-Json -Depth 10) `
        -ContentType 'application/json'
}

# ── VERIFY ────────────────────────────────────────────────────────────────────

function Get-SVHPrinters {
    param(
        [string]$Search,
        [string]$FolderId,
        [int]$Limit  = 100,
        [int]$Offset = 0
    )
    $params = @{ limit = $Limit; offset = $Offset }
    if ($Search)   { $params['search']    = $Search }
    if ($FolderId) { $params['folder_id'] = $FolderId }
    (plGet '/api/v1/printers' $params)
}
Export-ModuleMember -Function Get-SVHPrinters

function Get-SVHPrinter {
    param([Parameter(Mandatory)][string]$PrinterId)
    $details     = plGet "/api/v1/printers/$PrinterId"
    $deployments = plGet "/api/v1/printers/$PrinterId/deployments"
    $details | Add-Member -NotePropertyName deployments -NotePropertyValue $deployments -PassThru
}
Export-ModuleMember -Function Get-SVHPrinter

function Get-SVHPrintDrivers {
    param(
        [string]$Search,
        [string]$OsFilter,
        [int]$Limit = 50
    )
    $params = @{ limit = $Limit }
    if ($Search)   { $params['search'] = $Search }
    if ($OsFilter) { $params['os']     = $OsFilter }
    plGet '/api/v1/drivers' $params
}
Export-ModuleMember -Function Get-SVHPrintDrivers

function Get-SVHPrinterDeploymentProfiles {
    param([int]$Limit = 50)
    plGet '/api/v1/profiles' @{ limit = $Limit }
}
Export-ModuleMember -Function Get-SVHPrinterDeploymentProfiles

function Get-SVHPrinterDeploymentStatus {
    param([Parameter(Mandatory)][string]$PrinterId)
    plGet "/api/v1/printers/$PrinterId/deployment-status"
}
Export-ModuleMember -Function Get-SVHPrinterDeploymentStatus

function Get-SVHPrinterLogicAudit {
    param(
        [string]$StartDate,
        [string]$EndDate,
        [string]$EventType,
        [string]$User,
        [int]$Limit = 100
    )
    $params = @{ limit = $Limit }
    if ($StartDate) { $params['start_date']  = $StartDate }
    if ($EndDate)   { $params['end_date']    = $EndDate }
    if ($EventType) { $params['event_type']  = $EventType }
    if ($User)      { $params['user']        = $User }
    plGet '/api/v1/audit-logs' $params
}
Export-ModuleMember -Function Get-SVHPrinterLogicAudit

function Get-SVHPrintQuota {
    param([Parameter(Mandatory)][string]$UserOrGroup)
    plGet "/api/v1/quotas/$([uri]::EscapeDataString($UserOrGroup))"
}
Export-ModuleMember -Function Get-SVHPrintQuota

function Get-SVHPrintUsage {
    param(
        [ValidateSet('by_user','by_printer','by_department')][string]$ReportType = 'by_user',
        [string]$StartDate,
        [string]$EndDate,
        [int]$Limit = 100
    )
    $params = @{ limit = $Limit; type = $ReportType }
    if ($StartDate) { $params['start_date'] = $StartDate }
    if ($EndDate)   { $params['end_date']   = $EndDate }
    plGet '/api/v1/reports/usage' $params
}
Export-ModuleMember -Function Get-SVHPrintUsage

# ── ACT ───────────────────────────────────────────────────────────────────────

function Deploy-SVHPrinter {
    <#
    .SYNOPSIS
        Push a printer installation to a user or computer endpoint.
    #>
    param(
        [Parameter(Mandatory)][string]$PrinterId,
        [string]$UserId,
        [string]$ComputerId
    )
    $body = @{ printer_id = $PrinterId }
    if ($UserId)     { $body['user_id']     = $UserId }
    if ($ComputerId) { $body['computer_id'] = $ComputerId }
    $result = plPost "/api/v1/printers/$PrinterId/deploy" $body
    Write-Host "[svh] Printer $PrinterId deploy requested" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Deploy-SVHPrinter

function Set-SVHPrintQuota {
    param(
        [Parameter(Mandatory)][string]$UserOrGroup,
        [Parameter(Mandatory)][int]$PageLimit,
        [string]$ResetPeriod = 'monthly'
    )
    $result = plPut "/api/v1/quotas/$([uri]::EscapeDataString($UserOrGroup))" @{
        page_limit   = $PageLimit
        reset_period = $ResetPeriod
    }
    Write-Host "[svh] Print quota for '$UserOrGroup' set to $PageLimit pages ($ResetPeriod)" -ForegroundColor Yellow
    $result
}
Export-ModuleMember -Function Set-SVHPrintQuota
