# 3D Meshes

OBJ format. UV-unwrapped, Y-up orientation to match VPX coordinate system.

| File | Poly budget | Notes |
|------|-------------|-------|
| `ferris_wheel.obj` | ~4000 tris | Wheel hub + 3 gondola arms + lock cradles. Origin at center. Rotated on Z-axis by script (0°, 120°, 240°). |
| `bathroom_door.obj` | ~800 tris | Flat panel door with handle detail. Origin at top hinge edge. Translated on Y-axis by script (0 = blocking Scoop, -35 = lowered). |

## Ferris Wheel rig notes

- **Rest position (Z=0):** Empty slot facing upper-right (12 o'clock position = top)
- **Lock 1 (Z=120):** First gondola rotated into catch position
- **Lock 2 (Z=240):** Second gondola
- **Lock 3 / Multiball (Z=360 = 0):** Third gondola locked; script then fires eject solenoid

Script drives `FerrisWheelPrimitive.ObjRotZ` in 4° increments per `TimerFerrisRotate` tick (150ms interval).

## Bathroom Door rig notes

- **Raised (TransY=0):** Door panel sits flush above playfield, blocking Scoop 1
- **Lowered (TransY=-35):** Panel drops below playfield surface, Scoop 1 accessible
- Script drives `BathroomDoorPrimitive.TransY` in 5-unit steps per `TimerBathroomDoor` tick (500ms interval)
