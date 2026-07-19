import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white

W, H = A4
GUTTER = 0.78 * inch   # inside/gutter >=0.7in
OUTER = 0.58 * inch    # outside >=0.5in
TOP = 0.72 * inch      # top >=0.6in
BOTTOM = 0.72 * inch   # bottom >=0.6in

ORANGE = HexColor("#f4820b")
CREAM = HexColor("#fff2e0")
DARK = HexColor("#7a3d00")
TEAL = HexColor("#178a86")
TRACE = HexColor("#c9c9c9")   # light gray traceable strokes (prints light in B&W)
GUIDE = HexColor("#cccccc")
MIDGUIDE = HexColor("#dcdcdc")

c = canvas.Canvas("uc_interior_v2.pdf", pagesize=A4)
page = 0

def new_page():
    global page
    if page > 0:
        c.showPage()
    page += 1
    return page

def lm_(pi):
    return GUTTER if pi % 2 == 1 else OUTER

def rm_(pi):
    return OUTER if pi % 2 == 1 else GUTTER

def footer(pi):
    c.setFont("Helvetica", 8)
    c.setFillColor(HexColor("#999999"))
    c.drawCentredString(W / 2, BOTTOM - 24, str(pi))
    c.setFillColor(black)

# keyword and short uppercase word per letter
LETTERS = {
    "A": ("Apple", "ANT"), "B": ("Ball", "BAT"), "C": ("Cat", "CAT"),
    "D": ("Dog", "DOG"), "E": ("Egg", "EGG"), "F": ("Fish", "FAN"),
    "G": ("Goat", "GO"), "H": ("Hat", "HAT"), "I": ("Igloo", "ICE"),
    "J": ("Jam", "JAM"), "K": ("Kite", "KEY"), "L": ("Lion", "LOG"),
    "M": ("Moon", "MAP"), "N": ("Nest", "NET"), "O": ("Owl", "OWL"),
    "P": ("Pig", "PEN"), "Q": ("Queen", "QUIZ"), "R": ("Rat", "RUN"),
    "S": ("Sun", "SUN"), "T": ("Top", "TOP"), "U": ("Umbrella", "UP"),
    "V": ("Van", "VAN"), "W": ("Web", "WEB"), "X": ("Fox", "BOX"),
    "Y": ("Yak", "YES"), "Z": ("Zebra", "ZOO"),
}

def guide_row(x0, x1, ybase, rh, dashed_mid=True):
    """Draw handwriting guide: top line, dashed midline, baseline."""
    c.setStrokeColor(GUIDE)
    c.setLineWidth(1)
    c.setDash()
    c.line(x0, ybase, x1, ybase)          # baseline
    c.line(x0, ybase + rh, x1, ybase + rh)  # top line
    if dashed_mid:
        c.setStrokeColor(MIDGUIDE)
        c.setDash(3, 3)
        c.line(x0, ybase + rh / 2, x1, ybase + rh / 2)
        c.setDash()
    c.setStrokeColor(black)

def trace_letter_row(letter, x0, x1, ybase, rh, first_solid=0):
    """Fill a guide row with light-gray traceable capital letters."""
    guide_row(x0, x1, ybase, rh)
    fs = rh * 1.15
    c.setFont("Helvetica-Bold", fs)
    step = c.stringWidth(letter, "Helvetica-Bold", fs) + rh * 0.55
    x = x0 + rh * 0.15
    idx = 0
    while x + c.stringWidth(letter, "Helvetica-Bold", fs) <= x1:
        c.setFillColor(black if idx < first_solid else TRACE)
        c.drawString(x, ybase + rh * 0.06, letter)
        x += step
        idx += 1
    c.setFillColor(black)

# ---------- TITLE PAGE ----------
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setFillColor(ORANGE)
c.roundRect(lm, H - TOP - 2.7 * inch, cw, 2.7 * inch, 16, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 40)
c.drawCentredString(lm + cw / 2, H - TOP - 1.2 * inch, "Uppercase Letter")
c.drawCentredString(lm + cw / 2, H - TOP - 1.85 * inch, "Tracing Workbook")
c.setFillColor(black); c.setFont("Helvetica-Bold", 17)
c.drawCentredString(lm + cw / 2, H - TOP - 3.15 * inch, "Trace the ABCs  -  Capital Letters A to Z")
c.setFont("Helvetica", 13)
c.drawCentredString(lm + cw / 2, H - TOP - 3.7 * inch, "Handwriting Practice for Kids Ages 3-5")
# alphabet motif in light gray
c.setFillColor(TRACE); c.setFont("Helvetica-Bold", 60)
c.drawCentredString(lm + cw / 2, H - TOP - 5.7 * inch, "A B C")
c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 30)
c.drawCentredString(lm + cw / 2, H - TOP - 6.7 * inch, "1 2 3 ... it's as easy as A B C!")
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 13)
c.drawCentredString(lm + cw / 2, BOTTOM + 0.25 * inch, "EducationWorksheet.com")
footer(page)

# ---------- HOW TO USE ----------
new_page(); lm = lm_(page); rm = rm_(page)
c.setFont("Helvetica-Bold", 18); c.setFillColor(ORANGE)
c.drawString(lm, H - TOP - 8, "How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica", 11.5)
lines = ["",
    "This workbook helps your child learn to write the capital letters",
    "A to Z through fun, guided tracing practice.",
    "",
    "1.  Look at the big letter at the top of each page.",
    "2.  Trace the light gray letters from left to right.",
    "3.  Follow the dashed middle line to keep letters neat.",
    "4.  Say the letter and its picture word out loud (A is for Apple!).",
    "5.  Then write the letter all by yourself on the blank lines.",
    "",
    "Tip for grown-ups:",
    "Use a pencil, keep each session short and playful, and praise",
    "every attempt. Repetition builds confidence and steady hands.",
    "",
    "There are four pages for every letter, plus review pages and a",
    "completion certificate at the end. Have fun learning the ABCs!",
]
y = H - TOP - 40
for ln in lines:
    c.drawString(lm, y, ln); y -= 21
footer(page)

# ---------- ALPHABET CHART ----------
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setFont("Helvetica-Bold", 18); c.setFillColor(ORANGE)
c.drawString(lm, H - TOP - 8, "The Alphabet: A to Z"); c.setFillColor(black)
c.setFont("Helvetica", 11)
c.drawString(lm, H - TOP - 32, "Here are all the capital letters you will learn in this book.")
cols = 5
cellw = cw / cols
letters = list(LETTERS.keys())
y0 = H - TOP - 70
rowh = 1.35 * inch
for i, L in enumerate(letters):
    r = i // cols; col = i % cols
    x = lm + col * cellw; yt = y0 - r * rowh
    c.setStrokeColor(HexColor("#e0b070")); c.setLineWidth(1)
    c.roundRect(x + 4, yt - rowh + 14, cellw - 8, rowh - 18, 8, stroke=1, fill=0)
    c.setFillColor(ORANGE); c.setFont("Helvetica-Bold", 40)
    c.drawCentredString(x + cellw / 2, yt - 40, L)
    c.setFillColor(DARK); c.setFont("Helvetica", 9)
    c.drawCentredString(x + cellw / 2, yt - rowh + 26, LETTERS[L][0])
    c.setFillColor(black)
footer(page)

# ---------- PER-LETTER PAGES (4 each) ----------
def letter_page1(L, kw):
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(ORANGE)
    c.drawString(lm, H - TOP - 6, f"Meet the Letter {L}"); c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(TEAL)
    c.drawRightString(W - rm, H - TOP - 4, f"{L} is for {kw}"); c.setFillColor(black)
    # giant traceable letter with baseline box
    boxtop = H - TOP - 0.5 * inch
    boxh = 3.9 * inch
    c.setStrokeColor(HexColor("#e0b070")); c.setLineWidth(1.4); c.setDash(4, 4)
    c.roundRect(lm, boxtop - boxh, cw, boxh, 10, stroke=1, fill=0); c.setDash()
    c.setFillColor(TRACE); c.setFont("Helvetica-Bold", 230)
    c.drawCentredString(lm + cw / 2, boxtop - boxh + 0.55 * inch, L)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 12); c.setFillColor(DARK)
    c.drawString(lm, boxtop - boxh - 20, "Trace the big letter with your finger, then with a pencil.")
    c.setFillColor(black)
    # two trace rows below
    rh = 0.85 * inch
    yb = BOTTOM + 1.4 * inch
    trace_letter_row(L, lm, W - rm, yb + rh + 0.35 * inch, rh)
    trace_letter_row(L, lm, W - rm, yb, rh)
    footer(page)

def letter_page2(L, kw):
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(ORANGE)
    c.drawString(lm, H - TOP - 6, f"Trace the Letter {L}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace each row of letters. Stay between the lines!")
    c.setFillColor(black)
    rh = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    for i in range(5):
        yb = top - i * (rh + gap) - rh
        trace_letter_row(L, lm, W - rm, yb, rh)
    footer(page)

def letter_page3(L, kw):
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(ORANGE)
    c.drawString(lm, H - TOP - 6, f"Trace, Then Write {L}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace the top rows, then write the letter yourself below.")
    c.setFillColor(black)
    rh = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    # 2 traced rows, 3 blank practice rows
    for i in range(5):
        yb = top - i * (rh + gap) - rh
        if i < 2:
            trace_letter_row(L, lm, W - rm, yb, rh, first_solid=0)
        else:
            guide_row(lm, W - rm, yb, rh)
    footer(page)

def letter_page4(L, kw, word):
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    c.setFont("Helvetica-Bold", 16); c.setFillColor(ORANGE)
    c.drawString(lm, H - TOP - 6, f"Word Practice: {word}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, f"{L} is for {kw}. Trace the word, then write it yourself.")
    c.setFillColor(black)
    rh = 0.95 * inch
    gap = 0.82 * inch
    top = H - TOP - 0.9 * inch
    # traced word rows (2), then blank rows (3)
    def word_row(yb, traced):
        guide_row(lm, W - rm, yb, rh)
        if traced:
            fs = rh * 1.1
            c.setFont("Helvetica-Bold", fs)
            c.setFillColor(TRACE)
            # repeat the word across
            unit = word + "  "
            x = lm + rh * 0.15
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

# ---------- REVIEW PAGES ----------
groups = [("A", "F"), ("G", "L"), ("M", "R"), ("S", "Z")]
alpha = list(LETTERS.keys())
def group_letters(a, b):
    return alpha[alpha.index(a):alpha.index(b) + 1]

for a, b in groups:
    new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
    gl = group_letters(a, b)
    c.setFont("Helvetica-Bold", 16); c.setFillColor(ORANGE)
    c.drawString(lm, H - TOP - 6, f"Review: Letters {a} to {b}"); c.setFillColor(black)
    c.setFont("Helvetica", 11); c.setFillColor(DARK)
    c.drawString(lm, H - TOP - 26, "Trace one row of each letter you have learned.")
    c.setFillColor(black)
    rh = 0.72 * inch
    n = len(gl)
    avail = (H - TOP - 0.9 * inch) - (BOTTOM + 0.3 * inch)
    gap = (avail - n * rh) / max(1, n - 1) if n > 1 else 0.3 * inch
    top = H - TOP - 0.9 * inch
    for i, L in enumerate(gl):
        yb = top - i * (rh + gap) - rh
        c.setFont("Helvetica-Bold", 13); c.setFillColor(TEAL)
        c.drawString(lm, yb + rh + 4, L)
        c.setFillColor(black)
        trace_letter_row(L, lm + 0.3 * inch, W - rm, yb, rh)
    footer(page)

# ---------- CERTIFICATE ----------
new_page(); lm = lm_(page); rm = rm_(page); cw = W - lm - rm
c.setStrokeColor(ORANGE); c.setLineWidth(4)
c.roundRect(lm, BOTTOM, cw, H - TOP - BOTTOM, 16, stroke=1, fill=0)
c.setStrokeColor(TEAL); c.setLineWidth(1.5)
c.roundRect(lm + 12, BOTTOM + 12, cw - 24, H - TOP - BOTTOM - 24, 12, stroke=1, fill=0)
c.setFillColor(ORANGE); c.setFont("Helvetica-Bold", 34)
c.drawCentredString(W / 2, H - TOP - 2.0 * inch, "Great Job!")
c.setFillColor(black); c.setFont("Helvetica-Bold", 18)
c.drawCentredString(W / 2, H - TOP - 2.9 * inch, "Certificate of Completion")
c.setFont("Helvetica", 13)
c.drawCentredString(W / 2, H - TOP - 3.7 * inch, "This certifies that")
c.setStrokeColor(HexColor("#cccccc")); c.setLineWidth(1)
c.line(W / 2 - 2.4 * inch, H - TOP - 4.6 * inch, W / 2 + 2.4 * inch, H - TOP - 4.6 * inch)
c.setFont("Helvetica-Oblique", 10)
c.drawCentredString(W / 2, H - TOP - 4.85 * inch, "(write your name)")
c.setFont("Helvetica", 13)
c.drawCentredString(W / 2, H - TOP - 5.6 * inch, "has learned to trace all the capital letters A to Z!")
c.setFillColor(TEAL); c.setFont("Helvetica-Bold", 48)
c.drawCentredString(W / 2, H - TOP - 7.0 * inch, "A B C")
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 12)
c.drawCentredString(W / 2, BOTTOM + 0.6 * inch, "EducationWorksheet.com")
footer(page)

c.showPage()
c.save()
meta = {"title": "Uppercase Letter Tracing Workbook", "pages": page}
json.dump(meta, open("uc_meta.json", "w"))
print(json.dumps(meta, indent=2))
