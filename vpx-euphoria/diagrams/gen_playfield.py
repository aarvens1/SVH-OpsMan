"""
Generate Excalidraw playfield layout diagram for Euphoria (LE) VPX table.
Output: euphoria-playfield.md (Obsidian Excalidraw plugin wrapper format)
"""

import json, math, os

# ---------------------------------------------------------------------------
# Element builder helpers
# ---------------------------------------------------------------------------

_eid = 0

def nid():
    global _eid
    _eid += 1
    return f"el{_eid:04d}"

def rct(x, y, w, h, label="", fill="#ffffff", stroke="#000000",
        font_size=14, bold=False, opacity=100, corner=4,
        text_color="#000000", stroke_width=2, stroke_style="solid"):
    eid = nid()
    el = {
        "id": eid, "type": "rectangle", "version": 1,
        "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": stroke, "backgroundColor": fill,
        "fillStyle": "solid", "strokeWidth": stroke_width,
        "strokeStyle": stroke_style, "roughness": 0, "opacity": opacity,
        "roundness": {"type": 3, "value": corner},
        "isDeleted": False, "groupIds": [], "seed": hash(eid) & 0xFFFFFF
    }
    els = [el]
    if label:
        els.append(txt(x + w/2, y + h/2, label, font_size, bold, text_color, anchor="center", width=w - 8))
    return els, eid

def ell(cx, cy, rx, ry, label="", fill="#ffffff", stroke="#000000",
        font_size=12, text_color="#000000", stroke_width=2):
    eid = nid()
    el = {
        "id": eid, "type": "ellipse", "version": 1,
        "x": cx - rx, "y": cy - ry, "width": rx*2, "height": ry*2,
        "angle": 0, "strokeColor": stroke, "backgroundColor": fill,
        "fillStyle": "solid", "strokeWidth": stroke_width,
        "strokeStyle": "solid", "roughness": 0, "opacity": 100,
        "roundness": {"type": 3, "value": 4},
        "isDeleted": False, "groupIds": [], "seed": hash(eid) & 0xFFFFFF
    }
    els = [el]
    if label:
        els.append(txt(cx, cy, label, font_size, False, text_color, anchor="center", width=rx*2))
    return els, eid

def txt(x, y, text, font_size=13, bold=False, color="#212529",
        anchor="left", width=None):
    eid = nid()
    fw = 700 if bold else 400
    w  = width if width else max(len(text) * font_size * 0.65, 60)
    el = {
        "id": eid, "type": "text", "version": 1,
        "x": x if anchor == "left" else x - w/2,
        "y": y - font_size/2,
        "width": w, "height": font_size * 1.4,
        "angle": 0, "strokeColor": color, "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100,
        "text": text, "fontSize": font_size, "fontFamily": 3,
        "textAlign": anchor if anchor != "center" else "center",
        "verticalAlign": "middle",
        "containerId": None, "originalText": text,
        "isDeleted": False, "groupIds": [], "seed": hash(eid) & 0xFFFFFF,
        "fontWeight": fw
    }
    return el

def arw(x1, y1, x2, y2, color="#333333", width=2, style="solid", label=""):
    eid = nid()
    el = {
        "id": eid, "type": "arrow", "version": 1,
        "x": x1, "y": y1,
        "width": abs(x2-x1), "height": abs(y2-y1),
        "angle": 0, "strokeColor": color, "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": width, "strokeStyle": style,
        "roughness": 0, "opacity": 100,
        "points": [[0, 0], [x2-x1, y2-y1]],
        "lastCommittedPoint": None,
        "startBinding": None, "endBinding": None,
        "startArrowhead": None, "endArrowhead": "arrow",
        "isDeleted": False, "groupIds": [], "seed": hash(eid) & 0xFFFFFF
    }
    return [el], eid

def lne(x1, y1, x2, y2, color="#888888", width=1, style="solid"):
    eid = nid()
    el = {
        "id": eid, "type": "line", "version": 1,
        "x": x1, "y": y1,
        "width": abs(x2-x1)+1, "height": abs(y2-y1)+1,
        "angle": 0, "strokeColor": color, "backgroundColor": "transparent",
        "fillStyle": "solid", "strokeWidth": width, "strokeStyle": style,
        "roughness": 0, "opacity": 100,
        "points": [[0, 0], [x2-x1, y2-y1]],
        "lastCommittedPoint": None,
        "startBinding": None, "endBinding": None,
        "startArrowhead": None, "endArrowhead": None,
        "isDeleted": False, "groupIds": [], "seed": hash(eid) & 0xFFFFFF
    }
    return [el], eid

# ---------------------------------------------------------------------------
# Color palette
# ---------------------------------------------------------------------------

# Zone backgrounds
C_SHOP_FILL   = "#fff4e6";  C_SHOP_STROKE   = "#ffa94d"
C_CORE_FILL   = "#f3f0ff";  C_CORE_STROKE   = "#9775fa"
C_OFFICE_FILL = "#e7f5ff";  C_OFFICE_STROKE = "#74c0fc"
C_SERVER_FILL = "#ebfbee";  C_SERVER_STROKE = "#69db7c"

# Device colors (reused for pinball component role analogy)
C_GATEWAY     = "#6741d9";  C_GATEWAY_SK    = "#4c2baa"  # Major toys / spinner
C_CORE        = "#4c2baa";  C_CORE_SK       = "#3b2099"  # Ramps
C_RED_LARGE   = "#b91c1c";  C_RED_L_SK      = "#991a1a"  # Drop targets
C_ORANGE      = "#e8590c";  C_ORANGE_SK     = "#bf360c"  # Bumpers
C_BLUE        = "#1864ab";  C_BLUE_SK       = "#1557a0"  # Scoops / holes
C_TEAL        = "#0b7285";  C_TEAL_SK       = "#087f8c"  # Flippers
C_ACCENT_PK   = "#c2255c";  C_ACCENT_SK     = "#a61e1e"  # Wizard / meter

# Euphoria theme
C_PURPLE      = "#800080"
C_CYAN        = "#00cccc"
C_PINK        = "#ff1493"

# Text
C_DARK        = "#212529"
C_MID         = "#555555"
C_LIGHT       = "#999999"

# ---------------------------------------------------------------------------
# Canvas layout constants
# ---------------------------------------------------------------------------

# Playfield bounding box (portrait, Y increases downward)
PF_X = 80;   PF_Y = 60
PF_W = 600;  PF_H = 1440

PF_CX = PF_X + PF_W // 2   # 380
PF_R  = PF_X + PF_W        # 680

# Key Y positions (0 = top / plunger lane, 1440 = drain)
Y_PLUNGER    = PF_Y + 60
Y_BUMPERS    = PF_Y + 280
Y_SPIRAL_MID = PF_Y + 350
Y_STAGE_TOP  = PF_Y + 380
Y_FERRIS_TOP = PF_Y + 480
Y_MADDY_TOP  = PF_Y + 560
Y_SCOOP      = PF_Y + 700
Y_FERRIS_MID = PF_Y + 680
Y_SLING      = PF_Y + 900
Y_FLIPPER    = PF_Y + 1320
Y_DRAIN      = PF_Y + 1400

# Key X positions
X_LEFT_WALL  = PF_X + 10
X_LEFT_INNER = PF_X + 80
X_MID        = PF_CX
X_RIGHT_INNER= PF_R - 80
X_RIGHT_WALL = PF_R - 10
X_SPINNER    = PF_R - 100

# ---------------------------------------------------------------------------
# Build elements
# ---------------------------------------------------------------------------

elements = []
text_labels = []   # For the ## Text Elements block

def add(*el_lists):
    for group in el_lists:
        if isinstance(group, list):
            for e in group:
                elements.append(e)
        elif isinstance(group, dict):
            elements.append(group)

# ---- TITLE ----------------------------------------------------------------
add(txt(PF_CX - 260, PF_Y - 44, "EUPHORIA (LE)  —  VPX Playfield Layout  |  2026-06-28",
        18, True, C_DARK, "left", 600))
add(txt(PF_CX - 200, PF_Y - 18, "Stern Spike 2 Style  |  Widebody  |  4 Flippers  |  3-Ball Ferris Lock",
        11, False, C_MID, "left", 500))

# ---- PLAYFIELD BODY -------------------------------------------------------
pf_els, pf_id = rct(PF_X, PF_Y, PF_W, PF_H, fill="#fafafa", stroke="#444444",
                    stroke_width=3, corner=8)
add(pf_els)

# ---- SHOOTER LANE (right edge) -------------------------------------------
sl_els, _ = rct(PF_R - 38, PF_Y + 40, 28, PF_H - 120,
                fill="#f0e8d0", stroke="#aaa", stroke_width=1, corner=2)
add(sl_els)
add(txt(PF_R - 24, PF_Y + 120, "S", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 134, "H", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 148, "O", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 162, "O", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 176, "T", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 190, "E", 10, False, C_MID, "center", 28))
add(txt(PF_R - 24, PF_Y + 204, "R", 10, False, C_MID, "center", 28))

# ---- ZONE: SPIRAL SUB-PLAYFIELD (upper left) ---------------------------
sp_x = PF_X + 8; sp_y = PF_Y + 80; sp_w = 210; sp_h = 280
sp_els, _ = rct(sp_x, sp_y, sp_w, sp_h, fill=C_CORE_FILL, stroke=C_CORE_STROKE,
                opacity=60, stroke_width=2, corner=10)
add(sp_els)
add(txt(sp_x + sp_w//2, sp_y + 12, "THE SPIRAL", 9, True, C_CORE_STROKE, "center", sp_w))

# Mini flippers inside Spiral
fl_els, _ = rct(sp_x + 20, sp_y + sp_h - 56, 65, 16,
                fill=C_TEAL, stroke=C_TEAL_SK, stroke_width=1, corner=6)
add(fl_els)
add(txt(sp_x + 52, sp_y + sp_h - 48, "UL Flip", 8, False, "#fff", "center", 65))

fl_els2, _ = rct(sp_x + sp_w - 85, sp_y + sp_h - 56, 65, 16,
                 fill=C_TEAL, stroke=C_TEAL_SK, stroke_width=1, corner=6)
add(fl_els2)
add(txt(sp_x + sp_w - 52, sp_y + sp_h - 48, "UR Flip", 8, False, "#fff", "center", 65))

# Spiral loop orbit (ellipse inside sub-playfield)
sp_loop_els, _ = ell(sp_x + sp_w//2, sp_y + 130, 75, 80,
                     fill="transparent", stroke=C_CORE_STROKE, stroke_width=2)
add(sp_loop_els)
add(txt(sp_x + sp_w//2, sp_y + 100, "tight loop", 8, False, C_CORE_STROKE, "center", 80))

# Opto sensor
opto_els, _ = ell(sp_x + sp_w//2, sp_y + 188, 14, 10,
                  fill=C_GATEWAY, stroke=C_GATEWAY_SK, text_color="#fff",
                  font_size=7)
add(opto_els)
add(txt(sp_x + sp_w//2, sp_y + 188, "OPTO", 7, False, "#fff", "center", 28))

# ---- BUMPERS (upper middle, Prom Lights) ----------------------------------
bmp_cx = PF_CX + 30; bmp_y = Y_BUMPERS
for i, (ox, oy) in enumerate([(-55, 0), (55, 0), (0, -55)]):
    bmp_els, _ = ell(bmp_cx + ox, bmp_y + oy, 30, 30,
                     fill=C_ORANGE, stroke=C_ORANGE_SK, font_size=8, text_color="#fff")
    add(bmp_els)
    add(txt(bmp_cx + ox, bmp_y + oy, f"BMP{i+1}", 8, False, "#fff", "center", 60))
add(txt(bmp_cx, bmp_y + 52, "Prom Lights", 9, False, C_ORANGE, "center", 120))

# ---- RAMP 1: THE STAGE (center) ------------------------------------------
sr_x = PF_CX - 60; sr_y = Y_STAGE_TOP; sr_w = 120; sr_h = 200
sr_els, _ = rct(sr_x, sr_y, sr_w, sr_h, fill=C_CORE_FILL, stroke=C_CORE_STROKE,
                stroke_width=2, corner=6)
add(sr_els)
add(txt(sr_x + sr_w//2, sr_y + 18, "THE STAGE", 9, True, C_CORE_SK, "center", sr_w))
add(txt(sr_x + sr_w//2, sr_y + 36, "Ramp 1", 8, False, C_CORE_SK, "center", sr_w))

# Diverter symbol inside Stage Ramp
div_els, _ = rct(sr_x + 35, sr_y + 90, 50, 20,
                 fill=C_GATEWAY, stroke=C_GATEWAY_SK, stroke_width=1, corner=3)
add(div_els)
add(txt(sr_x + 60, sr_y + 100, "DIVERTER", 7, False, "#fff", "center", 50))

# Arrows showing two exit paths
arr_els, _ = arw(sr_x + 60, sr_y + 110, sr_x + 60, sr_y + 200,
                 color=C_CORE_STROKE, width=2)
add(arr_els)
add(txt(sr_x + 62, sr_y + 160, "→ Scoop", 8, False, C_CORE_STROKE, "left", 70))

arr_els2, _ = arw(sr_x + 60, sr_y + 110, sr_x - 40, sr_y + 200,
                  color=C_CORE_STROKE, width=1, style="dashed")
add(arr_els2)
add(txt(sr_x - 50, sr_y + 155, "→ L. Inlane", 7, False, C_MID, "left", 70))

# ---- RAMP 2: FERRIS WHEEL (right) ----------------------------------------
fr_x = PF_R - 200; fr_y = Y_FERRIS_TOP; fr_w = 110; fr_h = 160
fr_els, _ = rct(fr_x, fr_y, fr_w, fr_h, fill=C_SHOP_FILL, stroke=C_SHOP_STROKE,
                stroke_width=2, corner=6)
add(fr_els)
add(txt(fr_x + fr_w//2, fr_y + 18, "FERRIS", 9, True, C_RED_LARGE, "center", fr_w))
add(txt(fr_x + fr_w//2, fr_y + 34, "Ramp 2", 8, False, C_MID, "center", fr_w))

# Ferris Wheel toy (circle with lock slots)
fw_cx = PF_R - 140; fw_cy = Y_FERRIS_MID + 40
fw_els, _ = ell(fw_cx, fw_cy, 65, 65, fill="#fff4e6", stroke=C_RED_LARGE, stroke_width=3)
add(fw_els)
add(txt(fw_cx, fw_cy - 18, "FERRIS", 9, True, C_RED_LARGE, "center", 100))
add(txt(fw_cx, fw_cy, "WHEEL", 9, True, C_RED_LARGE, "center", 100))
add(txt(fw_cx, fw_cy + 16, "3-Ball Lock", 8, False, C_MID, "center", 100))
# Lock slots on rim
for angle_deg in [270, 30, 150]:
    angle_rad = math.radians(angle_deg)
    lx = fw_cx + 55 * math.cos(angle_rad)
    ly = fw_cy + 55 * math.sin(angle_rad)
    slot_els, _ = ell(lx, ly, 10, 10, fill=C_GATEWAY, stroke=C_GATEWAY_SK)
    add(slot_els)
add(txt(fw_cx, fw_cy + 82, "Toy(1)", 8, False, C_MID, "center", 100))

# ---- MECH 1: BATHROOM DOOR drop target + SCOOP 1 -------------------------
scoop_x = PF_CX - 35; scoop_y = Y_SCOOP; scoop_w = 70; scoop_h = 55
scoop_els, _ = rct(scoop_x, scoop_y, scoop_w, scoop_h,
                   fill=C_BLUE, stroke=C_BLUE_SK, stroke_width=2, corner=8)
add(scoop_els)
add(txt(scoop_x + scoop_w//2, scoop_y + 16, "SCOOP 1", 9, True, "#fff", "center", scoop_w))
add(txt(scoop_x + scoop_w//2, scoop_y + 32, "Stage Scoop", 7, False, "#cde", "center", scoop_w))

# Bathroom Door (above scoop)
bd_els, _ = rct(scoop_x - 8, scoop_y - 44, scoop_w + 16, 36,
                fill=C_RED_LARGE, stroke=C_RED_L_SK, stroke_width=2, corner=3)
add(bd_els)
add(txt(scoop_x + scoop_w//2, scoop_y - 26, "BATHROOM DOOR", 8, True, "#fff", "center", 90))
add(txt(scoop_x + scoop_w//2, scoop_y - 12, "Motorized Drop", 7, False, "#fcc", "center", 90))

# ---- DROP TARGET BANK: M-A-D-D-Y -----------------------------------------
mt_x = PF_X + 50; mt_y = Y_MADDY_TOP; mt_h = 32
letters = ["M", "A", "D", "D", "Y"]
for i, ltr in enumerate(letters):
    t_els, _ = rct(mt_x + i*42, mt_y, 38, mt_h,
                   fill=C_RED_LARGE, stroke=C_RED_L_SK, stroke_width=2, corner=4)
    add(t_els)
    add(txt(mt_x + i*42 + 19, mt_y + 16, ltr, 14, True, "#fff", "center", 38))
add(txt(mt_x + 88, mt_y + 46, "TargetBank(1) — M-A-D-D-Y", 8, False, C_RED_LARGE, "center", 210))

# ---- MECH 2: GLITTER DROP SPINNER (right orbit) --------------------------
sp_eid_els, _ = ell(X_SPINNER, PF_Y + 500, 26, 40,
                    fill=C_GATEWAY, stroke=C_GATEWAY_SK, font_size=7, text_color="#fff")
add(sp_eid_els)
add(txt(X_SPINNER, PF_Y + 500, "SPIN", 7, False, "#fff", "center", 52))
add(txt(X_SPINNER, PF_Y + 548, "Glitter Drop", 8, False, C_GATEWAY, "center", 90))
add(txt(X_SPINNER, PF_Y + 561, "Spinner", 8, False, C_GATEWAY, "center", 90))

# ---- ORBITS ---------------------------------------------------------------
# Left orbit arc (habitrail to Spiral)
lo_arc_els, _ = arw(PF_X + 30, PF_Y + 560, PF_X + 30, PF_Y + 100,
                    color=C_CORE_STROKE, width=2)
add(lo_arc_els)
add(txt(PF_X + 2, PF_Y + 320, "LEFT ORBIT", 8, True, C_CORE_STROKE, "left", 60))
add(txt(PF_X + 2, PF_Y + 334, "→ Spiral", 8, False, C_MID, "left", 60))

# Right orbit arc (over Glitter Spinner)
ro_arc_els, _ = arw(PF_R - 60, PF_Y + 560, PF_R - 60, PF_Y + 110,
                    color=C_CORE_STROKE, width=2)
add(ro_arc_els)
add(txt(PF_R - 58, PF_Y + 320, "RIGHT", 8, True, C_CORE_STROKE, "left", 50))
add(txt(PF_R - 58, PF_Y + 334, "ORBIT", 8, True, C_CORE_STROKE, "left", 50))

# Wireform exit: Spiral → Right Inlane (dashed)
wf_els, _ = arw(sp_x + sp_w + 8, sp_y + sp_h - 40, PF_R - 120, Y_SLING + 60,
                color=C_MID, width=1, style="dashed")
add(wf_els)
add(txt(sp_x + sp_w + 14, sp_y + sp_h + 10, "wireform → R.Inlane", 7, False, C_LIGHT, "left", 120))

# ---- SLINGSHOTS -----------------------------------------------------------
# Left sling
sl_els, _ = rct(PF_X + 20, Y_SLING, 60, 80, fill="#eee", stroke="#888",
                stroke_width=1, corner=3)
add(sl_els)
add(txt(PF_X + 50, Y_SLING + 40, "L.SLING", 8, False, C_MID, "center", 60))

# Right sling
sr_els2, _ = rct(PF_R - 80, Y_SLING, 60, 80, fill="#eee", stroke="#888",
                 stroke_width=1, corner=3)
add(sr_els2)
add(txt(PF_R - 50, Y_SLING + 40, "R.SLING", 8, False, C_MID, "center", 60))

# ---- FLIPPERS (4 total) ---------------------------------------------------
# Lower left
lfl_els, _ = rct(PF_X + 50, Y_FLIPPER, 120, 22, fill=C_TEAL, stroke=C_TEAL_SK,
                 stroke_width=2, corner=8)
add(lfl_els)
add(txt(PF_X + 110, Y_FLIPPER + 11, "LEFT MAIN (3\")", 9, False, "#fff", "center", 120))

# Lower right
rfl_els, _ = rct(PF_R - 170, Y_FLIPPER, 120, 22, fill=C_TEAL, stroke=C_TEAL_SK,
                 stroke_width=2, corner=8)
add(rfl_els)
add(txt(PF_R - 110, Y_FLIPPER + 11, "RIGHT MAIN (3\")", 9, False, "#fff", "center", 120))

# Drain gap
add(txt(PF_CX, Y_FLIPPER + 30, "▼ DRAIN ▼", 10, True, "#c00", "center", 80))

# ---- EUPHORIA METER (10 inserts along left rail) -------------------------
meter_y_start = Y_MADDY_TOP + 100
add(txt(PF_X - 68, meter_y_start - 14, "EUPHORIA", 8, True, C_ACCENT_PK, "left", 70))
add(txt(PF_X - 68, meter_y_start, "METER", 8, True, C_ACCENT_PK, "left", 70))
for i in range(10):
    fill = C_PINK if i < 7 else C_ACCENT_PK
    m_els, _ = ell(PF_X - 34, meter_y_start + 20 + i * 28, 12, 9,
                   fill=fill, stroke=C_ACCENT_PK)
    add(m_els)
    if i == 9:
        add(txt(PF_X - 20, meter_y_start + 20 + i*28, "WIZARD", 7, True, C_ACCENT_PK, "left", 60))

# ---- LEGEND ---------------------------------------------------------------
leg_x = PF_R + 20; leg_y = PF_Y + 80; leg_row = 22

add(txt(leg_x, leg_y - 20, "LEGEND", 11, True, C_DARK, "left", 140))

legend_items = [
    (C_CORE_FILL,   C_CORE_STROKE,  "Ramp / Sub-Playfield"),
    (C_SHOP_FILL,   C_SHOP_STROKE,  "Toy Mechanism"),
    (C_TEAL,        C_TEAL_SK,      "Flipper"),
    (C_BLUE,        C_BLUE_SK,      "Scoop / Hole"),
    (C_RED_LARGE,   C_RED_L_SK,     "Drop Target"),
    (C_ORANGE,      C_ORANGE_SK,    "Bumper"),
    (C_GATEWAY,     C_GATEWAY_SK,   "Spinner / Opto"),
    (C_ACCENT_PK,   C_ACCENT_PK,    "Euphoria Meter"),
]
for i, (fill, stroke, label) in enumerate(legend_items):
    ry = leg_y + i * leg_row
    sw_els, _ = rct(leg_x, ry, 16, 14, fill=fill, stroke=stroke, stroke_width=1, corner=2)
    add(sw_els)
    add(txt(leg_x + 22, ry + 7, label, 10, False, C_DARK, "left", 160))

# Arrow legend
ary = leg_y + len(legend_items) * leg_row + 8
arw_s, _ = arw(leg_x, ary + 7, leg_x + 16, ary + 7, color=C_CORE_STROKE, width=2)
add(arw_s)
add(txt(leg_x + 22, ary + 7, "Ball path (confirmed)", 10, False, C_DARK, "left", 160))

arw_d, _ = arw(leg_x, ary + 29, leg_x + 16, ary + 29, color=C_MID, width=1, style="dashed")
add(arw_d)
add(txt(leg_x + 22, ary + 29, "Ball path (inferred/virtual)", 10, False, C_DARK, "left", 160))

# ---- MODE CHEAT SHEET (right side, lower) ---------------------------------
cs_x = leg_x; cs_y = ary + 60
add(txt(cs_x, cs_y, "MODES", 11, True, C_DARK, "left", 140))
modes = [
    ("Cassie's Meltdown",  "M-A-D-D-Y → Scoop jackpot (20s)"),
    ("Jacob's Party",      "Scoop → Spinner 3x (45s)"),
    ("Fezco's Run",        "Scoop → Orbits 3x (45s)"),
    ("Carnival Multiball", "3× Ferris Lock → 3-ball"),
    ("All For Us (WIZ)",   "Euphoria Meter 100% → 3-ball 4x"),
]
for i, (name, desc) in enumerate(modes):
    my = cs_y + 20 + i * 36
    add(txt(cs_x, my, name, 9, True, C_PURPLE, "left", 200))
    add(txt(cs_x, my + 14, desc, 8, False, C_MID, "left", 200))

# ---------------------------------------------------------------------------
# Compute bounding box
# ---------------------------------------------------------------------------
xs = [e["x"] for e in elements if "x" in e]
ys = [e["y"] for e in elements if "y" in e]
ws = [e.get("width", 0) for e in elements if "x" in e]
hs = [e.get("height", 0) for e in elements if "y" in e]
x_min = min(xs)
y_min = min(ys)
x_max = max(x + w for x, w in zip(xs, ws))
y_max = max(y + h for y, h in zip(ys, hs))
print(f"Elements: {len(elements)}")
print(f"Bounding box: ({x_min:.0f}, {y_min:.0f}) → ({x_max:.0f}, {y_max:.0f})")
print(f"Canvas size: {x_max - x_min:.0f} × {y_max - y_min:.0f}")

# ---------------------------------------------------------------------------
# Build Excalidraw JSON
# ---------------------------------------------------------------------------
diagram = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": elements,
    "appState": {
        "gridSize": None,
        "viewBackgroundColor": "#ffffff"
    },
    "files": {}
}

# Validate
json_str = json.dumps(diagram, indent=2)

# ---------------------------------------------------------------------------
# Collect text labels for the ## Text Elements block
# ---------------------------------------------------------------------------
label_lines = []
for e in elements:
    if e.get("type") == "text" and e.get("text","").strip():
        label_lines.append(e["text"].strip())

# ---------------------------------------------------------------------------
# Write Obsidian Excalidraw wrapper
# ---------------------------------------------------------------------------
out_dir  = os.path.dirname(os.path.abspath(__file__))
out_path = os.path.join(out_dir, "euphoria-playfield.md")

wrapper = f"""---

excalidraw-plugin: parsed
tags: [excalidraw]

---
==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==

# Excalidraw Data

## Text Elements
{chr(10).join(label_lines)}

%%
## Drawing
```json
{json_str}
```
%%
"""

with open(out_path, "w", encoding="utf-8") as f:
    f.write(wrapper)

print(f"\nWrote: {out_path}")
print("Validating JSON embed...")
json.loads(json_str)
print("JSON valid.")
