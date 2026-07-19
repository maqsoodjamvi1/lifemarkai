from PIL import Image, ImageDraw, ImageFont

W, Hh = 1600, 2560
img = Image.new("RGB", (W, Hh), "#ffd23f")
d = ImageDraw.Draw(img)

def font(sz, bold=True):
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        try:
            return ImageFont.truetype(p, sz)
        except Exception:
            pass
    return ImageFont.load_default()

def ctext(y, txt, f, fill):
    bb = d.textbbox((0,0), txt, font=f)
    w = bb[2]-bb[0]
    d.text(((W-w)//2, y), txt, font=f, fill=fill)

BLUE="#1f6feb"; ORANGE="#ff8c42"; GREEN="#2a9d5c"; WHITE="#ffffff"; BLACK="#111111"

# top blue band
d.rectangle([0,0,W,900], fill=BLUE)
ctext(230, "Multiplication", font(120), WHITE)
ctext(380, "& Division", font(120), WHITE)
ctext(560, "WORKBOOK", font(90), WHITE)

# grade badge
d.ellipse([W//2-190, 980, W//2+190, 1360], fill=ORANGE)
ctext(1050, "Grade", font(80), WHITE)
ctext(1140, "3", font(150), WHITE)

# subtitle ribbon
d.rectangle([120, 1520, W-120, 1700], fill=GREEN)
ctext(1560, "130+ Practice Pages", font(78), WHITE)

ctext(1790, "Facts 0-12  -  Answer Key", font(58), BLACK)

# math symbols
for (x,y,s) in [(180,1000,"x"),(1300,1000,"+"),(180,2300,"="),(1300,2300,"/")]:
    d.text((x,y), s, font=font(150), fill=BLUE)

# footer band
d.rectangle([0,2380,W,Hh], fill=BLUE)
ctext(2440, "EducationWorksheet.com", font(64), WHITE)

img.save("kindle-cover.jpg", "JPEG", quality=90)
print("kindle-cover.jpg", img.size)
