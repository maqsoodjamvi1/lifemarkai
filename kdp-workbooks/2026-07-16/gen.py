import random, json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor

random.seed(20260716)
W, H = A4

# KDP no-bleed SAFE margins: keep ALL ink inside these insets.
GUTTER = 0.55 * inch     # inside/gutter
OUTER  = 0.45 * inch     # outer edge
TOP    = 0.55 * inch     # top safe inset (nothing above H-TOP)
BOTTOM = 0.55 * inch     # bottom safe inset (nothing below BOTTOM)

BLUE   = HexColor("#1f6feb")
ORANGE = HexColor("#ff8c42")
GREEN  = HexColor("#2a9d5c")
GREY   = HexColor("#888888")
LIGHT  = HexColor("#eef4ff")

TITLE = "Multiplication & Division Workbook"
GRADE = "Grade 3"

c = canvas.Canvas("interior.pdf", pagesize=A4)
page = 0

def new_page():
    global page
    if page > 0:
        c.showPage()
    page += 1
    return page

def lmf(pi):
    return GUTTER if pi % 2 == 1 else OUTER

def rmf(pi):
    # right-side safe edge (mirror gutter on even pages)
    return W - (OUTER if pi % 2 == 1 else GUTTER)

def footer(pi):
    c.setFont("Helvetica", 8); c.setFillColor(GREY)
    c.drawCentredString(W/2, BOTTOM - 0.18*inch if False else 0.42*inch, str(pi))
    c.setFillColor(black)

def make_mult():
    a = random.randint(2, 12); b = random.randint(2, 12)
    return (f"{a} x {b}", a*b)

def make_div():
    b = random.randint(2, 12); q = random.randint(2, 12)
    return (f"{b*q} / {b}", q)

key = []

# ---------- TITLE PAGE (inset panel, no edge bleed) ----------
new_page()
lm = lmf(page); rm = rmf(page)
c.setFillColor(BLUE)
c.roundRect(lm, H-3.7*inch, rm-lm, 3.15*inch, 12, fill=1, stroke=0)
c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 30)
c.drawCentredString(W/2, H-1.7*inch, "Multiplication &")
c.drawCentredString(W/2, H-2.25*inch, "Division Workbook")
c.setFont("Helvetica-Bold", 16); c.drawCentredString(W/2, H-2.85*inch, GRADE)
c.setFillColor(HexColor("#ffd23f")); c.setFont("Helvetica-Bold", 20)
for x in [1.5, 2.9, 4.1, 5.3, 6.7]:
    c.drawCentredString(x*inch, H-3.35*inch, "*")
c.setFillColor(black); c.setFont("Helvetica", 13)
c.drawCentredString(W/2, H-4.5*inch, "130+ Practice Pages  -  Facts 0-12")
c.drawCentredString(W/2, H-4.9*inch, "With Complete Answer Key")
c.setFont("Helvetica", 11)
c.drawCentredString(W/2, H-5.4*inch, "Name: ______________________________")
c.setFont("Helvetica-Bold", 12); c.drawCentredString(W/2, 1.5*inch, "EducationWorksheet.com")
footer(page)

# ---------- HOW TO USE ----------
new_page(); lm = lmf(page)
c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 20)
c.drawString(lm, H-TOP-0.1*inch, "How to Use This Workbook")
c.setFillColor(black); c.setFont("Helvetica", 12)
lines = [
 "Welcome, young mathematician!","",
 "This book is full of multiplication and division practice.",
 "Each page has one big problem with room to work it out.","",
 "1. Read the problem at the top of the page.",
 "2. Use the space to draw, count, or show your work.",
 "3. Write your answer in the answer box.",
 "4. Check your work with the Answer Key at the back.","",
 "Tips:",
 "  -  For multiplication, try drawing rows and columns (arrays).",
 "  -  For division, share the total into equal groups.",
 "  -  Practice a few pages every day. Little and often wins!","",
 "There is no timer here. Take your time and have fun.",
 "You've got this!",
]
y = H - TOP - 0.7*inch
for ln in lines:
    c.drawString(lm, y, ln); y -= 0.32*inch
footer(page)

# ---------- TIMES TABLE ----------
new_page(); lm = lmf(page); rm = rmf(page)
c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 20)
c.drawCentredString(W/2, H-TOP-0.1*inch, "Multiplication Table (0-12)")
c.setFillColor(black)
grid_n = 13
avail_w = rm - lm
cell = avail_w / (grid_n+1)
x0 = lm; y0 = H - TOP - 0.7*inch
for r in range(grid_n+1):
    for col in range(grid_n+1):
        cx = x0 + col*cell; cy = y0 - r*cell
        c.rect(cx, cy-cell, cell, cell, stroke=1, fill=0)
        if r == 0 and col == 0:
            c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(cx+cell/2, cy-cell*0.7, "x"); c.setFillColor(black)
        elif r == 0:
            c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(cx+cell/2, cy-cell*0.7, str(col-1)); c.setFillColor(black)
        elif col == 0:
            c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 8)
            c.drawCentredString(cx+cell/2, cy-cell*0.7, str(r-1)); c.setFillColor(black)
        else:
            c.setFont("Helvetica", 7)
            c.drawCentredString(cx+cell/2, cy-cell*0.7, str((r-1)*(col-1)))
c.setFont("Helvetica", 11)
c.drawCentredString(W/2, 1.3*inch, "Use this chart to check your multiplication facts!")
footer(page)

# ---------- PRACTICE PAGES ----------
PRACTICE_PAGES = 132
pnum = 0
for i in range(PRACTICE_PAGES):
    new_page(); lm = lmf(page); rm = rmf(page)
    # header band fully within top safe area (top edge at H-TOP)
    band_top = H - TOP
    band_h = 0.42*inch
    c.setFillColor(LIGHT); c.rect(lm, band_top-band_h, rm-lm, band_h, fill=1, stroke=0)
    c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 13)
    c.drawString(lm+0.12*inch, band_top-band_h+0.14*inch, f"Practice Page {i+1}")
    c.setFillColor(GREY); c.setFont("Helvetica", 9)
    c.drawRightString(rm-0.12*inch, band_top-band_h+0.15*inch, "Show your work below")
    c.setFillColor(black)

    if i % 2 == 0:
        txt, ans = make_mult()
    else:
        txt, ans = make_div()
    pnum += 1; key.append((pnum, txt, ans))

    c.setFillColor(black); c.setFont("Helvetica-Bold", 52)
    c.drawCentredString(W/2, H-TOP-1.7*inch, f"{txt} =")

    box_top = H-TOP-2.3*inch; box_bottom = BOTTOM + 1.7*inch
    c.setStrokeColor(HexColor("#cccccc")); c.setLineWidth(1)
    c.rect(lm, box_bottom, rm-lm, box_top-box_bottom, stroke=1, fill=0)
    c.setFillColor(GREY); c.setFont("Helvetica-Oblique", 10)
    c.drawString(lm+0.15*inch, box_top-0.28*inch, "Work it out here:")
    c.setFillColor(black)

    ay = BOTTOM + 0.55*inch
    c.setFont("Helvetica-Bold", 14); c.setFillColor(BLUE)
    c.drawString(lm, ay+0.32*inch, "Answer:")
    c.setStrokeColor(BLUE); c.setLineWidth(2)
    c.rect(lm+1.2*inch, ay, 1.9*inch, 0.65*inch, stroke=1, fill=0)
    c.setFillColor(black)

    if (i+1) % 10 == 0:
        if random.random() < 0.5:
            t2, a2 = make_mult()
        else:
            t2, a2 = make_div()
        pnum += 1; key.append((pnum, t2, a2))
        c.setFillColor(ORANGE); c.setFont("Helvetica-Bold", 12)
        c.drawString(lm+3.5*inch, ay+0.45*inch, "* Challenge:")
        c.setFillColor(black); c.setFont("Helvetica-Bold", 18)
        c.drawString(lm+3.5*inch, ay+0.12*inch, f"{t2} = ______")

    footer(page)

# ---------- ANSWER KEY ----------
total_problems = len(key)

def key_header():
    lm = lmf(page); rm = rmf(page)
    c.setFillColor(GREEN)
    c.roundRect(lm, H-TOP-0.5*inch, rm-lm, 0.6*inch, 8, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(W/2, H-TOP-0.15*inch, "Answer Key")
    c.setFillColor(black)

new_page(); key_header()
cols = 4; lm = lmf(page); rm = rmf(page)
avail = rm - lm; colw = avail/cols
ytop = H - TOP - 1.0*inch; line_h = 0.26*inch
rows_per_col = int((ytop - BOTTOM) / line_h)
c.setFont("Helvetica", 9)
idx = 0; col = 0
for (n, txt, ans) in key:
    x = lm + col*colw
    yy = ytop - (idx % rows_per_col)*line_h
    c.drawString(x, yy, f"{n}. {txt} = {ans}")
    idx += 1
    if idx % rows_per_col == 0:
        col += 1
        if col >= cols:
            col = 0; footer(page)
            new_page(); key_header(); lm = lmf(page); rm = rmf(page)
            ytop = H - TOP - 1.0*inch; idx = 0
footer(page)

c.save()

meta = {"title": f"{TITLE} - {GRADE}", "total_pages": page,
        "total_problems": total_problems, "practice_pages": PRACTICE_PAGES, "trim": "A4"}
with open("answer_key.json", "w") as f:
    json.dump({"meta": meta, "key": [[n, t, a] for (n, t, a) in key]}, f)
print(json.dumps(meta, indent=2))
