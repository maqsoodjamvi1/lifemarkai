import json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
W,H=A4
GUTTER=0.75*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
c=canvas.Canvas("sw_interior.pdf", pagesize=A4)
page=0
CORAL=HexColor("#ef6c57"); LIGHT=HexColor("#fdeae6"); DARK=HexColor("#7a2a1c"); TRACE=HexColor("#f6c9c0")
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)
# High-frequency Dolch pre-primer + primer sight words
WORDS=["the","and","a","to","in","is","you","that","it","he","was","for","on","are","as","with","his","they","at","be","this","have","from","or","one","had","by","word","but","not","what","all","were","we","when","your","can","said","there","use","an","each","which","she","do","how","their","if","will","up","other","about","out","many","then","them","these","so","some","her","would","make","like","him","into","time","has","look","two","more","go","see","no","way","could","people","my","than","first","water","been","call","who","now","find","long","down","day","did","get","come","made","may","part"]

# Title
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(CORAL); c.roundRect(lm,H-TOP-2.6*inch,cw,2.6*inch,14,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",42)
c.drawCentredString(lm+cw/2,H-TOP-1.2*inch,"Sight Words")
c.setFont("Helvetica-Bold",30); c.drawCentredString(lm+cw/2,H-TOP-1.9*inch,"Tracing")
c.setFillColor(black); c.setFont("Helvetica-Bold",16); c.drawCentredString(lm+cw/2,H-TOP-2.9*inch,"Ages 4-7  -  Trace & Write 100 First Words")
c.setFont("Helvetica",13); c.drawCentredString(lm+cw/2,H-TOP-3.5*inch,"Kindergarten Sight Word Practice Workbook")
c.setFont("Helvetica-Bold",12); c.drawCentredString(lm+cw/2,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(CORAL); c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
for i,ln in enumerate(["","Sight words are the most common words in English. Learning to","read and write them helps children become confident readers.","","- Say the word out loud at the top of the page.","- Trace the light gray word on each line.","- Then write the word on your own at the bottom.","- Practice a few words each day.","","Tip for grown-ups: point out these words in books you read","together. Repetition and praise build lasting confidence."]):
    c.drawString(lm,H-TOP-36-i*20,ln)
footer(page)

def word_page(w):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(CORAL); c.drawString(lm,H-TOP-4,"Sight Word"); c.setFillColor(black)
    # big word top
    c.setFont("Helvetica-Bold",60); c.setFillColor(DARK); c.drawCentredString(lm+cw/2, H-TOP-1.3*inch, w)
    # traceable rows
    c.setFont("Helvetica-Bold",48); c.setFillColor(TRACE)
    yrow=H-TOP-2.6*inch
    row_str=("  "+w)*3
    for r in range(5):
        c.drawString(lm, yrow-r*1.0*inch, row_str)
        c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(0.8)
        c.line(lm, yrow-r*1.0*inch-8, W-rm, yrow-r*1.0*inch-8)
        c.setStrokeColor(HexColor("#f0f0f0")); c.setDash(2,3); c.line(lm, yrow-r*1.0*inch+16, W-rm, yrow-r*1.0*inch+16); c.setDash()
    c.setFillColor(black)
    c.setFont("Helvetica-Bold",12); c.setFillColor(DARK); c.drawString(lm, BOTTOM+0.5*inch, "Now write it:")
    c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(1); c.line(lm+1.3*inch, BOTTOM+0.5*inch, W-rm, BOTTOM+0.5*inch)
    c.setFillColor(black)
    footer(page)

for w in WORDS[:96]: word_page(w)

c.showPage(); c.save()
meta={"title":"Sight Words Tracing","pages":page,"words":min(96,len(WORDS))}
json.dump(meta, open("sw_meta.json","w"))
print(json.dumps(meta,indent=2))
