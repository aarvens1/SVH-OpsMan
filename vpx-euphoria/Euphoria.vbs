'=============================================================================
' EUPHORIA (LE) - Visual Pinball X Table Script
' Theme: Euphoria (HBO/A24) | Engine: Stern Spike 2 Style
' Requires: FlexDMD or UltraDMD, PuP-Pack (optional), VPX 10.7+
'=============================================================================

Option Explicit

'=============================================================================
' SECTION 1: GLOBAL STATE VARIABLES
'=============================================================================

' --- Ball & Game State ---
Dim BallsLocked         : BallsLocked    = 0    ' Ferris Wheel lock count (0-3)
Dim BallInPlay          : BallInPlay     = 0    ' Current ball number
Dim BallsOnPlayfield    : BallsOnPlayfield = 0  ' Active balls during multiball
Dim GameInProgress      : GameInProgress = False

' --- Scoring ---
Dim Score               : Score          = 0
Dim PlayfieldMultiplier : PlayfieldMultiplier = 1   ' 1x-4x
Dim BonusMultiplier     : BonusMultiplier     = 1
Dim BonusTotal          : BonusTotal          = 0

' --- Mode State ---
Dim ActiveMode          : ActiveMode     = 0    ' 0 = no mode, see MODE_* constants
Dim ModeTimer           : ModeTimer      = 0    ' Seconds remaining in current mode
Dim ModeJackpot         : ModeJackpot    = 0

' --- Euphoria Meter ---
Dim EuphoriaMeter       : EuphoriaMeter  = 0    ' 0-100; fills toward wizard mode
Dim EuphoriaWizardActive : EuphoriaWizardActive = False

' --- Spiral Sub-Playfield ---
Dim SpiralLoopCount     : SpiralLoopCount = 0   ' Consecutive loops since entry
Dim SpiralActive        : SpiralActive    = False

' --- MADDY Bank ---
Dim MaddyLettersLit     : MaddyLettersLit = 0   ' Bitmask: M=1,A=2,D=4,D=8,Y=16

' --- Combo / Multiplier ---
Dim ComboCount          : ComboCount     = 0
Dim LastShotTime        : LastShotTime   = 0    ' For combo window timing

' --- Lighting state (bitmask per zone) ---
Dim LightState          : LightState     = 0

'=============================================================================
' SECTION 2: CONSTANTS
'=============================================================================

' Mode IDs
Const MODE_NONE             = 0
Const MODE_CASSIE_MELTDOWN  = 1   ' Maddy vs Cassie hurry-up
Const MODE_JACOBS_PARTY     = 2   ' Spinner frenzy
Const MODE_FEZCO_ORBIT      = 3   ' Orbit loop challenge
Const MODE_ALLFORUSMODE     = 4   ' Pre-wizard buildup
Const MODE_CARNIVAL_MB      = 5   ' Ferris Wheel multiball (3-ball)
Const MODE_EUPHORIA_WIZARD  = 99  ' Wizard mode: All For Us

' Score values (base, before multipliers)
Const PTS_BUMPER            = 1000
Const PTS_SPINNER_PER_SPIN  = 500
Const PTS_RAMP_STAGE        = 5000
Const PTS_RAMP_FERRIS       = 4000
Const PTS_ORBIT_LEFT        = 3000
Const PTS_ORBIT_RIGHT       = 3000
Const PTS_SPIRAL_LOOP       = 2500
Const PTS_SPIRAL_LOOP_BONUS = 5000   ' Per loop after 3rd consecutive
Const PTS_SCOOP             = 7500
Const PTS_DROP_MADDY        = 1500   ' Per target in TargetBank1
Const PTS_JACKPOT_BASE      = 250000
Const PTS_SUPERJAKPOT        = 750000

' Timing (milliseconds unless noted)
Const COMBO_WINDOW_MS       = 5000   ' Window to extend combo chain
Const MODE_DURATION_SEC     = 45     ' Default mode countdown (seconds)
Const HURRYUP_DURATION_SEC  = 20
Const SPIRAL_EXIT_DELAY_MS  = 800   ' Wireform travel time to right inlane

' Euphoria Meter thresholds
Const METER_PER_BUMPER      = 1
Const METER_PER_LOOP        = 3
Const METER_PER_RAMP        = 5
Const METER_PER_MODE_START  = 10
Const METER_WIZARD_THRESHOLD = 100

' Ball-lock identifiers
Const LOCK_SLOT_1 = 1
Const LOCK_SLOT_2 = 2
Const LOCK_SLOT_3 = 3

'=============================================================================
' SECTION 3: TABLE INIT & GAME CYCLE
'=============================================================================

Sub Table1_Init()
    ' Wire up timer intervals
    TimerMode.Interval    = 1000  ' 1-second tick for mode countdown
    TimerCombo.Interval   = COMBO_WINDOW_MS
    TimerBathroomDoor.Interval = 500
    TimerFerrisRotate.Interval = 150  ' Wheel animation tick

    ' Reset all logical state
    ResetGameState()

    ' DMD / PuP attract loop
    DMD_ShowAttract()

    ' Ensure Bathroom Door is raised (blocking Scoop1)
    BathroomDoor_Raise()
End Sub

Sub Table1_KeyDown(ByVal KeyCode)
    If KeyCode = StartGameKey Then
        If Not GameInProgress Then StartGame()
    End If
    If KeyCode = LeftFlipperKey  Then Flipper_LeftMain.RotateToEnd()
    If KeyCode = RightFlipperKey Then Flipper_RightMain.RotateToEnd()
    If KeyCode = LeftFlipperKey  Then Flipper_UpperLeft.RotateToEnd()   ' Upper mini
    If KeyCode = LeftFlipperKey  Then Flipper_UpperRight.RotateToEnd()  ' Upper mini
End Sub

Sub Table1_KeyUp(ByVal KeyCode)
    If KeyCode = LeftFlipperKey  Then Flipper_LeftMain.RotateToStart()
    If KeyCode = RightFlipperKey Then Flipper_RightMain.RotateToStart()
    If KeyCode = LeftFlipperKey  Then Flipper_UpperLeft.RotateToStart()
    If KeyCode = LeftFlipperKey  Then Flipper_UpperRight.RotateToStart()
End Sub

Sub StartGame()
    GameInProgress  = True
    BallInPlay      = 1
    Score           = 0
    ResetGameState()
    DMD_ShowBallStart(BallInPlay)
    PlaySound "game_start_fanfare"
    Plunger.AutoPlunger(500)
End Sub

Sub ResetGameState()
    BallsLocked          = 0
    EuphoriaMeter        = 0
    ActiveMode           = MODE_NONE
    ModeTimer            = 0
    PlayfieldMultiplier  = 1
    BonusMultiplier      = 1
    BonusTotal           = 0
    SpiralLoopCount      = 0
    SpiralActive         = False
    MaddyLettersLit      = 0
    ComboCount           = 0
    EuphoriaWizardActive = False
    BallsOnPlayfield     = 1
    DMD_UpdateMeter(EuphoriaMeter)
End Sub

'=============================================================================
' SECTION 4: DRAIN / BALL MANAGEMENT
'=============================================================================

Sub Drain_Hit()
    If BallsOnPlayfield > 1 Then
        BallsOnPlayfield = BallsOnPlayfield - 1
        ' Multiball still active — do not end ball
        DMD_ShowMessage("KEEP GOING!")
        Exit Sub
    End If

    ' Single-ball drain — end-of-ball sequence
    EndOfBall()
End Sub

Sub EndOfBall()
    TimerMode.Enabled = False
    ActiveMode        = MODE_NONE

    ' Commit bonus
    Dim FinalBonus : FinalBonus = BonusTotal * BonusMultiplier
    Score = Score + FinalBonus
    DMD_ShowBonus(BonusTotal, BonusMultiplier, FinalBonus)
    PlaySound "bonus_count_music"

    If BallInPlay < 3 Then
        BallInPlay = BallInPlay + 1
        Wait 3000
        ResetGameState()
        DMD_ShowBallStart(BallInPlay)
        Plunger.AutoPlunger(500)
    Else
        GameOver()
    End If
End Sub

Sub GameOver()
    GameInProgress = False
    DMD_ShowGameOver(Score)
    PlaySound "game_over_sting"
    Wait 4000
    DMD_ShowAttract()
End Sub

'=============================================================================
' SECTION 5: RAMPS
'=============================================================================

' --- Ramp 1: The Stage (Center) ---
Sub TriggerEnter_StageRamp(sender)
    PlaySound "ramp_whoosh_01"
End Sub

Sub TriggerExit_StageRamp(sender)
    AddScore PTS_RAMP_STAGE, "STAGE RAMP"
    FillEuphoriaMeter(METER_PER_RAMP)
    IncrementCombo()

    ' Diverter logic: if Scoop1 is ready to collect a mode-start, route ball there
    If Diverter_Stage.IsActive Then
        ' Ball travels to Scoop1
        DMD_ShowMessage("DIRECTOR'S CUT!")
        Scoop1_VirtualFeed()
    Else
        ' Ball loops back to left inlane
        LeftInlane_VirtualFeed()
    End If
End Sub

' --- Ramp 2: Ferris Wheel (Right) ---
Sub TriggerEnter_FerrisRamp(sender)
    PlaySound "ramp_whoosh_02"
End Sub

Sub TriggerExit_FerrisRamp(sender)
    AddScore PTS_RAMP_FERRIS, "FERRIS RAMP"
    FillEuphoriaMeter(METER_PER_RAMP)
    ' Ball enters Ferris Wheel lock mechanism
    FerrisWheel_BallArrived()
End Sub

'=============================================================================
' SECTION 6: ORBITS & SPIRAL SUB-PLAYFIELD
'=============================================================================

' --- Left Orbit (feeds Spiral entry or standard loop) ---
Sub TriggerEnter_LeftOrbit(sender)
    PlaySound "orbit_whoosh_left"
End Sub

Sub TriggerExit_LeftOrbit(sender)
    AddScore PTS_ORBIT_LEFT, "LEFT ORBIT"
    FillEuphoriaMeter(METER_PER_LOOP)
    IncrementCombo()
    ' Ball climbs habitrail into The Spiral sub-playfield
    EnterSpiral()
End Sub

' --- Right Orbit ---
Sub TriggerEnter_RightOrbit(sender)
    PlaySound "orbit_whoosh_right"
End Sub

Sub TriggerExit_RightOrbit(sender)
    AddScore PTS_ORBIT_RIGHT, "RIGHT ORBIT"
    IncrementCombo()
End Sub

' --- The Spiral Sub-Playfield Logic ---
Sub EnterSpiral()
    SpiralActive    = True
    SpiralLoopCount = 0
    DMD_ShowMessage("THE SPIRAL!")
    PlaySound "spiral_entry_jingle"
    Flipper_UpperLeft.Enabled  = True
    Flipper_UpperRight.Enabled = True
End Sub

Sub ExitSpiral()
    ' Wireform delivers ball to right lower inlane after SPIRAL_EXIT_DELAY_MS
    SpiralActive = False
    Flipper_UpperLeft.Enabled  = False
    Flipper_UpperRight.Enabled = False
    Wait SPIRAL_EXIT_DELAY_MS
    RightInlane_VirtualFeed()
    DMD_ShowMessage("LOOP TOTAL: " & SpiralLoopCount)
End Sub

' Opto inside The Spiral tight loop — called on each pass
Sub Opto_SpiralLoop_Hit()
    SpiralLoopCount = SpiralLoopCount + 1
    FillEuphoriaMeter(METER_PER_LOOP)

    Dim LoopPts : LoopPts = PTS_SPIRAL_LOOP
    If SpiralLoopCount > 3 Then LoopPts = PTS_SPIRAL_LOOP_BONUS

    AddScore LoopPts, "SPIRAL LOOP x" & SpiralLoopCount
    PlaySound "spiral_loop_sfx"
    Flash_SpiralZone(SpiralLoopCount)
End Sub

'=============================================================================
' SECTION 7: FERRIS WHEEL TOY (3-BALL LOCK → CARNIVAL MULTIBALL)
'=============================================================================

' Called when ball arrives from Ferris Ramp
Sub FerrisWheel_BallArrived()
    BallsLocked = BallsLocked + 1
    PlaySound "ball_lock_clunk"
    FerrisWheel_Rotate(BallsLocked)     ' Animate wheel advancing one position

    Select Case BallsLocked
        Case LOCK_SLOT_1
            DMD_ShowMessage("LOCK 1 - FERRIS LOCK")
            PlaySound "crowd_cheer_short"
        Case LOCK_SLOT_2
            DMD_ShowMessage("LOCK 2 - ALMOST THERE")
            PlaySound "crowd_cheer_medium"
        Case LOCK_SLOT_3
            DMD_ShowMessage("LOCK 3 - CARNIVAL MULTIBALL!")
            Wait 1200
            TriggerCarnivalMultiball()
    End Select

    ' If not yet 3 locks: release a new ball from trough
    If BallsLocked < LOCK_SLOT_3 Then
        AddBallToTrough()
    End If
End Sub

Sub FerrisWheel_Rotate(LockCount)
    ' Step primitive wheel model by 120° per lock (3 positions for 3 locks)
    Dim TargetAngle : TargetAngle = (LockCount - 1) * 120
    TimerFerrisRotate.Tag  = TargetAngle
    TimerFerrisRotate.Enabled = True
End Sub

Sub TimerFerrisRotate_Timer()
    Dim Current : Current = FerrisWheelPrimitive.ObjRotZ
    Dim Target  : Target  = CDbl(TimerFerrisRotate.Tag)
    If Abs(Current - Target) < 3 Then
        FerrisWheelPrimitive.ObjRotZ = Target
        TimerFerrisRotate.Enabled    = False
    Else
        FerrisWheelPrimitive.ObjRotZ = Current + 4
    End If
End Sub

Sub TriggerCarnivalMultiball()
    ActiveMode       = MODE_CARNIVAL_MB
    BallsOnPlayfield = 3
    BallsLocked      = 0
    EuphoriaMeter    = EuphoriaMeter + 15

    PlaySound "multiball_launch_siren"
    LightAll_Flash(Color_Primary)
    DMD_ShowMode("CARNIVAL MULTIBALL", "SHOOT JACKPOTS!")

    ' Eject all 3 locked balls
    FerrisWheel_EjectAll()
    ModeJackpot = PTS_JACKPOT_BASE
    TimerMode.Enabled = True
End Sub

Sub FerrisWheel_EjectAll()
    ' Kick each locked ball via solenoid — staggered 400ms apart
    Sol_FerrisEject.FirePulse 40
    Wait 400
    Sol_FerrisEject.FirePulse 40
    Wait 400
    Sol_FerrisEject.FirePulse 40
    FerrisWheelPrimitive.ObjRotZ = 0  ' Reset wheel visual
End Sub

'=============================================================================
' SECTION 8: BATHROOM DOOR DROP TARGET (MECH 1)
'=============================================================================

Sub BathroomDoor_Lower()
    ' Motorized smooth drop — animate via timer
    TimerBathroomDoor.Tag     = "LOWER"
    TimerBathroomDoor.Enabled = True
    PlaySound "door_creak_lower"
End Sub

Sub BathroomDoor_Raise()
    TimerBathroomDoor.Tag     = "RAISE"
    TimerBathroomDoor.Enabled = True
    PlaySound "door_creak_raise"
End Sub

Sub TimerBathroomDoor_Timer()
    Dim CurrentY : CurrentY = BathroomDoorPrimitive.TransY
    If TimerBathroomDoor.Tag = "LOWER" Then
        If CurrentY > -35 Then
            BathroomDoorPrimitive.TransY = CurrentY - 5
        Else
            BathroomDoorPrimitive.TransY   = -35
            TimerBathroomDoor.Enabled      = False
            DMD_ShowMessage("BATHROOM IS OPEN!")
        End If
    ElseIf TimerBathroomDoor.Tag = "RAISE" Then
        If CurrentY < 0 Then
            BathroomDoorPrimitive.TransY = CurrentY + 5
        Else
            BathroomDoorPrimitive.TransY  = 0
            TimerBathroomDoor.Enabled     = False
        End If
    End If
End Sub

' Hit registered on Bathroom Door sensor during active mode
Sub Target_BathroomDoor_Hit()
    If ActiveMode = MODE_CASSIE_MELTDOWN Or _
       ActiveMode = MODE_ALLFORUSMODE    Or _
       EuphoriaWizardActive Then
        BathroomDoor_Lower()
        AddScore PTS_SCOOP, "BATHROOM OPEN"
        ' Scoop1 now accessible
        Diverter_Stage.IsActive = True
    End If
End Sub

'=============================================================================
' SECTION 9: GLITTER DROP SPINNER (MECH 2)
'=============================================================================

Sub Opto_GlitterSpinner_Spin()
    AddScore PTS_SPINNER_PER_SPIN * PlayfieldMultiplier, "SPINNER"
    FillEuphoriaMeter(METER_PER_BUMPER)

    ' Jacob's Party mode: spinner worth 3x and feeds meter faster
    If ActiveMode = MODE_JACOBS_PARTY Then
        AddScore PTS_SPINNER_PER_SPIN * 2, "PARTY SPIN BONUS"
        FillEuphoriaMeter(2)
        PlaySound "crowd_cheer_ticker"
    Else
        PlaySound "spinner_click"
    End If

    ' Flash spinner lane insert on each spin
    Light_SpinnerLane.State = 1
    Wait 80
    Light_SpinnerLane.State = 0
End Sub

'=============================================================================
' SECTION 10: SCOOP (SCOOP 1 — "THE STAGE SCOOP")
'=============================================================================

Sub Scoop1_Hit()
    PlaySound "scoop_thunk"
    Wait 500

    If EuphoriaMeter >= METER_WIZARD_THRESHOLD And Not EuphoriaWizardActive Then
        StartWizardMode()
    ElseIf ActiveMode = MODE_CASSIE_MELTDOWN Then
        CollectModeJackpot()
    ElseIf ActiveMode = MODE_CARNIVAL_MB Then
        CollectCarnivalJackpot()
    Else
        AddScore PTS_SCOOP, "SCOOP"
        StartRandomMode()
    End If

    ' Raise Bathroom Door again after scoop collect
    BathroomDoor_Raise()
    Diverter_Stage.IsActive = False
    Sol_Scoop1Eject.FirePulse 40
End Sub

Sub Scoop1_VirtualFeed()
    ' Ball routed to Scoop1 via Stage Ramp diverter (no physical hit, trigger directly)
    Scoop1_Hit()
End Sub

'=============================================================================
' SECTION 11: BUMPERS (PROM LIGHTS CLUSTER)
'=============================================================================

Sub Bumper1_Hit()
    BumperCommon(1)
End Sub

Sub Bumper2_Hit()
    BumperCommon(2)
End Sub

Sub Bumper3_Hit()
    BumperCommon(3)
End Sub

Sub BumperCommon(BumperNum)
    AddScore PTS_BUMPER * PlayfieldMultiplier, "BUMPER " & BumperNum
    BonusTotal = BonusTotal + 100
    FillEuphoriaMeter(METER_PER_BUMPER)

    ' Prom Lights pulse: cycle through Pink → Cyan → Purple
    Dim PulseColor : PulseColor = (BumperNum Mod 3)
    Select Case PulseColor
        Case 0 : Flash_BumperCluster(Color_Primary)
        Case 1 : Flash_BumperCluster(Color_Secondary)
        Case 2 : Flash_BumperCluster(Color_Accent)
    End Select
    PlaySound "bumper_pop_0" & BumperNum
End Sub

'=============================================================================
' SECTION 12: DROP TARGET BANK — "M-A-D-D-Y" (5 TARGETS)
'=============================================================================

Sub DropTarget_M_Hit() : MaddyDropHit(1, "M")  : End Sub
Sub DropTarget_A_Hit() : MaddyDropHit(2, "A")  : End Sub
Sub DropTarget_D1_Hit(): MaddyDropHit(4, "D")  : End Sub
Sub DropTarget_D2_Hit(): MaddyDropHit(8, "D2") : End Sub
Sub DropTarget_Y_Hit() : MaddyDropHit(16, "Y") : End Sub

Sub MaddyDropHit(BitFlag, Letter)
    If (MaddyLettersLit And BitFlag) = 0 Then
        MaddyLettersLit = MaddyLettersLit Or BitFlag
        AddScore PTS_DROP_MADDY, "MADDY-" & Letter
        PlaySound "target_drop_hit"
        DMD_ShowLetter(Letter)
        BonusTotal = BonusTotal + 500
    End If

    If MaddyLettersLit = 31 Then  ' All 5 bits set (11111 binary = 31)
        MaddyLetters_Complete()
    End If
End Sub

Sub MaddyLetters_Complete()
    PlaySound "maddy_scream_cue"
    DMD_ShowMessage("M-A-D-D-Y COMPLETE!")
    Flash_MaddyBank()
    FillEuphoriaMeter(METER_PER_MODE_START)

    ' Reset bank after brief pause
    Wait 1500
    TargetBank_MaddyReset()
    MaddyLettersLit = 0

    ' Award bonus multiplier or start Cassie Meltdown
    If ActiveMode = MODE_NONE Then
        StartMode(MODE_CASSIE_MELTDOWN)
    Else
        BonusMultiplier = BonusMultiplier + 1
        If BonusMultiplier > 4 Then BonusMultiplier = 4
        DMD_ShowMessage("BONUS X" & BonusMultiplier)
    End If
End Sub

Sub TargetBank_MaddyReset()
    Sol_MaddyReset.FirePulse 40
    DropTarget_M.IsDropped  = False
    DropTarget_A.IsDropped  = False
    DropTarget_D1.IsDropped = False
    DropTarget_D2.IsDropped = False
    DropTarget_Y.IsDropped  = False
End Sub

'=============================================================================
' SECTION 13: MODE ENGINE
'=============================================================================

Sub StartRandomMode()
    ' Cycle through available modes that aren't the active one
    Dim Candidate
    Randomize
    Do
        Candidate = Int(Rnd * 3) + 1  ' Modes 1-3
    Loop While Candidate = ActiveMode
    StartMode(Candidate)
End Sub

Sub StartMode(ModeNum)
    If ActiveMode <> MODE_NONE And ActiveMode <> MODE_CARNIVAL_MB Then Exit Sub

    ActiveMode = ModeNum
    ModeTimer  = MODE_DURATION_SEC
    FillEuphoriaMeter(METER_PER_MODE_START)
    TimerMode.Enabled = True

    Select Case ModeNum
        Case MODE_CASSIE_MELTDOWN
            PlaySound "labrinth_track_cassie"
            DMD_ShowMode("CASSIE'S MELTDOWN", "SHOOT THE SCOOP!")
            LightZone_Flash(Color_Accent, 8)    ' Hot pink strobe
            BathroomDoor_Lower()
            ModeJackpot = PTS_JACKPOT_BASE
            ModeTimer   = HURRYUP_DURATION_SEC

        Case MODE_JACOBS_PARTY
            PlaySound "labrinth_track_party"
            DMD_ShowMode("JACOB'S PARTY", "MAX THE SPINNER!")
            LightZone_Flash(Color_Secondary, 6) ' Cyan pulse
            PlayfieldMultiplier = 2

        Case MODE_FEZCO_ORBIT
            PlaySound "labrinth_track_fezco"
            DMD_ShowMode("FEZCO'S RUN", "SHOOT ORBITS!")
            LightZone_Flash(Color_Primary, 5)   ' Purple sweep
            ' Orbit shots worth 3x for duration
            PlayfieldMultiplier = 3

        Case MODE_ALLFORUSMODE
            PlaySound "labrinth_all_for_us_intro"
            DMD_ShowMode("ALL FOR US", "WIZARD MODE AWAITS!")
            LightAll_Sweep(Color_Primary, Color_Accent)
            PlayfieldMultiplier = 4
    End Select
End Sub

Sub EndMode()
    Select Case ActiveMode
        Case MODE_JACOBS_PARTY
            PlayfieldMultiplier = 1
        Case MODE_FEZCO_ORBIT
            PlayfieldMultiplier = 1
        Case MODE_CARNIVAL_MB
            ' Drain to single ball if multiball ends here
            BallsOnPlayfield = 1
    End Select

    ActiveMode = MODE_NONE
    ModeTimer  = 0
    TimerMode.Enabled = False
    DMD_ShowMessage("MODE ENDED")
    Light_NormalPlayfield()
End Sub

Sub CollectModeJackpot()
    If ActiveMode = MODE_CASSIE_MELTDOWN Then
        AddScore ModeJackpot, "MELTDOWN JACKPOT"
        PlaySound "jackpot_fanfare"
        Flash_PlayfieldAll(Color_Accent)
        ' Jackpot increases 10% each collect
        ModeJackpot = Int(ModeJackpot * 1.1)
        ModeTimer   = HURRYUP_DURATION_SEC ' Reset timer
        DMD_ShowMessage("JACKPOT! " & FormatScore(ModeJackpot) & " NEXT")
    End If
End Sub

Sub CollectCarnivalJackpot()
    AddScore ModeJackpot, "CARNIVAL JACKPOT"
    PlaySound "jackpot_fanfare"
    Flash_PlayfieldAll(Color_Primary)
    ModeJackpot = Int(ModeJackpot * 1.15)
    DMD_ShowMessage("JACKPOT! SHOOT AGAIN!")
End Sub

'=============================================================================
' SECTION 14: MODE TIMER TICK
'=============================================================================

Sub TimerMode_Timer()
    If ModeTimer > 0 Then
        ModeTimer = ModeTimer - 1
        DMD_UpdateModeTimer(ModeTimer)

        ' Strobe flashers in sync with BPM during wizard/All For Us
        If EuphoriaWizardActive Then
            BPMFlash_Tick()
        End If

        ' Warn at 10 seconds
        If ModeTimer = 10 Then
            PlaySound "mode_warning_10s"
            DMD_ShowMessage("HURRY UP! " & ModeTimer & "s")
        End If
    Else
        EndMode()
    End If
End Sub

'=============================================================================
' SECTION 15: WIZARD MODE — "ALL FOR US"
'=============================================================================

Sub StartWizardMode()
    EuphoriaWizardActive = True
    ActiveMode           = MODE_EUPHORIA_WIZARD
    BallsOnPlayfield     = 3   ' Triple-ball wizard mode
    ModeTimer            = 60
    ModeJackpot          = PTS_SUPERJAKPOT

    PlaySound "all_for_us_full_track"
    DMD_ShowMode("EUPHORIA", "ALL FOR US")
    LightAll_WizardSweep()
    FerrisWheel_EjectAll()  ' Release any held balls
    PlayfieldMultiplier = 4
    TimerMode.Enabled   = True

    DMD_ShowMessage("EVERY SHOT IS A JACKPOT!")
End Sub

Sub EndWizardMode()
    EuphoriaWizardActive = False
    EuphoriaMeter        = 0
    ActiveMode           = MODE_NONE
    PlayfieldMultiplier  = 1
    DMD_UpdateMeter(EuphoriaMeter)
    PlaySound "wizard_end_sting"
    DMD_ShowMessage("EUPHORIA OVER")
    Light_NormalPlayfield()
End Sub

' BPM-synced flasher pulse — called every second during wizard
Sub BPMFlash_Tick()
    ' "All For Us" tempo ~128 BPM; flash groups on beat subdivisions
    Dim Beat : Beat = (60 - ModeTimer) Mod 4
    Select Case Beat
        Case 0 : Flash_BumperCluster(Color_Primary)
        Case 1 : Flash_SpiralZone(0)
        Case 2 : Flash_PlayfieldAll(Color_Accent)
        Case 3 : Flash_BumperCluster(Color_Secondary)
    End Select
End Sub

'=============================================================================
' SECTION 16: COMBO SYSTEM
'=============================================================================

Sub IncrementCombo()
    ComboCount    = ComboCount + 1
    LastShotTime  = GetTime()

    If ComboCount > 1 Then
        Dim ComboBonus : ComboBonus = PTS_RAMP_STAGE * (ComboCount - 1)
        AddScore ComboBonus, "COMBO x" & ComboCount
        DMD_ShowMessage("COMBO x" & ComboCount)
        PlaySound "combo_escalate"
    End If

    TimerCombo.Enabled = True  ' Reset combo window
End Sub

Sub TimerCombo_Timer()
    ' Combo window expired without another shot
    If ComboCount > 1 Then
        DMD_ShowMessage("COMBO ENDED AT x" & ComboCount)
    End If
    ComboCount         = 0
    TimerCombo.Enabled = False
End Sub

'=============================================================================
' SECTION 17: SCORE & METER UTILITIES
'=============================================================================

Sub AddScore(Points, Description)
    Dim Multiplied : Multiplied = Points * PlayfieldMultiplier
    Score    = Score + Multiplied
    BonusTotal = BonusTotal + Int(Points * 0.1)   ' 10% of raw points to bonus
    DMD_UpdateScore(Score)
    If PlayfieldMultiplier > 1 Then
        DMD_ShowMessage(Description & " +" & FormatScore(Multiplied) & " (x" & PlayfieldMultiplier & ")")
    End If
End Sub

Sub FillEuphoriaMeter(Amount)
    EuphoriaMeter = EuphoriaMeter + Amount
    If EuphoriaMeter > METER_WIZARD_THRESHOLD Then
        EuphoriaMeter = METER_WIZARD_THRESHOLD
    End If
    DMD_UpdateMeter(EuphoriaMeter)
    Update_MeterInserts()
End Sub

Sub Update_MeterInserts()
    ' 10 insert LEDs represent 0-100% meter; light proportionally
    Dim i, Threshold
    For i = 1 To 10
        Threshold = i * 10
        If EuphoriaMeter >= Threshold Then
            SetInsertLight "Meter_" & i, Color_Accent
        Else
            SetInsertLight "Meter_" & i, 0
        End If
    Next
End Sub

Function FormatScore(N)
    ' Returns comma-formatted score string
    Dim S : S = CStr(N)
    Dim Out : Out = ""
    Dim Pos, Count : Count = 0
    For Pos = Len(S) To 1 Step -1
        If Count > 0 And Count Mod 3 = 0 Then Out = "," & Out
        Out   = Mid(S, Pos, 1) & Out
        Count = Count + 1
    Next
    FormatScore = Out
End Function

'=============================================================================
' SECTION 18: LIGHTING HELPERS
'=============================================================================

' RGB color constants (packed as Long for VPX lighting API)
Const Color_Primary   = &H800080   ' Purple
Const Color_Secondary = &H00FFFF   ' Cyan
Const Color_Accent    = &HFF1493   ' Deep Pink / Glitter

Sub Flash_BumperCluster(RGBColor)
    Bumper1Light.State = 1
    Bumper2Light.State = 1
    Bumper3Light.State = 1
    Wait 120
    Bumper1Light.State = 0
    Bumper2Light.State = 0
    Bumper3Light.State = 0
End Sub

Sub Flash_SpiralZone(LoopCount)
    SpiralLight.State = 1
    If LoopCount > 5 Then
        ' Rapid strobe for hot loop
        Wait 60
        SpiralLight.State = 0
        Wait 60
        SpiralLight.State = 1
    End If
    Wait 200
    SpiralLight.State = 0
End Sub

Sub Flash_MaddyBank()
    MaddyBankLight.State = 1
    Wait 300
    MaddyBankLight.State = 0
    Wait 100
    MaddyBankLight.State = 1
    Wait 300
    MaddyBankLight.State = 0
End Sub

Sub Flash_PlayfieldAll(RGBColor)
    Flasher_Left.IntensityScale  = 1
    Flasher_Right.IntensityScale = 1
    Flasher_Back.IntensityScale  = 1
    Wait 150
    Flasher_Left.IntensityScale  = 0
    Flasher_Right.IntensityScale = 0
    Flasher_Back.IntensityScale  = 0
End Sub

Sub LightZone_Flash(RGBColor, Repeats)
    Dim i
    For i = 1 To Repeats
        Flash_PlayfieldAll(RGBColor)
        Wait 100
    Next
End Sub

Sub LightAll_Flash(RGBColor)
    LightZone_Flash RGBColor, 6
End Sub

Sub LightAll_Sweep(Color1, Color2)
    Flash_BumperCluster(Color1)
    Wait 80
    Flash_SpiralZone(0)
    Wait 80
    Flash_MaddyBank()
    Wait 80
    Flash_PlayfieldAll(Color2)
End Sub

Sub LightAll_WizardSweep()
    Dim i
    For i = 1 To 4
        LightAll_Sweep Color_Primary, Color_Accent
        Wait 200
    Next
End Sub

Sub Light_NormalPlayfield()
    ' Restore idle light state for all zones
    Bumper1Light.State   = 1
    Bumper2Light.State   = 1
    Bumper3Light.State   = 1
    SpiralLight.State    = 0
    MaddyBankLight.State = 0
End Sub

Sub SetInsertLight(LightName, RGBColor)
    ' Dynamically reference named insert light objects
    On Error Resume Next
    Dim L : Set L = Eval(LightName)
    If Not L Is Nothing Then
        If RGBColor = 0 Then
            L.State = 0
        Else
            L.State = 1
        End If
    End If
    On Error GoTo 0
End Sub

'=============================================================================
' SECTION 19: DMD / DISPLAY INTERFACE
'=============================================================================

' These subs act as an abstraction layer — swap the internals for
' FlexDMD, UltraDMD, or PuP-Pack calls as appropriate for your setup.

Sub DMD_ShowAttract()
    Controller.DisplayMessage "EUPHORIA", "INSERT COIN"
    PlaySound "attract_music_loop"
End Sub

Sub DMD_ShowBallStart(BallNum)
    Controller.DisplayMessage "BALL " & BallNum, "GOOD LUCK"
End Sub

Sub DMD_ShowGameOver(FinalScore)
    Controller.DisplayMessage "GAME OVER", FormatScore(FinalScore)
End Sub

Sub DMD_UpdateScore(CurrentScore)
    Controller.DisplayScore CurrentScore
End Sub

Sub DMD_ShowMode(Line1, Line2)
    Controller.DisplayMessage Line1, Line2
End Sub

Sub DMD_ShowMessage(Msg)
    Controller.DisplayMessage Msg, ""
End Sub

Sub DMD_ShowBonus(Base, Mult, Total)
    Controller.DisplayMessage "BONUS X" & Mult, FormatScore(Total)
End Sub

Sub DMD_UpdateModeTimer(SecondsLeft)
    Controller.DisplayTimer SecondsLeft
End Sub

Sub DMD_UpdateMeter(MeterValue)
    Controller.DisplayMeter MeterValue
End Sub

Sub DMD_ShowLetter(Letter)
    Controller.DisplayMessage "M-A-D-D-Y", Letter & " LIT"
End Sub

'=============================================================================
' SECTION 20: VIRTUAL BALL FEED HELPERS
' (Simulate ball arriving at a trigger without physical path travel)
'=============================================================================

Sub LeftInlane_VirtualFeed()
    BallTrough.BallFeedTo "LeftInlane"
End Sub

Sub RightInlane_VirtualFeed()
    BallTrough.BallFeedTo "RightInlane"
End Sub

Sub AddBallToTrough()
    BallTrough.AddBall
End Sub

'=============================================================================
' END OF SCRIPT — Euphoria (LE) VPX Table
'=============================================================================
