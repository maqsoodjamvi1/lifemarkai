from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white

pages = 112
TW, THh = 8.268, 11.693
spine = pages * 0.002252   # KDP formula for B&W white paper
bleed = 0.125
CW = 2 * TW + spine + 2 * bleed
CH = THh + 2 * bleed

c = canvas.Canvas("uc_cover.pdf", pagesize=(CW * inch, CH * inch))
W = CW * inch
H = CH * inch
back_w = (TW + bleed) * inch
spine_w = spine * inch
front_x0 = back_w + spine_w
front_w = (TW + bleed) * inch

ORANGE = HexColor("#f4820b")
CREAM = HexColor("#fff2e0")
DARK = HexColor("#7a3d00")
TEAL = HexColor("#178a86")
RED = HexColor("#e63946")
LIGHT = HexColor("#ffd9a8")

# ---------------- FRONT ----------------
fx = front_x0
cxf = fx + front_w / 2
c.setFillColor(ORANGE); c.rect(fx, 0, front_w, H, fill=1, stroke=0)
# cream title panel
c.setFillColor(CREAM); c.rect(fx, H - 3.6 * inch, front_w, 3.6 * inch, fill=1, stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 46)
c.drawCentredString(cxf, H - 1.55 * inch, "Uppercase")
c.drawCentredString(cxf, H - 2.35 * inch, "Letter Tracing")
c.setFont("Helvetica-Bold", 34); c.drawCentredString(cxf, H - 3.05 * inch, "Workbook")
# big ABC motif
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 130)
c.drawCentredString(cxf, H - 6.1 * inch, "A B C")
# age badge circle
c.setFillColor(TEAL); c.circle(fx + front_w - 1.7 * inch, H - 4.7 * inch, 0.6 * inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 15)
c.drawCentredString(fx + front_w - 1.7 * inch, H - 4.62 * inch, "Ages")
c.drawCentredString(fx + front_w - 1.7 * inch, H - 4.98 * inch, "3-5")
# subtitle banner
c.setFillColor(RED); c.roundRect(cxf - 2.9 * inch, H - 7.55 * inch, 5.8 * inch, 0.7 * inch, 8, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 19)
c.drawCentredString(cxf, H - 7.32 * inch, "Trace Capital Letters A to Z")
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 16)
c.drawCentredString(cxf, H - 8.2 * inch, "Fun Handwriting Practice for Kids")
# brand
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 16)
c.drawCentredString(cxf, 0.62 * inch, "EducationWorksheet.com")

# ---------------- SPINE ----------------
c.setFillColor(DARK); c.rect(back_w, 0, spine_w, H, fill=1, stroke=0)
c.saveState()
c.translate(back_w + spine_w / 2, H / 2)
c.rotate(90)
c.setFillColor(white); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(0, -4, "Uppercase Letter Tracing Workbook   -   EducationWorksheet.com")
c.restoreState()

# ---------------- BACK ----------------
c.setFillColor(ORANGE); c.rect(0, 0, back_w, H, fill=1, stroke=0)
c.setFillColor(CREAM); c.rect(0, H - 1.8 * inch, back_w, 1.8 * inch, fill=1, stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 24)
c.drawCentredString(back_w / 2, H - 1.15 * inch, "Let's Learn the ABCs!")
c.setFillColor(white); c.setFont("Helvetica", 13)
blurb = [
    "Give your child a confident start with capital letters!",
    "This workbook guides little hands through tracing every",
    "uppercase letter from A to Z with big, friendly letters and",
    "clear guide lines that make learning to write easy and fun.",
]
yy = H - 2.5 * inch
for ln in blurb:
    c.drawString(0.7 * inch, yy, ln); yy -= 0.3 * inch
c.setFillColor(white); c.setFont("Helvetica-Bold", 14)
c.drawString(0.7 * inch, yy - 0.15 * inch, "Inside this book:")
yy -= 0.55 * inch
c.setFont("Helvetica", 12.5)
feats = [
    "Trace all 26 capital letters, A to Z",
    "Four practice pages for every single letter",
    "Big letters with dashed guide lines to stay neat",
    "A picture word for each letter (A is for Apple!)",
    "Trace, then write it yourself for real practice",
    "Review pages and a fun completion certificate",
    "Perfect for preschool and kindergarten, ages 3-5",
]
for f in feats:
    c.setFillColor(TEAL); c.circle(0.82 * inch, yy + 4, 0.06 * inch, fill=1, stroke=0)
    c.setFillColor(white); c.drawString(1.02 * inch, yy, f)
    yy -= 0.34 * inch
# ISBN barcode area (white box, inside safe zone)
c.setFillColor(white); c.rect(back_w - 2.5 * inch, 0.4 * inch, 2.0 * inch, 1.05 * inch, fill=1, stroke=0)
c.setFillColor(HexColor("#999999")); c.setFont("Helvetica", 7)
c.drawString(back_w - 2.4 * inch, 0.55 * inch, "ISBN / barcode")
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 12)
c.drawString(0.7 * inch, 0.6 * inch, "EducationWorksheet.com")

c.showPage()
c.save()
print("uc_cover.pdf", round(CW, 3), "x", round(CH, 3), "spine", round(spine, 4))
