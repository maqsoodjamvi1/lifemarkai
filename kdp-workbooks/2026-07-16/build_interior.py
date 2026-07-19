#!/usr/bin/env python3
"""Grade 3 Multiplication & Division Workbook - A4 B&W interior."""
import random, json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor

random.seed(20260716)  # deterministic

OUT = "/sessions/kind-loving-lovelace/mnt/lifemarkai/kdp-workbooks/2026-07-16/interior.pdf"
W, H = A4  # points

# Margins: generous inside gutter, safe outer/top/bottom
GUTTER = 0.5 * inch
OUTER = 0.4 * inch
TOP = 0.55 * inch
BOTTOM = 0.5 * inch

PROBLEMS_PER_PAGE = 4   # large problems with solving space (matches established product)
NUM_PRACTICE_PAGES = 35  # -> 140 problems total, cover claims "140 Practice Problems"

c = canvas.Canvas(OUT, pagesize=A4)

def left_margin(page_index):
    # odd page numbers (1-based) are right-hand pages -> gutter on left
    return GUTTER if (page_index % 2 == 1) else OUTER

def footer(page_index, label=None):
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#888888"))
    # page number centered
    c.drawCentredString(W/2, 0.28*inch, str(page_index))
    c.setFillColor(black)

page = 0

def new_page():
    global page
    if page > 0:
        c.showPage()
    page += 1
    return page

# ---------- Title page ----------
new_page()
c.setFillColor(HexColor("#1f6feb"))
c.rect(0, H-3.2*inch, W, 3.2*inch, fill=1, stroke=0)
c.setFillColor(HexColor("#ffffff"))
c.setFont("Helvetica-Bold", 30)
c.drawCentredString(W/2, H-1.7*inch, "Multiplication &")
c.drawCentredString(W/2, H-2.25*inch, "Division Workbook")
c.setFont("Helvetica-Bold", 16)
c.drawCentredString(W/2, H-2.75*inch, "Grade 3")
c.setFillColor(black)
c.setFont("Helvetica", 13)
c.drawCentredString(W/2, H-4.1*inch, "140 Practice Problems  •  Facts 0–12")
c.drawCentredString(W/2, H-4.5*inch, "With Complete Answer Key")
c.setFont("Helvetica-Bold", 12)
c.drawCentredString(W/2, 1.4*inch, "EducationWorksheet.com")

# ---------- How to use ----------
new_page()
lm = left_margin(page)
c.setFont("Helvetica-Bold", 18)
c.drawString(lm, H-TOP-6, "How to Use This Workbook")
c.setFont("Helvetica", 11.5)
lines = [
    "",
    "This workbook helps Grade 3 students master multiplication and",
    "division facts through 12 with plenty of daily practice.",
    "",
    "• Each page has 15 problems. Write your answer on the blank line.",
    "• Multiplication and division pages alternate so skills stay fresh.",
    "• Work a page or two a day — short, regular practice works best.",
    "• Check your work using the Answer Key at the back of the book.",
    "• Circle any problem you miss and try it again tomorrow.",
    "",
    "Tip for grown-ups: praise effort, keep sessions short and positive,",
    "and celebrate progress. Consistency beats long, tiring sessions.",
]
y = H-TOP-40
for ln in lines:
    c.drawString(lm, y, ln)
    y -= 20
footer(page)

# ---------- Practice pages ----------
answer_key = []  # list of (problem_str, answer)

def gen_mult():
    a = random.randint(2, 12); b = random.randint(2, 12)
    return f"{a} × {b} =", a*b

def gen_div():
    b = random.randint(2, 12); q = random.randint(2, 12)
    a = b*q
    return f"{a} ÷ {b} =", q

prob_number = 0
for p in range(NUM_PRACTICE_PAGES):
    new_page()
    lm = left_margin(page)
    is_mult = (p % 2 == 0)
    title = "Multiplication" if is_mult else "Division"
    c.setFont("Helvetica-Bold", 15)
    c.setFillColor(HexColor("#1f6feb"))
    c.drawString(lm, H-TOP-4, f"{title} Practice")
    c.setFillColor(black)
    c.setFont("Helvetica", 9)
    c.drawRightString(W-OUTER, H-TOP-2, "Name: ______________   Date: ________")
    # 4 large problems per page, each in its own solving box
    area_top = H-TOP-58
    area_bottom = BOTTOM + 8
    block_h = (area_top - area_bottom) / PROBLEMS_PER_PAGE
    box_w = (W - lm - OUTER)
    for i in range(PROBLEMS_PER_PAGE):
        yy_top = area_top - i*block_h
        prob_number += 1
        if is_mult:
            ps, ans = gen_mult()
        else:
            ps, ans = gen_div()
        answer_key.append((prob_number, ps.replace(" =",""), ans))
        # box
        c.setStrokeColor(HexColor("#c9d6ea")); c.setLineWidth(1)
        c.roundRect(lm, yy_top-block_h+10, box_w, block_h-14, 8, stroke=1, fill=0)
        # number badge
        c.setFillColor(HexColor("#1f6feb"))
        c.circle(lm+18, yy_top-12, 11, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(lm+18, yy_top-15.5, str(prob_number))
        # problem text
        c.setFillColor(black); c.setFont("Helvetica-Bold", 22)
        c.drawString(lm+40, yy_top-20, ps)
        # answer line
        c.setFont("Helvetica-Bold", 22)
        c.drawString(lm+40+150, yy_top-20, "__________")
        # "show your work" hint
        c.setFont("Helvetica-Oblique", 8); c.setFillColor(HexColor("#9aa7bd"))
        c.drawString(lm+40, yy_top-block_h+22, "show your work")
        c.setFillColor(black)
    footer(page)

total_problems = prob_number

# ---------- Answer key ----------
# format: compact, multiple columns
def key_header():
    new_page()
    lm2 = left_margin(page)
    c.setFont("Helvetica-Bold", 18)
    c.setFillColor(HexColor("#1f6feb"))
    c.drawString(lm2, H-TOP-6, "Answer Key")
    c.setFillColor(black)
    return lm2

lm = key_header()
c.setFont("Helvetica", 9)
per_col = 44
cols = 4
col_w = (W - lm - OUTER)/cols
y0 = H-TOP-34
idx = 0
col = 0
y = y0
for (num, ps, ans) in answer_key:
    x = lm + col*col_w
    c.drawString(x, y, f"{num}. {ps} = {ans}")
    y -= 15.5
    idx += 1
    if idx % per_col == 0:
        col += 1
        y = y0
        if col >= cols:
            footer(page)
            key_header()
            c.setFont("Helvetica", 9)
            col = 0
            y = y0
footer(page)

c.showPage()
c.save()

meta = {
    "title": "Multiplication & Division Workbook - Grade 3",
    "total_pages": page,
    "total_problems": total_problems,
    "problems_per_page": PROBLEMS_PER_PAGE,
    "practice_pages": NUM_PRACTICE_PAGES,
}
with open("/sessions/kind-loving-lovelace/mnt/lifemarkai/kdp-workbooks/2026-07-16/answer_key.json","w") as f:
    json.dump({"meta": meta, "key": answer_key}, f)
print(json.dumps(meta, indent=2))
