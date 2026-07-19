import random, json
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
random.seed(20260717)
W,H=A4
GUTTER=0.75*inch; OUTER=0.55*inch; TOP=0.7*inch; BOTTOM=0.7*inch
c=canvas.Canvas("nt_interior.pdf", pagesize=A4)
page=0; key=[]
PURPLE=HexColor("#6a4bbf"); LILAC=HexColor("#efe7ff"); DARK=HexColor("#3a2570"); TRACE=HexColor("#c9bff0")
def new_page():
    global page
    if page>0: c.showPage()
    page+=1; return page
def lm_(pi): return GUTTER if pi%2==1 else OUTER
def rm_(pi): return OUTER if pi%2==1 else GUTTER
def footer(pi):
    c.setFont("Helvetica",8); c.setFillColor(HexColor("#888888"))
    c.drawCentredString(W/2,BOTTOM-22,str(pi)); c.setFillColor(black)
WORDS=["Zero","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen","Twenty"]

# Title
new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
c.setFillColor(PURPLE); c.roundRect(lm,H-TOP-2.6*inch,cw,2.6*inch,14,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",36)
c.drawCentredString(lm+cw/2,H-TOP-1.15*inch,"Number Tracing")
c.drawCentredString(lm+cw/2,H-TOP-1.75*inch,"Workbook")
c.setFillColor(black); c.setFont("Helvetica-Bold",16); c.drawCentredString(lm+cw/2,H-TOP-2.9*inch,"Kindergarten  -  Trace Numbers 0 to 20")
c.setFont("Helvetica",13); c.drawCentredString(lm+cw/2,H-TOP-3.5*inch,"Trace, Count, and Write  -  With Answer Key")
c.setFont("Helvetica-Bold",12); c.drawCentredString(lm+cw/2,BOTTOM+0.2*inch,"EducationWorksheet.com")
footer(page)

# How to use
new_page(); lm=lm_(page)
c.setFont("Helvetica-Bold",17); c.setFillColor(PURPLE); c.drawString(lm,H-TOP-6,"How to Use This Workbook"); c.setFillColor(black)
c.setFont("Helvetica",11.5)
lines=["","This workbook helps your child learn to write numbers 0 to 20",
"by tracing, counting, and practicing on their own.","",
"- Trace the light gray numbers from top to bottom.",
"- Say the number name out loud as you trace.",
"- Count the pictures to connect numbers with amounts.",
"- Then practice writing the number all by yourself!","",
"Tip for grown-ups: use a pencil, keep sessions short and fun,",
"and praise every attempt. Repetition builds confidence."]
y=H-TOP-36
for ln in lines: c.drawString(lm,y,ln); y-=20
footer(page)

def shapes(cx,cy,cnt,r=6):
    per=5
    for k in range(cnt):
        rr=k//per; cc=k%per
        c.circle(cx+cc*20, cy-rr*18, r, fill=1, stroke=0)

# Trace pages: numbers 0-20
for num in range(21):
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(PURPLE); c.drawString(lm,H-TOP-4,f"Trace the Number {num}"); c.setFillColor(black)
    c.setFont("Helvetica",11); c.setFillColor(DARK); c.drawRightString(W-rm,H-TOP-2,WORDS[num]); c.setFillColor(black)
    # big traceable number
    c.setFont("Helvetica-Bold",150); c.setFillColor(TRACE)
    c.drawString(lm+0.2*inch, H-TOP-2.9*inch, str(num))
    # count objects box next to it
    c.setFillColor(PURPLE); shapes(lm+3.2*inch, H-TOP-1.9*inch, num)
    c.setFillColor(black)
    # rows of traceable digits
    c.setFont("Helvetica-Bold",46); c.setFillColor(TRACE)
    yrow=H-TOP-4.2*inch
    for row in range(3):
        s=(" "+str(num))* (6 if num<10 else 4)
        c.drawString(lm, yrow-row*0.85*inch, s)
        c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(0.8)
        c.line(lm, yrow-row*0.85*inch-6, W-rm, yrow-row*0.85*inch-6)
    c.setFillColor(black)
    # practice line label
    c.setFont("Helvetica-Bold",12); c.setFillColor(DARK)
    c.drawString(lm, BOTTOM+0.5*inch, "Now write it yourself:")
    c.setStrokeColor(HexColor("#dddddd")); c.setLineWidth(1)
    c.line(lm+2.1*inch, BOTTOM+0.5*inch, W-rm, BOTTOM+0.5*inch)
    c.setFillColor(black)
    footer(page)

# Count and write (with answer key)
n=0
def cw_page(maxn):
    global n
    new_page(); lm=lm_(page); rm=rm_(page); cw=W-lm-rm
    c.setFont("Helvetica-Bold",15); c.setFillColor(PURPLE); c.drawString(lm,H-TOP-4,"Count and Write"); c.setFillColor(black)
    c.setFont("Helvetica",9); c.drawRightString(W-rm,H-TOP-2,"Name: ____________")
    at=H-TOP-40; ab=BOTTOM+6; bw=cw/2; bh=(at-ab)/2
    for i in range(4):
        r=i//2; col=i%2; x=lm+col*bw; ytop=at-r*bh
        n+=1; cnt=random.randint(1,maxn); key.append((n,cnt))
        c.setStrokeColor(HexColor("#d6c9f5")); c.setLineWidth(1.2)
        c.roundRect(x+6,ytop-bh+14,bw-12,bh-22,8,stroke=1,fill=0)
        c.setFillColor(PURPLE); shapes(x+24, ytop-30, cnt, r=7); c.setFillColor(black)
        c.setFont("Helvetica-Bold",13); c.drawString(x+18, ytop-bh+24,"How many?  ______")
        c.setFillColor(HexColor("#9a88cc")); c.setFont("Helvetica-Bold",11); c.drawString(x+bw-40,ytop-22,f"{n}."); c.setFillColor(black)
    footer(page)
for _ in range(8): cw_page(20)
total=n

def kh():
    new_page(); l=lm_(page)
    c.setFont("Helvetica-Bold",17); c.setFillColor(PURPLE); c.drawString(l,H-TOP-6,"Answer Key"); c.setFillColor(black); return l
lm=kh(); c.setFont("Helvetica",9)
pc=44; cols=5; rm=rm_(page); cwid=(W-lm-rm)/cols; y0=H-TOP-32; idx=0; col=0; y=y0
for (num,ans) in key:
    x=lm+col*cwid; c.drawString(x,y,f"{num}. {ans}"); y-=15; idx+=1
    if idx%pc==0:
        col+=1; y=y0
        if col>=cols: footer(page); lm=kh(); rm=rm_(page); cwid=(W-lm-rm)/cols; c.setFont("Helvetica",9); col=0; y=y0
footer(page); c.showPage(); c.save()
meta={"title":"Number Tracing Workbook - Kindergarten","pages":page,"count_exercises":total}
json.dump({"meta":meta,"key":key}, open("nt_answer_key.json","w"))
print(json.dumps(meta,indent=2))
