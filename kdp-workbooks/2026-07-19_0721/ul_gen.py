#!/usr/bin/env python3
"""Uppercase Letter Tracing Workbook (A-Z) — A4 B&W interior, KDP-safe margins."""
import random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth

W, H = A4  # 595.28 x 841.89 pt
LEFT = 0.78 * inch      # inside/gutter safe (>=0.7)
RIGHT = W - 0.62 * inch # outside (>=0.5)
TOP = H - 0.72 * inch   # (>=0.6)
BOT = 0.72 * inch
CW = RIGHT - LEFT       # content width

GRAY = (0.62, 0.62, 0.62)      # trace outline
LGRAY = (0.80, 0.80, 0.80)     # guide lines
DK = (0.12, 0.12, 0.12)

WORDS = {
    'A':'APPLE','B':'BALL','C':'CAT','D':'DOG','E':'EGG','F':'FISH','G':'GOAT',
    'H':'HAT','I':'IGLOO','J':'JAM','K':'KITE','L':'LION','M':'MOON','N':'NEST',
    'O':'ORANGE','P':'PIG','Q':'QUEEN','R':'RING','S':'SUN','T':'TREE','U':'UP',
    'V':'VAN','W':'WHALE','X':'FOX','Y':'YAK','Z':'ZEBRA'
}

c = canvas.Canvas("ul_interior.pdf", pagesize=A4)

def center(txt, y, font, size, color=DK):
    c.setFillColorRGB(*color)
    c.setFont(font, size)
    c.drawCentredString(W/2, y, txt)

def dashed_text(txt, x, y, size, font="Helvetica-Bold", color=GRAY, dash=(2,3), lw=1.0):
    """Draw outline (stroke-only) dashed text for tracing."""
    c.saveState()
    c.setDash(dash[0], dash[1])
    c.setLineWidth(lw)
    c.setStrokeColorRGB(*color)
    t = c.beginText()
    t.setTextRenderMode(1)  # stroke only
    t.setFont(font, size)
    t.setTextOrigin(x, y)
    t.textOut(txt)
    c.drawText(t)
    c.restoreState()

def guide_row(y_base, height, n_lines=1):
    """Draw handwriting guide: baseline solid, midline dashed, topline light."""
    for i in range(n_lines):
        yb = y_base - i*height
        # baseline
        c.setDash()
        c.setLineWidth(0.8); c.setStrokeColorRGB(*LGRAY)
        c.line(LEFT, yb, RIGHT, yb)
        # top line
        c.line(LEFT, yb+height*0.72, RIGHT, yb+height*0.72)
        # dashed midline
        c.setDash(2,3); c.setLineWidth(0.6)
        c.line(LEFT, yb+height*0.36, RIGHT, yb+height*0.36)
    c.setDash()

def footer(pg):
    c.setFont("Helvetica", 8); c.setFillColorRGB(*LGRAY)
    c.drawCentredString(W/2, 0.42*inch, str(pg))

pg = 0
def newpage():
    global pg
    c.showPage(); pg += 1

# ---------- Title page ----------
pg = 1
c.setFillColorRGB(*DK)
c.setFont("Helvetica-Bold", 30)
c.drawCentredString(W/2, H-3.2*inch, "UPPERCASE")
c.drawCentredString(W/2, H-3.9*inch, "LETTER TRACING")
c.setFont("Helvetica-Bold", 22)
c.drawCentredString(W/2, H-4.7*inch, "WORKBOOK")
c.setFont("Helvetica", 15)
c.drawCentredString(W/2, H-5.5*inch, "Trace Capital Letters A to Z")
c.setFont("Helvetica", 13)
c.drawCentredString(W/2, H-5.95*inch, "Handwriting Practice for Kids Ages 3-5")
# decorative dashed ABC
dashed_text("A  B  C", W/2 - stringWidth("A  B  C","Helvetica-Bold",44)/2, H-7.4*inch, 44)
c.setFont("Helvetica", 12); c.setFillColorRGB(*DK)
c.drawCentredString(W/2, 1.6*inch, "EducationWorksheet.com")
footer("")
newpage()

# ---------- How to use ----------
c.setFillColorRGB(*DK); c.setFont("Helvetica-Bold", 20)
c.drawCentredString(W/2, TOP-0.2*inch, "How to Use This Book")
tips = [
 "1.  Start at the big dotted letter at the top of each page.",
 "2.  Follow the dotted lines with a pencil to trace the letter.",
 "3.  Use the dashed middle line to keep letters the right height.",
 "4.  Trace each row from left to right, then try writing on your own.",
 "5.  Say the letter sound out loud as you trace.",
 "6.  Trace the picture word to learn a letter that starts with it.",
 "7.  Finish with the Letter Hunt game at the back of the book!",
]
c.setFont("Helvetica", 13)
yy = TOP - 0.9*inch
for t in tips:
    c.drawString(LEFT, yy, t); yy -= 0.55*inch
c.setFont("Helvetica-Oblique", 12); c.setFillColorRGB(*GRAY)
c.drawCentredString(W/2, BOT+0.6*inch, "Tip: Go slowly. Neat tracing builds strong handwriting!")
footer(pg)
newpage()

# ---------- Letters A-Z, 3 pages each ----------
for L in [chr(x) for x in range(ord('A'), ord('Z')+1)]:
    # Page 1: giant model + 2 trace rows
    center(f"Letter  {L}", TOP-0.1*inch, "Helvetica-Bold", 22, DK)
    # giant model letter
    big = 150
    bw = stringWidth(L, "Helvetica-Bold", big)
    dashed_text(L, W/2 - bw/2, TOP-2.7*inch, big, lw=1.4, dash=(3,4))
    # solid faint model to the side removed; add label
    c.setFont("Helvetica", 11); c.setFillColorRGB(*GRAY)
    c.drawCentredString(W/2, TOP-3.0*inch, "Trace the big letter, then the rows below.")
    # trace rows
    rowH = 1.0*inch
    y0 = TOP-4.2*inch
    for r in range(2):
        yb = y0 - r*(rowH+0.15*inch)
        guide_row(yb, rowH, 1)
        # dotted letters along the row
        s = 62
        gap = stringWidth(L+"  ", "Helvetica-Bold", s)
        x = LEFT + 4
        while x + stringWidth(L,"Helvetica-Bold",s) < RIGHT-4:
            dashed_text(L, x, yb+2, s)
            x += gap
    footer(pg); newpage()

    # Page 2: 4 practice trace rows
    center(f"Practice  {L}", TOP-0.1*inch, "Helvetica-Bold", 22, DK)
    rowH = 0.95*inch
    y0 = TOP-1.3*inch
    for r in range(4):
        yb = y0 - r*(rowH+0.18*inch)
        guide_row(yb, rowH, 1)
        s = 58
        gap = stringWidth(L+"  ", "Helvetica-Bold", s)
        x = LEFT + 4
        # first two are dotted to trace, rest blank for independent writing
        while x + stringWidth(L,"Helvetica-Bold",s) < RIGHT-4:
            if r < 2:
                dashed_text(L, x, yb+2, s)
            x += gap
    c.setFont("Helvetica-Oblique", 11); c.setFillColorRGB(*GRAY)
    c.drawCentredString(W/2, BOT+0.35*inch, "Trace the top rows, then write the letter on your own below.")
    footer(pg); newpage()

    # Page 3: word tracing
    word = WORDS[L]
    center(f"{L} is for {word}", TOP-0.1*inch, "Helvetica-Bold", 22, DK)
    # big dotted word
    ws = 60
    while stringWidth(word, "Helvetica-Bold", ws) > CW-10 and ws > 24:
        ws -= 2
    wb = stringWidth(word, "Helvetica-Bold", ws)
    guide_row(TOP-2.1*inch, 1.0*inch, 1)
    dashed_text(word, W/2 - wb/2, TOP-2.1*inch+2, ws)
    c.setFont("Helvetica", 11); c.setFillColorRGB(*GRAY)
    c.drawCentredString(W/2, TOP-2.5*inch, "Trace the word.")
    # independent practice rows of the letter
    c.setFont("Helvetica-Bold", 13); c.setFillColorRGB(*DK)
    c.drawString(LEFT, TOP-3.2*inch, f"Now write {L} by yourself:")
    rowH = 0.95*inch
    y0 = TOP-3.6*inch
    for r in range(3):
        yb = y0 - r*(rowH+0.2*inch)
        guide_row(yb, rowH, 1)
        if r == 0:
            s = 58
            gap = stringWidth(L+"  ", "Helvetica-Bold", s)
            x = LEFT + 4
            cnt=0
            while x + stringWidth(L,"Helvetica-Bold",s) < RIGHT-4 and cnt<3:
                dashed_text(L, x, yb+2, s); x += gap; cnt+=1
    footer(pg); newpage()

# ---------- Letter Hunt section ----------
center("Letter Hunt!", TOP-0.2*inch, "Helvetica-Bold", 26, DK)
c.setFont("Helvetica", 14); c.setFillColorRGB(*DK)
intro=[
 "Time to play! On the next pages you will find grids full of",
 "capital letters. For each grid, circle every target letter you",
 "can find. Then count how many you found and write the number",
 "in the box. Check your answers with the Answer Key at the back.",
]
yy=TOP-1.3*inch
for t in intro:
    c.drawString(LEFT, yy, t); yy-=0.4*inch
dashed_text("FIND THE LETTERS", LEFT+0.3*inch, BOT+2.2*inch, 26)
footer(pg); newpage()

# Build grids with computed answer key
random.seed(20260719)
alpha = [chr(x) for x in range(ord('A'), ord('Z')+1)]
targets = ['A','E','S','T','M','O']
answer_key = []
ROWS, COLS = 10, 12
for gi, tgt in enumerate(targets):
    center(f"Grid {gi+1}:  Circle every  {tgt}", TOP-0.15*inch, "Helvetica-Bold", 20, DK)
    # generate grid; guarantee a known count of target
    n_target = random.randint(9, 16)
    cells = []
    others = [a for a in alpha if a != tgt]
    total = ROWS*COLS
    cells = [tgt]*n_target + [random.choice(others) for _ in range(total-n_target)]
    random.shuffle(cells)
    count = cells.count(tgt)
    answer_key.append((gi+1, tgt, count))
    # draw grid
    gx0 = LEFT + 0.2*inch
    gx1 = RIGHT - 0.2*inch
    gy_top = TOP - 1.1*inch
    gy_bot = BOT + 1.1*inch
    cellw = (gx1-gx0)/COLS
    cellh = (gy_top-gy_bot)/ROWS
    c.setFont("Helvetica-Bold", 20); c.setFillColorRGB(*DK)
    for r in range(ROWS):
        for col in range(COLS):
            ch = cells[r*COLS+col]
            cx = gx0 + col*cellw + cellw/2
            cy = gy_top - r*cellh - cellh/2 - 6
            c.drawCentredString(cx, cy, ch)
    # answer box
    c.setLineWidth(1); c.setStrokeColorRGB(*DK)
    bx = W/2 - 1.6*inch
    by = BOT+0.35*inch
    c.setFont("Helvetica", 13); c.setFillColorRGB(*DK)
    c.drawString(bx, by+4, f"I found this many {tgt}'s:")
    c.rect(bx+2.05*inch, by-3, 0.55*inch, 0.32*inch)
    footer(pg); newpage()

# ---------- Answer key ----------
center("Answer Key", TOP-0.3*inch, "Helvetica-Bold", 26, DK)
c.setFont("Helvetica", 13); c.setFillColorRGB(*GRAY)
c.drawCentredString(W/2, TOP-0.8*inch, "Letter Hunt — number of each letter to circle")
c.setFont("Helvetica", 16); c.setFillColorRGB(*DK)
yy = TOP-1.7*inch
for (gnum, tgt, count) in answer_key:
    c.drawString(LEFT+0.5*inch, yy, f"Grid {gnum}   —   Letter {tgt}   —   {count} to circle")
    yy -= 0.6*inch
c.setFont("Helvetica-Oblique", 12); c.setFillColorRGB(*GRAY)
c.drawCentredString(W/2, BOT+1.0*inch, "Great job practicing your uppercase letters!")
footer(pg)
c.showPage()
c.save()

# write answer key json for verification
import json
with open("ul_answer_key.json","w") as f:
    json.dump([{"grid":g,"letter":t,"count":cnt} for g,t,cnt in answer_key], f, indent=2)
print("PAGES(last pg var):", pg)
print("Answer key:", answer_key)
