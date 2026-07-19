import random, json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor
random.seed(20260716)
W, H = A4
# Generous no-bleed safe margins (KDP A4, <150pp): inside >=0.375", we use more.
GUTTER=0.75*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
PPP=4; NPP=35
OUT="interior_print.pdf"
c = canvas.Canvas(OUT, pagesize=A4)
page=0
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER  # opposite side outer
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)

# Title page - all content INSIDE margins, no edge bleed
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(HexColor("#1f6feb"))
c.roundRect(lm, H-TOP-2.6*inch, cw, 2.6*inch, 14, fill=1, stroke=0)
c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold",28)
cx=lm+cw/2
c.drawCentredString(cx,H-TOP-1.0*inch,"Multiplication &")
c.drawCentredString(cx,H-TOP-1.5*inch,"Division Workbook")
c.setFont("Helvetica-Bold",15); c.drawCentredString(cx,H-TOP-2.05*inch,"Grade 3")
c.setFillColor(black); c.setFont("Helvetica",13)
c.drawCentredString(cx,H-TOP-3.5*inch,"140 Practice Problems  -  Facts 0-12")
c.drawCentredString(cx,H-TOP-3.9*inch,"With Complete Answer Key")
c.setFont("Helvetica-Bold",12); c.drawCentredString(cx,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page); rm=rm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(HexColor("#1f6feb"))
c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
lines=["","This workbook helps Grade 3 students master multiplication and",
"division facts through 12 with plenty of daily practice.","",
"- Each page has 4 problems with room to show your work.",
"- Multiplication and division pages alternate to keep skills fresh.",
"- Work a page or two a day - short, regular practice works best.",
"- Check your work using the Answer Key at the back of the book.",
"- Circle any problem you miss and try it again tomorrow.","",
"Tip for grown-ups: praise effort, keep sessions short and positive,",
"and celebrate progress. Consistency beats long, tiring sessions."]
y=H-TOP-36
for ln in lines: c.drawString(lm,y,ln); y-=20
footer(page)

key=[]
def gm(): a=random.randint(2,12); b=random.randint(2,12); return f"{a} x {b} =", a*b
def gd(): b=random.randint(2,12); q=random.randint(2,12); a=b*q; return f"{a} / {b} =", q
n=0
for p in range(NPP):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    is_m=(p%2==0); t="Multiplication" if is_m else "Division"
    c.setFont("Helvetica-Bold",15); c.setFillColor(HexColor("#1f6feb"))
    c.drawString(lm,H-TOP-4,f"{t} Practice"); c.setFillColor(black)
    c.setFont("Helvetica",9); c.drawRightString(W-rm,H-TOP-2,"Name: ____________  Date: ______")
    at=H-TOP-44; ab=BOTTOM+6; bh=(at-ab)/PPP
    for i in range(PPP):
        yt=at-i*bh; n+=1
        ps,ans=gm() if is_m else gd()
        key.append((n,ps.replace(" =",""),ans))
        c.setStrokeColor(HexColor("#c9d6ea")); c.setLineWidth(1)
        c.roundRect(lm, yt-bh+12, cw, bh-16, 8, stroke=1, fill=0)
        c.setFillColor(HexColor("#1f6feb")); c.circle(lm+20, yt-12, 11, stroke=0, fill=1)
        c.setFillColor(HexColor("#ffffff")); c.setFont("Helvetica-Bold",10)
        c.drawCentredString(lm+20, yt-15.5, str(n))
        c.setFillColor(black); c.setFont("Helvetica-Bold",22)
        c.drawString(lm+44, yt-20, ps); c.drawString(lm+200, yt-20, "__________")
        c.setFont("Helvetica-Oblique",8); c.setFillColor(HexColor("#9aa7bd"))
        c.drawString(lm+44, yt-bh+24, "show your work"); c.setFillColor(black)
    footer(page)
total=n

def kh():
    new_page(); l=lm_(page)
    c.setFont("Helvetica-Bold",17); c.setFillColor(HexColor("#1f6feb"))
    c.drawString(l,H-TOP-6,"Answer Key"); c.setFillColor(black); return l
lm=kh(); c.setFont("Helvetica",9)
pc=40; cols=4; rm=rm_(page); cwid=(W-lm-rm)/cols; y0=H-TOP-32; idx=0; col=0; y=y0
for (num,ps,ans) in key:
    x=lm+col*cwid; c.drawString(x,y,f"{num}. {ps} = {ans}"); y-=15.5; idx+=1
    if idx%pc==0:
        col+=1; y=y0
        if col>=cols: footer(page); lm=kh(); rm=rm_(page); cwid=(W-lm-rm)/cols; c.setFont("Helvetica",9); col=0; y=y0
footer(page); c.showPage(); c.save()
meta={"title":"Multiplication and Division Workbook Grade 3","pages":page,"problems":total}
json.dump({"meta":meta,"key":key}, open("answer_key_print.json","w"))
print(json.dumps(meta,indent=2))
