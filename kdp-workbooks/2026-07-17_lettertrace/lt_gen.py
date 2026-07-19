import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
W,H=A4
GUTTER=0.75*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
c=canvas.Canvas("lt_interior.pdf", pagesize=A4)
page=0
TEAL=HexColor("#0e9aa7"); LIGHT=HexColor("#e0f7f9"); DARK=HexColor("#0a5560"); TRACE=HexColor("#bfe8ec")
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)
WORDS={'A':'Apple','B':'Ball','C':'Cat','D':'Dog','E':'Egg','F':'Fish','G':'Goat','H':'Hat','I':'Igloo','J':'Jam','K':'Kite','L':'Lion','M':'Moon','N':'Nest','O':'Orange','P':'Pig','Q':'Queen','R':'Rat','S':'Sun','T':'Tree','U':'Umbrella','V':'Van','W':'Web','X':'Xylophone','Y':'Yak','Z':'Zebra'}

# Title
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(TEAL); c.roundRect(lm,H-TOP-2.6*inch,cw,2.6*inch,14,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",40)
c.drawCentredString(lm+cw/2,H-TOP-1.15*inch,"Letter Tracing")
c.setFont("Helvetica-Bold",30); c.drawCentredString(lm+cw/2,H-TOP-1.85*inch,"for Kids")
c.setFillColor(black); c.setFont("Helvetica-Bold",16); c.drawCentredString(lm+cw/2,H-TOP-2.9*inch,"Ages 3-5  -  Trace A-Z, a-z, Numbers & First Words")
c.setFont("Helvetica",13); c.drawCentredString(lm+cw/2,H-TOP-3.5*inch,"Handwriting Practice Workbook")
c.setFont("Helvetica-Bold",12); c.drawCentredString(lm+cw/2,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(TEAL); c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
for i,ln in enumerate(["","This workbook helps your child learn to write with fun, guided","letter and number tracing.","","- Trace the big light letter, then the rows of letters.","- Say the letter and the picture word out loud.","- Practice writing on your own at the bottom of each page.","- Move from capital letters to small letters to first words.","","Tip for grown-ups: use a pencil, keep it short and playful,","and praise every try. A little practice each day works best."]):
    c.drawString(lm,H-TOP-36-i*20,ln)
footer(page)

def trace_letter_page(ch, sub=""):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(TEAL); c.drawString(lm,H-TOP-4,f"Trace the Letter"); c.setFillColor(black)
    up=ch.upper()
    if up in WORDS:
        c.setFont("Helvetica",11); c.setFillColor(DARK); c.drawRightString(W-rm,H-TOP-2,f"{up} is for {WORDS[up]}"); c.setFillColor(black)
    # big traceable letter
    c.setFont("Helvetica-Bold",170); c.setFillColor(TRACE)
    c.drawString(lm+0.2*inch, H-TOP-3.0*inch, ch)
    # solid model letter smaller top-right
    c.setFont("Helvetica-Bold",70); c.setFillColor(TEAL)
    c.drawRightString(W-rm-0.2*inch, H-TOP-2.0*inch, ch)
    c.setFillColor(black)
    # rows of traceable letters
    c.setFont("Helvetica-Bold",46); c.setFillColor(TRACE)
    yrow=H-TOP-4.4*inch
    row_str=(" "+ch)*9
    for r in range(3):
        c.drawString(lm, yrow-r*0.85*inch, row_str)
        c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(0.8)
        c.line(lm, yrow-r*0.85*inch-6, W-rm, yrow-r*0.85*inch-6)
    c.setFillColor(black)
    c.setFont("Helvetica-Bold",12); c.setFillColor(DARK); c.drawString(lm, BOTTOM+0.5*inch, "Now write it yourself:")
    c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(1); c.line(lm+2.1*inch, BOTTOM+0.5*inch, W-rm, BOTTOM+0.5*inch)
    c.setFillColor(black)
    footer(page)

for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ": trace_letter_page(ch)
for ch in "abcdefghijklmnopqrstuvwxyz": trace_letter_page(ch)
for ch in "0123456789": trace_letter_page(ch)

# First words pages (trace simple words)
words=["cat","dog","sun","ball","fish","tree","book","star","moon","cake","bird","frog"]
def word_page(batch):
    new_page(); lm=lm_(page); rm=rm_(page)
    c.setFont("Helvetica-Bold",15); c.setFillColor(TEAL); c.drawString(lm,H-TOP-4,"Trace the Words"); c.setFillColor(black)
    at=H-TOP-50
    for i,w in enumerate(batch):
        y=at-i*1.7*inch
        c.setFont("Helvetica-Bold",40); c.setFillColor(TRACE); c.drawString(lm, y, (w+"  ")*2)
        c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(0.8); c.line(lm, y-6, W-rm, y-6)
        c.setStrokeColor(HexColor("#eeeeee")); c.line(lm, y-0.7*inch, W-rm, y-0.7*inch)
        c.setFillColor(black)
    footer(page)
for i in range(0,len(words),4): word_page(words[i:i+4])

c.showPage(); c.save()
meta={"title":"Letter Tracing for Kids","pages":page}
json.dump(meta, open("lt_meta.json","w"))
print(json.dumps(meta,indent=2))
