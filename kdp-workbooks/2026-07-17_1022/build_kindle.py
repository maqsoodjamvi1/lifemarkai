#!/usr/bin/env python3
"""1600x2560 kindle cover JPG for Kindergarten Number Tracing Workbook."""
import random
from PIL import Image, ImageDraw, ImageFont

random.seed(7)
W, H = 1600, 2560
img = Image.new("RGB", (W, H), (94, 198, 232))  # sky blue
d = ImageDraw.Draw(img)

def font(sz, bold=True):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            continue
    return ImageFont.load_default()

palette = [(255,210,63),(255,107,107),(92,214,138),(155,126,222),(255,255,255)]
# confetti numbers
f_conf = font(70)
for i in range(60):
    x = random.randint(30, W-60); y = random.randint(30, H-60)
    d.text((x,y), str(random.randint(0,20)), fill=random.choice(palette), font=f_conf)

# white rounded panel
def rrect(box, r, fill):
    d.rounded_rectangle(box, radius=r, fill=fill)
rrect([160, 760, W-160, 1900], 50, (255,255,255))

def ctext(cx, y, text, fnt, fill):
    bb = d.textbbox((0,0), text, font=fnt)
    w = bb[2]-bb[0]
    d.text((cx - w/2, y), text, fill=fill, font=fnt)

CX = W//2
ctext(CX, 300, "1  2  3", font(160), (255,255,255))
ctext(CX, 830, "Number", font(150), (255,107,107))
ctext(CX, 1000, "Tracing", font(150), (255,107,107))
ctext(CX, 1180, "Workbook", font(120), (155,126,222))
ctext(CX, 1360, "For Kindergarten", font(78), (18,52,86))
ctext(CX, 1470, "Trace, Count & Write 0 to 20", font(52), (26,43,74))

# badge
d.ellipse([CX-190, 1620, CX+190, 2000], fill=(255,210,63))
ctext(CX, 1710, "100+", font(120), (18,52,86))
ctext(CX, 1850, "ACTIVITIES", font(48), (18,52,86))

ctext(CX, 2360, "EducationWorksheet.com", font(56), (255,255,255))

img.save("kindle-cover.jpg", "JPEG", quality=92)
print("SAVED kindle-cover.jpg", img.size)
