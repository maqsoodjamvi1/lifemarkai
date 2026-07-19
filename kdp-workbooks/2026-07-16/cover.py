import json
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white

meta = json.load(open("answer_key.json"))["meta"]
pages = meta["total_pages"]

TW, THh = 8.268, 11.693   # A4 trim inches
spine = pages * 0.002252
bleed = 0.125
CW = 2*TW + spine + 2*bleed
CH = THh + 2*bleed

BLUE   = HexColor("#1f6feb")
YELLOW = HexColor("#ffd23f")
ORANGE = HexColor("#ff8c42")
GREEN  = HexColor("#2a9d5c")

c = canvas.Canvas("cover.pdf", pagesize=(CW*inch, CH*inch))
W = CW*inch; H = CH*inch

# base background
c.setFillColor(BLUE); c.rect(0, 0, W, H, fill=1, stroke=0)

back_x0 = 0; back_w = (TW+bleed)*inch
spine_x0 = back_w; spine_w = spine*inch
front_x0 = spine_x0 + spine_w; front_w = (TW+bleed)*inch

# ---------- FRONT ----------
fx = front_x0
c.setFillColor(YELLOW); c.rect(fx, 0, front_w, H, fill=1, stroke=0)
# top blue band
c.setFillColor(BLUE); c.rect(fx, H-4.6*inch, front_w, 4.6*inch, fill=1, stroke=0)
cxf = fx + front_w/2
c.setFillColor(white); c.setFont("Helvetica-Bold", 50)
c.drawCentredString(cxf, H-1.9*inch, "Multiplication")
c.drawCentredString(cxf, H-2.75*inch, "& Division")
c.setFont("Helvetica-Bold", 30)
c.drawCentredString(cxf, H-3.7*inch, "WORKBOOK")
# grade badge
c.setFillColor(ORANGE); c.circle(cxf, H-5.7*inch, 0.95*inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 26)
c.drawCentredString(cxf, H-5.75*inch, "Grade")
c.setFont("Helvetica-Bold", 40)
c.drawCentredString(cxf, H-6.6*inch, "3")
# subtitle ribbon
c.setFillColor(GREEN); c.rect(fx+0.5*inch, H-8.0*inch, front_w-1.0*inch, 0.9*inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 24)
c.drawCentredString(cxf, H-7.75*inch, "130+ Practice Pages")
# facts line
c.setFillColor(black); c.setFont("Helvetica-Bold", 18)
c.drawCentredString(cxf, H-8.7*inch, "Multiplication & Division Facts 0-12")
c.setFont("Helvetica", 14)
c.drawCentredString(cxf, H-9.2*inch, "With Complete Answer Key")
# playful math symbols
c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 40)
for (mx,my,s) in [(1.2,9.9,"x"),(6.6,9.9,"+"),(1.4,0.9,"="),(6.5,0.9,"/")]:
    c.drawCentredString(fx+mx*inch, H-my*inch, s)
c.setFillColor(black); c.setFont("Helvetica-Bold", 14)
c.drawCentredString(cxf, 0.55*inch, "EducationWorksheet.com")

# ---------- SPINE ----------
c.saveState()
c.setFillColor(BLUE); c.rect(spine_x0, 0, spine_w, H, fill=1, stroke=0)
c.translate(spine_x0 + spine_w/2, H/2)
c.rotate(90)
c.setFillColor(white); c.setFont("Helvetica-Bold", 12)
c.drawCentredString(0, -3, "Multiplication & Division Workbook  -  Grade 3")
c.restoreState()

# ---------- BACK ----------
bx = back_x0
c.setFillColor(HexColor("#eaf1ff")); c.rect(bx+bleed*inch, 0, back_w-bleed*inch, H, fill=1, stroke=0)
cxb = bx + bleed*inch + (back_w-bleed*inch)/2
# header band
c.setFillColor(BLUE); c.rect(bx, H-2.2*inch, back_w, 2.2*inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 30)
c.drawCentredString(cxb, H-1.35*inch, "Master the Times Tables!")
# blurb
c.setFillColor(black); c.setFont("Helvetica", 14)
blurb = [
 "Give your child the confidence to conquer multiplication",
 "and division with this fun, colorful practice workbook.",
 "Each page features one clear problem with plenty of room",
 "to work it out, so young learners can focus and succeed.",
]
by = H-2.9*inch
for ln in blurb:
    c.drawCentredString(cxb, by, ln); by -= 0.34*inch

# feature bullets
feats = [
 "130+ single-problem practice pages",
 "Multiplication & division facts 0 to 12",
 "Handy times-table reference chart",
 "Complete answer key to check every page",
 "Big, kid-friendly print with work space",
 "Perfect for Grade 3, homeschool & summer review",
]
c.setFont("Helvetica-Bold", 14); c.setFillColor(GREEN)
c.drawString(bx+0.9*inch, by-0.2*inch, "Inside this book:")
c.setFillColor(black); c.setFont("Helvetica", 13)
fy = by-0.7*inch
for f in feats:
    c.setFillColor(ORANGE); c.drawString(bx+0.9*inch, fy, "*")
    c.setFillColor(black); c.drawString(bx+1.15*inch, fy, f)
    fy -= 0.42*inch

c.setFillColor(black); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(cxb, 1.4*inch, "EducationWorksheet.com")
c.setFont("Helvetica", 10)
c.drawCentredString(cxb, 1.05*inch, "Ages 8-9  -  Grade 3  -  Math Practice")
# ISBN placeholder box (KDP prints its own barcode; leave white space)
c.setFillColor(white); c.rect(cxb-1.2*inch, 0.35*inch, 2.4*inch, 0.55*inch, fill=1, stroke=0)

c.save()
print("cover.pdf", round(CW,3),"x",round(CH,3),"in  spine",round(spine,4),"in  pages",pages)
