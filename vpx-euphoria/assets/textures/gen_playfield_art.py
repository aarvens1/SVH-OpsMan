"""
Generate Euphoria (LE) playfield diffuse texture.
Output: playfield_diffuse.png (2048 x 4096, RGBA)

Color scheme: Purple / Cyan / Deep Pink / Near-black background
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math, os

# ---------------------------------------------------------------------------
# Canvas setup
# ---------------------------------------------------------------------------
W, H = 2048, 4096
img  = Image.new("RGBA", (W, H), (0, 0, 0, 255))
draw = ImageDraw.Draw(img)

# VPX table units → pixel scale (table is 2025 × 4200 VPX units)
SX = W / 2025
SY = H / 4200

def px(vx, vy):
    """Convert VPX unit coord to pixel coord."""
    return (int(vx * SX), int(vy * SY))

def px_r(vr):
    """Convert VPX radius to pixel radius."""
    return int(vr * SX)

# ---------------------------------------------------------------------------
# Color palette
# ---------------------------------------------------------------------------
BG_DARK    = (8,  4,  18, 255)       # Near-black purple
C_PURPLE   = (128, 0, 128, 255)
C_PURPLE_L = (160, 60, 200, 255)
C_CYAN     = (0,  210, 230, 255)
C_PINK     = (255, 20, 147, 255)
C_PINK_D   = (180, 10, 100, 255)
C_GOLD     = (220, 170,  30, 255)
C_WHITE    = (255, 255, 255, 255)
C_GREY     = (80,  70,  90, 255)
C_LANE     = (25,  15,  40, 255)     # Lane inlay color
C_INSERT_R = (255,  30,  30, 180)    # Insert ring
C_INSERT_C = (30,  220, 240, 180)
C_INSERT_P = (200,  50, 255, 180)
C_INLANE   = (30,   60, 100,  80)    # Inlane fill
C_GLITTER  = (255, 210, 230,  60)    # Glitter overlay

# ---------------------------------------------------------------------------
# 1. BACKGROUND — dark radial gradient with purple center glow
# ---------------------------------------------------------------------------
for y in range(H):
    for x in range(W):
        # Radial distance from center-top
        cx, cy = W * 0.5, H * 0.15
        dist = math.hypot(x - cx, y - cy) / math.hypot(W, H)
        glow = max(0, 1.0 - dist * 1.6)
        r = int(8  + glow * 60)
        g = int(4  + glow * 8)
        b = int(18 + glow * 80)
        img.putpixel((x, y), (r, g, b, 255))

# ---------------------------------------------------------------------------
# 2. PLAYFIELD BORDER (thin bright line inside edge)
# ---------------------------------------------------------------------------
margin = 30
draw.rectangle([margin, margin, W - margin, H - margin],
               outline=(100, 60, 140, 220), width=4)
draw.rectangle([margin + 8, margin + 8, W - margin - 8, H - margin - 8],
               outline=(60, 30, 90, 120), width=2)

# Shooter lane right wall
draw.line([W - 80, margin, W - 80, H - 300], fill=(70, 50, 100, 200), width=3)
draw.line([W - 52, margin, W - 52, H - 300], fill=(50, 35, 75, 160), width=2)

# ---------------------------------------------------------------------------
# 3. LANE INLAYS — painted lane strips
# ---------------------------------------------------------------------------
def lane_strip(x1, y1, x2, y2, w, color, alpha=90):
    """Draw a filled lane strip between two points with given width."""
    angle = math.atan2(y2 - y1, x2 - x1)
    perp  = angle + math.pi / 2
    dx, dy = math.cos(perp) * w / 2, math.sin(perp) * w / 2
    poly = [
        (x1 + dx, y1 + dy), (x2 + dx, y2 + dy),
        (x2 - dx, y2 - dy), (x1 - dx, y1 - dy)
    ]
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.polygon(poly, fill=(*color[:3], alpha))
    img.alpha_composite(overlay)

# Left orbit lane
lane_strip(110, H*0.85, 110, H*0.12, 60, C_CYAN[:3], 55)
# Right orbit lane
lane_strip(W-130, H*0.85, W-130, H*0.12, 60, C_CYAN[:3], 45)
# Center stage ramp
lane_strip(W*0.47, H*0.85, W*0.47, H*0.30, 70, C_PURPLE[:3], 60)
# Ferris ramp
lane_strip(W*0.77, H*0.90, W*0.77, H*0.38, 60, C_PINK[:3], 50)
# Left inlane
lane_strip(280, H*0.90, 280, H*0.73, 40, C_CYAN[:3], 50)
# Right inlane
lane_strip(W-280, H*0.90, W-280, H*0.73, 40, C_CYAN[:3], 50)

# ---------------------------------------------------------------------------
# 4. ORBIT ARC (top connecting arch)
# ---------------------------------------------------------------------------
overlay_arc = Image.new("RGBA", (W, H), (0, 0, 0, 0))
da = ImageDraw.Draw(overlay_arc)
# Outer arch
da.arc([80, 60, W-80, 600], start=200, end=340, fill=(*C_CYAN[:3], 140), width=5)
# Inner arch
da.arc([140, 100, W-140, 520], start=200, end=340, fill=(*C_PURPLE[:3], 90), width=3)
img.alpha_composite(overlay_arc)

# ---------------------------------------------------------------------------
# 5. SPIRAL SUB-PLAYFIELD (upper left zone)
# ---------------------------------------------------------------------------
sp_rect = [margin+10, margin+10, 440, 600]
overlay_sp = Image.new("RGBA", (W, H), (0, 0, 0, 0))
dsp = ImageDraw.Draw(overlay_sp)
# Zone fill
dsp.rounded_rectangle(sp_rect, radius=30, fill=(70, 30, 120, 60), outline=(*C_PURPLE_L[:3], 160), width=3)
# Tight loop ellipse
cx_sp, cy_sp = 220, 350
dsp.ellipse([cx_sp-110, cy_sp-120, cx_sp+110, cy_sp+120],
            outline=(*C_PURPLE[:3], 180), width=4)
dsp.ellipse([cx_sp-70, cy_sp-80, cx_sp+70, cy_sp+80],
            outline=(*C_PURPLE_L[:3], 100), width=2)
img.alpha_composite(overlay_sp)

# Mini flipper bars (visual only)
draw.rounded_rectangle([100, 530, 220, 548], radius=8,
                       fill=(0, 180, 200, 200), outline=(*C_CYAN[:3], 255), width=2)
draw.rounded_rectangle([260, 530, 390, 548], radius=8,
                       fill=(0, 180, 200, 200), outline=(*C_CYAN[:3], 255), width=2)

# ---------------------------------------------------------------------------
# 6. BUMPER CLUSTER — Prom Lights (upper center)
# ---------------------------------------------------------------------------
bumper_positions = [(920, 900), (1100, 900), (1010, 750)]
bumper_colors    = [C_PINK, C_CYAN, C_PURPLE_L]
for (bx, by), bc in zip(bumper_positions, bumper_colors):
    bpx, bpy = px(bx, by)
    br       = px_r(60)
    # Glow halo
    glow_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_overlay)
    for g_r in range(br + 40, br, -6):
        alpha = max(0, int(60 * (1 - (g_r - br) / 40)))
        gd.ellipse([bpx-g_r, bpy-g_r, bpx+g_r, bpy+g_r],
                   fill=(*bc[:3], alpha))
    img.alpha_composite(glow_overlay)
    # Cap
    draw.ellipse([bpx-br, bpy-br, bpx+br, bpy+br],
                 fill=(*bc[:3], 220), outline=(255, 255, 255, 180), width=3)
    # Ring
    draw.ellipse([bpx-br+8, bpy-br+8, bpx+br-8, bpy+br-8],
                 fill=(0, 0, 0, 0), outline=(*bc[:3], 120), width=2)

# ---------------------------------------------------------------------------
# 7. FERRIS WHEEL TOY AREA (right)
# ---------------------------------------------------------------------------
fw_cx, fw_cy = px(1620, 2000)
fw_r = px_r(100)
fw_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
fw_d = ImageDraw.Draw(fw_overlay)
# Outer ring
fw_d.ellipse([fw_cx-fw_r, fw_cy-fw_r, fw_cx+fw_r, fw_cy+fw_r],
             fill=(80, 20, 10, 80), outline=(*C_PINK[:3], 200), width=5)
# Spokes
for angle_deg in [0, 60, 120, 180, 240, 300]:
    angle_r = math.radians(angle_deg)
    sx = fw_cx + int(math.cos(angle_r) * fw_r)
    sy = fw_cy + int(math.sin(angle_r) * fw_r)
    fw_d.line([fw_cx, fw_cy, sx, sy], fill=(*C_PINK[:3], 150), width=2)
# Lock slots
for angle_deg in [270, 30, 150]:
    angle_r = math.radians(angle_deg)
    lx = fw_cx + int(math.cos(angle_r) * fw_r)
    ly = fw_cy + int(math.sin(angle_r) * fw_r)
    fw_d.ellipse([lx-18, ly-18, lx+18, ly+18],
                 fill=(*C_GOLD[:3], 200), outline=(255, 255, 255, 180), width=2)
# Hub
fw_d.ellipse([fw_cx-20, fw_cy-20, fw_cx+20, fw_cy+20],
             fill=(*C_GOLD[:3], 255))
img.alpha_composite(fw_overlay)

# ---------------------------------------------------------------------------
# 8. DROP TARGET BANK — M-A-D-D-Y
# ---------------------------------------------------------------------------
dt_y_vpx = 1780
for i, ltr in enumerate(["M", "A", "D", "D", "Y"]):
    dt_x_vpx = 420 + i * 140
    dtx, dty = px(dt_x_vpx, dt_y_vpx)
    dw, dh = px_r(70), px_r(50)
    draw.rounded_rectangle([dtx - dw//2, dty - dh//2, dtx + dw//2, dty + dh//2],
                            radius=6, fill=(160, 20, 20, 220),
                            outline=(220, 50, 50, 255), width=3)
    # Letter — use default font, approximate centering
    draw.text((dtx - 8, dty - 12), ltr, fill=C_WHITE, font=None)

# ---------------------------------------------------------------------------
# 9. BATHROOM DOOR (above scoop, center)
# ---------------------------------------------------------------------------
bd_cx, bd_cy = px(1012, 2100)
bd_w, bd_h = px_r(120), px_r(55)
draw.rounded_rectangle([bd_cx-bd_w//2, bd_cy-bd_h//2,
                         bd_cx+bd_w//2, bd_cy+bd_h//2],
                        radius=8, fill=(100, 40, 15, 200),
                        outline=(200, 100, 50, 240), width=4)
# Door panel detail lines
for dy in range(-bd_h//2+10, bd_h//2-5, 12):
    draw.line([bd_cx-bd_w//2+10, bd_cy+dy, bd_cx+bd_w//2-10, bd_cy+dy],
              fill=(160, 80, 40, 120), width=1)
# Handle
draw.ellipse([bd_cx+bd_w//2-22, bd_cy-6, bd_cx+bd_w//2-8, bd_cy+6],
             fill=(220, 180, 60, 240))

# ---------------------------------------------------------------------------
# 10. SCOOP 1
# ---------------------------------------------------------------------------
sc_cx, sc_cy = px(1012, 2200)
sc_r = px_r(55)
draw.ellipse([sc_cx-sc_r, sc_cy-sc_r, sc_cx+sc_r, sc_cy+sc_r],
             fill=(20, 40, 80, 240), outline=(*C_CYAN[:3], 220), width=4)
draw.ellipse([sc_cx-sc_r+12, sc_cy-sc_r+12,
              sc_cx+sc_r-12, sc_cy+sc_r-12],
             fill=(0, 0, 0, 200), outline=(*C_PURPLE[:3], 120), width=2)

# ---------------------------------------------------------------------------
# 11. GLITTER DROP SPINNER (right orbit lane)
# ---------------------------------------------------------------------------
sp_gx, sp_gy = px(1830, 1550)
draw.ellipse([sp_gx-30, sp_gy-45, sp_gx+30, sp_gy+45],
             fill=(*C_PURPLE[:3], 200), outline=(*C_PINK[:3], 220), width=3)
# Spinner blade lines
draw.line([sp_gx-25, sp_gy, sp_gx+25, sp_gy], fill=C_PINK, width=3)
draw.line([sp_gx, sp_gy-40, sp_gx, sp_gy+40], fill=C_CYAN, width=2)

# ---------------------------------------------------------------------------
# 12. INSERT RINGS — shot arrows & mode inserts
# ---------------------------------------------------------------------------
def insert_ring(vx, vy, color=C_INSERT_C, r=28, filled=False):
    ix, iy = px(vx, vy)
    ir = px_r(r)
    if filled:
        draw.ellipse([ix-ir, iy-ir, ix+ir, iy+ir], fill=(*color[:3], 120),
                     outline=(*color[:3], 220), width=3)
    else:
        draw.ellipse([ix-ir, iy-ir, ix+ir, iy+ir], fill=(0, 0, 0, 0),
                     outline=(*color[:3], 200), width=3)

# Orbit inserts
for y_pos in [600, 800, 1100, 1400, 1700]:
    insert_ring(200, y_pos, C_CYAN)       # Left orbit
    insert_ring(1820, y_pos, C_CYAN)      # Right orbit

# Ramp inserts
for y_pos in [500, 700, 1000, 1300]:
    insert_ring(1012, y_pos, C_PURPLE)    # Stage ramp center
    insert_ring(1560, y_pos + 100, C_PINK) # Ferris ramp

# Spiral inserts
for i, (ix, iy) in enumerate([(400, 220), (300, 350), (220, 480), (340, 430)]):
    insert_ring(ix, iy, C_PURPLE_L, r=20)

# Euphoria meter inserts (left rail)
for i in range(10):
    meter_c = C_PINK if i < 7 else (200, 10, 80, 255)
    insert_ring(180, 1900 + i * 60, meter_c, r=18, filled=True)

# Bumper inserts below bumper cluster
for bx, by in [(820, 1050), (1010, 1050), (1200, 1050)]:
    insert_ring(bx, by, C_PINK, r=22, filled=True)

# Mode start insert at scoop
insert_ring(1012, 2200, C_GOLD, r=45)

# Slingshot inserts
insert_ring(350, 3100, C_PINK, r=18, filled=True)
insert_ring(1675, 3100, C_PINK, r=18, filled=True)

# ---------------------------------------------------------------------------
# 13. SLINGSHOTS (visual shape only)
# ---------------------------------------------------------------------------
def sling(x1, y1, x2, y2, x3, y3, color):
    sling_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sling_overlay)
    sd.polygon([px(x1,y1), px(x2,y2), px(x3,y3)],
               fill=(*color[:3], 60), outline=(*color[:3], 180))
    img.alpha_composite(sling_overlay)

sling(230, 2850, 230, 3300, 460, 3300, C_PINK[:3])   # Left sling
sling(1795, 2850, 1795, 3300, 1565, 3300, C_PINK[:3]) # Right sling

# ---------------------------------------------------------------------------
# 14. FLIPPER AREAS (visual indicator)
# ---------------------------------------------------------------------------
# Left flipper
draw.rounded_rectangle([px(350, 3720)[0], px(350, 3720)[1],
                         px(700, 3720)[0]+1, px(350, 3720)[1]+22],
                        radius=10, fill=(*C_CYAN[:3], 180),
                        outline=(*C_CYAN[:3], 255), width=3)
# Right flipper
draw.rounded_rectangle([px(1325, 3720)[0], px(1325, 3720)[1],
                         px(1675, 3720)[0]+1, px(1325, 3720)[1]+22],
                        radius=10, fill=(*C_CYAN[:3], 180),
                        outline=(*C_CYAN[:3], 255), width=3)

# ---------------------------------------------------------------------------
# 15. LOGO AREA (top center)
# ---------------------------------------------------------------------------
logo_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(logo_overlay)
# Large title block
ld.rounded_rectangle([W//2-340, 30, W//2+340, 160],
                      radius=18, fill=(40, 0, 60, 200),
                      outline=(*C_PINK[:3], 220), width=4)
# Glow border
for expand in range(10, 0, -2):
    ld.rounded_rectangle([W//2-340-expand, 30-expand, W//2+340+expand, 160+expand],
                          radius=18+expand, outline=(*C_PINK[:3], 15*expand), width=1)
img.alpha_composite(logo_overlay)

# EUPHORIA text (large, centered)
draw.text((W//2 - 200, 58), "EUPHORIA", fill=C_WHITE, font=None)
draw.text((W//2 - 100, 108), "(LIMITED EDITION)", fill=(*C_PINK[:3], 200), font=None)

# ---------------------------------------------------------------------------
# 16. GLITTER OVERLAY — scattered sparkle dots
# ---------------------------------------------------------------------------
import random
random.seed(42)
glitter_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd2 = ImageDraw.Draw(glitter_overlay)
for _ in range(2200):
    gx = random.randint(60, W-60)
    gy = random.randint(60, H-60)
    gr = random.randint(1, 4)
    ga = random.randint(20, 100)
    gc = random.choice([C_PINK, C_CYAN, C_PURPLE_L, C_WHITE])
    gd2.ellipse([gx-gr, gy-gr, gx+gr, gy+gr], fill=(*gc[:3], ga))
img.alpha_composite(glitter_overlay)

# ---------------------------------------------------------------------------
# 17. LANE ARROWS (shot directions)
# ---------------------------------------------------------------------------
def arrow(vx, vy, direction="up", color=C_CYAN, size=40):
    ax, ay = px(vx, vy)
    s = int(size * SX)
    pts = {
        "up":    [(ax, ay-s), (ax-s//2, ay+s//3), (ax+s//2, ay+s//3)],
        "down":  [(ax, ay+s), (ax-s//2, ay-s//3), (ax+s//2, ay-s//3)],
        "right": [(ax+s, ay), (ax-s//3, ay-s//2), (ax-s//3, ay+s//2)],
        "left":  [(ax-s, ay), (ax+s//3, ay-s//2), (ax+s//3, ay+s//2)],
    }
    arr_overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ad = ImageDraw.Draw(arr_overlay)
    ad.polygon(pts[direction], fill=(*color[:3], 160), outline=(*color[:3], 220))
    img.alpha_composite(arr_overlay)

arrow(200,  1400, "up", C_CYAN)       # Left orbit
arrow(1820, 1400, "up", C_CYAN)       # Right orbit
arrow(1012, 1000, "up", C_PURPLE_L)   # Stage ramp
arrow(1560, 1200, "up", C_PINK)       # Ferris ramp
arrow(1830, 1550, "up", C_PINK)       # Spinner

# ---------------------------------------------------------------------------
# 18. FINAL POST-PROCESSING — slight vignette
# ---------------------------------------------------------------------------
vignette = Image.new("RGBA", (W, H), (0, 0, 0, 0))
vd = ImageDraw.Draw(vignette)
for step in range(0, 180, 12):
    alpha = int(step * 0.9)
    vd.rectangle([step, step, W-step, H-step],
                 outline=(0, 0, 0, alpha), width=12)
img.alpha_composite(vignette)

# Convert to RGB for PNG output
out = img.convert("RGB")
out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "playfield_diffuse.png")
out.save(out_path, "PNG", optimize=False)

w, h = out.size
print(f"Written: {out_path}")
print(f"Size: {w} x {h} pixels")
print(f"Mode: RGB (import as playfield_diffuse in VPX Image Manager)")
