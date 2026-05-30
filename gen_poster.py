#!/usr/bin/env python3
"""Pebble Pocket poster — center the stone image + warm sand bg + italic title."""
import io, os, ssl, urllib.request
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(ROOT, 'poster.png')
TARGET = 1024

# Use one of the gen-image stones produced during dev — the black basalt one
# happens to be dramatic. Replace this URL if you regenerate.
STONE_URL = 'https://cdn.aiwaves.tech/prod/telegram/avatar/0/1780138152680842.webp'

FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf',
    '/System/Library/Fonts/Supplemental/Georgia Italic.ttf',
    '/System/Library/Fonts/NewYorkItalic.ttf',
]
def find_font(paths):
    for p in paths:
        if os.path.exists(p):
            return p
    return None

font_serif = find_font(FONT_CANDIDATES)

# Download stone
ctx = ssl.create_default_context()
ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
print(f'fetching {STONE_URL}')
req = urllib.request.Request(STONE_URL, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
    img_bytes = r.read()
stone = Image.open(io.BytesIO(img_bytes)).convert('RGB')
print(f'stone size: {stone.size}')

# Center crop to square + resize to a comfortable size for the poster
side = min(stone.size)
left = (stone.size[0] - side) // 2
top  = (stone.size[1] - side) // 2
stone = stone.crop((left, top, left + side, top + side)).resize((640, 640), Image.LANCZOS)

# Compose 1024x1024 poster
canvas = Image.new('RGB', (TARGET, TARGET), (26, 20, 16))

# Background — warm sand radial gradient toward center
g = Image.new('L', (TARGET, TARGET), 0)
gd = ImageDraw.Draw(g)
for r in range(TARGET, 0, -8):
    a = int(60 * (1 - (r / TARGET) ** 0.9))
    gd.ellipse([(TARGET//2 - r, TARGET//2 + 120 - r), (TARGET//2 + r, TARGET//2 + 120 + r)], fill=a)
warm = Image.new('RGB', (TARGET, TARGET), (110, 90, 69))
canvas.paste(warm, (0, 0), g)

# Drop shadow under stone
shadow = Image.new('L', (TARGET, TARGET), 0)
sd = ImageDraw.Draw(shadow)
cx, cy = TARGET // 2, TARGET // 2 + 120
for r in range(320, 100, -10):
    a = int(110 * (1 - (r / 320) ** 1.5))
    sd.ellipse([(cx - r, cy + 220 - r // 3), (cx + r, cy + 220 + r // 3)], fill=a)
canvas.paste((0, 0, 0), (0, 0), shadow)

# Paste stone
sx = (TARGET - 640) // 2
sy = TARGET // 2 - 200
# Rounded mask
mask = Image.new('L', (640, 640), 0)
ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (640, 640)], radius=40, fill=255)
canvas.paste(stone, (sx, sy), mask)

# Title overlay at top
draw = ImageDraw.Draw(canvas, 'RGBA')
CREAM = (236, 226, 210, 248)
SUB   = (200, 175, 130, 175)

title = 'pebble pocket'
TS = 92
font_title = ImageFont.truetype(font_serif, TS) if font_serif else ImageFont.load_default()
bbox = draw.textbbox((0, 0), title, font=font_title)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (TARGET - tw) // 2
ty = 80
# Subtle warm halo
for dx, dy, alpha in [(-2,-2,70),(2,-2,70),(-2,2,70),(2,2,70),(0,0,120)]:
    draw.text((tx+dx, ty+dy), title, fill=(212, 168, 122, alpha), font=font_title)
draw.text((tx, ty), title, fill=CREAM, font=font_title)

sub = 'one stone a day'
SS = 30
font_sub = ImageFont.truetype(font_serif, SS) if font_serif else ImageFont.load_default()
sbbox = draw.textbbox((0, 0), sub, font=font_sub)
sw = sbbox[2] - sbbox[0]
sx2 = (TARGET - sw) // 2
sy2 = ty + th + 30
draw.text((sx2, sy2), sub, fill=SUB, font=font_sub)

canvas.save(OUT, 'PNG', optimize=True)
print(f'wrote {OUT}  {TARGET}x{TARGET}')
