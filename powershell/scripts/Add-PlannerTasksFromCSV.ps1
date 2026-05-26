<# 
CSV headers (exact):
Title,Bucket,DueDate,Checklist,Notes,AssigneeUPN,IsRecurring,Month,DayOfMonth,Labels
- Title: task title (required)
- Bucket: bucket name. Defaults to "To Do"
- DueDate: anything Get-Date can parse (local time). Optional
- Checklist: semicolon-separated items
- Notes: multi-line allowed if quoted
- AssigneeUPN: user@domain.com to assign. Optional
- IsRecurring: TRUE/FALSE. If TRUE, Month and DayOfMonth required
- Month,DayOfMonth: integers for annual recurrence
- Labels: semicolon-separated label NAMES as configured in the plan (e.g., "Security;Networking"). 
  You may also specify category keys directly like category1;category2.
#>

param(
  [Parameter(Mandatory)]
  [string]$PlanId,

  [Parameter(Mandatory)]
  [string]$CsvPath,

  [switch]$Idempotent # Skip creating a task if a task with same Title already exists in the same bucket
)

# --- Utilities ---------------------------------------------------------------

function Connect-GraphPlanner {
  if (-not (Get-Module Microsoft.Graph.Authentication -ListAvailable)) {
    Install-Module Microsoft.Graph -Scope CurrentUser -Force
    Import-Module Microsoft.Graph.Authentication
  }
  $scopes = "Group.ReadWrite.All","Planner.ReadWrite.All","User.Read.All"
  if (-not (Get-MgContext)) {
    Connect-MgGraph -Scopes $scopes
  }
}

function Get-Plan {
  param([string]$PlanId)
  Get-MgPlannerPlan -PlannerPlanId $PlanId
}

function Get-PlanBuckets {
  param([string]$PlanId)
  Get-MgPlannerPlanBucket -PlannerPlanId $PlanId
}

function Ensure-Bucket {
  param([string]$PlanId,[string]$BucketName)
  $b = Get-PlanBuckets -PlanId $PlanId | Where-Object Name -eq $BucketName | Select-Object -First 1
  if ($b) { return $b }
  New-MgPlannerBucket -Name $BucketName -PlanId $PlanId -OrderHint " !"
}

function Get-PlanLabelMap {
  param([string]$PlanId)
  # Map label NAME -> category key (category1..category25). Falls back gracefully if names are empty.
  $plan   = Get-Plan -PlanId $PlanId
  $detail = Get-MgPlannerPlanDetail -PlannerPlanId $plan.Id
  $map = @{}
  # categoryDescriptions is an open type bag in AdditionalProperties
  $desc = $detail.AdditionalProperties.categoryDescriptions
  if ($desc) {
    $desc.GetEnumerator() | ForEach-Object {
      $catKey = $_.Key        # e.g., category1
      $name   = ($_.Value | ForEach-Object { $_ })  # string or null
      if ($name) {
        $map[$name] = $catKey
      }
    }
  }
  # Also allow direct keys
  1..25 | ForEach-Object { $map["category$_"] = "category$_" }
  return $map
}

function New-TaskV1 {
  param(
    [string]$PlanId,[string]$BucketId,[string]$Title,[Nullable[datetime]]$DueUtc
  )
  $args = @{ PlanId=$PlanId; BucketId=$BucketId; Title=$Title }
  if ($DueUtc) { $args.DueDateTime = $DueUtc }
  New-MgPlannerTask @args
}

function New-TaskRecurring {
  param(
    [string]$PlanId,[string]$BucketId,[string]$Title,
    [datetime]$DueUtc,[int]$Month,[int]$DayOfMonth
  )
  # Use beta REST directly. No beta module required.
  $body = @{
    planId      = $PlanId
    bucketId    = $BucketId
    title       = $Title
    dueDateTime = $DueUtc.ToString("o")
    recurrence  = @{
      schedule = @{
        pattern = @{
          type       = "absoluteYearly"
          interval   = 1
          month      = $Month
          dayOfMonth = $DayOfMonth
        }
        patternStartDateTime = $DueUtc.ToString("o")
      }
    }
  } | ConvertTo-Json -Depth 10

  $r = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/beta/planner/tasks" `
        -ContentType "application/json" -Body $body
  return $r
}

function Set-TaskChecklist {
  param([string]$TaskId,[string[]]$Items)
  if (-not $Items -or $Items.Count -eq 0) { return }

  $detail = Get-MgPlannerTaskDetail -PlannerTaskId $TaskId
  $etag   = $detail.AdditionalProperties.'@odata.etag'

  $check = @{}
  foreach ($c in $Items) {
    if (-not [string]::IsNullOrWhiteSpace($c)) {
      $check[[guid]::NewGuid().Guid] = @{
        "@odata.type" = "#microsoft.graph.plannerChecklistItem"
        title         = $c.Trim()
        isChecked     = $false
      }
    }
  }
  Update-MgPlannerTaskDetail -PlannerTaskId $TaskId -IfMatch $etag -Checklist $check | Out-Null
}

function Set-TaskNotes {
  param([string]$TaskId,[string]$Notes)
  if ([string]::IsNullOrWhiteSpace($Notes)) { return }
  $d    = Get-MgPlannerTaskDetail -PlannerTaskId $TaskId
  $etag = $d.AdditionalProperties.'@odata.etag'
  Update-MgPlannerTaskDetail -PlannerTaskId $TaskId -IfMatch $etag -Description $Notes | Out-Null
}

function Set-TaskAssignee {
  param([string]$TaskId,[string]$UserPrincipalName)
  if ([string]::IsNullOrWhiteSpace($UserPrincipalName)) { return }

  $u = Get-MgUser -UserId $UserPrincipalName
  $t = Get-MgPlannerTask -PlannerTaskId $TaskId
  $etag = $t.AdditionalProperties.'@odata.etag'

  $assign = @{}
  if ($t.Assignments -and $t.Assignments.AdditionalProperties) {
    $t.Assignments.AdditionalProperties.GetEnumerator() | ForEach-Object {
      $assign[$_.Key] = $_.Value
    }
  }
  $assign[$u.Id] = @{
    '@odata.type' = '#microsoft.graph.plannerAssignment'
    orderHint     = ' !'
  }

  Update-MgPlannerTask -PlannerTaskId $TaskId -IfMatch $etag -Assignments $assign | Out-Null
}

function Set-TaskLabels {
  param([string]$TaskId,[string[]]$LabelNames,[hashtable]$LabelMap)
  if (-not $LabelNames -or $LabelNames.Count -eq 0) { return }

  # Build appliedCategories object: { categoryN = true, ... }
  $applied = @{}
  foreach ($n in $LabelNames) {
    $name = $n.Trim()
    if (-not $name) { continue }
    $key = $null
    if ($LabelMap.ContainsKey($name)) { $key = $LabelMap[$name] }
    elseif ($LabelMap.ContainsKey($name.ToLower())) { $key = $LabelMap[$name.ToLower()] }
    if (-not $key) { continue }
    $applied[$key] = $true
  }
  if ($applied.Count -eq 0) { return }

  # Patch task
  $t    = Get-MgPlannerTask -PlannerTaskId $TaskId
  $etag = $t.AdditionalProperties.'@odata.etag'
  Update-MgPlannerTask -PlannerTaskId $TaskId -IfMatch $etag -AppliedCategories $applied | Out-Null
}

function To-UtcOrNull {
  param([string]$MaybeDate)
  if ([string]::IsNullOrWhiteSpace($MaybeDate)) { return $null }
  $dt = Get-Date $MaybeDate -ErrorAction Stop
  return [DateTime]::SpecifyKind($dt, 'Local').ToUniversalTime()
}

# --- Main --------------------------------------------------------------------

$ErrorActionPreference = 'Stop'
$VerbosePreference = 'Continue'

Connect-GraphPlanner
$plan = Get-Plan -PlanId $PlanId | Select-Object Title,Id
if (-not $plan) { throw "Plan not found: $PlanId" }

$labelMap = Get-PlanLabelMap -PlanId $PlanId
$rows = Import-Csv $CsvPath
if (-not $rows -or $rows.Count -eq 0) { throw "CSV has no rows: $CsvPath" }

# Optional idempotency: prefetch tasks grouped by bucket to avoid duplicates
$existingByBucket = @{}
if ($Idempotent) {
  # planner/plan/{id}/tasks list is only in beta; use per-bucket in v1
  $buckets = Get-PlanBuckets -PlanId $PlanId
  foreach ($b in $buckets) {
    $existingByBucket[$b.Id] = (Get-MgPlannerBucketTask -PlannerBucketId $b.Id | Select-Object Title,Id)
  }
}

foreach ($r in $rows) {
  $title = $r.Title
  if ([string]::IsNullOrWhiteSpace($title)) { Write-Verbose "Skipping row with empty Title"; continue }

  $bucketName = if ($r.Bucket) { $r.Bucket } else { "To Do" }
  $bucket = Ensure-Bucket -PlanId $PlanId -BucketName $bucketName

  if ($Idempotent -and $existingByBucket.ContainsKey($bucket.Id)) {
    $dup = $existingByBucket[$bucket.Id] | Where-Object { $_.Title -eq $title } | Select-Object -First 1
    if ($dup) { Write-Verbose "Skip (exists): $title in bucket '$bucketName'"; continue }
  }

  $dueUtc = To-UtcOrNull -MaybeDate $r.DueDate

  $task = $null
  $isRecurring = $false
  if ($r.IsRecurring) {
    try { $isRecurring = [bool]::Parse($r.IsRecurring) } catch { $isRecurring = $false }
  }

  if ($isRecurring) {
    $month = [int]$r.Month
    $day   = [int]$r.DayOfMonth
    if ($month -lt 1 -or $month -gt 12 -or $day -lt 1 -or $day -gt 31) {
      throw "Recurring row needs valid Month (1-12) and DayOfMonth (1-31): '$title'"
    }
    if (-not $dueUtc) { $dueUtc = (Get-Date).ToUniversalTime() }
    $rTask = New-TaskRecurring -PlanId $PlanId -BucketId $bucket.Id -Title $title -DueUtc $dueUtc -Month $month -DayOfMonth $day
    $taskId = $rTask.id
  } else {
    $t = New-TaskV1 -PlanId $PlanId -BucketId $bucket.Id -Title $title -DueUtc $dueUtc
    $taskId = $t.Id
  }

  # Checklist
  $checkItems = @()
  if ($r.Checklist) {
    $checkItems = $r.Checklist -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  }
  Set-TaskChecklist -TaskId $taskId -Items $checkItems

  # Notes
  Set-TaskNotes -TaskId $taskId -Notes $r.Notes

  # Assignee
  Set-TaskAssignee -TaskId $taskId -UserPrincipalName $r.AssigneeUPN

  # Labels
  $labelNames = @()
  if ($r.Labels) { $labelNames = $r.Labels -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ } }
  Set-TaskLabels -TaskId $taskId -LabelNames $labelNames -LabelMap $labelMap

  Write-Host "Created: '$title' in '$bucketName'  (TaskId: $taskId)"
}

Write-Host "Done."
