'=============================================================================
' EUPHORIA (LE) — VBScript Addendum
' Append this block to the bottom of Euphoria.vbs in the VPX Script Editor.
'
' Covers:
'   - Ball trough management (VPX-native Trough object)
'   - Shooter / auto-plunger
'   - Slingshot events
'   - Drain trigger (replaces placeholder)
'   - Spinner tick (Glitter Drop)
'   - Proper Controller / FlexDMD wiring
'   - B2S / backglass sync
'   - OutLane / InLane ball-save logic
'   - Nudge handling
'=============================================================================

'=============================================================================
' SECTION A: FLEXDMD / CONTROLLER WIRING
' Replace DMD_* stubs in main script with real FlexDMD calls here.
' Requires FlexDMD COM object registered: FlexDMD.FlexDMD.1
'=============================================================================

Dim FDMD           ' FlexDMD instance
Dim FDMD_Ready     : FDMD_Ready = False

Sub InitFlexDMD()
    On Error Resume Next
    Set FDMD = CreateObject("FlexDMD.FlexDMD.1")
    If Err.Number <> 0 Then
        ' FlexDMD not installed — fall back to VPX debug text
        FDMD_Ready = False
        Debug.Print "FlexDMD not available — DMD output disabled."
        Err.Clear
        On Error GoTo 0
        Exit Sub
    End If
    On Error GoTo 0

    FDMD.GameName    = "Euphoria"
    FDMD.TableFile   = Table1.Filename
    FDMD.Width       = 128
    FDMD.Height      = 32
    FDMD.Run         = True
    FDMD_Ready       = True
End Sub

' Override the stub DMD_ShowMessage from main script:
Sub DMD_ShowMessage(Msg)
    If FDMD_Ready Then
        FDMD.Scenes.ResolveScene("").SetText Msg
    Else
        Debug.Print "[DMD] " & Msg
    End If
End Sub

Sub DMD_UpdateScore(CurrentScore)
    If FDMD_Ready Then
        FDMD.Scenes.ResolveScene("").SetText FormatScore(CurrentScore)
    End If
End Sub

Sub DMD_ShowMode(Line1, Line2)
    If FDMD_Ready Then
        FDMD.Scenes.ResolveScene("").SetText Line1 & " " & Line2
    End If
End Sub

'=============================================================================
' SECTION B: B2S BACKGLASS SYNC
' UpdateB2S is called on score, mode, and multiball changes.
'=============================================================================

Sub UpdateB2S()
    On Error Resume Next
    ' B2S Server uses Controller.B2SSetData to push named lamp states.
    ' Map game state to backglass lamp IDs (see Euphoria_Backglass.b2s for IDs).
    Controller.B2SSetData 1, IIf(EuphoriaWizardActive, 1, 0)   ' Wizard lamp
    Controller.B2SSetData 2, BallsLocked                         ' Lock count 0-3
    Controller.B2SSetData 3, IIf(ActiveMode > 0, 1, 0)          ' Mode active
    Controller.B2SSetData 4, Int(EuphoriaMeter / 10)            ' Meter 0-10
    Controller.B2SSetData 5, PlayfieldMultiplier - 1            ' PF mult 0-3
    On Error GoTo 0
End Sub

'=============================================================================
' SECTION C: TROUGH (VPX BallControl object)
'=============================================================================

Dim TroughCount   : TroughCount   = 5   ' Total balls in game
Dim BallsInTrough : BallsInTrough = 4   ' Start with 4 in trough, 1 launched

Sub InitTrough()
    BallsInTrough = TroughCount - 1    ' One ball already plunged
End Sub

' Called by VPX when ball enters drain trigger:
Sub Drain_Hit()
    PlaySound "drain_drop"
    BallsInTrough = BallsInTrough + 1

    If BallsOnPlayfield > 1 Then
        BallsOnPlayfield = BallsOnPlayfield - 1
        DMD_ShowMessage("KEEP GOING!")
        UpdateB2S()
        Exit Sub
    End If

    ' Last ball drained — end of ball sequence
    BallsOnPlayfield = 0
    EndOfBall()
End Sub

' Called by Euphoria.vbs when a new ball is needed:
Sub AddBallToTrough()
    If BallsInTrough > 0 Then
        BallsInTrough = BallsInTrough - 1
        Sol_Scoop1Eject.FirePulse 35   ' Repurpose scoop solenoid as VUK for demo
    End If
End Sub

' Plunger auto-launch (replaces Plunger.AutoPlunger call in main script):
Sub Plunger_AutoPlunger(Strength)
    Plunger.PullBack()
    Plunger.Fire()
End Sub

'=============================================================================
' SECTION D: SLINGSHOT EVENTS
'=============================================================================

Sub Sling_Left_Slingshot()
    PlaySound "sling_crack_L"
    AddScore 50 * PlayfieldMultiplier, ""
    BonusTotal = BonusTotal + 10
    FillEuphoriaMeter(0)   ' Slings don't fill meter
    Flash_Sling("L")
End Sub

Sub Sling_Right_Slingshot()
    PlaySound "sling_crack_R"
    AddScore 50 * PlayfieldMultiplier, ""
    BonusTotal = BonusTotal + 10
    Flash_Sling("R")
End Sub

Sub Flash_Sling(Side)
    Dim L : Set L = IIf(Side = "L", Bumper1Light, Bumper2Light)
    L.State = 1
    Wait 80
    L.State = 0
End Sub

'=============================================================================
' SECTION E: INLANE / OUTLANE + BALL SAVE
'=============================================================================

Dim BallSaveActive   : BallSaveActive   = False
Dim BallSaveSeconds  : BallSaveSeconds  = 8    ' 8s ball save on ball start
Dim TimerBallSave_Countdown : TimerBallSave_Countdown = 0

Sub TimerBallSave_Timer()
    If BallSaveSeconds > 0 Then
        BallSaveSeconds = BallSaveSeconds - 1
    Else
        BallSaveActive  = False
        TimerBallSave.Enabled = False
        DMD_ShowMessage("")
    End If
End Sub

' Call this at ball start (add to InitializeGame / ResetGameState):
Sub ActivateBallSave(Seconds)
    BallSaveActive         = True
    BallSaveSeconds        = Seconds
    TimerBallSave.Interval = 1000
    TimerBallSave.Enabled  = True
    DMD_ShowMessage("BALL SAVE " & Seconds & "s")
End Sub

Sub Trigger_LeftInlane_Hit()
    PlaySound "inlane_click"
    ' Activate right ramp diverter for 3 seconds (ball recycling combo)
    AddScore 200, "L.INLANE"
End Sub

Sub Trigger_RightInlane_Hit()
    PlaySound "inlane_click"
    AddScore 200, "R.INLANE"
End Sub

Sub Trigger_LeftOutlane_Hit()
    PlaySound "outlane_drain"
    If BallSaveActive Then
        ' Save the ball — kick it back up left orbit
        DMD_ShowMessage("BALL SAVED!")
        PlaySound "ball_saved_fanfare"
        Sol_LeftOutlaneSave.FirePulse 40
    End If
End Sub

Sub Trigger_RightOutlane_Hit()
    PlaySound "outlane_drain"
    If BallSaveActive Then
        DMD_ShowMessage("BALL SAVED!")
        PlaySound "ball_saved_fanfare"
        Sol_RightOutlaneSave.FirePulse 40
    End If
End Sub

'=============================================================================
' SECTION F: SPINNER EVENT WIRING
' The spinner's built-in event fires on each pass; wire it here.
'=============================================================================

Sub Spinner_GlitterDrop_Spin()
    Opto_GlitterSpinner_Spin()   ' Delegate to main script handler
End Sub

'=============================================================================
' SECTION G: GATE EVENT WIRING
'=============================================================================

Sub Gate_LeftOrbit_Hit()
    ' One-way gate closing sound
    PlaySound "gate_clack"
End Sub

Sub Gate_RightOrbit_Hit()
    PlaySound "gate_clack"
End Sub

'=============================================================================
' SECTION H: NUDGE HANDLING
'=============================================================================

Sub Table1_NudgeTilt(XY, Angle, Force)
    If Force > 400 Then
        DMD_ShowMessage("TILT WARNING")
        PlaySound "tilt_warning"
        Flash_PlayfieldAll(Color_Primary)
    End If
    If Force > 700 Then
        ' Hard tilt — end ball immediately
        PlaySound "tilt_bang"
        TimerMode.Enabled = False
        ActiveMode        = MODE_NONE
        DMD_ShowMessage("T I L T")
        Wait 1500
        EndOfBall()
    End If
End Sub

'=============================================================================
' SECTION I: ADDITIONAL SOUNDS (slings, drain, inlane, ball save)
' Add these to your VPX Sound Manager alongside the manifest sounds.
'=============================================================================
' sling_crack_L.wav    — left slingshot crack
' sling_crack_R.wav    — right slingshot crack
' inlane_click.wav     — ball rolling over inlane switch
' outlane_drain.wav    — ball entering outlane
' ball_saved_fanfare.wav — ball save activation
' drain_drop.wav       — ball dropping into trough
' gate_clack.wav       — one-way orbit gate closing
' tilt_warning.wav     — nudge tilt warning ding
' tilt_bang.wav        — hard tilt klaxon

'=============================================================================
' SECTION J: TABLE1_INIT OVERRIDE PATCH
' Re-runs init steps that require Addendum subs to be defined first.
' Call this at the very end of Table1_Init() in the main script.
'=============================================================================

Sub Addendum_LateInit()
    InitFlexDMD()
    InitTrough()
    ActivateBallSave(0)   ' Ball save off until game starts
    TimerBallSave.Interval = 1000
    UpdateB2S()
End Sub

'=============================================================================
' END OF ADDENDUM
'=============================================================================
