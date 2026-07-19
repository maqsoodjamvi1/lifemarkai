#!/usr/bin/env python3
"""Kindergarten Number Tracing Workbook — interior PDF (A4, B&W, no-bleed)."""
import random
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor

random.seed(717)

PW, PH = A4  # 595.276 x 841.890 pt
ML = 0.9 * inch
MR = 0.9 * inch
MT = 0.8 * inch
MB = 0.8 * inch
CW = PW - ML - MR
CH = PH - MT - MB

BLACK = HexColor("#000000")
GRAY = HexColor("#B8B8B8")
LGRAY = HexColor("#DDDDDD")
MGRAY = HexColor("#666666")

WORDS = ["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten",
         "Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen",
         "Eighteen","Nineteen","Twenty"]

OUT = "interior_print_v3.pdf"
c = canvas.Canvas(OUT, pagesize=A4)

counting_answers = []
missing_answers = []

def footer(page_label):
    c.setFont("Helvetica", 8)
    c.setFillColor(MGRAY)
    c.drawCentredString(PW/2, 0.68*inch, "EducationWorksheet.com")
    c.setFillColor(BLACK)

def new_page():
    c.showPage()

# ---------- TITLE PAGE ----------
c.setFillColor(BLACK)
c.setFont("Helvetica-Bold", 34)
c.drawCentredString(PW/2, PH-2.4*inch, "Number Tracing")
c.drawCentredString(PW/2, PH-3.0*inch, "Workbook")
c.setFont("Helvetica-Bold", 20)
c.drawCentredString(PW/2, PH-3.8*inch, "For Kindergarten")
c.setFont("Helvetica", 15)
c.drawCentredString(PW/2, PH-4.5*inch, "Trace, Count & Write Numbers 0 to 20")
c.setFont("Helvetica-Bold", 40)
c.setFillColor(GRAY)
c.drawCentredString(PW/2, PH-6.2*inch, "1  2  3  4  5")
c.drawCentredString(PW/2, PH-7.0*inch, "6  7  8  9  10")
c.setFillColor(BLACK)
c.setFont("Helvetica", 13)
c.drawCentredString(PW/2, 2.2*inch, "100+ Tracing, Counting & Writing Activities")
c.setFont("Helvetica-Bold", 13)
c.drawCentredString(PW/2, 1.7*inch, "EducationWorksheet.com")
new_page()

# ---------- HOW TO USE ----------
c.setFillColor(BLACK)
c.setFont("Helvetica-Bold", 22)
c.drawCentredString(PW/2, PH-1.5*inch, "How to Use This Book")
c.setFont("Helvetica", 13)
tips = [
    "Welcome, little learner!  This book helps your child recognize,",
    "trace, and write the numbers 0 to 20.",
    "",
    "1.  Start with the tracing pages.  Trace each dotted number slowly,",
    "     following the light gray guide lines.",
    "",
    "2.  Use the counting pages to count the pictures and write the",
    "     correct number in the box.",
    "",
    "3.  The missing-number pages build number order and counting-on",
    "     skills.  Fill in the number that belongs in the blank.",
    "",
    "4.  Check work with the Answer Key at the back of the book.",
    "",
    "Tips for grown-ups:",
    "   -  Keep sessions short and fun (10-15 minutes).",
    "   -  Praise effort, not just correct answers.",
    "   -  Use a pencil so mistakes are easy to erase.",
]
y = PH-2.3*inch
for line in tips:
    c.drawString(ML, y, line)
    y -= 0.32*inch
new_page()

# ---------- TRACING PAGES ----------
def tracing_page(n):
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(ML, PH-MT-0.08*inch, "Trace the Number")
    c.setFont("Helvetica-Bold", 16)
    c.drawRightString(PW-MR, PH-MT-0.08*inch, WORDS[n])
    c.setStrokeColor(LGRAY); c.setLineWidth(1)
    c.line(ML, PH-MT-0.26*inch, PW-MR, PH-MT-0.26*inch)

    top = PH-MT-0.35*inch
    c.setFont("Helvetica-Bold", 150)
    c.setFillColor(BLACK)
    c.drawString(ML+0.1*inch, top-1.9*inch, str(n))
    c.setFillColor(GRAY)
    c.drawString(ML+1.9*inch, top-1.9*inch, str(n))
    if n >= 10:
        c.drawString(ML+3.6*inch, top-1.9*inch, str(n))
    c.setFillColor(BLACK)

    row_y = top-2.6*inch
    c.setFont("Helvetica-Bold", 52)
    for r in range(3):
        yy = row_y - r*0.95*inch
        c.setStrokeColor(LGRAY); c.setLineWidth(0.8)
        c.line(ML, yy-0.08*inch, PW-MR, yy-0.08*inch)
        c.setFillColor(GRAY)
        xx = ML+0.15*inch
        step = 0.62*inch if n>=10 else 0.42*inch
        count = int((CW-0.3*inch)//step)
        for i in range(count):
            c.drawString(xx, yy, str(n))
            xx += step
    c.setFillColor(BLACK)

    by = MB+0.15*inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(ML, by+1.35*inch, "Color %d %s:" % (n, "circle" if n==1 else "circles"))
    cx = ML+0.2*inch; cy = by+0.9*inch; per_row=10
    c.setLineWidth(1.2); c.setStrokeColor(BLACK)
    for i in range(n):
        c.circle(cx+ (i%per_row)*0.42*inch, cy - (i//per_row)*0.42*inch, 0.14*inch, stroke=1, fill=0)
    footer("")

for n in range(0, 21):
    tracing_page(n)
    new_page()

# ---------- COUNTING PAGES ----------
SHAPES = ["circle","square","star","triangle","heart"]

def draw_shape(cx, cy, s, size):
    import math
    c.setLineWidth(1.4); c.setStrokeColor(BLACK); c.setFillColor(BLACK)
    if s == "circle":
        c.circle(cx, cy, size, stroke=1, fill=1)
    elif s == "square":
        c.rect(cx-size, cy-size, 2*size, 2*size, stroke=1, fill=1)
    elif s == "triangle":
        p = c.beginPath(); p.moveTo(cx, cy+size); p.lineTo(cx-size, cy-size); p.lineTo(cx+size, cy-size); p.close()
        c.drawPath(p, stroke=1, fill=1)
    elif s == "star":
        p = c.beginPath()
        for k in range(10):
            ang = math.pi/2 + k*math.pi/5
            rr = size if k%2==0 else size*0.45
            x = cx+rr*math.cos(ang); yy=cy+rr*math.sin(ang)
            if k==0: p.moveTo(x,yy)
            else: p.lineTo(x,yy)
        p.close(); c.drawPath(p, stroke=1, fill=1)
    elif s == "heart":
        p = c.beginPath()
        p.moveTo(cx, cy-size)
        p.curveTo(cx-size*1.4, cy+size*0.4, cx-size*0.4, cy+size*1.2, cx, cy+size*0.4)
        p.curveTo(cx+size*0.4, cy+size*1.2, cx+size*1.4, cy+size*0.4, cx, cy-size)
        p.close(); c.drawPath(p, stroke=1, fill=1)

counting_prob_num = 0
def counting_page(page_idx, problems):
    global counting_prob_num
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(ML, PH-MT-0.08*inch, "Count and Write the Number")
    c.setFont("Helvetica", 10); c.setFillColor(MGRAY)
    c.drawRightString(PW-MR, PH-MT-0.06*inch, "Count the pictures. Write how many in the box.")
    c.setFillColor(BLACK)
    c.setStrokeColor(LGRAY); c.setLineWidth(1)
    c.line(ML, PH-MT-0.26*inch, PW-MR, PH-MT-0.26*inch)

    gap = 0.25*inch
    cellw = (CW-gap)/2
    cellh = (CH-0.5*inch-gap)/2
    top = PH-MT-0.45*inch
    for idx,(count,shape) in enumerate(problems):
        counting_prob_num += 1
        row = idx//2; col = idx%2
        x0 = ML + col*(cellw+gap)
        y0 = top - row*(cellh+gap) - cellh
        c.setStrokeColor(LGRAY); c.setLineWidth(1)
        c.roundRect(x0, y0, cellw, cellh, 8, stroke=1, fill=0)
        c.setFillColor(BLACK); c.setFont("Helvetica-Bold", 13)
        c.drawString(x0+0.15*inch, y0+cellh-0.3*inch, "%d)" % counting_prob_num)
        c.setStrokeColor(BLACK); c.setLineWidth(1.5)
        bxs=0.5*inch
        c.rect(x0+cellw-0.75*inch, y0+0.2*inch, bxs, bxs, stroke=1, fill=0)
        c.setFont("Helvetica", 9); c.setFillColor(MGRAY)
        c.drawString(x0+0.2*inch, y0+0.32*inch, "How many?")
        c.setFillColor(BLACK)
        area_x = x0+0.3*inch; area_top = y0+cellh-0.55*inch
        per_row = 4; ssize = 0.16*inch; sp = 0.55*inch
        for i in range(count):
            sx = area_x + (i%per_row)*sp + 0.2*inch
            sy = area_top - (i//per_row)*sp
            draw_shape(sx, sy, shape, ssize)
        counting_answers.append((counting_prob_num, count))
    footer("")

counting_pages_data = []
for p in range(20):
    probs = []
    for k in range(4):
        cnt = random.randint(1,20)
        shp = random.choice(SHAPES)
        probs.append((cnt, shp))
    counting_pages_data.append(probs)

for p, probs in enumerate(counting_pages_data):
    counting_page(p, probs)
    new_page()

# ---------- MISSING NUMBER PAGES ----------
missing_prob_num = 0
def missing_page(problems):
    global missing_prob_num
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(ML, PH-MT-0.08*inch, "Missing Numbers")
    c.setFont("Helvetica", 10); c.setFillColor(MGRAY)
    c.drawRightString(PW-MR, PH-MT-0.06*inch, "Write the number that belongs in the blank.")
    c.setFillColor(BLACK)
    c.setStrokeColor(LGRAY); c.setLineWidth(1)
    c.line(ML, PH-MT-0.26*inch, PW-MR, PH-MT-0.26*inch)

    top = PH-MT-0.7*inch
    rowh = CH/ len(problems)
    for idx,(seq, ans) in enumerate(problems):
        missing_prob_num += 1
        yy = top - idx*rowh
        c.setFont("Helvetica-Bold", 14); c.setFillColor(BLACK)
        c.drawString(ML, yy, "%d)" % missing_prob_num)
        bx = ML+0.6*inch; bw=0.7*inch; bh=0.6*inch; sp=0.2*inch
        for val in seq:
            c.setStrokeColor(BLACK); c.setLineWidth(1.4)
            c.rect(bx, yy-0.2*inch, bw, bh, stroke=1, fill=0)
            if val is not None:
                c.setFont("Helvetica-Bold", 24)
                c.drawCentredString(bx+bw/2, yy-0.02*inch, str(val))
            bx += bw+sp
        missing_answers.append((missing_prob_num, ans))
    footer("")

missing_pages_data = []
for p in range(8):
    probs = []
    for k in range(4):
        start = random.randint(0, 15)
        seq_vals = [start, start+1, start+2, start+3, start+4]
        blank = random.randint(1,3)
        ans = seq_vals[blank]
        seq = [v if i!=blank else None for i,v in enumerate(seq_vals)]
        probs.append((seq, ans))
    missing_pages_data.append(probs)

for probs in missing_pages_data:
    missing_page(probs)
    new_page()

# ---------- ANSWER KEY ----------
def answer_key():
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(PW/2, PH-1.3*inch, "Answer Key")
    c.setFont("Helvetica-Bold", 14)
    y = PH-2.0*inch
    c.drawString(ML, y, "Count and Write the Number")
    y -= 0.3*inch
    c.setFont("Helvetica", 11)
    col = 0; startx = ML; colw = CW/5
    x = startx; yy = y
    per_col = 16
    for i,(num,ans) in enumerate(counting_answers):
        c.drawString(x, yy, "%d) %d" % (num, ans))
        yy -= 0.24*inch
        if (i+1) % per_col == 0:
            col += 1; x = startx + col*colw; yy = y

def answer_key2():
    c.setFillColor(BLACK)
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(PW/2, PH-1.3*inch, "Answer Key (continued)")
    c.setFont("Helvetica-Bold", 14)
    y = PH-2.0*inch
    c.drawString(ML, y, "Missing Numbers")
    y -= 0.3*inch
    c.setFont("Helvetica", 11)
    col=0; startx=ML; colw=CW/4; x=startx; yy=y; per_col=16
    for i,(num,ans) in enumerate(missing_answers):
        c.drawString(x, yy, "%d) %d" % (num, ans))
        yy -= 0.24*inch
        if (i+1)%per_col==0:
            col+=1; x=startx+col*colw; yy=y

answer_key()
new_page()
answer_key2()
c.showPage()
c.save()

total_problems = len(counting_answers) + len(missing_answers)
print("SAVED", OUT)
print("counting problems:", len(counting_answers))
print("missing problems:", len(missing_answers))
print("total answerable problems:", total_problems)
import json
with open("answers.json","w") as f:
    json.dump({"counting":counting_answers,"missing":missing_answers}, f)
