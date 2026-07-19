"""
Lowercase Letter Tracing Workbook — Kindle cover  1600 x 2560 px
Uses ReportLab at 200 DPI on a 8 x 12.8 in canvas → converts to JPEG
Purple / Blue color scheme
"""
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
import subprocess, os

KW, KH = 8.0, 12.8           # inches at 200 DPI = 1600 x 2560 px
TMP    = "lc_kindle_tmp.pdf"
OUT    = "lc_kindle_cover.jpg"

PURPLE = HexColor("#6a1b9a")
DARK   = HexColor("#4a148c")
BLUE   = HexColor("#1565c0")
CREAM  = HexColor("#f3e5f5")
INDIGO = HexColor("#283593")

c  = canvas.Canvas(TMP, pagesize=(KW * inch, KH * inch))
W  = KW * inch
H  = KH * inch
cx = W / 2

# Background
c.setFillColor(PURPLE); c.rect(0, 0, W, H, fill=1, stroke=0)

# Cream title panel
c.setFillColor(CREAM); c.rect(0, H - 3.9 * inch, W, 3.9 * inch, fill=1, stroke=0)

# Title
c.setFillColor(DARK); c.setFont("Helvetica-Bold", 72)
c.drawCentredString(cx, H - 1.50 * inch, "Lowercase")
c.drawCentredString(cx, H - 2.45 * inch, "Letter Tracing")
c.setFont("Helvetica-Bold", 54)
c.drawCentredString(cx, H - 3.25 * inch, "Workbook")

# Big a b c
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 210)
c.drawCentredString(cx, H - 7.20 * inch, "a b c")

# Age badge
c.setFillColor(BLUE)
c.circle(W - 1.55 * inch, H - 5.00 * inch, 0.90 * inch, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 22)
c.drawCentredString(W - 1.55 * inch, H - 4.88 * inch, "Ages")
c.drawCentredString(W - 1.55 * inch, H - 5.28 * inch, "3–5")

# Subtitle banner
c.setFillColor(INDIGO)
c.roundRect(cx - 3.4 * inch, H - 8.50 * inch, 6.8 * inch, 0.85 * inch, 10, fill=1, stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold", 26)
c.drawCentredString(cx, H - 8.22 * inch, "Trace Small Letters a to z")

# Tagline
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 22)
c.drawCentredString(cx, H - 9.20 * inch, "Handwriting Practice for Kids")

# Brand
c.setFillColor(CREAM); c.setFont("Helvetica-Bold", 20)
c.drawCentredString(cx, 0.60 * inch, "EducationWorksheet.com")

c.showPage()
c.save()

# Convert PDF → JPEG at 200 DPI using Ghostscript (if available), else ImageMagick
gs_ok = subprocess.run(["which", "gs"], capture_output=True).returncode == 0
im_ok = subprocess.run(["which", "convert"], capture_output=True).returncode == 0

if gs_ok:
    subprocess.run([
        "gs", "-dNOPAUSE", "-dBATCH", "-sDEVICE=jpeg", "-r200",
        f"-sOutputFile={OUT}", TMP
    ], check=True)
    print(f"Kindle cover (Ghostscript) → {OUT}")
elif im_ok:
    subprocess.run(["convert", "-density", "200", TMP, "-quality", "95", OUT], check=True)
    print(f"Kindle cover (ImageMagick) → {OUT}")
else:
    print("Neither gs nor convert found — keeping lc_kindle_tmp.pdf as fallback")
    os.rename(TMP, OUT.replace(".jpg", ".pdf"))
