# Euphoria (LE) — VPX Table Script

VBScript implementation for the *Euphoria* virtual pinball table in Visual Pinball X.

## Files

- `Euphoria.vbs` — Complete table script. Paste into the VPX script window.

## Requirements

- Visual Pinball X 10.7+
- FlexDMD **or** UltraDMD (for the DMD abstraction layer in Section 19)
- PuP-Pack: optional — wire up via `Controller.DisplayMessage` replacements
- VPX primitives, lights, timers, and solenoids named per the table layout (see Section 2 of the design doc)

## Script Sections

| Section | Contents |
|---------|----------|
| 1 | Global state variables |
| 2 | Constants (mode IDs, score values, timing) |
| 3 | Table init & game cycle |
| 4 | Drain / ball management |
| 5 | Ramps (The Stage, Ferris Wheel) |
| 6 | Orbits & The Spiral sub-playfield |
| 7 | Ferris Wheel toy (3-ball lock → Carnival Multiball) |
| 8 | Bathroom Door drop target (motorized) |
| 9 | Glitter Drop Spinner |
| 10 | Scoop (The Stage Scoop) |
| 11 | Bumpers (Prom Lights cluster) |
| 12 | Drop target bank (M-A-D-D-Y) |
| 13 | Mode engine (Cassie's Meltdown, Jacob's Party, Fezco's Run, All For Us) |
| 14 | Mode timer tick |
| 15 | Wizard mode — All For Us |
| 16 | Combo system |
| 17 | Score & meter utilities |
| 18 | Lighting helpers |
| 19 | DMD/display interface (abstraction layer) |
| 20 | Virtual ball feed helpers |

## Named Objects Expected in VPX Editor

### Flippers
`Flipper_LeftMain`, `Flipper_RightMain`, `Flipper_UpperLeft`, `Flipper_UpperRight`

### Triggers / Optos
`TriggerEnter_StageRamp`, `TriggerExit_StageRamp`, `TriggerEnter_FerrisRamp`, `TriggerExit_FerrisRamp`, `TriggerEnter_LeftOrbit`, `TriggerExit_LeftOrbit`, `TriggerEnter_RightOrbit`, `TriggerExit_RightOrbit`, `Opto_SpiralLoop`, `Opto_GlitterSpinner`

### Targets
`DropTarget_M`, `DropTarget_A`, `DropTarget_D1`, `DropTarget_D2`, `DropTarget_Y`, `Target_BathroomDoor`

### Solenoids
`Sol_FerrisEject`, `Sol_MaddyReset`, `Sol_Scoop1Eject`

### Primitives
`FerrisWheelPrimitive` (ObjRotZ animated), `BathroomDoorPrimitive` (TransY animated)

### Lights
`Bumper1Light`, `Bumper2Light`, `Bumper3Light`, `SpiralLight`, `MaddyBankLight`, `Light_SpinnerLane`, `Meter_1` through `Meter_10`, `Flasher_Left`, `Flasher_Right`, `Flasher_Back`

### Timers
`TimerMode`, `TimerCombo`, `TimerBathroomDoor`, `TimerFerrisRotate`

### Other
`Diverter_Stage` (IsActive property), `BallTrough`, `Plunger`, `Scoop1`

## Modes

| Mode | Trigger | Key Shot | Duration |
|------|---------|----------|----------|
| Cassie's Meltdown | M-A-D-D-Y complete | Scoop (hurry-up jackpot) | 20s |
| Jacob's Party | Random / Scoop | Spinner (3x) | 45s |
| Fezco's Run | Random / Scoop | Orbits (3x PF multiplier) | 45s |
| Carnival Multiball | 3 Ferris locks | Scoop jackpots | Until drain to 1 ball |
| All For Us (Wizard) | Euphoria Meter 100% | All shots | 60s, 3-ball |

## Euphoria Meter

Fills toward 100% via: bumpers (+1), loops (+3), ramps (+5), mode starts (+10). At 100% the next Scoop collect triggers the *All For Us* wizard mode.
