"""
Generate Euphoria (LE) B2S backglass art frames.
Output: bg_frame_1.png, bg_frame_2.png, bg_wizard_1-4.png, bg_mb_1.png
        + all lamp overlay PNGs
Canvas: 1280 x 1024
"""

from PIL import Image, ImageDraw, ImageFilter
import math, os, random

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = 1280, 1024
random.seed(99)

C_PURPLE  = (128, 0, 128)
C_PURPLE2 = (80, 0, 100)
C_CYAN    = (0, 210, 230)
C_PINK    = (255, 20, 147)
C_BLACK   = (4, 2, 10)
C_WHITE   = (255, 255, 255)
C_GOLD    = (220, 170, 30)

def save(img, name):
    p = os.path.join(OUT, name)
    img.save(p, "PNG")
    print(f"  {name}  {img.size}")

def make_base(glow_color=(80, 0, 120)):
    """Dark background with center glow."""
    img = Image.new("RGBA", (W, H))
    for y in range(H):
        for x in range(W):
            cx, cy = W * 0.5, H * 0.3
            d = math.hypot(x - cx, y - cy) / math.hypot(W * 0.6, H * 0.6)
            t = max(0.0, 1.0 - d)
            r = int(C_BLACK[0] + t * glow_color[0])
            g = int(C_BLACK[1] + t * glow_color[1])
            b = int(C_BLACK[2] + t * glow_color[2])
            img.putpixel((x, y), (min(255,r), min(255,g), min(255,b), 255))
    return img

def add_title(img, glow_alpha=180):
    """Draw EUPHORIA title on the backglass."""
    d = ImageDraw.Draw(img)
    cx = W // 2
    # Glow box behind title
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for expand in range(30, 0, -3):
        a = int(glow_alpha * (30 - expand) / 30 * 0.6)
        od.rounded_rectangle([cx-380-expand, 80-expand, cx+380+expand, 240+expand],
                              radius=20+expand, fill=(*C_PINK, a))
    img.alpha_composite(overlay)

    # Title box
    d.rounded_rectangle([cx-380, 80, cx+380, 240],
                        radius=20, fill=(30, 5, 50, 220),
                        outline=(*C_PINK, 220), width=6)
    # Inner glow line
    d.rounded_rectangle([cx-370, 90, cx+370, 230],
                        radius=16, fill=(0,0,0,0),
                        outline=(*C_PURPLE, 120), width=2)
    # Text approximation using large font
    d.text((cx - 190, 110), "EUPHORIA", fill=C_WHITE, font=None)
    d.text((cx - 120, 180), "LIMITED EDITION", fill=(*C_PINK, 220), font=None)
    return img

def add_ferris_wheel(img, spin_angle=0):
    """Draw the Ferris Wheel graphic center-left."""
    d = ImageDraw.Draw(img)
    cx, cy = 280, 580
    r = 160
    # Outer rim
    d.ellipse([cx-r, cy-r, cx+r, cy+r],
              outline=(*C_PINK, 200), width=6)
    d.ellipse([cx-r+15, cy-r+15, cx+r-15, cy+r-15],
              outline=(*C_PURPLE, 120), width=3)
    # Spokes (rotated by spin_angle)
    for i in range(6):
        angle = math.radians(spin_angle + i * 60)
        sx = cx + int(math.cos(angle) * r)
        sy = cy + int(math.sin(angle) * r)
        d.line([cx, cy, sx, sy], fill=(*C_PINK, 150), width=2)
    # Gondola dots
    for i in range(3):
        angle = math.radians(spin_angle + i * 120)
        gx = cx + int(math.cos(angle) * (r - 15))
        gy = cy + int(math.sin(angle) * (r - 15))
        d.ellipse([gx-18, gy-18, gx+18, gy+18],
                  fill=(*C_GOLD, 230), outline=(255,255,200,200), width=3)
    # Hub
    d.ellipse([cx-22, cy-22, cx+22, cy+22],
              fill=(*C_GOLD, 255))
    d.text((cx - 50, cy + r + 12), "FERRIS WHEEL", fill=(*C_CYAN, 200), font=None)
    return img

def add_characters(img):
    """Placeholder character silhouettes (right side of backglass)."""
    d = ImageDraw.Draw(img)
    # Zone label
    d.rounded_rectangle([820, 290, 1240, 830],
                        radius=16, fill=(20, 5, 35, 160),
                        outline=(*C_PURPLE, 140), width=3)
    d.text((910, 310), "M A D D Y", fill=(*C_PINK, 240), font=None)
    d.text((895, 340), "EUPHORIA", fill=(*C_CYAN, 160), font=None)
    # Simple silhouette shapes
    # Figure 1
    d.ellipse([880, 380, 940, 440], fill=(*C_PINK, 180))   # head
    d.rectangle([880, 440, 940, 600], fill=(*C_PURPLE, 160))  # body
    # Figure 2
    d.ellipse([980, 360, 1040, 420], fill=(*C_CYAN, 180))
    d.rectangle([980, 420, 1040, 580], fill=(*C_PURPLE2, 160))
    # Figure 3
    d.ellipse([1080, 380, 1140, 440], fill=(*C_GOLD, 180))
    d.rectangle([1080, 440, 1140, 600], fill=(60, 30, 10, 160))
    d.text((870, 620), "ALL FOR US", fill=(*C_GOLD, 200), font=None)
    return img

def add_glitter(img, count=1200):
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x = random.randint(0, W-1)
        y = random.randint(0, H-1)
        r = random.randint(1, 3)
        a = random.randint(30, 140)
        c = random.choice([C_PINK, C_CYAN, C_WHITE, C_PURPLE])
        d.ellipse([x-r, y-r, x+r, y+r], fill=(*c, a))
    return img

def add_score_area(img):
    d = ImageDraw.Draw(img)
    # Player 1 score placeholder
    d.rounded_rectangle([30, 50, 450, 150],
                        radius=8, fill=(10, 0, 20, 200),
                        outline=(*C_PINK, 180), width=3)
    d.text((48, 68), "00000000", fill=(*C_PINK, 220), font=None)
    d.text((48, 110), "PLAYER 1", fill=(*C_PURPLE, 160), font=None)
    # Ball indicator
    d.rounded_rectangle([570, 890, 680, 940],
                        radius=6, fill=(10, 0, 20, 200),
                        outline=(*C_CYAN, 180), width=2)
    d.text((586, 905), "BALL", fill=(*C_CYAN, 200), font=None)
    # Multiplier strip
    for i, label in enumerate(["1x","2x","3x","4x"]):
        mx = 600 + i * 62
        d.rounded_rectangle([mx, 895, mx+50, 935],
                            radius=4, fill=(20, 0, 40, 200),
                            outline=(*C_PURPLE, 140), width=2)
        d.text((mx+12, 908), label, fill=(*C_PURPLE, 180), font=None)
    return img

def add_vignette(img):
    overlay = Image.new("RGBA", (W, H), (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    for s in range(0, 120, 10):
        a = int(s * 1.2)
        d.rectangle([s, s, W-s, H-s], outline=(0,0,0,a), width=10)
    img.alpha_composite(overlay)
    return img

# ── FRAME 1 (attract, normal glow) ──────────────────────────────────────
print("bg_frame_1...")
f1 = make_base((80, 0, 120))
f1 = add_ferris_wheel(f1, 0)
f1 = add_title(f1, 180)
f1 = add_characters(f1)
f1 = add_score_area(f1)
f1 = add_glitter(f1, 800)
f1 = add_vignette(f1)
save(f1, "bg_frame_1.png")

# ── FRAME 2 (attract, brighter pulse) ─────────────────────────────────
print("bg_frame_2...")
f2 = make_base((120, 10, 160))
f2 = add_ferris_wheel(f2, 20)
f2 = add_title(f2, 230)
f2 = add_characters(f2)
f2 = add_score_area(f2)
f2 = add_glitter(f2, 1000)
f2 = add_vignette(f2)
save(f2, "bg_frame_2.png")

# ── WIZARD FRAMES (color sweep) ────────────────────────────────────────
print("Wizard frames...")
wizard_colors = [
    (120, 0, 180),   # purple
    (0,  80, 200),   # blue
    (200, 0, 80),    # hot pink
    (0, 160, 160),   # teal
]
for i, gc in enumerate(wizard_colors):
    wf = make_base(gc)
    wf = add_ferris_wheel(wf, i * 45)
    wf = add_title(wf, 255)
    wf = add_characters(wf)
    wf = add_score_area(wf)
    wf = add_glitter(wf, 1400)
    # Extra full-field glow overlay for wizard
    overlay = Image.new("RGBA", (W, H), (0,0,0,0))
    od = ImageDraw.Draw(overlay)
    od.rectangle([0, 0, W, H], fill=(*gc, 40))
    wf.alpha_composite(overlay)
    wf = add_vignette(wf)
    save(wf, f"bg_wizard_{i+1}.png")

# ── MULTIBALL STROBE FRAME ────────────────────────────────────────────
print("Multiball strobe frame...")
mb = make_base((160, 0, 60))
d = ImageDraw.Draw(mb)
mb = add_ferris_wheel(mb, 90)
mb = add_title(mb, 200)
# 3-ball indicators
for bx in [490, 590, 690]:
    d.ellipse([bx-25, 570-25, bx+25, 570+25],
              fill=(*C_GOLD, 220), outline=(255,255,255,200), width=4)
d.text((470, 608), "CARNIVAL MULTIBALL", fill=(*C_GOLD, 220), font=None)
mb = add_glitter(mb, 1600)
mb = add_vignette(mb)
save(mb, "bg_mb_1.png")

# ── LAMP OVERLAY TILES (small PNGs) ────────────────────────────────────
print("Lamp tiles...")

def lamp_tile(w, h, fill_off, fill_on, glow_on=None, name_off="", name_on=""):
    # Off state
    off = Image.new("RGBA", (w, h), (0,0,0,0))
    d = ImageDraw.Draw(off)
    d.rounded_rectangle([2, 2, w-3, h-3], radius=4, fill=fill_off)
    save(off, name_off)
    # On state
    on = Image.new("RGBA", (w, h), (0,0,0,0))
    d = ImageDraw.Draw(on)
    if glow_on:
        for gr in range(max(w,h)//2 + 10, max(w,h)//2, -2):
            ga = int(80 * (max(w,h)//2 + 10 - gr) / 10)
            d.ellipse([w//2-gr, h//2-gr, w//2+gr, h//2+gr],
                      fill=(*glow_on, ga))
    d.rounded_rectangle([2, 2, w-3, h-3], radius=4, fill=fill_on)
    save(on, name_on)

# Wizard lamp (440x200 tile)
wo = Image.new("RGBA", (440, 200), (0,0,0,0))
ImageDraw.Draw(wo).rounded_rectangle([4,4,436,196], radius=16,
    fill=(30, 5, 50, 180), outline=(80, 0, 100, 160), width=3)
save(wo, "lamp_wizard_off.png")

wn = Image.new("RGBA", (440, 200), (0,0,0,0))
wd = ImageDraw.Draw(wn)
for gr in range(120, 60, -8):
    ga = int(100 * (120 - gr) / 60)
    wd.ellipse([220-gr, 100-gr, 220+gr, 100+gr], fill=(*C_PINK, ga))
wd.rounded_rectangle([4,4,436,196], radius=16,
    fill=(80, 0, 100, 220), outline=(*C_PINK, 240), width=4)
wd.text((80, 80), "ALL FOR US", fill=(255,255,255,240), font=None)
save(wn, "lamp_wizard_on.png")

# Lock segment (60x60)
lamp_tile(60, 60,
    fill_off=(20, 10, 40, 180), fill_on=(*C_GOLD, 230), glow_on=C_GOLD,
    name_off="lock_seg_off.png", name_on="lock_seg_on.png")

# Mode active lamp (120x60)
lamp_tile(120, 60,
    fill_off=(20, 5, 35, 160), fill_on=(*C_PURPLE, 220), glow_on=C_PURPLE,
    name_off="mode_off.png", name_on="mode_on.png")

# Meter segments (30x30)
lamp_tile(30, 30,
    fill_off=(15, 5, 25, 180), fill_on=(*C_PINK, 220), glow_on=C_PINK,
    name_off="meter_off.png", name_on="meter_on.png")

# Meter hot (near-wizard)
hot = Image.new("RGBA", (30, 30), (0,0,0,0))
hd = ImageDraw.Draw(hot)
hd.rounded_rectangle([2,2,28,28], radius=4, fill=(200, 10, 80, 230))
for gr in range(20, 10, -3):
    ga = int(80 * (20-gr)/10)
    hd.ellipse([15-gr, 15-gr, 15+gr, 15+gr], fill=(200,10,80,ga))
save(hot, "meter_hot.png")

# Meter wizard (top segment, full glow)
wiz = Image.new("RGBA", (30, 30), (0,0,0,0))
wzd = ImageDraw.Draw(wiz)
for gr in range(25, 8, -3):
    ga = int(120 * (25-gr)/17)
    wzd.ellipse([15-gr, 15-gr, 15+gr, 15+gr], fill=(*C_GOLD, ga))
wzd.rounded_rectangle([2,2,28,28], radius=4, fill=(*C_GOLD, 240))
save(wiz, "meter_wizard.png")

# Multiplier indicators (50x40)
lamp_tile(50, 40,
    fill_off=(15, 5, 30, 160), fill_on=(*C_CYAN, 200), glow_on=C_CYAN,
    name_off="mult_off.png", name_on="mult_on.png")

mhot = Image.new("RGBA", (50, 40), (0,0,0,0))
mhd = ImageDraw.Draw(mhot)
for gr in range(30, 12, -4):
    ga = int(100*(30-gr)/18)
    mhd.ellipse([25-gr, 20-gr, 25+gr, 20+gr], fill=(*C_GOLD, ga))
mhd.rounded_rectangle([2,2,48,38], radius=4, fill=(*C_GOLD, 230))
mhd.text((8, 12), "4x", fill=(0,0,0,240), font=None)
save(mhot, "mult_hot.png")

print("\nBackglass art complete.")
