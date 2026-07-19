"""
Letters + First Words Tracing Workbook
A-Z: each letter gets 4 pages
  1. Meet the letter (big Aa, arrow stroke order)
  2. Trace UPPERCASE rows
  3. Trace lowercase rows
  4. Trace the first word (e.g. Apple, Ball...)
Plus: title page, how-to, A-Z chart, 4 review pages, certificate = ~110 pages
A4, B&W, No Bleed
"""
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, black, white
import math

OUT = "fw_interior.pdf"
PW, PH = 8.268 * inch, 11.693 * inch   # A4
MARGIN = 0.75 * inch
CX = PW / 2
BOT_M   = 0.45 * inch   # bottom safe margin (KDP min 0.375")
TOP_M   = 0.30 * inch   # top safe margin (KDP min 0.25")
HDR_H   = 0.85 * inch   # header bar height
FTR_H   = 0.32 * inch   # footer bar height
# Content area (between header and footer)
CT  = PH - TOP_M - HDR_H         # content top   (~10.51")
CB  = BOT_M + FTR_H              # content bottom (~0.77")

GREEN  = HexColor("#2e7d32")
DGREEN = HexColor("#1b5e20")
LIME   = HexColor("#c8e6c9")
TEAL   = HexColor("#00796b")
CREAM  = HexColor("#f9fbe7")

c = canvas.Canvas(OUT, pagesize=(PW, PH))

# First words and picture words for each letter
WORDS = {
    'A': 'Apple',   'B': 'Ball',   'C': 'Cat',   'D': 'Dog',
    'E': 'Egg',     'F': 'Fish',   'G': 'Gift',  'H': 'Hat',
    'I': 'Ice',     'J': 'Jar',    'K': 'Kite',  'L': 'Leaf',
    'M': 'Map',     'N': 'Nest',   'O': 'Oak',   'P': 'Pan',
    'Q': 'Queen',   'R': 'Rain',   'S': 'Sun',   'T': 'Top',
    'U': 'Umbrella','V': 'Van',    'W': 'Web',   'X': 'Box',
    'Y': 'Yarn',    'Z': 'Zebra',
}

def header_bar(c, title):
    bar_y = PH - TOP_M - HDR_H     # bottom edge of header bar (within top safe margin)
    c.setFillColor(GREEN)
    # Stay within MARGIN (0.75") on each side — satisfies 0.375" gutter requirement
    c.rect(MARGIN, bar_y, PW - 2*MARGIN, HDR_H, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(CX, bar_y + 0.28*inch, title)

def footer(c, pg):
    # Footer bar starts at BOT_M, inset by MARGIN on each side
    c.setFillColor(GREEN)
    c.rect(MARGIN, BOT_M, PW - 2*MARGIN, FTR_H, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica", 11)
    c.drawCentredString(CX, BOT_M + 0.09*inch, f"EducationWorksheet.com  ·  {pg}")

def dashed_line(c, x1, y, x2, color=HexColor("#cccccc"), dash=4):
    c.setStrokeColor(color)
    c.setLineWidth(0.6)
    c.setDash(dash, 3)
    c.line(x1, y, x2, y)
    c.setDash()

def dotted_letter(c, letter, x, y, size):
    """Draw a large dotted/dashed outline letter for tracing."""
    c.setFillColor(HexColor("#aaaaaa"))
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(x, y, letter)

def trace_row(c, letter, y, size=54, n=5):
    """One row of trace letters."""
    spacing = (PW - 2*MARGIN) / n
    # First letter solid grey model
    c.setFillColor(HexColor("#999999"))
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(MARGIN + spacing*0.5, y, letter)
    # Rest dashed (simulate with light color)
    c.setFillColor(HexColor("#dddddd"))
    for i in range(1, n):
        c.drawCentredString(MARGIN + spacing*(i+0.5), y, letter)
    # Baseline
    dashed_line(c, MARGIN, y - 4, PW - MARGIN)

def word_trace_row(c, word, y, size=38, n=2):
    """One row of trace words."""
    spacing = (PW - 2*MARGIN) / n
    c.setFillColor(HexColor("#999999"))
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(MARGIN + spacing*0.5, y, word)
    c.setFillColor(HexColor("#dddddd"))
    c.drawCentredString(MARGIN + spacing*1.5, y, word)
    dashed_line(c, MARGIN, y - 4, PW - MARGIN)

page_num = [0]
def newpage():
    page_num[0] += 1
    return page_num[0]

# ── PAGE 1: TITLE ──────────────────────────────────────────────────────────────
pg = newpage()
c.setFillColor(GREEN)
c.rect(MARGIN, BOT_M, PW - 2*MARGIN, PH - TOP_M - BOT_M, fill=1, stroke=0)
c.setFillColor(LIME)
c.rect(MARGIN, PH*0.25, PW - 2*MARGIN, PH*0.5, fill=1, stroke=0)
c.setFillColor(DGREEN)
c.setFont("Helvetica-Bold", 48)
c.drawCentredString(CX, PH - 1.8*inch, "Letters +")
c.drawCentredString(CX, PH - 2.65*inch, "First Words")
c.setFont("Helvetica-Bold", 34)
c.drawCentredString(CX, PH - 3.35*inch, "Tracing Workbook")
c.setFillColor(white)
c.setFont("Helvetica-Bold", 26)
c.drawCentredString(CX, PH*0.25 + 3.5*inch, "Aa Bb Cc")
c.setFont("Helvetica-Bold", 20)
c.drawCentredString(CX, PH*0.25 + 2.8*inch, "Trace Letters & First Words")
c.setFillColor(TEAL)
c.roundRect(CX-2.5*inch, PH*0.25+1.9*inch, 5*inch, 0.65*inch, 8, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 18)
c.drawCentredString(CX, PH*0.25+2.15*inch, "Handwriting Practice for Kids · Ages 3-5")
c.setFillColor(white); c.setFont("Helvetica-Bold", 14)
c.drawCentredString(CX, 0.9*inch, "EducationWorksheet.com")
c.showPage()

# ── PAGE 2: HOW TO USE ─────────────────────────────────────────────────────────
pg = newpage()
header_bar(c, "How to Use This Workbook")
c.setFillColor(black); c.setFont("Helvetica-Bold", 16)
c.drawString(MARGIN, PH - 1.6*inch, "This workbook teaches letters and first words in 4 easy steps:")
tips = [
    ("1", "Meet the Letter", "See the big letter and learn its shape. Trace the arrows."),
    ("2", "Trace Uppercase", "Trace the capital letter rows from left to right."),
    ("3", "Trace Lowercase", "Trace the small letter rows neatly."),
    ("4", "Trace the Word",  "Trace and copy the first word for that letter."),
]
y = PH - 2.2*inch
for num, title, desc in tips:
    c.setFillColor(GREEN)
    c.circle(MARGIN + 0.18*inch, y + 0.18*inch, 0.22*inch, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(MARGIN + 0.18*inch, y + 0.12*inch, num)
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN + 0.55*inch, y + 0.18*inch, title)
    c.setFillColor(black); c.setFont("Helvetica", 13)
    c.drawString(MARGIN + 0.55*inch, y - 0.1*inch, desc)
    y -= 0.75*inch
footer(c, pg)
c.showPage()

# ── PAGE 3: A–Z CHART ─────────────────────────────────────────────────────────
pg = newpage()
header_bar(c, "The Alphabet — A to Z")
cols, rows = 7, 4
cell_w = (PW - 2*MARGIN) / cols
cell_h = (CT - 0.4*inch - CB - 0.1*inch) / rows  # fit between header and footer
letters = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
for i, L in enumerate(letters):
    col = i % cols; row = i // cols
    x = MARGIN + col*cell_w
    y = (CT - 0.4*inch) - (row+1)*cell_h + 0.15*inch
    c.setFillColor(LIME)
    c.roundRect(x+4, y, cell_w-8, cell_h-8, 6, fill=1, stroke=0)
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(x + cell_w/2, y + cell_h*0.5, L)
    c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(x + cell_w/2, y + cell_h*0.2, L.lower())
footer(c, pg)
c.showPage()

# ── LETTER PAGES (4 pages each) ───────────────────────────────────────────────
for L in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    l = L.lower()
    word = WORDS[L]

    # --- Page 1: Meet the Letter ---
    pg = newpage()
    header_bar(c, f"Meet the Letter  {L} {l}")
    # Big letters
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 160)
    c.drawCentredString(PW*0.3, PH - 4.2*inch, L)
    c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 160)
    c.drawCentredString(PW*0.72, PH - 4.2*inch, l)
    # Labels
    c.setFillColor(black); c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(PW*0.3, PH - 4.7*inch, "Uppercase")
    c.drawCentredString(PW*0.72, PH - 4.7*inch, "Lowercase")
    # Word preview
    c.setFillColor(LIME)
    c.roundRect(MARGIN, PH - 7.2*inch, PW - 2*MARGIN, 1.8*inch, 10, fill=1, stroke=0)
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 20)
    c.drawCentredString(CX, PH - 5.8*inch, f"{L} is for {word}!")
    c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 36)
    c.drawCentredString(CX, PH - 6.7*inch, word)
    # Trace instruction
    c.setFillColor(black); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(CX, PH - 7.8*inch, "Trace the letters below — follow the arrows!")
    # Quick trace row
    trace_row(c, L, PH - 8.7*inch, size=44, n=6)
    footer(c, pg)
    c.showPage()

    # --- Page 2: Trace UPPERCASE ---
    pg = newpage()
    header_bar(c, f"Trace Uppercase  {L}  {L}  {L}")
    y = PH - 1.8*inch
    for _ in range(4):
        trace_row(c, L, y, size=54, n=5)
        y -= 1.55*inch
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(CX, y - 0.1*inch, f"Now write it yourself!")
    y -= 0.55*inch
    dashed_line(c, MARGIN, y, PW - MARGIN, color=HexColor("#aaaaaa"), dash=6)
    footer(c, pg)
    c.showPage()

    # --- Page 3: Trace lowercase ---
    pg = newpage()
    header_bar(c, f"Trace Lowercase  {l}  {l}  {l}")
    y = PH - 1.8*inch
    for _ in range(4):
        trace_row(c, l, y, size=54, n=5)
        y -= 1.55*inch
    c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(CX, y - 0.1*inch, f"Now write it yourself!")
    y -= 0.55*inch
    dashed_line(c, MARGIN, y, PW - MARGIN, color=HexColor("#aaaaaa"), dash=6)
    footer(c, pg)
    c.showPage()

    # --- Page 4: Trace the word ---
    pg = newpage()
    header_bar(c, f"Trace the Word:  {word}")
    # Word model
    c.setFillColor(LIME)
    c.roundRect(MARGIN, PH - 2.6*inch, PW - 2*MARGIN, 1.2*inch, 8, fill=1, stroke=0)
    c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 40)
    c.drawCentredString(CX, PH - 2.05*inch, word)
    # Trace rows
    y = PH - 3.3*inch
    word_size = max(22, min(38, int(300 / len(word))))
    n_per_row = 2 if len(word) > 5 else 3
    for _ in range(4):
        word_trace_row(c, word, y, size=word_size, n=n_per_row)
        y -= 1.35*inch
    # Write yourself
    c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 14)
    c.drawCentredString(CX, y - 0.05*inch, "Write the word yourself:")
    y -= 0.5*inch
    dashed_line(c, MARGIN, y, PW - MARGIN, color=HexColor("#aaaaaa"), dash=6)
    footer(c, pg)
    c.showPage()

# ── REVIEW PAGES ──────────────────────────────────────────────────────────────
review_sets = [
    ("A–F", list("ABCDEF")),
    ("G–L", list("GHIJKL")),
    ("M–R", list("MNOPQR")),
    ("S–Z", list("STUVWXYZ")),
]
for label, rev_letters in review_sets:
    pg = newpage()
    header_bar(c, f"Review: Letters {label}")
    c.setFillColor(black); c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN, PH - 1.55*inch, "Match each uppercase letter to its lowercase and first word:")
    y = PH - 2.1*inch
    for RL in rev_letters:
        c.setFillColor(LIME)
        c.roundRect(MARGIN, y - 0.28*inch, PW - 2*MARGIN, 0.55*inch, 6, fill=1, stroke=0)
        c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 22)
        c.drawString(MARGIN + 0.2*inch, y, RL)
        c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 22)
        c.drawString(MARGIN + 0.8*inch, y, RL.lower())
        c.setFillColor(black); c.setFont("Helvetica", 14)
        c.drawString(MARGIN + 1.5*inch, y, f"→  {WORDS[RL]}")
        # Trace line
        c.setFillColor(HexColor("#cccccc"))
        c.setFont("Helvetica-Bold", 18)
        c.drawString(PW*0.62, y, "_ _ _ _ _ _ _ _ _")
        y -= 0.78*inch
    footer(c, pg)
    c.showPage()

# ── CERTIFICATE ───────────────────────────────────────────────────────────────
pg = newpage()
c.setFillColor(LIME); c.rect(MARGIN, BOT_M, PW - 2*MARGIN, PH - TOP_M - BOT_M, fill=1, stroke=0)
c.setStrokeColor(GREEN); c.setLineWidth(6)
border_m = 0.5 * inch   # border margin (> KDP minimums)
c.roundRect(border_m, border_m, PW - 2*border_m, PH - 2*border_m, 16, fill=0, stroke=1)
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 42)
c.drawCentredString(CX, PH - 2.0*inch, "Certificate of")
c.drawCentredString(CX, PH - 2.7*inch, "Achievement!")
c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 22)
c.drawCentredString(CX, PH - 3.5*inch, "This certifies that")
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 26)
c.drawCentredString(CX, PH*0.52, "________________________________")
c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 20)
c.drawCentredString(CX, PH*0.52 - 0.6*inch, "has completed the")
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 24)
c.drawCentredString(CX, PH*0.52 - 1.2*inch, "Letters + First Words Tracing Workbook!")
c.setFillColor(black); c.setFont("Helvetica-Bold", 16)
c.drawCentredString(CX, PH*0.52 - 2.0*inch, "Excellent work tracing all 26 letters and first words!")
c.setFillColor(DGREEN); c.setFont("Helvetica-Bold", 14)
c.drawString(MARGIN + 0.5*inch, 1.2*inch, "Date: _________________________")
c.drawString(PW*0.6, 1.2*inch, "Sign: _________________________")
footer(c, pg)
c.showPage()

c.save()
total = page_num[0]
print(f"fw_interior.pdf — {total} pages")
