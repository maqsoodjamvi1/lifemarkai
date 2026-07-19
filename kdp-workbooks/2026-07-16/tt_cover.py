import sys
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
pages = int(sys.argv[1]) if len(sys.argv)>1 else 100
TW, THh = 8.268, 11.693
spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
OUT="tt_cover.pdf"
c=canvas.Canvas(OUT, pagesize=(CW*inch, CH*inch))
W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_w=(TW+bleed)*inch
spine_x0=back_w; front_x0=spine_x0+spine_w
GREEN=HexColor("#1b7f5c"); LIGHT=HexColor("#d8f3e6"); DARK=HexColor("#0f3d2e"); YEL=HexColor("#ffd23f")
def clock(cx,cy,r):
    c.setFillColor(white); c.setStrokeColor(DARK); c.setLineWidth(3)
    c.circle(cx,cy,r,fill=1,stroke=1)
    c.setFillColor(GREEN); c.circle(cx,cy,r*0.06,fill=1,stroke=0)
    import math
    for h in range(12):
        a=math.radians(90-h*30)
        x1=cx+math.cos(a)*r*0.82; y1=cy+math.sin(a)*r*0.82
        x2=cx+math.cos(a)*r*0.92; y2=cy+math.sin(a)*r*0.92
        c.setStrokeColor(DARK); c.setLineWidth(2); c.line(x1,y1,x2,y2)
    # hands ~ 10:10
    c.setLineWidth(4); c.setStrokeColor(DARK)
    c.line(cx,cy,cx+math.cos(math.radians(90-300))*r*0.5, cy+math.sin(math.radians(90-300))*r*0.5)
    c.line(cx,cy,cx+math.cos(math.radians(90-60))*r*0.7, cy+math.sin(math.radians(90-60))*r*0.7)
# FRONT
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(GREEN); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(fx,H-3.4*inch,front_w,3.4*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",44)
c.drawCentredString(cxf,H-1.5*inch,"Telling Time")
c.setFont("Helvetica-Bold",40); c.drawCentredString(cxf,H-2.25*inch,"Workbook")
c.setFillColor(HexColor("#e63946")); c.circle(fx+front_w-1.5*inch,H-2.1*inch,0.7*inch,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",26); c.drawCentredString(fx+front_w-1.5*inch,H-2.28*inch,"Gr 3")
clock(cxf,H-6.0*inch,1.6*inch)
c.setFillColor(YEL); c.roundRect(cxf-2.6*inch,H-8.2*inch,5.2*inch,0.6*inch,8,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",19); c.drawCentredString(cxf,H-8.0*inch,"Reading Clocks  -  Time in Words  -  AM/PM")
c.setFillColor(white); c.setFont("Helvetica-Bold",16); c.drawCentredString(cxf,H-8.75*inch,"100+ Exercises  -  With Answer Key")
c.setFillColor(white); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
# SPINE
c.setFillColor(DARK); c.rect(spine_x0,0,spine_w,H,fill=1,stroke=0)
# BACK
bx=0
c.setFillColor(GREEN); c.rect(bx,0,back_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(bx,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",22); c.drawCentredString(bx+back_w/2,H-1.05*inch,"Master the Clock!")
c.setFillColor(white); c.setFont("Helvetica",13)
blurb=["Help your Grade 3 learner read and tell time with",
"confidence. Clear, friendly practice covers analog clocks,",
"writing time in words, and AM vs PM - with room to work",
"and a complete answer key to check every page."]
yy=H-2.3*inch
for ln in blurb: c.drawString(bx+0.7*inch,yy,ln); yy-=0.3*inch
c.setFillColor(white); c.setFont("Helvetica-Bold",13); c.drawString(bx+0.7*inch,yy-0.2*inch,"Inside this book:")
yy-=0.55*inch; c.setFont("Helvetica",12.5)
feats=["100+ time-telling exercises",
"Read analog clocks to the minute",
"Write the time in words",
"AM / PM and elapsed-time practice",
"Complete answer key for self-checking"]
for f in feats:
    c.setFillColor(YEL); c.circle(bx+0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(white); c.drawString(bx+1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(bx+back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(bx+back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("tt_cover.pdf pages",pages,"size",round(CW,3),"x",round(CH,3),"spine",round(spine,4))
