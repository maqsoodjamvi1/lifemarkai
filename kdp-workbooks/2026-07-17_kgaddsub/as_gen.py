import random, json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
random.seed(20260717)
W,H=A4
GUTTER=0.8*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
c=canvas.Canvas("as_interior.pdf", pagesize=A4)
page=0; key=[]
GREEN=HexColor("#2f9e6e"); LIGHT=HexColor("#e3f6ee"); DARK=HexColor("#134b36")
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)
PPP=4; NPP=35

# Title
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(GREEN); c.roundRect(lm,H-TOP-2.6*inch,cw,2.6*inch,14,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",34)
c.drawCentredString(lm+cw/2,H-TOP-1.05*inch,"Addition &")
c.drawCentredString(lm+cw/2,H-TOP-1.6*inch,"Subtraction")
c.setFont("Helvetica-Bold",18); c.drawCentredString(lm+cw/2,H-TOP-2.2*inch,"Kindergarten  -  Numbers to 10")
c.setFillColor(black); c.setFont("Helvetica-Bold",15); c.drawCentredString(lm+cw/2,H-TOP-3.0*inch,"140 Practice Problems  -  With Answer Key")
c.setFont("Helvetica",12); c.drawCentredString(lm+cw/2,H-TOP-3.5*inch,"Beginning Math Practice Workbook")
c.setFont("Helvetica-Bold",12); c.drawCentredString(lm+cw/2,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(GREEN); c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
for i,ln in enumerate(["","This workbook helps your kindergartner practice adding and","subtracting numbers up to 10 with fun, simple problems.","","- Each page has 4 problems with room to show your work.","- Addition and subtraction pages alternate to keep skills fresh.","- Count on fingers or draw dots to help find the answer.","- Check answers with the Answer Key at the back.","","Tip for grown-ups: keep it short and playful, use real objects","to count, and praise every try. A little each day works best."]):
    c.drawString(lm,H-TOP-36-i*20,ln)
footer(page)

n=0
def prob(is_add):
    if is_add:
        a=random.randint(0,10); b=random.randint(0,10-a); return f"{a} + {b} =", a+b
    else:
        a=random.randint(0,10); b=random.randint(0,a); return f"{a} - {b} =", a-b

for p in range(NPP):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    is_add=(p%2==0); t="Addition" if is_add else "Subtraction"
    c.setFont("Helvetica-Bold",15); c.setFillColor(GREEN); c.drawString(lm,H-TOP-4,f"{t} Practice"); c.setFillColor(black)
    c.setFont("Helvetica",9); c.drawRightString(W-rm,H-TOP-2,"Name: ____________")
    at=H-TOP-44; ab=BOTTOM+6; bh=(at-ab)/PPP
    for i in range(PPP):
        yt=at-i*bh; n+=1
        ps,ans=prob(is_add); key.append((n,ps.replace(" =",""),ans))
        c.setStrokeColor(HexColor("#bfe6d6")); c.setLineWidth(1)
        c.roundRect(lm, yt-bh+12, cw, bh-16, 8, stroke=1, fill=0)
        c.setFillColor(GREEN); c.circle(lm+20, yt-12, 11, stroke=0, fill=1)
        c.setFillColor(white); c.setFont("Helvetica-Bold",10); c.drawCentredString(lm+20, yt-15.5, str(n))
        c.setFillColor(black); c.setFont("Helvetica-Bold",24); c.drawString(lm+44, yt-22, ps); c.drawString(lm+210, yt-22, "______")
        c.setFont("Helvetica-Oblique",8); c.setFillColor(HexColor("#9ab8ab")); c.drawString(lm+44, yt-bh+24, "show your work"); c.setFillColor(black)
    footer(page)
total=n

def kh():
    new_page(); l=lm_(page)
    c.setFont("Helvetica-Bold",17); c.setFillColor(GREEN); c.drawString(l,H-TOP-6,"Answer Key"); c.setFillColor(black); return l
lm=kh(); c.setFont("Helvetica",9)
pc=40; cols=4; rm=rm_(page); cwid=(W-lm-rm)/cols; y0=H-TOP-32; idx=0; col=0; y=y0
for (num,ps,ans) in key:
    x=lm+col*cwid; c.drawString(x,y,f"{num}. {ps} = {ans}"); y-=15; idx+=1
    if idx%pc==0:
        col+=1; y=y0
        if col>=cols: footer(page); lm=kh(); rm=rm_(page); cwid=(W-lm-rm)/cols; c.setFont("Helvetica",9); col=0; y=y0
footer(page); c.showPage(); c.save()
# verify
mism=0
for num,ps,ans in key:
    ps=ps.strip()
    if "+" in ps: a,b=ps.split("+"); calc=int(a)+int(b)
    else: a,b=ps.split("-"); calc=int(a)-int(b)
    if calc!=ans: mism+=1
meta={"title":"Addition & Subtraction Kindergarten to 10","pages":page,"problems":total,"mismatches":mism}
json.dump({"meta":meta,"key":key}, open("as_key.json","w"))
print(json.dumps(meta,indent=2))
