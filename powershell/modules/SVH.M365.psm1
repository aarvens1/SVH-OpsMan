# SVH.M365.psm1 — Teams, Outlook Mail/Calendar, Planner, To Do, OneDrive, SharePoint
# Requires: SVH.Core
# App registration owner: ma_stevens@shoestringvalley.com
# Required permissions: Mail.ReadWrite, Mail.Send, Calendars.ReadWrite,
#   Team.ReadBasic.All, ChannelMessage.Read.All, ChannelMessage.Send,
#   TeamMember.ReadWrite.All, Tasks.ReadWrite, Sites.Read.All,
#   Files.ReadWrite.All

Set-StrictMode -Version Latest

function script:Get-GraphToken {
    Get-SVHOAuth2Token -CacheKey 'Graph' `
        -TenantId     (Get-SVHCredential 'GRAPH_TENANT_ID') `
        -ClientId     (Get-SVHCredential 'GRAPH_CLIENT_ID') `
        -ClientSecret (Get-SVHCredential 'GRAPH_CLIENT_SECRET') `
        -Scope        'https://graph.microsoft.com/.default'
}

function script:gGet  { param($p, $q = @{}) Invoke-SVHRest -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Query $q }
function script:gPost { param($p, $b)       Invoke-SVHRest -Method POST   -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Body $b }
function script:gPatch{ param($p, $b)       Invoke-SVHRest -Method PATCH  -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } -Body $b }
function script:gDel  { param($p)           Invoke-SVHRest -Method DELETE -Uri "https://graph.microsoft.com/v1.0$p" -Headers @{ Authorization = "Bearer $(Get-GraphToken)" } }

# ── VERIFY: Teams ──────────────────────────────────────────────────────────────

function Get-SVHTeams {
    <#
    .SYNOPSIS  List all Teams in the tenant.
    .EXAMPLE   Get-SVHTeams | Where-Object visibility -eq 'Public'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([int]$Top = 100)
    (gGet '/groups' @{
        '$filter' = "resourceProvisioningOptions/Any(x:x eq 'Team')"
        '$select' = 'id,displayName,description,visibility,mail'
        '$top'    = $Top
    }).value
}
Export-ModuleMember -Function Get-SVHTeams

function Get-SVHTeamChannels {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$TeamId
    )
    process { (gGet "/teams/$TeamId/channels").value }
}
Export-ModuleMember -Function Get-SVHTeamChannels

function Get-SVHTeamMessages {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$ChannelId,
        [int]$Top = 20
    )
    (gGet "/teams/$TeamId/channels/$ChannelId/messages" @{ '$top' = $Top }).value
}
Export-ModuleMember -Function Get-SVHTeamMessages

# ── VERIFY: Outlook Mail ───────────────────────────────────────────────────────

function Search-SVHMail {
    <#
    .SYNOPSIS  Search a user's mailbox.
    .EXAMPLE   Search-SVHMail -UserPrincipalName jdoe@svh.com -Query 'from:vendor@acme.com'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$Query,
        [int]$Top = 25
    )
    (gGet "/users/$UserPrincipalName/messages" @{
        '$search' = "`"$Query`""
        '$top'    = $Top
        '$select' = 'id,subject,from,receivedDateTime,hasAttachments,importance,isRead'
    }).value
}
Export-ModuleMember -Function Search-SVHMail

function Get-SVHMailMessage {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$MessageId
    )
    gGet "/users/$UserPrincipalName/messages/$MessageId"
}
Export-ModuleMember -Function Get-SVHMailMessage

function Get-SVHMailFolders {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    (gGet "/users/$UserPrincipalName/mailFolders").value
}
Export-ModuleMember -Function Get-SVHMailFolders

function Get-SVHMailboxSettings {
    <#
    .SYNOPSIS  Get mailbox settings — OOO state, timezone, working hours.
    .EXAMPLE   Get-SVHMailboxSettings jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipeline, ValueFromPipelineByPropertyName)]
        [Alias('UPN')]
        [string]$UserPrincipalName
    )
    process { gGet "/users/$UserPrincipalName/mailboxSettings" }
}
Export-ModuleMember -Function Get-SVHMailboxSettings

# ── VERIFY: Outlook Calendar ───────────────────────────────────────────────────

function Get-SVHCalendarEvents {
    <#
    .SYNOPSIS  List calendar events for a user within a date range.
    .EXAMPLE   Get-SVHCalendarEvents -UserPrincipalName jdoe@svh.com -DaysAhead 7
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [int]$DaysAhead  = 7,
        [int]$DaysBehind = 0
    )
    $start = (Get-Date).AddDays(-$DaysBehind).ToString('o')
    $end   = (Get-Date).AddDays($DaysAhead).ToString('o')
    (gGet "/users/$UserPrincipalName/calendarView" @{
        startDateTime = $start
        endDateTime   = $end
        '$select'     = 'id,subject,start,end,organizer,attendees,location,isOnlineMeeting,onlineMeetingUrl,bodyPreview'
        '$top'        = 100
    }).value
}
Export-ModuleMember -Function Get-SVHCalendarEvents

function Get-SVHMeetingRooms {
    <#
    .SYNOPSIS  List available meeting rooms in the tenant.
    .EXAMPLE   Get-SVHMeetingRooms | Where-Object capacity -ge 10
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param()
    (gGet '/places/microsoft.graph.room').value
}
Export-ModuleMember -Function Get-SVHMeetingRooms

function Find-SVHMeetingTime {
    <#
    .SYNOPSIS  Find availability windows for a set of attendees.
    .EXAMPLE   Find-SVHMeetingTime -Attendees @('a@svh.com','b@svh.com') -DurationMinutes 60
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string[]]$Attendees,
        [int]$DurationMinutes = 30,
        [int]$DaysAhead       = 5,
        [string]$TimeZone     = 'Pacific Standard Time'
    )
    $start = (Get-Date).ToString('o')
    $end   = (Get-Date).AddDays($DaysAhead).ToString('o')
    gPost '/me/findMeetingTimes' @{
        attendees            = $Attendees | ForEach-Object { @{ emailAddress = @{ address = $_ }; type = 'required' } }
        timeConstraint       = @{
            activityDomain = 'work'
            timeSlots      = @(@{ start = @{ dateTime = $start; timeZone = $TimeZone }; end = @{ dateTime = $end; timeZone = $TimeZone } })
        }
        meetingDuration      = "PT${DurationMinutes}M"
        returnSuggestionReasons = $true
    }
}
Export-ModuleMember -Function Find-SVHMeetingTime

# ── VERIFY: SharePoint ─────────────────────────────────────────────────────────

function Get-SVHSharePointSites {
    <#
    .SYNOPSIS  Search for SharePoint sites by keyword.
    .EXAMPLE   Get-SVHSharePointSites -Search 'operations'
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([string]$Search = '*')
    (gGet '/sites' @{ search = $Search }).value
}
Export-ModuleMember -Function Get-SVHSharePointSites

function Get-SVHSharePointSiteLists {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$SiteId
    )
    process {
        (gGet "/sites/$SiteId/lists" @{
            '$select' = 'id,displayName,description,webUrl,list'
        }).value
    }
}
Export-ModuleMember -Function Get-SVHSharePointSiteLists

function Get-SVHSharePointListItems {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$SiteId,
        [Parameter(Mandatory)][string]$ListId,
        [string]$Filter,
        [int]$Top = 100
    )
    $params = @{ '$expand' = 'fields'; '$top' = $Top }
    if ($Filter) { $params['$filter'] = $Filter }
    (gGet "/sites/$SiteId/lists/$ListId/items" $params).value
}
Export-ModuleMember -Function Get-SVHSharePointListItems

# ── VERIFY: OneDrive ───────────────────────────────────────────────────────────

function Get-SVHOneDriveDrive {
    <#
    .SYNOPSIS  Get OneDrive quota and metadata for a user.
    .EXAMPLE   Get-SVHOneDriveDrive jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    gGet "/users/$UserPrincipalName/drive"
}
Export-ModuleMember -Function Get-SVHOneDriveDrive

function Get-SVHOneDriveItems {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [string]$FolderPath = 'root'
    )
    (gGet "/users/$UserPrincipalName/drive/$FolderPath/children").value
}
Export-ModuleMember -Function Get-SVHOneDriveItems

function Search-SVHOneDrive {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$Query
    )
    (gGet "/users/$UserPrincipalName/drive/root/search(q='$([uri]::EscapeDataString($Query))')").value
}
Export-ModuleMember -Function Search-SVHOneDrive

# ── VERIFY: Planner ────────────────────────────────────────────────────────────

function Get-SVHPlannerPlans {
    <#
    .SYNOPSIS  List Planner plans in an M365 group.
    .EXAMPLE   Get-SVHTeams | Where-Object displayName -eq 'IT' | Get-SVHPlannerPlans
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$GroupId
    )
    process { (gGet "/groups/$GroupId/planner/plans").value }
}
Export-ModuleMember -Function Get-SVHPlannerPlans

function Get-SVHPlannerTasks {
    <#
    .SYNOPSIS  List tasks in a Planner plan.
    .EXAMPLE   Get-SVHPlannerTasks -PlanId 'xxx' | Where-Object percentComplete -lt 100
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PlanId,
        [switch]$OpenOnly
    )
    process {
        $tasks = (gGet "/planner/plans/$PlanId/tasks").value
        if ($OpenOnly) { $tasks = $tasks | Where-Object { $_.percentComplete -lt 100 } }
        $tasks
    }
}
Export-ModuleMember -Function Get-SVHPlannerTasks

function Get-SVHPlannerTask {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$TaskId
    )
    process { gGet "/planner/tasks/$TaskId" }
}
Export-ModuleMember -Function Get-SVHPlannerTask

function Get-SVHPlannerBuckets {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$PlanId
    )
    process { (gGet "/planner/plans/$PlanId/buckets").value }
}
Export-ModuleMember -Function Get-SVHPlannerBuckets

# ── VERIFY: To Do ──────────────────────────────────────────────────────────────

function Get-SVHTodoLists {
    <#
    .SYNOPSIS  List Microsoft To Do task lists for a user.
    .EXAMPLE   Get-SVHTodoLists -UserPrincipalName jdoe@shoestringvalley.com
    #>
    [CmdletBinding()]
    [OutputType([PSObject])]
    param([Parameter(Mandatory)][string]$UserPrincipalName)
    (gGet "/users/$UserPrincipalName/todo/lists").value
}
Export-ModuleMember -Function Get-SVHTodoLists

function Get-SVHTodoTasks {
    [CmdletBinding()]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$ListId,
        [switch]$OpenOnly
    )
    $params = @{}
    if ($OpenOnly) { $params['$filter'] = "status ne 'completed'" }
    (gGet "/users/$UserPrincipalName/todo/lists/$ListId/tasks" $params).value
}
Export-ModuleMember -Function Get-SVHTodoTasks

# ── ACT: Teams ────────────────────────────────────────────────────────────────

function Send-SVHTeamsMessage {
    <#
    .SYNOPSIS  Send a message to a Teams channel.
    .NOTES     Managed by: ma_stevens@shoestringvalley.com
               Requires ChannelMessage.Send permission.
    .EXAMPLE   Send-SVHTeamsMessage -TeamId 'xxx' -ChannelId 'yyy' -Message 'Patch window starts at 6pm'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$ChannelId,
        [Parameter(Mandatory)][string]$Message,
        [ValidateSet('text','html')][string]$ContentType = 'text'
    )
    if ($PSCmdlet.ShouldProcess("channel $ChannelId", 'Send Teams message')) {
        gPost "/teams/$TeamId/channels/$ChannelId/messages" @{
            body = @{ contentType = $ContentType; content = $Message }
        }
    }
}
Export-ModuleMember -Function Send-SVHTeamsMessage

function New-SVHTeamsChannel {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$DisplayName,
        [string]$Description = ''
    )
    if ($PSCmdlet.ShouldProcess($DisplayName, "Create Teams channel in team $TeamId")) {
        gPost "/teams/$TeamId/channels" @{
            displayName    = $DisplayName
            description    = $Description
            membershipType = 'standard'
        }
    }
}
Export-ModuleMember -Function New-SVHTeamsChannel

function Add-SVHTeamMember {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$TeamId,
        [Parameter(Mandatory)][string]$UserObjectId,
        [ValidateSet('member','owner')][string]$Role = 'member'
    )
    if ($PSCmdlet.ShouldProcess($UserObjectId, "Add to team $TeamId as $Role")) {
        gPost "/teams/$TeamId/members" @{
            '@odata.type'     = '#microsoft.graph.aadUserConversationMember'
            'user@odata.bind' = "https://graph.microsoft.com/v1.0/users('$UserObjectId')"
            roles             = if ($Role -eq 'owner') { @('owner') } else { @() }
        }
        Write-Verbose "$UserObjectId added to team $TeamId as $Role"
    }
}
Export-ModuleMember -Function Add-SVHTeamMember

# ── ACT: Mail ─────────────────────────────────────────────────────────────────

function Send-SVHMail {
    <#
    .SYNOPSIS  Send email from a user's mailbox via Graph.
    .NOTES     Managed by: ma_stevens@shoestringvalley.com
    .EXAMPLE   Send-SVHMail -From jdoe@svh.com -To @('vendor@acme.com') -Subject 'Test' -Body 'Hello'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$From,
        [Parameter(Mandatory)][string[]]$To,
        [Parameter(Mandatory)][string]$Subject,
        [Parameter(Mandatory)][string]$Body,
        [ValidateSet('text','html')][string]$ContentType = 'text',
        [bool]$SaveToSentItems = $true
    )
    if ($PSCmdlet.ShouldProcess("$($To -join ', ')", "Send mail from $From")) {
        gPost "/users/$From/sendMail" @{
            message = @{
                subject      = $Subject
                body         = @{ contentType = $ContentType; content = $Body }
                toRecipients = $To | ForEach-Object { @{ emailAddress = @{ address = $_ } } }
            }
            saveToSentItems = $SaveToSentItems
        }
        Write-Verbose "Mail sent from $From to $($To -join ', ')"
    }
}
Export-ModuleMember -Function Send-SVHMail

function Set-SVHMailboxAutoReply {
    <#
    .SYNOPSIS  Configure or clear the automatic reply (OOO) for a mailbox.
    .EXAMPLE   Set-SVHMailboxAutoReply -UPN jdoe@svh.com -Status disabled
    .EXAMPLE   Set-SVHMailboxAutoReply -UPN jdoe@svh.com -Status scheduled `
                   -InternalMessage 'Back Monday' -ExternalMessage 'Out of office' `
                   -StartTime (Get-Date) -EndTime (Get-Date).AddDays(5)
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][ValidateSet('disabled','enabled','scheduled')][string]$Status,
        [string]$InternalMessage = '',
        [string]$ExternalMessage = '',
        [datetime]$StartTime,
        [datetime]$EndTime
    )
    $ooo = @{ status = $Status }
    if ($InternalMessage) { $ooo['internalReplyMessage'] = $InternalMessage }
    if ($ExternalMessage) { $ooo['externalReplyMessage'] = $ExternalMessage }
    if ($Status -eq 'scheduled' -and $StartTime -and $EndTime) {
        $ooo['scheduledStartDateTime'] = @{ dateTime = $StartTime.ToUniversalTime().ToString('o'); timeZone = 'UTC' }
        $ooo['scheduledEndDateTime']   = @{ dateTime = $EndTime.ToUniversalTime().ToString('o');   timeZone = 'UTC' }
    }
    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Set auto-reply to '$Status'")) {
        gPatch "/users/$UserPrincipalName/mailboxSettings" @{ automaticRepliesSetting = $ooo }
        Write-Verbose "Auto-reply set to '$Status' for $UserPrincipalName"
    }
}
Export-ModuleMember -Function Set-SVHMailboxAutoReply

# ── ACT: Calendar ─────────────────────────────────────────────────────────────

function New-SVHCalendarEvent {
    <#
    .SYNOPSIS  Create a calendar event for a user.
    .EXAMPLE   New-SVHCalendarEvent -UserPrincipalName jdoe@svh.com -Subject 'Patch window' `
                   -Start '2026-05-15T18:00' -End '2026-05-15T22:00' -TimeZone 'Pacific Standard Time'
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$Subject,
        [Parameter(Mandatory)][string]$Start,
        [Parameter(Mandatory)][string]$End,
        [string]$TimeZone      = 'Pacific Standard Time',
        [string[]]$Attendees   = @(),
        [string]$Location      = '',
        [string]$Body          = '',
        [switch]$IsTeamsMeeting
    )
    $event = @{
        subject = $Subject
        start   = @{ dateTime = $Start; timeZone = $TimeZone }
        end     = @{ dateTime = $End;   timeZone = $TimeZone }
    }
    if ($Location)  { $event['location']  = @{ displayName = $Location } }
    if ($Body)      { $event['body']      = @{ contentType = 'text'; content = $Body } }
    if ($Attendees) { $event['attendees'] = $Attendees | ForEach-Object { @{ emailAddress = @{ address = $_ }; type = 'required' } } }
    if ($IsTeamsMeeting) { $event['isOnlineMeeting'] = $true; $event['onlineMeetingProvider'] = 'teamsForBusiness' }

    if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Create calendar event '$Subject'")) {
        gPost "/users/$UserPrincipalName/events" $event
    }
}
Export-ModuleMember -Function New-SVHCalendarEvent

function Remove-SVHCalendarEvent {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$EventId
    )
    process {
        if ($PSCmdlet.ShouldProcess($EventId, "Delete calendar event")) {
            gDel "/users/$UserPrincipalName/events/$EventId"
            Write-Verbose "Calendar event $EventId deleted"
        }
    }
}
Export-ModuleMember -Function Remove-SVHCalendarEvent

# ── ACT: Planner ──────────────────────────────────────────────────────────────

function New-SVHPlannerTask {
    <#
    .SYNOPSIS  Create a Planner task.
    .NOTES     Tasks are never deleted in SVH — mark at 100% instead.
    .EXAMPLE   New-SVHPlannerTask -PlanId 'xxx' -Title 'Patch SVH-SQL01' -BucketId 'yyy' -AssignTo @('user-object-id')
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$PlanId,
        [Parameter(Mandatory)][string]$Title,
        [string]$BucketId,
        [string[]]$AssignTo    = @(),
        [datetime]$DueDateTime,
        [int]$PercentComplete  = 0
    )
    $task = @{
        planId          = $PlanId
        title           = $Title
        percentComplete = $PercentComplete
    }
    if ($BucketId)    { $task['bucketId'] = $BucketId }
    if ($DueDateTime) { $task['dueDateTime'] = $DueDateTime.ToUniversalTime().ToString('o') }
    if ($AssignTo)    { $task['assignments'] = @{} ; $AssignTo | ForEach-Object { $task['assignments'][$_] = @{ '@odata.type' = '#microsoft.graph.plannerAssignment'; orderHint = ' !' } } }

    if ($PSCmdlet.ShouldProcess($PlanId, "Create Planner task '$Title'")) {
        gPost '/planner/tasks' $task
    }
}
Export-ModuleMember -Function New-SVHPlannerTask

function Set-SVHPlannerTask {
    <#
    .SYNOPSIS  Update a Planner task — title, percent complete, due date.
    .NOTES     Always fetch the task first to get its @odata.etag — required by Planner API.
    .EXAMPLE   Get-SVHPlannerTask -TaskId 'xxx' | Set-SVHPlannerTask -PercentComplete 100
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory, ValueFromPipelineByPropertyName)]
        [Alias('id')]
        [string]$TaskId,
        [string]$Title,
        [int]$PercentComplete = -1,
        [datetime]$DueDateTime
    )
    process {
        $existing = gGet "/planner/tasks/$TaskId"
        $etag     = $existing.'@odata.etag'
        $update   = @{}
        if ($Title)                    { $update['title']           = $Title }
        if ($PercentComplete -ge 0)    { $update['percentComplete'] = $PercentComplete }
        if ($DueDateTime)              { $update['dueDateTime']     = $DueDateTime.ToUniversalTime().ToString('o') }

        if ($update.Count -eq 0) { Write-Warning 'No changes specified.'; return }

        if ($PSCmdlet.ShouldProcess($TaskId, 'Update Planner task')) {
            Invoke-SVHRest -Method PATCH `
                -Uri "https://graph.microsoft.com/v1.0/planner/tasks/$TaskId" `
                -Headers @{ Authorization = "Bearer $(Get-GraphToken)"; 'If-Match' = $etag } `
                -Body $update
            Write-Verbose "Task $TaskId updated"
        }
    }
}
Export-ModuleMember -Function Set-SVHPlannerTask

# ── ACT: To Do ────────────────────────────────────────────────────────────────

function New-SVHTodoTask {
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$ListId,
        [Parameter(Mandatory)][string]$Title,
        [string]$Body,
        [datetime]$DueDateTime,
        [ValidateSet('normal','high','low')][string]$Importance = 'normal'
    )
    $task = @{ title = $Title; importance = $Importance }
    if ($Body)        { $task['body'] = @{ content = $Body; contentType = 'text' } }
    if ($DueDateTime) { $task['dueDateTime'] = @{ dateTime = $DueDateTime.ToString('yyyy-MM-ddTHH:mm:ss.000'); timeZone = 'UTC' } }

    if ($PSCmdlet.ShouldProcess($ListId, "Create To Do task '$Title'")) {
        gPost "/users/$UserPrincipalName/todo/lists/$ListId/tasks" $task
    }
}
Export-ModuleMember -Function New-SVHTodoTask

# ── ACT: OneDrive ─────────────────────────────────────────────────────────────

function New-SVHOneDriveSharingLink {
    <#
    .SYNOPSIS  Create a sharing link for a file or folder.
    .EXAMPLE   New-SVHOneDriveSharingLink -UserPrincipalName jdoe@svh.com -ItemId 'xxx' -Type view -Scope organization
    #>
    [CmdletBinding(SupportsShouldProcess)]
    [OutputType([PSObject])]
    param(
        [Parameter(Mandatory)][string]$UserPrincipalName,
        [Parameter(Mandatory)][string]$ItemId,
        [ValidateSet('view','edit','embed')][string]$Type  = 'view',
        [ValidateSet('organization','anonymous')][string]$Scope = 'organization',
        [int]$ExpirationDays = 0
    )
    $body = @{ type = $Type; scope = $Scope }
    if ($ExpirationDays -gt 0) {
        $body['expirationDateTime'] = (Get-Date).AddDays($ExpirationDays).ToUniversalTime().ToString('o')
    }
    if ($PSCmdlet.ShouldProcess($ItemId, "Create $Scope $Type sharing link")) {
        gPost "/users/$UserPrincipalName/drive/items/$ItemId/createLink" $body
    }
}
Export-ModuleMember -Function New-SVHOneDriveSharingLink
