"""
Letters + First Words Tracing Workbook — Full-wrap KDP print cover
A4 paperback, 112 pages, B&W white paper
Green color scheme
"""
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white

pages  = 112
TW, TH = 8.268, 11.693
spine  = pages * 0.002252
bleed  = 0.125
CW     = 2 * TW + spine + 2 * bleed
CH     = TH + 2 * bleed

c      = canvas.Canvas("fw_cover.pdf", pagesize=(CW * inch, CH * inch))
W      = CW * inch
H      = CH * inch

back_w  = (TW + bleed) * inch
spine_w = spine * inch
front_x = back_w + spine_w
front_w = (TW + bleed) * inch

GREEN  = HexColor("#2e7d32")
DGREEN = HexColor("#1b5e20")
LIME   = HexColor("#c8e6c9")
TEAL   = HexColor("#00796b")
CREAM  = HexColor("#f9fbe7")

# ── FRONT COVER ──────────────────────────────────────────────────────────────
fx  = front_x
cxf = fx + front_w / 2

# Background
c.setFillColor(GREEN); c.rect(fx, 0, front_w, H, fill=1, stroke=0)

# Cream title panel
c.setFillColor(CREAM); c.rect(fx, H - 3.8*inch, front_w, 3.8*inch, fill=1, stroke=0)

# Title
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 40)
c.drawCentredString(cxf, H - 1.5*inch, "Letters +")
c.drawCentredString(cxf, H - 2.25*inch, "First Words")
c.setFont("Helvetica-Bold", 30)
c.drawCentredString(cxf, H - 3.0*inch, "Tracing Workbook")

# Big letters motif
c.setFillColor(LIME); c.setFont("Helvetica-Bold", 110)
c.drawCentredString(cxf, H - 6.1*inch, "Aa Bb")

# Age badge
c.setFillColor(TEAL)
c.circle(fx + front_w - 1.7*inch, H - 4.85*inch, 0.62*inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(fx + front_w - 1.7*inch, H - 4.77*inch, "Ages")
c.drawCentredString(fx + front_w - 1.7*inch, H - 5.13*inch, "3-5")

# Subtitle banner
c.setFillColor(DGREEN)
c.roundRect(cxf - 2.9*inch, H - 7.75*inch, 5.8*inch, 0.72*inch, 8, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 16)
c.drawCentredString(cxf, H - 7.50*inch, "Trace Letters A–Z & First Words")

# Tagline
c.setFillColor(LIME); c.setFont("Helvetica-Bold", 14)
c.drawCentredString(cxf, H - 8.32*inch, "Handwriting Practice for Preschool & Kindergarten")

# Brand
c.setFillColor(LIME); c.setFont("Helvetica-Bold", 14)
c.drawCentredString(cxf, 0.62*inch, "EducationWorksheet.com")

# ── SPINE ────────────────────────────────────────────────────────────────────
c.setFillColor(DGREEN); c.rect(back_w, 0, spine_w, H, fill=1, stroke=0)
c.saveState()
c.translate(back_w + spine_w/2, H/2)
c.rotate(90)
c.setFillColor(white); c.setFont("Helvetica-Bold", 11)
c.drawCentredString(0, -4, "Letters + First Words Tracing Workbook   ·   EducationWorksheet.com")
c.restoreState()

# ── BACK COVER ───────────────────────────────────────────────────────────────
c.setFillColor(GREEN); c.rect(0, 0, back_w, H, fill=1, stroke=0)
c.setFillColor(CREAM); c.rect(0, H - 1.9*inch, back_w, 1.9*inch, fill=1, stroke=0)
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 22)
c.drawCentredString(back_w/2, H - 1.22*inch, "Letters, Words & Reading Readiness!")

c.setFillColor(white); c.setFont("Helvetica", 13)
blurb = [
    "A fun two-in-one workbook that teaches children to trace all",
    "26 letters — uppercase and lowercase — PLUS trace and copy",
    "the first word for every letter. A is for Apple, B is for Ball,",
    "and so much more! Perfect for building reading readiness.",
]
yy = H - 2.55*inch
for ln in blurb:
    c.drawString(0.65*inch, yy, ln); yy -= 0.30*inch

c.setFillColor(white); c.setFont("Helvetica-Bold", 14)
c.drawString(0.65*inch, yy - 0.15*inch, "Inside this book:")
yy -= 0.55*inch
c.setFont("Helvetica", 12.5)
feats = [
    "Trace all 26 uppercase letters A to Z",
    "Trace all 26 lowercase letters a to z",
    "Trace a first word for every letter (Apple, Ball…)",
    "Meet the letter pages with big letter models",
    "Review pages and a fun completion certificate",
    "112 pages of handwriting practice",
    "Perfect for preschool and kindergarten, ages 3-5",
]
for f in feats:
    c.setFillColor(TEAL)
    c.circle(0.77*inch, yy + 4, 0.06*inch, fill=1, stroke=0)
    c.setFillColor(white)
    c.drawString(0.97*inch, yy, f)
    yy -= 0.34*inch

# ISBN box
c.setFillColor(white)
c.rect(back_w - 2.5*inch, 0.40*inch, 2.0*inch, 1.05*inch, fill=1, stroke=0)
c.setFillColor(HexColor("#999999")); c.setFont("Helvetica", 7)
c.drawString(back_w - 2.40*inch, 0.55*inch, "ISBN / barcode")

c.setFillColor(LIME); c.setFont("Helvetica-Bold", 12)
c.drawString(0.65*inch, 0.62*inch, "EducationWorksheet.com")

c.showPage()
c.save()
print(f"fw_cover.pdf  {CW:.3f} x {CH:.3f} in  spine={spine:.4f} in ({spine*25.4:.2f} mm)")
