import random, json, math
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
random.seed(20260716)
W,H=A4
GUTTER=0.75*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
c=canvas.Canvas("kg_counting_interior.pdf", pagesize=A4)
page=0
key=[]
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)
BLUE=HexColor("#ff7a1a"); DARK=HexColor("#7a3b00")

def shape(cx,cy,r,kind):
    if kind==0:
        c.circle(cx,cy,r,fill=1,stroke=0)
    elif kind==1:
        c.rect(cx-r,cy-r,2*r,2*r,fill=1,stroke=0)
    elif kind==2:
        p=c.beginPath(); p.moveTo(cx,cy+r); p.lineTo(cx-r,cy-r); p.lineTo(cx+r,cy-r); p.close(); c.drawPath(p,fill=1,stroke=0)
    else:
        # star-ish: use circle
        c.circle(cx,cy,r,fill=1,stroke=0)

# Title page
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(BLUE); c.roundRect(lm,H-TOP-2.6*inch,cw,2.6*inch,14,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",34)
c.drawCentredString(lm+cw/2,H-TOP-1.15*inch,"Counting")
c.drawCentredString(lm+cw/2,H-TOP-1.75*inch,"Workbook")
c.setFillColor(black); c.setFont("Helvetica-Bold",16); c.drawCentredString(lm+cw/2,H-TOP-2.9*inch,"Kindergarten  -  Numbers 1 to 20")
c.setFont("Helvetica",13); c.drawCentredString(lm+cw/2,H-TOP-3.5*inch,"Count, Trace, and Write  -  With Answer Key")
c.setFont("Helvetica-Bold",12); c.drawCentredString(lm+cw/2,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(BLUE); c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
lines=["","This workbook helps your child learn to count, recognize, and",
"write numbers from 1 to 20 through fun, colorful practice.","",
"- Count the pictures in each box and write the number.",
"- Trace the big numbers to practice writing them.",
"- Fill in the missing numbers to learn number order.",
"- Check answers with the Answer Key at the back.","",
"Tip for grown-ups: keep practice short and playful. Praise effort,",
"count real objects together, and celebrate every success."]
y=H-TOP-36
for ln in lines: c.drawString(lm,y,ln); y-=20
footer(page)

n=0
# Section A: Count and write (numbers 1-10 then 1-20), 4 boxes/page
def count_page(maxn):
    global n
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(BLUE); c.drawString(lm,H-TOP-4,"Count and Write"); c.setFillColor(black)
    c.setFont("Helvetica",9); c.drawRightString(W-rm,H-TOP-2,"Name: ____________")
    at=H-TOP-40; ab=BOTTOM+6; rows=2; cols=2
    bw=cw/cols; bh=(at-ab)/rows
    for i in range(4):
        r=i//cols; col=i%cols
        x=lm+col*bw; ytop=at-r*bh
        n+=1
        cnt=random.randint(1,maxn)
        kind=random.randint(0,2)
        key.append((n,cnt))
        c.setStrokeColor(HexColor("#ffcc99")); c.setLineWidth(1.2)
        c.roundRect(x+6,ytop-bh+14,bw-12,bh-22,8,stroke=1,fill=0)
        # draw shapes in grid inside box
        c.setFillColor(BLUE)
        area_x=x+18; area_y=ytop-30; per_row=5; sr=7
        for k in range(cnt):
            rr=k//per_row; cc=k%per_row
            shape(area_x+cc*22+10, area_y-rr*22-10, sr, kind)
        c.setFillColor(black)
        # answer line
        c.setFont("Helvetica-Bold",13); c.drawString(x+18, ytop-bh+24, "How many?  ______")
        c.setFillColor(HexColor("#bb8855")); c.setFont("Helvetica-Bold",11); c.drawString(x+bw-40,ytop-22,f"{n}.")
        c.setFillColor(black)
    footer(page)

for _ in range(16): count_page(10)
for _ in range(16): count_page(20)

# Section B: Trace the numbers 0-9 (visual, not counted in key)
def trace_page(start):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(BLUE); c.drawString(lm,H-TOP-4,"Trace the Numbers"); c.setFillColor(black)
    at=H-TOP-40; ab=BOTTOM+6
    nums=[start,start+1]
    bh=(at-ab)/2
    for j,num in enumerate(nums):
        ytop=at-j*bh
        c.setFont("Helvetica-Bold",13); c.setFillColor(BLUE); c.drawString(lm, ytop-16, f"Number {num}"); c.setFillColor(black)
        # big outlined digits repeated
        c.setFont("Helvetica-Bold",70)
        c.setFillColor(HexColor("#ffe4cc"))
        for t in range(5):
            c.drawString(lm+t*(cw/5)+6, ytop-bh+30, str(num))
        c.setFillColor(black)
        c.setStrokeColor(HexColor("#cccccc")); c.setLineWidth(0.8)
        c.line(lm, ytop-bh+24, W-rm, ytop-bh+24)
    footer(page)
for s in range(0,10,2): trace_page(s)

# Section C: Missing numbers (counted in key)
def missing_page():
    global n
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(BLUE); c.drawString(lm,H-TOP-4,"What Comes Next?"); c.setFillColor(black)
    at=H-TOP-50; rowh=0.9*inch
    for row in range(6):
        y=at-row*rowh
        start=random.randint(1,14)
        seq=[start,start+1,start+2,start+3,start+4]
        missing_idx=random.randint(1,3)
        ans=seq[missing_idx]
        n+=1; key.append((n,ans))
        c.setFont("Helvetica-Bold",11); c.setFillColor(HexColor("#bb8855")); c.drawString(lm,y+8,f"{n}."); c.setFillColor(black)
        c.setFont("Helvetica-Bold",20)
        bx=lm+30
        for idx,val in enumerate(seq):
            cellx=bx+idx*1.1*inch
            c.setStrokeColor(HexColor("#ffcc99")); c.setLineWidth(1.2)
            c.roundRect(cellx,y-10,0.9*inch,0.6*inch,6,stroke=1,fill=0)
            if idx!=missing_idx:
                c.drawCentredString(cellx+0.45*inch,y+2,str(val))
    footer(page)
for _ in range(8): missing_page()

total=n
# Answer key
def kh():
    new_page(); l=lm_(page)
    c.setFont("Helvetica-Bold",17); c.setFillColor(BLUE); c.drawString(l,H-TOP-6,"Answer Key"); c.setFillColor(black); return l
lm=kh(); c.setFont("Helvetica",9)
pc=44; cols=5; rm=rm_(page); cwid=(W-lm-rm)/cols; y0=H-TOP-32; idx=0; col=0; y=y0
for (num,ans) in key:
    x=lm+col*cwid; c.drawString(x,y,f"{num}. {ans}"); y-=15; idx+=1
    if idx%pc==0:
        col+=1; y=y0
        if col>=cols: footer(page); lm=kh(); rm=rm_(page); cwid=(W-lm-rm)/cols; c.setFont("Helvetica",9); col=0; y=y0
footer(page); c.showPage(); c.save()
meta={"title":"Counting Workbook - Kindergarten","pages":page,"exercises":total}
json.dump({"meta":meta,"key":key}, open("kg_answer_key.json","w"))
print(json.dumps(meta,indent=2))
