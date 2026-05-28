# Excalidraw diagram conventions

Applies whenever Claude generates or edits an Excalidraw diagram in the Obsidian vault.

## File format (mandatory)

All Excalidraw files use `.md` extension — never `.excalidraw`. The file must be wrapped in the Obsidian Excalidraw plugin markdown format:

```
---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==

# Excalidraw Data

## Text Elements
[extracted text labels, one per line]

%%
## Drawing
```json
{...excalidraw JSON...}
```
%%
```

**Never write raw JSON to the file.** The plugin will show code instead of a diagram if the wrapper is missing.

## Generation approach

Generate diagrams programmatically via a Python script that builds the Excalidraw JSON and writes the wrapped `.md` file. Do not hand-craft element coordinates. The script pattern:

```python
elements = []

def nid(): ...       # auto-incrementing element ID
def rct(...): ...    # rectangle
def txt(...): ...    # text
def arw(...): ...    # arrow
def ell(...): ...    # ellipse
def lne(...): ...    # line (no arrowhead)

# build elements, then:
diagram = {"type": "excalidraw", "version": 2, "source": "https://excalidraw.com",
           "elements": elements, "appState": {"gridSize": None, "viewBackgroundColor": "#ffffff"}}
```

After writing, validate with `python3 -c "import json; json.load(open('path'))"` and print element count + bounding box before reporting done.

## Network topology color palette

Use these exact hex values. Consistency across diagrams matters more than per-diagram tweaking.

### Switch / device boxes

| Role | Fill | Stroke | When to use |
|---|---|---|---|
| Gateway / UDM | `#6741d9` | `#4c2baa` | UDM Pro, UDM SE, UDR |
| MDF / core | `#4c2baa` | `#3b2099` | Distribution/core switches (USW Pro 48, USW Ent) |
| Large bay sw | `#b91c1c` | `#991a1a` | 48-port shop switches (USW 48 PoE, USW Pro 48) |
| Medium bay sw | `#c92a2a` | `#a61e1e` | 24-port shop switches (USW Pro 24) |
| Small shop sw | `#e8590c` | `#bf360c` | 8-port / Flex Mini / edge shop switches |
| Office switch | `#1864ab` | `#1557a0` | All office-area switches regardless of size |
| Access point | `#0b7285` | `#087f8c` | All APs (see AP style below) |
| Offline device | `#555555` | `#888888` | Any device that is offline (applied to all types) |

### Zone background fills (low opacity overlays)

| Zone | Fill | Stroke | Opacity |
|---|---|---|---|
| Shop floor | `#fff4e6` | `#ffa94d` | 35 |
| Core / MDF | `#f3f0ff` | `#9775fa` | 35 |
| Office | `#e7f5ff` | `#74c0fc` | 35 |
| Server room | `#ebfbee` | `#69db7c` | 35 |

Zone labels: 9pt, colored to match the zone stroke, plain text — no emoji in headers.

### Arrow weights (link speed → stroke width)

| Link | Width | Style |
|---|---|---|
| 10G backbone | 3 | solid |
| 1G distribution | 2 | solid |
| 1G SFP / uplink | 2 | dashed (if dual-home or secondary path) |
| Edge / PoE port | 1 | solid |
| Inferred uplink (not API-confirmed) | 1 | dashed |
| AP to switch | 1 | solid |

Spine arrows: color matches the source zone stroke (e.g. `#7048e8` for core). Distribution/edge: match the switch color.

## AP representation

**Context-dependent:**
- Dense diagrams (many APs, tight space): small rectangle, same style as switch boxes but smaller (width ~130, height ~22). Label format: `NAME (N)` where N is wireless client count.
- Sparse diagrams (few APs, space available): ellipse, teal fill `#0b7285`.

When in doubt, use rectangles — they pack better.

## Client count indicators

Show wired and wireless client counts as a trailing indicator below the switch — not a corner badge. The visual metaphor is a short downlink:

```
[SWITCH BOX]
      |
   ──────
  [W] [~W]
```

Implementation:
- Short vertical line from bottom-center of switch box, length ~20px
- Two small ellipses (r=14) on that line:
  - Left: wired count — fill `#1a1a2e`, stroke `#888888`, white text
  - Right: wireless count — fill `#0b7285`, stroke `#087f8c`, white text
- Font size: 9pt if count < 10, 8pt if 10–99, 7pt if 100+
- If either count is 0, omit that badge (don't show a "0")
- If both are 0, omit the indicator entirely

Helper function signature: `def client_indicator(switch_cx, switch_bottom_y, wired, wireless)`

## Offline devices

Always show offline devices — grayed out, never hidden. Apply `#555555` fill / `#888888` stroke to the device box regardless of its normal role color. Subtitle text uses `#999999`. Append `✗` to the name label if space allows.

## Legend

Every network diagram includes a legend in the bottom-left corner:
- One row per device class with a color swatch and label
- One row for the client indicator (show the wired/wireless badge pair)
- One row for dashed arrow meaning
- Font: 8pt, left-aligned, dark gray `#333333`

## Diagram title block

Top of canvas, centered:
- Line 1: `Site Name — Diagram Type  |  YYYY-MM-DD`, 18pt, `#212529`
- Line 2: key stats (device counts, client totals), 11pt, `#555555`

## What NOT to do

- Don't use the Excalidraw MCP tools to generate diagrams — they produce layout that can't be reviewed before saving. Use the Python script approach.
- Don't hand-craft JSON element coordinates for more than ~5 elements.
- Don't use emojis in diagram labels.
- Don't put topology detail in note prose when a diagram exists — embed with `![[filename.md]]`.
