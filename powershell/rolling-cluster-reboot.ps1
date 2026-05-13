<#
.SYNOPSIS
    Rolling reboot of all nodes across one or more failover clusters.
    Designed to run as a background process on a management server -- confirmations
    use signal files so the script waits indefinitely and survives laptop disconnects.
    Use Connect-ClusterReboot.ps1 from your laptop to monitor and respond to prompts.

.PARAMETER ClusterNames
    One or more cluster names. If omitted, auto-discovers all clusters visible from
    the current machine.

.PARAMETER TimeoutSeconds
    How long to wait for each node to rejoin after reboot. Default: 600.

.PARAMETER WorkDir
    Working directory for transcript, prompt, and signal files.
    Default: C:\cluster-reboot
#>

[CmdletBinding()]
param(
    [string[]] $ClusterNames,
    [int]      $TimeoutSeconds = 600,
    [string]   $WorkDir = 'C:\cluster-reboot',
    [switch]   $Background     # pass when launching headless via Connect-ClusterReboot.ps1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -- Module check --------------------------------------------------------------
if (-not (Get-Module -ListAvailable -Name FailoverClusters)) {
    Write-Host "[FAIL] FailoverClusters module not found. Install RSAT-Clustering-PowerShell." -ForegroundColor Red
    return
}
Import-Module FailoverClusters -ErrorAction Stop

# -- Working directory + transcript --------------------------------------------
New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null
# Clear any stale signal/prompt from a previous run
Remove-Item "$WorkDir\prompt.txt", "$WorkDir\signal.txt" -Force -ErrorAction SilentlyContinue
'RUNNING' | Set-Content "$WorkDir\status.txt"
try { Stop-Transcript } catch {}
Start-Transcript -Path "$WorkDir\transcript.txt" -Append

# -- Formatting helpers --------------------------------------------------------

function Write-Banner { param([string]$t) Write-Host "`n$('-'*64)`n  $t`n$('-'*64)" -ForegroundColor Cyan }
function Write-Step   { param([string]$t) Write-Host "`n  >> $t" -ForegroundColor Yellow }
function Write-OK     { param([string]$t) Write-Host "     [OK]   $t" -ForegroundColor Green }
function Write-Warn   { param([string]$t) Write-Host "     [WARN] $t" -ForegroundColor DarkYellow }
function Write-Fail   { param([string]$t) Write-Host "     [FAIL] $t" -ForegroundColor Red }

# -- Confirmation --------------------------------------------------------------
# Interactive mode: plain Read-Host (run directly on the server).
# Background mode (-Background switch): file-based signaling so the script
# waits indefinitely and survives a laptop disconnect via Connect-ClusterReboot.ps1.

function Confirm-Proceed {
    param([string]$Prompt)

    if (-not $Background) {
        $r = Read-Host "`n  $Prompt  [y/N]"
        return ($r -match '^[Yy]')
    }

    $promptFile = "$WorkDir\prompt.txt"
    $signalFile = "$WorkDir\signal.txt"

    Remove-Item $signalFile -Force -ErrorAction SilentlyContinue
    $Prompt | Set-Content $promptFile
    'WAITING' | Set-Content "$WorkDir\status.txt"
    Write-Host "  [waiting for confirmation via monitor]  prompt: $Prompt" -ForegroundColor DarkGray

    while (-not (Test-Path $signalFile)) { Start-Sleep -Seconds 2 }

    $response = (Get-Content $signalFile -Raw).Trim()
    Remove-Item $signalFile, $promptFile -Force -ErrorAction SilentlyContinue
    'RUNNING' | Set-Content "$WorkDir\status.txt"
    Write-Host "  [response received: $response]" -ForegroundColor DarkGray
    return ($response -match '^[Yy]')
}

# Blocking acknowledgment (used after timeout/error)
function Wait-Acknowledge {
    param([string]$Message)

    if (-not $Background) {
        Read-Host "`n  $Message  [press Enter to continue]"
        return
    }

    $promptFile = "$WorkDir\prompt.txt"
    $signalFile = "$WorkDir\signal.txt"

    Remove-Item $signalFile -Force -ErrorAction SilentlyContinue
    $Message | Set-Content $promptFile
    'WAITING' | Set-Content "$WorkDir\status.txt"
    Write-Host "  [waiting for acknowledgment via monitor]" -ForegroundColor DarkGray

    while (-not (Test-Path $signalFile)) { Start-Sleep -Seconds 2 }

    Remove-Item $signalFile, $promptFile -Force -ErrorAction SilentlyContinue
    'RUNNING' | Set-Content "$WorkDir\status.txt"
}

# -- Host safety check ---------------------------------------------------------
# If this machine is a VM inside the cluster it must be a clustered (HA) role,
# otherwise it won't migrate during drain and the script dies mid-run.

$_hostName = $env:COMPUTERNAME
$_clusterVM = Get-ClusterGroup -ErrorAction SilentlyContinue |
              Where-Object { $_.GroupType -eq 'VirtualMachine' -and $_.Name -like "*$_hostName*" }

if (-not $_clusterVM) {
    $isVM = (Get-WmiObject -Class Win32_ComputerSystem).Model -match 'Virtual|VMware|HVM'
    if ($isVM) {
        Write-Warn "This machine ($_hostName) is a VM but NOT a clustered HA role."
        Write-Warn "It will NOT migrate during node drain -- script may die mid-run."
        Write-Host "         Fix: Failover Cluster Manager -> right-click VM -> Configure as Highly Available." -ForegroundColor Yellow
        if (-not (Confirm-Proceed "This host is not HA. Continue anyway?")) {
            'FAILED' | Set-Content "$WorkDir\status.txt"
            Stop-Transcript
            return
        }
    }
}

# -- Cluster health snapshot ---------------------------------------------------

function Show-ClusterHealth {
    param([string]$ClusterName)

    $nodes     = Get-ClusterNode     -Cluster $ClusterName
    $groups    = Get-ClusterGroup    -Cluster $ClusterName | Where-Object { $_.GroupType -ne 'Cluster' }
    $resources = Get-ClusterResource -Cluster $ClusterName

    $badNodes  = @($nodes     | Where-Object { $_.State -notin 'Up','Paused' })
    $badGroups = @($groups    | Where-Object { $_.State -eq 'Failed' })
    $badRes    = @($resources | Where-Object { $_.State -eq 'Failed' })

    Write-Host ""
    Write-Host "     Nodes:" -ForegroundColor White
    foreach ($n in $nodes | Sort-Object Name) {
        $color = switch ($n.State) { 'Up' { 'Green' } 'Paused' { 'Yellow' } default { 'Red' } }
        Write-Host "       $($n.Name.PadRight(20)) $($n.State)" -ForegroundColor $color
    }

    Write-Host "     Group distribution:" -ForegroundColor White
    $groups | Group-Object OwnerNode | Sort-Object Name | ForEach-Object {
        Write-Host "       $($_.Name.PadRight(20)) $($_.Count) group(s)" -ForegroundColor Gray
    }

    if ($badGroups.Count -gt 0) { Write-Fail "Failed groups:    $($badGroups.Name -join ', ')" }
    if ($badRes.Count    -gt 0) { Write-Fail "Failed resources: $($badRes.Name    -join ', ')" }

    $isHealthy = ($badNodes.Count -eq 0 -and $badGroups.Count -eq 0 -and $badRes.Count -eq 0)
    if ($isHealthy) { Write-OK "Cluster is fully healthy" }
    return $isHealthy
}

# -- Wait for a node to rejoin -------------------------------------------------

function Wait-NodeOnline {
    param([string]$NodeName, [string]$ClusterName)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    Write-Step "Waiting for $NodeName to respond to ping..."
    $pinged = $false
    while ((Get-Date) -lt $deadline) {
        if (Test-Connection -ComputerName $NodeName -Count 1 -Quiet -ErrorAction SilentlyContinue) {
            $pinged = $true
            Write-OK "$NodeName is responding to ping"
            break
        }
        Start-Sleep -Seconds 10
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
    Write-Host ""

    if (-not $pinged) {
        Write-Fail "Timed out waiting for ping from $NodeName"
        return $false
    }

    Write-Step "Waiting for $NodeName to rejoin the cluster..."
    while ((Get-Date) -lt $deadline) {
        try {
            $n = Get-ClusterNode -Cluster $ClusterName -Name $NodeName -ErrorAction Stop
            if ($n.State -in 'Up','Paused') {
                Write-OK "$NodeName rejoined with state: $($n.State)"
                return $true
            }
        } catch { <# cluster service not ready yet #> }
        Start-Sleep -Seconds 10
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
    Write-Host ""

    Write-Fail "Timed out waiting for $NodeName cluster state"
    return $false
}

# -- Per-node reboot procedure -------------------------------------------------

function Invoke-NodeReboot {
    param([string]$NodeName, [string]$ClusterName)

    Write-Banner "Node: $NodeName   |   Cluster: $ClusterName"

    # 1. Pre-drain health gate
    Write-Step "Pre-drain health check"
    $healthy = Show-ClusterHealth -ClusterName $ClusterName
    if (-not $healthy) {
        Write-Warn "Cluster is not fully healthy before drain."
        if (-not (Confirm-Proceed "Continue draining $NodeName despite cluster issues?")) {
            Write-Warn "Skipped $NodeName"
            return $false
        }
    }

    # 2. Confirm drain
    if (-not (Confirm-Proceed "Drain $NodeName now? (moves all cluster roles off this node)")) {
        Write-Warn "Skipped $NodeName"
        return $false
    }

    # 3. Drain
    Write-Step "Draining $NodeName..."
    try {
        Suspend-ClusterNode -Name $NodeName -Cluster $ClusterName -Drain -ForceDrain -Wait -ErrorAction Stop
        Write-OK "$NodeName drained -- all roles evacuated"
    } catch {
        Write-Fail "Drain failed: $_"
        if (-not (Confirm-Proceed "Drain failed. Reboot anyway (roles may not have moved cleanly)?")) {
            return $false
        }
    }

    # 4. Show where roles landed
    Write-Step "Post-drain distribution:"
    $null = Show-ClusterHealth -ClusterName $ClusterName

    # 5. Confirm reboot
    if (-not (Confirm-Proceed "Reboot $NodeName now?")) {
        Write-Warn "Resuming $NodeName without reboot."
        Resume-ClusterNode -Name $NodeName -Cluster $ClusterName -Failback 'Policy' -ErrorAction SilentlyContinue
        return $false
    }

    # 6. Reboot
    Write-Step "Rebooting $NodeName..."
    try {
        Restart-Computer -ComputerName $NodeName -Force -ErrorAction Stop
        Write-OK "Reboot command accepted -- waiting 30s before polling..."
    } catch {
        Write-Fail "Reboot command failed: $_"
        if (-not (Confirm-Proceed "Reboot command failed. Continue waiting as if it rebooted?")) {
            return $false
        }
    }
    Start-Sleep -Seconds 30

    # 7. Wait for rejoin
    $back = Wait-NodeOnline -NodeName $NodeName -ClusterName $ClusterName
    if (-not $back) {
        Write-Fail "$NodeName did not rejoin within ${TimeoutSeconds}s."
        Wait-Acknowledge "TIMEOUT: $NodeName did not rejoin. Investigate, then respond to continue."
    }

    # 8. Post-reboot health snapshot
    Write-Step "Post-reboot cluster health:"
    $null = Show-ClusterHealth -ClusterName $ClusterName

    # 9. Confirm resume
    if (-not (Confirm-Proceed "Resume $NodeName now? (returns it to active service)")) {
        Write-Warn "$NodeName left paused. Resume manually: Resume-ClusterNode -Name $NodeName -Cluster $ClusterName"
        return $true
    }

    # 10. Resume
    Write-Step "Resuming $NodeName..."
    try {
        Resume-ClusterNode -Name $NodeName -Cluster $ClusterName -Failback 'Policy' -ErrorAction Stop
        Write-OK "$NodeName is back in service"
    } catch {
        Write-Fail "Resume failed: $_"
        return $false
    }

    # 11. Final health check -- give cluster 15s to settle
    Start-Sleep -Seconds 15
    Write-Step "Final health check after resuming ${NodeName}:"
    $finalHealthy = Show-ClusterHealth -ClusterName $ClusterName
    if (-not $finalHealthy) {
        Write-Warn "Cluster has issues after resuming $NodeName."
        if (-not (Confirm-Proceed "Proceed to the next node anyway?")) {
            return $false
        }
    }

    return $true
}

# -- Main ----------------------------------------------------------------------

Write-Banner "Rolling Cluster Node Reboot"
Write-Host "  Started : $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor White
Write-Host "  Host    : $($env:USERDOMAIN)\$($env:USERNAME) on $($env:COMPUTERNAME)" -ForegroundColor White
Write-Host "  WorkDir : $WorkDir" -ForegroundColor White
Write-Host "  Timeout : ${TimeoutSeconds}s per node" -ForegroundColor White

# Discover clusters if not specified
if (-not $ClusterNames) {
    Write-Step "Auto-discovering clusters..."
    try {
        $ClusterNames = @(Get-Cluster -ErrorAction Stop | Select-Object -ExpandProperty Name)
        Write-OK "Found: $($ClusterNames -join ', ')"
    } catch {
        Write-Fail "Could not auto-discover clusters. Pass -ClusterNames explicitly."
        'FAILED' | Set-Content "$WorkDir\status.txt"
        Stop-Transcript
        return
    }
}

Write-Host "`n  Clusters to process: $($ClusterNames -join ', ')" -ForegroundColor White

# Initial health snapshot
foreach ($c in $ClusterNames) {
    Write-Banner "Initial health -- $c"
    $null = Show-ClusterHealth -ClusterName $c
}

if (-not (Confirm-Proceed "Everything looks good? Begin rolling reboot of ALL nodes across ALL clusters?")) {
    Write-Host "`n  Aborted." -ForegroundColor Yellow
    'DONE' | Set-Content "$WorkDir\status.txt"
    Stop-Transcript
    return
}

$allGood = $true

foreach ($clusterName in $ClusterNames) {
    Write-Banner "CLUSTER: $clusterName"

    try {
        $nodes = @(Get-ClusterNode -Cluster $clusterName | Sort-Object Name)
    } catch {
        Write-Fail "Cannot reach cluster '$clusterName': $_"
        $allGood = $false
        continue
    }

    Write-Host "`n  Nodes ($($nodes.Count)): $($nodes.Name -join '  |  ')" -ForegroundColor White
    Write-Host "  Nodes will be rebooted one at a time in alphabetical order." -ForegroundColor Gray

    if (-not (Confirm-Proceed "Start rebooting nodes in '$clusterName'?")) {
        Write-Warn "Skipping cluster '$clusterName'"
        continue
    }

    foreach ($node in $nodes) {
        $ok = Invoke-NodeReboot -NodeName $node.Name -ClusterName $clusterName
        if (-not $ok) { $allGood = $false }
    }

    Write-Banner "Cluster '$clusterName' complete"
    $null = Show-ClusterHealth -ClusterName $clusterName
}

Write-Banner "All done"
Write-Host "  Finished: $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor White
if ($allGood) {
    Write-OK "All nodes rebooted without errors."
} else {
    Write-Warn "One or more nodes had issues or were skipped -- review transcript."
}

Stop-Transcript
'DONE' | Set-Content "$WorkDir\status.txt"
