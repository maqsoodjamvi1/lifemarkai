#!/usr/bin/env python3
"""Full-wrap paperback cover for Uppercase Letter Tracing Workbook (88pp A4)."""
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth

PAGES = 88
SPINE = PAGES * 0.002252 * inch   # ~0.198in
BLEED = 0.125 * inch
TRIM_W = 8.27 * inch
TRIM_H = 11.69 * inch

TOTAL_W = BLEED + TRIM_W + SPINE + TRIM_W + BLEED
TOTAL_H = TRIM_H + 2*BLEED

TEAL = (0.16, 0.63, 0.65)
YEL = (1.0, 0.85, 0.30)
CREAM = (1.0, 0.98, 0.92)
DK = (0.10, 0.28, 0.30)
WHITE = (1,1,1)
CORAL = (0.98, 0.55, 0.42)

c = canvas.Canvas("ul_cover.pdf", pagesize=(TOTAL_W, TOTAL_H))

# full-bleed background
c.setFillColorRGB(*TEAL)
c.rect(0, 0, TOTAL_W, TOTAL_H, fill=1, stroke=0)

back_x = BLEED
spine_x = BLEED + TRIM_W
front_x = BLEED + TRIM_W + SPINE

def dashed_text(txt, x, y, size, font="Helvetica-Bold", color=WHITE, lw=1.6, dash=(3,4)):
    c.saveState(); c.setDash(dash[0],dash[1]); c.setLineWidth(lw); c.setStrokeColorRGB(*color)
    t=c.beginText(); t.setTextRenderMode(1); t.setFont(font,size); t.setTextOrigin(x,y); t.textOut(txt)
    c.drawText(t); c.restoreState()

# ---- FRONT panel ----
fcx = front_x + TRIM_W/2
# cream rounded card
c.setFillColorRGB(*CREAM)
c.roundRect(front_x+0.5*inch, BLEED+1.0*inch, TRIM_W-1.0*inch, TRIM_H-2.0*inch, 22, fill=1, stroke=0)
# yellow banner
c.setFillColorRGB(*YEL)
c.roundRect(front_x+0.85*inch, BLEED+TRIM_H-3.0*inch, TRIM_W-1.7*inch, 1.5*inch, 16, fill=1, stroke=0)
c.setFillColorRGB(*DK); c.setFont("Helvetica-Bold", 40)
c.drawCentredString(fcx, BLEED+TRIM_H-2.05*inch, "UPPERCASE")
c.setFont("Helvetica-Bold", 33)
c.drawCentredString(fcx, BLEED+TRIM_H-2.65*inch, "LETTER TRACING")
# subtitle
c.setFillColorRGB(*TEAL); c.setFont("Helvetica-Bold", 19)
c.drawCentredString(fcx, BLEED+TRIM_H-3.5*inch, "Trace Capital Letters A to Z")
c.setFillColorRGB(*DK); c.setFont("Helvetica", 15)
c.drawCentredString(fcx, BLEED+TRIM_H-3.95*inch, "Handwriting Practice for Kids  •  Ages 3-5")
# big dotted ABC decoration
dashed_text("A B C", fcx - stringWidth("A B C","Helvetica-Bold",92)/2, BLEED+3.6*inch, 92, color=CORAL, lw=2.4, dash=(4,5))
dashed_text("D E", fcx - stringWidth("D E","Helvetica-Bold",64)/2, BLEED+2.55*inch, 64, color=TEAL, lw=2.0, dash=(4,5))
# feature pills
c.setFillColorRGB(*TEAL); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(fcx, BLEED+1.75*inch, "26 Letters  •  Word Tracing  •  Letter Hunt Games")
c.setFillColorRGB(*CORAL); c.setFont("Helvetica-Bold", 12)
c.drawCentredString(fcx, BLEED+1.45*inch, "88 Pages of Big, Easy-to-Trace Practice")

# ---- SPINE (thin, no text) ----
c.setFillColorRGB(*YEL)
c.rect(spine_x, BLEED, SPINE, TRIM_H, fill=1, stroke=0)

# ---- BACK panel ----
bcx = back_x + TRIM_W/2
c.setFillColorRGB(*CREAM)
c.roundRect(back_x+0.5*inch, BLEED+0.8*inch, TRIM_W-1.0*inch, TRIM_H-1.6*inch, 20, fill=1, stroke=0)
c.setFillColorRGB(*DK); c.setFont("Helvetica-Bold", 20)
c.drawCentredString(bcx, BLEED+TRIM_H-1.7*inch, "Give Your Child a Confident Start!")
blurb=[
 "This friendly workbook helps young learners master",
 "every capital letter from A to Z. Big, clear dotted",
 "letters make tracing easy for little hands, while",
 "handwriting guide lines teach correct letter size.",
 "",
 "Inside you'll find:",
 "   •  A full page set for each letter A-Z",
 "   •  Big model letters plus rows to trace",
 "   •  A picture word for every letter (A is for Apple!)",
 "   •  Space to practice writing on your own",
 "   •  Fun Letter Hunt games with an answer key",
 "",
 "Perfect for preschool, pre-K, and kindergarten kids",
 "ages 3-5. 88 pages of screen-free learning fun.",
]
c.setFont("Helvetica", 13); c.setFillColorRGB(0.15,0.2,0.2)
yy = BLEED+TRIM_H-2.25*inch
for line in blurb:
    c.drawString(back_x+0.85*inch, yy, line); yy -= 0.34*inch
c.setFillColorRGB(*TEAL); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(bcx, BLEED+1.15*inch, "EducationWorksheet.com")

c.showPage(); c.save()
print("SPINE in:", round(SPINE/inch,4), "TOTAL_W in:", round(TOTAL_W/inch,3), "TOTAL_H in:", round(TOTAL_H/inch,3))
