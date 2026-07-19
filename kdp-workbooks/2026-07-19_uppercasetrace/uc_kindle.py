from PIL import Image, ImageDraw, ImageFont

W, H = 1600, 2560
ORANGE = (244, 130, 11)
CREAM = (255, 242, 224)
DARK = (122, 61, 0)
TEAL = (23, 138, 134)
RED = (230, 57, 70)
WHITE = (255, 255, 255)

img = Image.new("RGB", (W, H), ORANGE)
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

def ctext(y, text, f, fill):
    bb = d.textbbox((0, 0), text, font=f)
    w = bb[2] - bb[0]
    d.text(((W - w) / 2, y), text, font=f, fill=fill)

# title panel
d.rectangle([0, 0, W, 760], fill=CREAM)
ctext(150, "Uppercase", font(150), DARK)
ctext(320, "Letter Tracing", font(140), DARK)
ctext(500, "Workbook", font(120), DARK)
# ABC motif
ctext(1000, "A B C", font(360), CREAM)
# recenter age text within badge
def badge_text(cx, cy, lines, f, fill):
    total_h = 0
    sizes = []
    for ln in lines:
        bb = d.textbbox((0, 0), ln, font=f)
        sizes.append((bb[2] - bb[0], bb[3] - bb[1]))
        total_h += (bb[3] - bb[1]) + 10
    y = cy - total_h / 2
    for ln, (w, h) in zip(lines, sizes):
        d.text((cx - w / 2, y), ln, font=f, fill=fill)
        y += h + 10
# clear the stray text by repainting badge
d.ellipse([1150, 1420, 1470, 1740], fill=TEAL)
badge_text(1310, 1580, ["Ages", "3-5"], font(90), WHITE)
# subtitle banner
d.rounded_rectangle([160, 1820, 1440, 1990], radius=30, fill=RED)
ctext(1855, "Trace Capital Letters A to Z", font(78), WHITE)
ctext(2080, "Fun Handwriting Practice for Kids", font(66), CREAM)
# brand
ctext(2420, "EducationWorksheet.com", font(70), CREAM)

img.save("uc_kindle_cover.jpg", "JPEG", quality=90)
print("uc_kindle_cover.jpg", img.size)
