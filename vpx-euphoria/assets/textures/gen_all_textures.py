"""
Generate all remaining Euphoria (LE) VPX textures:
  bumper_cap_pink.png       256x256
  bumper_ring_cyan.png      256x256
  spinner_glitter.png       128x512
  dt_M/A/D/Y.png            128x256  (drop target faces)
  door_diffuse.png          256x512  (bathroom door)
  door_target.png           256x256  (hit target face)
  sling_left_decal.png      256x512
  sling_right_decal.png     256x512
  playfield_plastic.png     2048x4096 (insert emission overlay, RGBA)
  plunger_tip.png           64x256
"""

from PIL import Image, ImageDraw, ImageFilter
import math, os, random

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(7)

# ── helpers ────────────────────────────────────────────────────────────────

def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, "PNG")
    print(f"  {name}  {img.size}")

def radial_grad(w, h, cx, cy, r_inner, r_outer, c_inner, c_outer):
    img = Image.new("RGBA", (w, h))
    for y in range(h):
        for x in range(w):
            d = math.hypot(x - cx, y - cy)
            t = max(0.0, min(1.0, (d - r_inner) / max(1, r_outer - r_inner)))
            r = int(c_inner[0]*(1-t) + c_outer[0]*t)
            g = int(c_inner[1]*(1-t) + c_outer[1]*t)
            b = int(c_inner[2]*(1-t) + c_outer[2]*t)
            a = int(c_inner[3]*(1-t) + c_outer[3]*t)
            img.putpixel((x, y), (r, g, b, a))
    return img

def glitter(img, count=300, size=3):
    d = ImageDraw.Draw(img)
    for _ in range(count):
        x = random.randint(0, img.width-1)
        y = random.randint(0, img.height-1)
        r = random.randint(1, size)
        a = random.randint(80, 220)
        c = random.choice([(255,255,255), (255,20,147), (0,255,255)])
        d.ellipse([x-r, y-r, x+r, y+r], fill=(*c, a))
    return img

# ── BUMPER CAP (pink, glitter) ─────────────────────────────────────────────
print("Bumper cap...")
W = H = 256
cap = radial_grad(W, H, W//2, H//2, 0, W//2,
                  (255, 80, 180, 255), (100, 0, 60, 255))
d = ImageDraw.Draw(cap)
# Highlight ring
d.ellipse([20, 20, W-20, H-20], outline=(255, 255, 255, 180), width=4)
d.ellipse([40, 40, W-40, H-40], outline=(255, 200, 230, 120), width=2)
# Center highlight
d.ellipse([W//2-30, H//2-30, W//2+30, H//2+30],
          fill=(255, 220, 240, 180))
glitter(cap, 150, 3)
save(cap, "bumper_cap_pink.png")

# ── BUMPER RING (cyan, metallic) ───────────────────────────────────────────
print("Bumper ring...")
ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(ring)
# Outer glow
for r in range(W//2, W//2-20, -2):
    a = int(80 * (W//2 - r + 20) / 20)
    d.ellipse([W//2-r, H//2-r, W//2+r, H//2+r], outline=(0, 220, 240, a), width=2)
# Main ring
d.ellipse([10, 10, W-10, H-10], outline=(0, 240, 255, 230), width=20)
d.ellipse([35, 35, W-35, H-35], outline=(0, 180, 200, 140), width=6)
# Shine
d.arc([50, 50, W-50, H-50], start=200, end=320, fill=(200, 255, 255, 200), width=8)
glitter(ring, 60, 2)
save(ring, "bumper_ring_cyan.png")

# ── SPINNER DECAL (glitter drop, portrait) ────────────────────────────────
print("Spinner...")
sw, sh = 128, 512
spinner = Image.new("RGBA", (sw, sh), (50, 0, 80, 255))
d = ImageDraw.Draw(spinner)
# Gradient wipe
for y in range(sh):
    t = y / sh
    r = int(50 + t * 80)
    g = int(0)
    b = int(80 + t * 60)
    d.line([(0, y), (sw-1, y)], fill=(r, g, b, 255))
# Blade lines
d.line([(10, sh//2), (sw-10, sh//2)], fill=(255, 20, 147, 240), width=6)
d.line([(sw//2, 10), (sw//2, sh-10)], fill=(0, 220, 240, 200), width=4)
# Star burst at center
for angle in range(0, 360, 45):
    a_r = math.radians(angle)
    ex = sw//2 + int(math.cos(a_r) * 40)
    ey = sh//2 + int(math.sin(a_r) * 80)
    d.line([(sw//2, sh//2), (ex, ey)], fill=(255, 255, 255, 100), width=2)
d.ellipse([sw//2-12, sh//2-12, sw//2+12, sh//2+12],
          fill=(255, 20, 147, 255), outline=(255, 255, 255, 220), width=3)
glitter(spinner, 200, 3)
save(spinner, "spinner_glitter.png")

# ── DROP TARGETS — M A D D Y ───────────────────────────────────────────────
print("Drop targets...")
dtw, dth = 128, 256
letters = ["M", "A", "D", "D", "Y"]
for ltr in letters:
    dt = Image.new("RGBA", (dtw, dth), (0, 0, 0, 255))
    d  = ImageDraw.Draw(dt)
    # Dark red gradient body
    for y in range(dth):
        t  = y / dth
        gr = int(120 + t * 40)
        d.line([(0, y), (dtw-1, y)], fill=(gr, 10, 10, 255))
    # Border
    d.rectangle([4, 4, dtw-5, dth-5], outline=(220, 60, 60, 220), width=4)
    d.rectangle([10, 10, dtw-11, dth-11], outline=(180, 30, 30, 120), width=2)
    # Letter (large, white, centered)
    # PIL default font is small; we draw a chunky letter with rectangles
    # for a retro look
    cx, cy = dtw//2, dth//2
    # Glow behind letter
    for glow_r in range(40, 20, -5):
        ga = int(120 * (40 - glow_r) / 20)
        d.ellipse([cx-glow_r, cy-glow_r, cx+glow_r, cy+glow_r],
                  fill=(255, 255, 255, ga))
    # Letter text (use default PIL font — renders small but legible at this size)
    d.text((cx - 10, cy - 16), ltr, fill=(255, 255, 255, 255))
    glitter(dt, 40, 2)
    fname = f"dt_{ltr}.png"
    # D appears twice — same file is fine, both targets share it
    save(dt, fname)

# ── BATHROOM DOOR DIFFUSE ─────────────────────────────────────────────────
print("Bathroom door...")
bdw, bdh = 256, 512
door = Image.new("RGBA", (bdw, bdh), (80, 40, 20, 255))
d = ImageDraw.Draw(door)
# Wood grain simulation
for y in range(0, bdh, 8):
    grain_a = random.randint(15, 40)
    d.line([(0, y), (bdw, y + random.randint(-3, 3))],
           fill=(100 + random.randint(0, 20), 55, 30, grain_a), width=2)
# Door panel recesses (2 panels)
for py in [30, 270]:
    d.rounded_rectangle([20, py, bdw-20, py+210], radius=8,
                        fill=(60, 30, 14, 200), outline=(130, 80, 40, 180), width=4)
# Handle
d.ellipse([bdw-50, bdh//2-15, bdw-20, bdh//2+15],
          fill=(200, 170, 50, 255), outline=(240, 210, 80, 255), width=3)
# Title card stripe
d.rectangle([0, bdh//2-20, bdw, bdh//2+20], fill=(120, 20, 60, 200))
d.text((20, bdh//2 - 8), "BATHROOM", fill=(255, 200, 220, 240))
glitter(door, 30, 2)
save(door, "door_diffuse.png")

# ── BATHROOM DOOR HIT TARGET FACE ─────────────────────────────────────────
print("Door target face...")
dtf = Image.new("RGBA", (256, 256), (60, 20, 10, 255))
d = ImageDraw.Draw(dtf)
d.rounded_rectangle([10, 10, 246, 246], radius=12,
                    fill=(90, 35, 15, 255), outline=(200, 100, 50, 220), width=6)
d.text((50, 110), "PUSH", fill=(255, 220, 200, 240))
glitter(dtf, 30, 2)
save(dtf, "door_target.png")

# ── SLINGSHOT DECALS ──────────────────────────────────────────────────────
print("Slingshot decals...")
slw, slh = 256, 512
for side in ["left", "right"]:
    sl = Image.new("RGBA", (slw, slh), (0, 0, 0, 0))
    d  = ImageDraw.Draw(sl)
    # Triangular gradient fill (sling is triangular shape)
    if side == "left":
        pts = [(0, 0), (0, slh), (slw, slh)]
    else:
        pts = [(slw, 0), (0, slh), (slw, slh)]
    d.polygon(pts, fill=(180, 10, 80, 200))
    # Inner lighter triangle
    if side == "left":
        pts2 = [(20, 40), (20, slh-40), (slw-40, slh-40)]
    else:
        pts2 = [(slw-20, 40), (40, slh-40), (slw-20, slh-40)]
    d.polygon(pts2, fill=(220, 30, 110, 120))
    glitter(sl, 80, 3)
    save(sl, f"sling_{side}_decal.png")

# ── PLUNGER TIP ───────────────────────────────────────────────────────────
print("Plunger tip...")
ptw, pth = 64, 256
pt = radial_grad(ptw, pth, ptw//2, pth//4,
                 0, ptw//2,
                 (220, 200, 180, 255), (80, 70, 60, 255))
d = ImageDraw.Draw(pt)
# Tip dome
d.ellipse([8, 8, ptw-8, ptw-8], fill=(230, 210, 190, 255),
          outline=(160, 140, 120, 220), width=3)
# Shaft lines
for x in [ptw//4, ptw//2, 3*ptw//4]:
    d.line([(x, ptw), (x, pth-10)], fill=(160, 140, 120, 180), width=2)
save(pt, "plunger_tip.png")

# ── PLAYFIELD PLASTIC (insert emission overlay) ───────────────────────────
print("Playfield plastic (insert emission map)...")
pw, ph = 2048, 4096
SX = pw / 2025
SY = ph / 4200

plastic = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
d = ImageDraw.Draw(plastic)

def insert_emit(vx, vy, color, r_vpx=28, alpha=200):
    ix = int(vx * SX)
    iy = int(vy * SY)
    ir = max(8, int(r_vpx * SX))
    # Outer glow
    for gr in range(ir + 16, ir, -3):
        ga = int(alpha * 0.3 * (ir + 16 - gr) / 16)
        d.ellipse([ix-gr, iy-gr, ix+gr, iy+gr], fill=(*color, ga))
    # Core
    d.ellipse([ix-ir, iy-ir, ix+ir, iy+ir], fill=(*color, alpha))

C_P = (200, 50, 255)
C_C = (0, 220, 240)
C_K = (255, 20, 147)
C_G = (220, 180, 30)

# Orbit inserts
for y in [600, 800, 1100, 1400, 1700]:
    insert_emit(200,  y, C_C)
    insert_emit(1820, y, C_C)

# Ramp inserts
for y in [500, 700, 1000, 1300]:
    insert_emit(1012, y, C_P)
    insert_emit(1560, y + 100, C_K)

# Spiral inserts
for vx, vy in [(400,220),(300,350),(220,480),(340,430)]:
    insert_emit(vx, vy, C_P, r_vpx=20)

# Bumper glow
for bx, by in [(920,900),(1100,900),(1010,750)]:
    insert_emit(bx, by, C_K, r_vpx=55, alpha=160)

# Bumper lane inserts
for bx, by in [(820,1050),(1010,1050),(1200,1050)]:
    insert_emit(bx, by, C_K, r_vpx=22, alpha=180)

# Euphoria meter
for i in range(10):
    mc = C_K if i < 7 else (200, 10, 80)
    insert_emit(180, 1900 + i*60, mc, r_vpx=18)

# Scoop / mode start
insert_emit(1012, 2200, C_G, r_vpx=45, alpha=180)

# Slingshot inserts
insert_emit(350, 3100, C_K, r_vpx=18)
insert_emit(1675, 3100, C_K, r_vpx=18)

# Arrow inserts along shot lanes
for vy in [1550, 1750, 1950, 2150, 2350]:
    insert_emit(520, vy, C_P, r_vpx=14)   # Maddy bank approach
    insert_emit(1780, vy, C_C, r_vpx=14)  # Ferris approach

save(plastic, "playfield_plastic.png")

print("\nDone — all textures generated.")
