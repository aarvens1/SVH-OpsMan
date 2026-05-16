<#
.SYNOPSIS
    Launches rolling-cluster-reboot.ps1 on a remote management server as a persistent
    background process, then monitors output and handles confirmations from your laptop.

    If your laptop disconnects, the script keeps running on the server. Re-run this
    script to reconnect — it will tail from where it left off and wait at any pending prompt.

.PARAMETER Server
    IP or hostname of the Windows server that will run the reboot orchestration.
    Defaults to the AccoColo management host.

.PARAMETER ClusterNames
    One or more failover cluster names to reboot. Passed to rolling-cluster-reboot.ps1.

.PARAMETER WorkDir
    Working directory on the remote server for transcripts and status files.

.PARAMETER TimeoutSeconds
    How long to wait for each node reboot before treating it as a failure.

.PARAMETER Credential
    Credential for the sa_stevens (server tier) account. Prompted if not supplied.

.EXAMPLE
    .\Connect-ClusterReboot.ps1

.EXAMPLE
    .\Connect-ClusterReboot.ps1 -Server 172.18.201.145 -ClusterNames AccoColoHypCon, AccoColoHypVC

.NOTES
    Run from your laptop or WSL in a regular PowerShell window (no elevation needed).
#>
[CmdletBinding()]
param(
    [string]  $Server         = '172.18.201.145',
    [string[]]$ClusterNames   = @('AccoColoHypCon', 'AccoColoHypVC'),
    [string]  $WorkDir        = 'C:\cluster-reboot',
    [int]     $TimeoutSeconds = 600,
    [System.Management.Automation.PSCredential]$Credential
)

# Path to rolling-cluster-reboot.ps1 beside this script (copied to server at runtime)
$LocalScript = Join-Path $PSScriptRoot 'rolling-cluster-reboot.ps1'

# -- HELPERS -------------------------------------------------------------------

function Write-Info   { param([string]$t) Write-Host $t -ForegroundColor Cyan }
function Write-Prompt { param([string]$t) Write-Host "`n  [PROMPT] $t" -ForegroundColor Yellow }
function Write-Conn   { param([string]$t) Write-Host $t -ForegroundColor DarkGray }

# -- CREDENTIALS ---------------------------------------------------------------
# Prompt once for sa_stevens — reused for every PSSession including reconnects.

if (-not $Credential) {
    $Credential = Get-Credential -UserName 'sa_stevens' -Message "Enter credentials for $Server"
}
if (-not $Credential) { Write-Host "No credentials provided. Exiting." -ForegroundColor Red; exit 1 }

# -- SESSION -------------------------------------------------------------------

function Connect-ToServer {
    Write-Conn "Connecting to $Server as $($Credential.UserName)..."
    try {
        $s = New-PSSession -ComputerName $Server -Credential $Credential -ErrorAction Stop
        Write-Conn "Connected."
        return $s
    } catch {
        Write-Host "  [FAIL] Cannot reach $Server : $_" -ForegroundColor Red
        return $null
    }
}

$session = Connect-ToServer
if (-not $session) { exit 1 }

# -- SETUP WORKDIR ON SERVER ---------------------------------------------------

Invoke-Command -Session $session -ScriptBlock {
    param($dir)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
} -ArgumentList $WorkDir

# -- COPY SCRIPT TO SERVER -----------------------------------------------------

Write-Info "Copying rolling-cluster-reboot.ps1 to $Server`:$WorkDir..."
Copy-Item -Path $LocalScript -Destination "$WorkDir\rolling-cluster-reboot.ps1" -ToSession $session -Force
Write-Info "Done."

# -- CHECK IF ALREADY RUNNING --------------------------------------------------

$alreadyRunning = Invoke-Command -Session $session -ScriptBlock {
    param($dir)
    $pidFile = "$dir\pid.txt"
    if (-not (Test-Path $pidFile)) { return $false }
    $savedPid = [int](Get-Content $pidFile -Raw).Trim()
    $proc = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
    return ($null -ne $proc -and $proc.ProcessName -eq 'powershell')
} -ArgumentList $WorkDir

# -- LAUNCH ON SERVER (if not already running) ---------------------------------

if ($alreadyRunning) {
    Write-Info "Script is already running on $Server. Reconnecting to live session..."
} else {
    Write-Info "Launching rolling-cluster-reboot.ps1 on $Server as background process..."

    Invoke-Command -Session $session -ScriptBlock {
        param($dir, $clusters, $timeout)

        # Clear stale files from any previous run (but not transcript -- keep history)
        Remove-Item "$dir\prompt.txt", "$dir\signal.txt" -Force -ErrorAction SilentlyContinue

        $scriptPath = "$dir\rolling-cluster-reboot.ps1"

        $launchArgs = @(
            '-ExecutionPolicy', 'Bypass',
            '-NonInteractive',
            '-File', "`"$scriptPath`"",
            '-WorkDir', "`"$dir`"",
            '-TimeoutSeconds', $timeout,
            '-Background',
            '-ClusterNames'
        ) + $clusters

        $proc = Start-Process powershell.exe `
            -ArgumentList $launchArgs `
            -PassThru `
            -WindowStyle Hidden

        $proc.Id | Set-Content "$dir\pid.txt"
        Write-Host "Launched as PID $($proc.Id)"

    } -ArgumentList $WorkDir, $ClusterNames, $TimeoutSeconds

    Write-Info "Script started. Monitoring output..."
    Start-Sleep -Seconds 3
}

# -- MONITOR LOOP --------------------------------------------------------------
# On reconnect, shows the last 40 lines of transcript so you know where things stand,
# then streams live from that point forward.

$lastLineCount = 0

if ($alreadyRunning) {
    # Show tail of existing transcript so you have context on reconnect
    $tail = Invoke-Command -Session $session -ScriptBlock {
        param($dir)
        $f = "$dir\transcript.txt"
        if (Test-Path $f) {
            $lines = @(Get-Content $f)
            [PSCustomObject]@{ Lines = ($lines | Select-Object -Last 40); Total = $lines.Count }
        } else {
            [PSCustomObject]@{ Lines = @(); Total = 0 }
        }
    } -ArgumentList $WorkDir

    if ($tail.Lines) {
        Write-Host "`n$('-'*64)" -ForegroundColor DarkGray
        Write-Host "  Last 40 lines of transcript (reconnect context):" -ForegroundColor DarkGray
        Write-Host "$('-'*64)" -ForegroundColor DarkGray
        $tail.Lines | ForEach-Object { Write-Host $_ }
        Write-Host "$('-'*64)" -ForegroundColor DarkGray
        Write-Host "  Live output follows..." -ForegroundColor DarkGray
        Write-Host "$('-'*64)`n" -ForegroundColor DarkGray
    }
    $lastLineCount = $tail.Total
}

Write-Conn "(Ctrl+C to detach -- script will keep running on server)"

while ($true) {

    # Reconnect if session dropped
    if (-not $session -or $session.State -ne 'Opened') {
        Write-Conn "`nConnection lost. Reconnecting in 10s..."
        Start-Sleep -Seconds 10
        $session = Connect-ToServer
        if (-not $session) { continue }
    }

    try {
        # Poll transcript + prompt + status in one round-trip
        $poll = Invoke-Command -Session $session -ScriptBlock {
            param($dir, $skip)
            $transcriptFile = "$dir\transcript.txt"
            $promptFile     = "$dir\prompt.txt"
            $statusFile     = "$dir\status.txt"

            $allLines = if (Test-Path $transcriptFile) { @(Get-Content $transcriptFile) } else { @() }
            [PSCustomObject]@{
                NewLines = $allLines | Select-Object -Skip $skip
                Total    = $allLines.Count
                Prompt   = if (Test-Path $promptFile) { (Get-Content $promptFile -Raw).Trim() } else { $null }
                Status   = if (Test-Path $statusFile) { (Get-Content $statusFile -Raw).Trim() } else { 'UNKNOWN' }
            }
        } -ArgumentList $WorkDir, $lastLineCount

        # Stream any new transcript lines
        if ($poll.NewLines) {
            $poll.NewLines | ForEach-Object { Write-Host $_ }
            $lastLineCount = $poll.Total
        }

        # Handle a pending confirmation prompt
        if ($poll.Prompt) {
            Write-Prompt "$($poll.Prompt)  [y/N]"
            $response = Read-Host "  Your response"

            Invoke-Command -Session $session -ScriptBlock {
                param($dir, $r)
                $r | Set-Content "$dir\signal.txt"
            } -ArgumentList $WorkDir, $response
        }

        # Exit monitor when script finishes
        if ($poll.Status -in 'DONE', 'FAILED') {
            Write-Info "`nScript completed with status: $($poll.Status)"
            Write-Conn "Full transcript: \\$Server\c$\cluster-reboot\transcript.txt"
            break
        }

    } catch {
        Write-Conn "Poll error: $_  -- retrying..."
        $session = $null
    }

    Start-Sleep -Seconds 3
}

Remove-PSSession $session -ErrorAction SilentlyContinue
