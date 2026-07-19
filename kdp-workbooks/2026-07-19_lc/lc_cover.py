"""
Lowercase Letter Tracing Workbook — Full-wrap KDP print cover
A4 paperback, 114 pages, B&W white paper
Purple/Blue color scheme
"""
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white

pages  = 114
TW, TH = 8.268, 11.693          # A4 in inches
spine  = pages * 0.002252        # KDP formula for B&W white paper
bleed  = 0.125
CW     = 2 * TW + spine + 2 * bleed
CH     = TH + 2 * bleed

c      = canvas.Canvas("lc_cover.pdf", pagesize=(CW * inch, CH * inch))
W      = CW * inch
H      = CH * inch

back_w  = (TW + bleed) * inch
spine_w = spine * inch
front_x = back_w + spine_w         # x where front cover starts
front_w = (TW + bleed) * inch

# Color palette
PURPLE = HexColor("#6a1b9a")
DARK   = HexColor("#4a148c")
BLUE   = HexColor("#1565c0")
LIGHT  = HexColor("#e8d5f5")
CREAM  = HexColor("#f3e5f5")
INDIGO = HexColor("#283593")
WHITE  = white

# ─── FRONT COVER ─────────────────────────────────────────────────────────────
fx   = front_x
cxf  = fx + front_w / 2

# Background
c.setFillColor(PURPLE); c.rect(fx, 0, front_w, H, fill=1, stroke=0)

# Cream title panel at top
c.setFillColor(CREAM); c.rect(fx, H - 3.8 * inch, front_w, 3.8 * inch, fill=1, stroke=0)

# Title
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 46)
c.drawCentredString(cxf, H - 1.55 * inch, "Lowercase")
c.drawCentredString(cxf, H - 2.35 * inch, "Letter Tracing")
c.setFont("Helvetica-Bold", 34)
c.drawCentredString(cxf, H - 3.10 * inch, "Workbook")

# Big a b c motif
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 130)
c.drawCentredString(cxf, H - 6.3 * inch, "a b c")

# Age badge
c.setFillColor(BLUE)
c.circle(fx + front_w - 1.7 * inch, H - 4.85 * inch, 0.62 * inch, fill=1, stroke=0)
c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(fx + front_w - 1.7 * inch, H - 4.77 * inch, "Ages")
c.drawCentredString(fx + front_w - 1.7 * inch, H - 5.13 * inch, "3-5")

# Subtitle banner
c.setFillColor(INDIGO)
c.roundRect(cxf - 2.9 * inch, H - 7.70 * inch, 5.8 * inch, 0.72 * inch, 8, fill=1, stroke=0)
c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 18)
c.drawCentredString(cxf, H - 7.46 * inch, "Trace Small Letters a to z")

# Tagline
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(cxf, H - 8.30 * inch, "Fun Handwriting Practice for Kids")

# Brand
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(cxf, 0.62 * inch, "EducationWorksheet.com")

# ─── SPINE ───────────────────────────────────────────────────────────────────
c.setFillColor(DARK); c.rect(back_w, 0, spine_w, H, fill=1, stroke=0)
c.saveState()
c.translate(back_w + spine_w / 2, H / 2)
c.rotate(90)
c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 12)
c.drawCentredString(0, -4, "Lowercase Letter Tracing Workbook   ·   EducationWorksheet.com")
c.restoreState()

# ─── BACK COVER ──────────────────────────────────────────────────────────────
c.setFillColor(PURPLE); c.rect(0, 0, back_w, H, fill=1, stroke=0)
# Cream header band
c.setFillColor(CREAM); c.rect(0, H - 1.9 * inch, back_w, 1.9 * inch, fill=1, stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 24)
c.drawCentredString(back_w / 2, H - 1.22 * inch, "Build Confident Little Writers!")

# Blurb
c.setFillColor(WHITE); c.setFont("Helvetica", 13)
blurb = [
    "Help your child master every small letter from a to z",
    "with this fun, step-by-step tracing workbook. Big letter",
    "models and clear guide lines make learning to write easy,",
    "so little hands build confidence with every page!",
]
yy = H - 2.55 * inch
for ln in blurb:
    c.drawString(0.65 * inch, yy, ln); yy -= 0.30 * inch

# Features
c.setFillColor(WHITE); c.setFont("Helvetica-Bold", 14)
c.drawString(0.65 * inch, yy - 0.15 * inch, "Inside this book:")
yy -= 0.55 * inch
c.setFont("Helvetica", 12.5)
feats = [
    "Trace all 26 lowercase letters, a to z",
    "Four practice pages for every single letter",
    "Giant model letters with dashed guide lines",
    "A picture word for each letter  (a is for Acorn!)",
    "Trace rows, then write it yourself for real practice",
    "Match uppercase to lowercase activity pages",
    "Review pages and a fun completion certificate",
    "Perfect for preschool and kindergarten, ages 3-5",
]
for f in feats:
    c.setFillColor(BLUE)
    c.circle(0.77 * inch, yy + 4, 0.06 * inch, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.drawString(0.97 * inch, yy, f)
    yy -= 0.34 * inch

# ISBN box (white, bottom right of back cover, inside safe zone)
c.setFillColor(WHITE)
c.rect(back_w - 2.5 * inch, 0.40 * inch, 2.0 * inch, 1.05 * inch, fill=1, stroke=0)
c.setFillColor(HexColor("#999999")); c.setFont("Helvetica", 7)
c.drawString(back_w - 2.40 * inch, 0.55 * inch, "ISBN / barcode")

c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 12)
c.drawString(0.65 * inch, 0.62 * inch, "EducationWorksheet.com")

c.showPage()
c.save()
print(f"lc_cover.pdf  {CW:.3f} x {CH:.3f} in   spine={spine:.4f} in  ({spine*25.4:.2f} mm)")
