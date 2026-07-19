#!/usr/bin/env python3
"""Full-wrap cover for Kindergarten Number Tracing Workbook (A4 no-bleed paperback)."""
import math, random
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

random.seed(99)

INTERIOR_PAGES = 53
TRIM_W = 8.27
TRIM_H = 11.69
BLEED = 0.125
SPINE = INTERIOR_PAGES * 0.002252   # ~0.1194 in

full_w = (BLEED + TRIM_W + SPINE + TRIM_W + BLEED)
full_h = (BLEED + TRIM_H + BLEED)

W = full_w * inch
H = full_h * inch

# Colors (kid-friendly)
SKY = HexColor("#5EC6E8")
SUN = HexColor("#FFD23F")
CORAL = HexColor("#FF6B6B")
GREEN = HexColor("#5CD68A")
PURPLE = HexColor("#9B7EDE")
WHITE = HexColor("#FFFFFF")
NAVY = HexColor("#123456")
DARK = HexColor("#1A2B4A")

c = canvas.Canvas("cover_print.pdf", pagesize=(W, H))

# panel x-boundaries (in inches from left)
back_x0 = 0.0
back_x1 = BLEED + TRIM_W
spine_x0 = back_x1
spine_x1 = back_x1 + SPINE
front_x0 = spine_x1
front_x1 = full_w

def R(x): return x*inch

# ---- full background (bright, extends through bleed) ----
c.setFillColor(SKY)
c.rect(0, 0, W, H, stroke=0, fill=1)

# ---- FRONT COVER ----
fx0 = front_x0
fw = front_x1 - front_x0
# decorative confetti numbers on front
c.setFont("Helvetica-Bold", 30)
palette = [SUN, CORAL, GREEN, PURPLE, WHITE]
for i in range(40):
    nx = fx0 + random.uniform(0.3, fw-0.3)
    ny = random.uniform(0.4, full_h-0.4)
    c.setFillColor(random.choice(palette))
    c.drawCentredString(R(nx), R(ny), str(random.randint(0,20)))

# white rounded title panel
c.setFillColor(WHITE)
panel_x = R(fx0 + 0.9)
panel_w = R(fw - 1.8)
panel_y = R(full_h*0.30)
panel_h = R(full_h*0.42)
c.roundRect(panel_x, panel_y, panel_w, panel_h, 18, stroke=0, fill=1)

cx_front = R(fx0 + fw/2 + BLEED*0.0)
# center of the visible front (account for outer bleed on right)
front_center = fx0 + (TRIM_W)/2 + (SPINE and 0)  # front visible starts at front_x0, trim width
front_center = front_x0 + TRIM_W/2
CXF = R(front_center)

c.setFillColor(CORAL)
c.setFont("Helvetica-Bold", 52)
c.drawCentredString(CXF, R(full_h*0.62), "Number")
c.drawCentredString(CXF, R(full_h*0.545), "Tracing")
c.setFillColor(PURPLE)
c.setFont("Helvetica-Bold", 40)
c.drawCentredString(CXF, R(full_h*0.475), "Workbook")
c.setFillColor(NAVY)
c.setFont("Helvetica-Bold", 24)
c.drawCentredString(CXF, R(full_h*0.415), "For Kindergarten")
c.setFillColor(DARK)
c.setFont("Helvetica", 16)
c.drawCentredString(CXF, R(full_h*0.375), "Trace, Count & Write Numbers 0 to 20")

# badge for activity count
c.setFillColor(SUN)
c.circle(CXF, R(full_h*0.20), R(0.95), stroke=0, fill=1)
c.setFillColor(NAVY)
c.setFont("Helvetica-Bold", 30)
c.drawCentredString(CXF, R(full_h*0.205), "100+")
c.setFont("Helvetica-Bold", 12)
c.drawCentredString(CXF, R(full_h*0.165), "ACTIVITIES")

# 1,2,3 big numerals row near top
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 60)
c.drawCentredString(CXF, R(full_h*0.80), "1  2  3")

# ---- SPINE ----
c.setFillColor(PURPLE)
c.rect(R(spine_x0), 0, R(SPINE), H, stroke=0, fill=1)
# spine text (thin — keep subtle; 53pp is under KDP text threshold but allowed)
c.saveState()
c.translate(R(spine_x0 + SPINE/2), H/2)
c.rotate(90)
c.setFillColor(WHITE)
c.setFont("Helvetica-Bold", 9)
c.drawCentredString(0, -3, "Number Tracing Workbook  -  Kindergarten")
c.restoreState()

# ---- BACK COVER ----
bx0 = BLEED
bw = TRIM_W
BCX = R(bx0 + bw/2)
# white panel for text
c.setFillColor(WHITE)
c.roundRect(R(bx0+0.6), R(full_h*0.30), R(bw-1.2), R(full_h*0.50), 16, stroke=0, fill=1)

c.setFillColor(NAVY)
c.setFont("Helvetica-Bold", 22)
c.drawCentredString(BCX, R(full_h*0.73), "Get Ready to Write Numbers!")

c.setFillColor(DARK)
c.setFont("Helvetica", 12.5)
blurb = [
    "This fun, easy-to-follow workbook helps young",
    "learners master the numbers 0 to 20 with plenty",
    "of practice and colorful activities.",
    "",
    "Inside you will find:",
]
yy = full_h*0.685
for line in blurb:
    c.drawCentredString(BCX, R(yy), line)
    yy -= 0.30
# bullet features
feats = [
    "Guided number tracing for 0-20",
    "100+ tracing, counting & writing activities",
    "Count-the-picture practice pages",
    "Missing-number & number-order fun",
    "Complete answer key for grown-ups",
    "Big, kid-friendly print on A4 pages",
]
c.setFont("Helvetica", 12)
yy = full_h*0.485
for f in feats:
    c.setFillColor(CORAL)
    c.drawString(R(bx0+1.05), R(yy), "*")
    c.setFillColor(DARK)
    c.drawString(R(bx0+1.28), R(yy), f)
    yy -= 0.285

c.setFillColor(NAVY)
c.setFont("Helvetica-Bold", 13)
c.drawCentredString(BCX, R(full_h*0.335), "EducationWorksheet.com")

# small note bottom (kept above bleed / barcode area is bottom-right, leave clear)
c.setFillColor(DARK)
c.setFont("Helvetica", 9)
c.drawCentredString(BCX, R(0.35), "Ages 4-6  |  Kindergarten Math Practice")

c.showPage()
c.save()
print("SAVED cover_print.pdf")
print("interior pages:", INTERIOR_PAGES)
print("spine (in):", round(SPINE,4))
print("full cover WxH (in):", round(full_w,4), "x", round(full_h,4))
