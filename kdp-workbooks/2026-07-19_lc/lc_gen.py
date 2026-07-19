"""
Lowercase Letter Tracing Workbook for Kids Ages 3-5
A4, B&W interior, 0.78in gutter, 4 pages per letter = 112 pages
Color scheme: Purple / Blue (distinct from Uppercase orange/teal)
"""

import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white

W, H = A4
GUTTER = 0.78 * inch   # inside/gutter >= 0.7 in
OUTER  = 0.58 * inch   # outside >= 0.5 in
TOP    = 0.72 * inch   # top >= 0.6 in
BOTTOM = 0.72 * inch   # bottom >= 0.6 in

# Color palette (purple/blue — distinct from uppercase orange/teal)
PURPLE   = HexColor("#6a1b9a")
LAVENDER = HexColor("#f3e5f5")
DARK     = HexColor("#4a148c")
BLUE     = HexColor("#1565c0")
TRACE    = HexColor("#c9c9c9")
GUIDE    = HexColor("#cccccc")
MIDGUIDE = HexColor("#dcdcdc")

c = canvas.Canvas("lc_interior.pdf", pagesize=A4)
page = 0

def new_page():
    global page
    if page > 0:
        c.showPage()
    page += 1
    return page

def lm_(pi): return GUTTER if pi % 2 == 1 else OUTER
def rm_(pi): return OUTER  if pi % 2 == 1 else GUTTER

def footer(pi):
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#999999"))
    c.drawCentredString(W / 2, BOTTOM - 24, str(pi))
    c.setFillColor(black)

# keyword and short lowercase word per letter (distinct from uppercase keywords)
LETTERS = {
    "a": ("Acorn",    "ant"),
    "b": ("Bee",      "bug"),
    "c": ("Cloud",    "cup"),
    "d": ("Duck",     "dot"),
    "e": ("Elf",      "elm"),
    "f": ("Frog",     "fog"),
    "g": ("Gift",     "gap"),
    "h": ("Hen",      "hop"),
    "i": ("Ink",      "ivy"),
    "j": ("Jar",      "jog"),
    "k": ("Key",      "kit"),
    "l": ("Lily",     "lip"),
    "m": ("Mouse",    "mud"),
    "n": ("Net",      "nap"),
    "o": ("Oak",      "oat"),
    "p": ("Pod",      "pin"),
    "q": ("Quilt",    "quiz"),
    "r": ("Ring",     "rip"),
    "s": ("Star",     "sit"),
    "t": ("Tree",     "tip"),
    "u": ("Urn",      "use"),
    "v": ("Vine",     "van"),
    "w": ("Worm",     "wag"),
    "x": ("Fox",      "fix"),
    "y": ("Yarn",     "yam"),
    "z": ("Zebra",    "zip"),
}

# ──────────────────────────────────────────────────────────────────────────────
# Drawing helpers
# ──────────────────────────────────────────────────────────────────────────────

def guide_row(x0, x1, ybase, rh, dashed_mid=True):
    """Handwriting guide: baseline + top + optional dashed mid."""
    c.setStrokeColor(GUIDE)
    c.setLineWidth(1)
    c.setDash()
    c.line(x0, ybase,      x1, ybase)           # baseline
    c.line(x0, ybase + rh, x1, ybase + rh)      # top line
    if dashed_mid:
        c.setStrokeColor(MIDGUIDE)
        c.setDash(3, 3)
        c.line(x0, ybase + rh / 2, x1, ybase + rh / 2)
        c.setDash()
    c.setStrokeColor(black)

def trace_letter_row(letter, x0, x1, ybase, rh, first_solid=0):
    """Fill a guide row with light-gray traceable letters."""
    guide_row(x0, x1, ybase, rh)
    fs   = rh * 1.15
    c.setFont("Helvetica-Bold", fs)
    step = c.stringWidth(letter, "Helvetica-Bold", fs) + rh * 0.55
    x    = x0 + rh * 0.15
    idx  = 0
    while x + c.stringWidth(letter, "Helvetica-Bold", fs) <= x1:
        c.setFillColor(black if idx < first_solid else TRACE)
        c.drawString(x, ybase + rh * 0.06, letter)
        x  += step
        idx += 1
    c.setFillColor(black)

# ──────────────────────────────────────────────────────────────────────────────
# TITLE PAGE
# ──────────────────────────────────────────────────────────────────────────────
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setFillColor(PURPLE)
c.roundRect(lm, H - TOP - 2.7 * inch, cw, 2.7 * inch, 16, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 40)
c.drawCentredString(lm + cw / 2, H - TOP - 1.20 * inch, "Lowercase Letter")
c.drawCentredString(lm + cw / 2, H - TOP - 1.85 * inch, "Tracing Workbook")
c.setFillColor(black); c.setFont("Helvetica-Bold", 17)
c.drawCentredString(lm + cw / 2, H - TOP - 3.15 * inch, "Trace the ABCs  ·  Small Letters a to z")
c.setFont("Helvetica", 13)
c.drawCentredString(lm + cw / 2, H - TOP - 3.70 * inch, "Handwriting Practice for Kids Ages 3-5")
c.setFillColor(TRACE); c.setFont("Helvetica-Bold", 60)
c.drawCentredString(lm + cw / 2, H - TOP - 5.70 * inch, "a  b  c")
c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 28)
c.drawCentredString(lm + cw / 2, H - TOP - 6.70 * inch, "Learn to write the small letters!")
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(lm + cw / 2, BOTTOM + 0.25 * inch, "EducationWorksheet.com")
footer(page)

# ──────────────────────────────────────────────────────────────────────────────
# HOW TO USE
# ──────────────────────────────────────────────────────────────────────────────
new_page(); lm = lm_(page); rm = rm_(page)
c.setFont("Helvetica-Bold", 18); c.setFillColor(PURPLE)
c.drawString(lm, H - TOP - 8, "How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica", 11.5)
lines = [
    "",
    "This workbook helps your child learn to write the small (lowercase)",
    "letters a to z through fun, guided tracing practice.",
    "",
    "1.  Look at the big letter at the top of each page.",
    "2.  Trace the light gray letters from left to right.",
    "3.  Follow the dashed middle line to keep letters neat.",
    "4.  Say the letter and its picture word out loud",
    "     (a is for Acorn!).",
    "5.  Then write the letter all by yourself on the blank lines.",
    "",
    "Tip for grown-ups:",
    "Use a pencil, keep each session short and playful, and praise",
    "every attempt. Repetition builds confidence and steady hands.",
    "",
    "There are four pages for every letter, plus review pages,",
    "matching activities, and a completion certificate at the end.",
    "Have fun learning all the small letters!",
]
y = H - TOP - 40
for ln in lines:
    c.drawString(lm, y, ln); y -= 21
footer(page)

# ──────────────────────────────────────────────────────────────────────────────
# ALPHABET CHART (lowercase)
# ──────────────────────────────────────────────────────────────────────────────
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setFont("Helvetica-Bold", 18); c.setFillColor(PURPLE)
c.drawString(lm, H - TOP - 8, "The Alphabet: a to z"); c.setFillColor(black)
c.setFont("Helvetica", 11)
c.drawString(lm, H - TOP - 32, "Here are all the small letters you will learn in this book.")
cols  = 5
cellw = cw / cols
letters_list = list(LETTERS.keys())
y0   = H - TOP - 70
rowh = 1.35 * inch
for i, L in enumerate(letters_list):
    r   = i // cols; col = i % cols
    x   = lm + col * cellw
    yt  = y0 - r * rowh
    c.setStrokeColor(HexColor("#b39ddb")); c.setLineWidth(1)
    c.roundRect(x + 4, yt - rowh + 14, cellw - 8, rowh - 18, 8, stroke=1, fill=0)
    c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 40)
    c.drawCentredString(x + cellw / 2, yt - 40, L)
    c.setFillColor(DARK); c.setFont("Helvetica", 9)
    c.drawCentredString(x + cellw / 2, yt - rowh + 26, LETTERS[L][0])
    c.setFillColor(black)
footer(page)

# ──────────────────────────────────────────────────────────────────────────────
# PER-LETTER PAGES  (4 per letter, 26 letters = 104 pages)
# ──────────────────────────────────────────────────────────────────────────────

def letter_page1(L, kw):
    """Page 1: Meet the letter — giant model + 2 trace rows."""
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Meet the Letter  {L}"); c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(BLUE)
    c.drawRightString(W - rm, H - TOP - 4, f"{L}  is for  {kw}"); c.setFillColor(black)
    # giant traceable letter
    boxtop = H - TOP - 0.5 * inch
    boxh   = 3.9 * inch
    c.setStrokeColor(HexColor("#b39ddb")); c.setLineWidth(1.4); c.setDash(4, 4)
    c.roundRect(lm, boxtop - boxh, cw, boxh, 10, stroke=1, fill=0); c.setDash()
    c.setFillColor(TRACE); c.setFont("Helvetica-Bold", 230)
    c.drawCentredString(lm + cw / 2, boxtop - boxh + 0.55 * inch, L)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(DARK)
    c.drawString(lm, boxtop - boxh - 20, "Trace the big letter with your finger, then with a pencil.")
    c.setFillColor(black)
    rh = 0.85 * inch
    yb = BOTTOM + 1.4 * inch
    trace_letter_row(L, lm, W - rm, yb + rh + 0.35 * inch, rh)
    trace_letter_row(L, lm, W - rm, yb, rh)
    footer(page)

def letter_page2(L, kw):
    """Page 2: Trace 5 rows."""
    new_page(); lm = lm_(page); rm = rm_(page)
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Trace the Letter  {L}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace each row of letters. Stay between the lines!")
    c.setFillColor(black)
    rh  = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    for i in range(5):
        yb = top - i * (rh + gap) - rh
        trace_letter_row(L, lm, W - rm, yb, rh)
    footer(page)

def letter_page3(L, kw):
    """Page 3: Trace 2 rows, then write 3 blank rows."""
    new_page(); lm = lm_(page); rm = rm_(page)
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Trace, Then Write  {L}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace the top rows, then write the letter yourself below.")
    c.setFillColor(black)
    rh  = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    for i in range(5):
        yb = top - i * (rh + gap) - rh
        if i < 2:
            trace_letter_row(L, lm, W - rm, yb, rh, first_solid=0)
        else:
            guide_row(lm, W - rm, yb, rh)
    footer(page)

def letter_page4(L, kw, word):
    """Page 4: Word practice — trace the word, then write it."""
    new_page(); lm = lm_(page); rm = rm_(page)
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Word Practice: {word}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, f"{L} is for {kw}. Trace the word, then write it yourself.")
    c.setFillColor(black)
    rh  = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    def word_row(yb, traced):
        guide_row(lm, W - rm, yb, rh)
        if traced:
            fs   = rh * 1.1
            c.setFont("Helvetica-Bold", fs)
            c.setFillColor(TRACE)
            unit = word + "  "
            x    = lm + rh * 0.15
            while x + c.stringWidth(word, "Helvetica-Bold", fs) <= W - rm:
                c.drawString(x, yb + rh * 0.06, word)
                x += c.stringWidth(unit, "Helvetica-Bold", fs)
            c.setFillColor(black)
    for i in range(5):
        yb = top - i * (rh + gap) - rh
        word_row(yb, traced=(i < 2))
    footer(page)

for L, (kw, word) in LETTERS.items():
    letter_page1(L, kw)
    letter_page2(L, kw)
    letter_page3(L, kw)
    letter_page4(L, kw, word)

# ──────────────────────────────────────────────────────────────────────────────
# REVIEW PAGES  (4 groups of letters, 1 page each = 4 pages)
# ──────────────────────────────────────────────────────────────────────────────
groups = [("a", "f"), ("g", "l"), ("m", "r"), ("s", "z")]

def group_letters(a, b):
    return letters_list[letters_list.index(a):letters_list.index(b) + 1]

for a, b in groups:
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    gl = group_letters(a, b)
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Review: Letters {a} to {b}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace one row of each letter you have learned.")
    c.setFillColor(black)
    rh   = 0.72 * inch
    n    = len(gl)
    avail = (H - TOP - 0.9 * inch) - (BOTTOM + 0.3 * inch)
    gap  = (avail - n * rh) / max(1, n - 1) if n > 1 else 0.3 * inch
    top  = H - TOP - 0.9 * inch
    for i, L in enumerate(gl):
        yb = top - i * (rh + gap) - rh
        c.setFont("Helvetica-Bold", 13); c.setFillColor(PURPLE)
        c.drawString(lm, yb + rh + 4, L)
        c.setFillColor(black)
        trace_letter_row(L, lm + 0.3 * inch, W - rm, yb, rh)
    footer(page)

# ──────────────────────────────────────────────────────────────────────────────
# MATCH UPPERCASE TO LOWERCASE  (2 activity pages)
# ──────────────────────────────────────────────────────────────────────────────
import random

def match_page(letter_range, suffix):
    """Left column: uppercase; right column: shuffled lowercase. Draw a line to match."""
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(PURPLE)
    c.drawString(lm, H - TOP - 6, f"Match Big to Small  {suffix}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Draw a line to match each big letter to its small letter.")
    c.setFillColor(black)

    n = len(letter_range)
    random.seed(99 + ord(letter_range[0]))
    shuffled = letter_range[:]
    random.shuffle(shuffled)

    avail_h = (H - TOP - 0.9 * inch) - (BOTTOM + 0.3 * inch)
    row_h   = avail_h / n
    top_y   = H - TOP - 0.9 * inch

    left_x  = lm + cw * 0.18
    right_x = lm + cw * 0.82

    for i, L in enumerate(letter_range):
        y = top_y - (i + 0.5) * row_h + 8
        # Big (uppercase) on left
        c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(left_x, y, L.upper())
        # Small (lowercase, shuffled) on right
        c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(right_x, y, shuffled[i])
        c.setFillColor(black)
        # Dotted line in between (for child to draw over)
        c.setStrokeColor(GUIDE); c.setDash(2, 5); c.setLineWidth(0.5)
        c.line(left_x + 18, y + 8, right_x - 18, y + 8)
        c.setDash(); c.setLineWidth(1)
    footer(page)

match_page(list("abcdefghijklm"), "(a – m)")
match_page(list("nopqrstuvwxyz"), "(n – z)")

# ──────────────────────────────────────────────────────────────────────────────
# CERTIFICATE
# ──────────────────────────────────────────────────────────────────────────────
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setStrokeColor(PURPLE); c.setLineWidth(4)
c.roundRect(lm, BOTTOM, cw, H - TOP - BOTTOM, 16, stroke=1, fill=0)
c.setStrokeColor(BLUE); c.setLineWidth(1.5)
c.roundRect(lm + 12, BOTTOM + 12, cw - 24, H - TOP - BOTTOM - 24, 12, stroke=1, fill=0)
c.setFillColor(PURPLE); c.setFont("Helvetica-Bold", 34)
c.drawCentredString(W / 2, H - TOP - 2.0 * inch, "Great Job!")
c.setFillColor(black); c.setFont("Helvetica-Bold", 18)
c.drawCentredString(W / 2, H - TOP - 2.9 * inch, "Certificate of Completion")
c.setFont("Helvetica", 13)
c.drawCentredString(W / 2, H - TOP - 3.7 * inch, "This certifies that")
c.setStrokeColor(HexColor("#cccccc")); c.setLineWidth(1)
c.line(W / 2 - 2.4 * inch, H - TOP - 4.6 * inch,
       W / 2 + 2.4 * inch, H - TOP - 4.6 * inch)
c.setFont("Helvetica-Oblique", 10)
c.drawCentredString(W / 2, H - TOP - 4.85 * inch, "(write your name)")
c.setFont("Helvetica", 13)
c.drawCentredString(W / 2, H - TOP - 5.6 * inch,
                    "has learned to trace all the small letters  a to z!")
c.setFillColor(BLUE); c.setFont("Helvetica-Bold", 48)
c.drawCentredString(W / 2, H - TOP - 7.0 * inch, "a  b  c")
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 12)
c.drawCentredString(W / 2, BOTTOM + 0.6 * inch, "EducationWorksheet.com")
footer(page)

c.showPage()
c.save()

meta = {"title": "Lowercase Letter Tracing Workbook", "pages": page}
json.dump(meta, open("lc_meta.json", "w"))
print(json.dumps(meta, indent=2))
