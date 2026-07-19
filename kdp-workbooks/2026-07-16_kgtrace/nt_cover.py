from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
pages=32; TW,THh=8.268,11.693; spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
c=canvas.Canvas("nt_cover.pdf", pagesize=(CW*inch,CH*inch)); W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_x0=back_w+spine_w; front_w=(TW+bleed)*inch
PUR=HexColor("#6a4bbf"); LIL=HexColor("#efe7ff"); DARK=HexColor("#3a2570"); TEAL=HexColor("#2a9d8f")
# FRONT
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(PUR); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(LIL); c.rect(fx,H-3.4*inch,front_w,3.4*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",44)
c.drawCentredString(cxf,H-1.55*inch,"Number")
c.drawCentredString(cxf,H-2.25*inch,"Tracing")
c.setFont("Helvetica-Bold",34); c.drawCentredString(cxf,H-2.95*inch,"Workbook")
# traceable numbers motif
c.setFillColor(HexColor("#8f76d6")); c.setFont("Helvetica-Bold",96)
c.drawCentredString(cxf,H-5.6*inch,"1 2 3")
c.setFillColor(TEAL); c.circle(fx+front_w-1.6*inch,H-4.5*inch,0.55*inch,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",34); c.drawCentredString(fx+front_w-1.6*inch,H-4.7*inch,"K")
c.setFillColor(HexColor("#e63946")); c.roundRect(cxf-2.7*inch,H-7.35*inch,5.4*inch,0.6*inch,8,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",18); c.drawCentredString(cxf,H-7.16*inch,"Trace Numbers 0 to 20  -  Count & Write")
c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,H-7.9*inch,"With Answer Key")
c.setFillColor(DARK); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
# SPINE
c.setFillColor(DARK); c.rect(back_w,0,spine_w,H,fill=1,stroke=0)
# BACK
c.setFillColor(PUR); c.rect(0,0,back_w,H,fill=1,stroke=0)
c.setFillColor(LIL); c.rect(0,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",22); c.drawCentredString(back_w/2,H-1.05*inch,"Little Hands, Big Numbers!")
c.setFillColor(white); c.setFont("Helvetica",13)
blurb=["Help your child learn to write numbers with easy, guided",
"tracing practice. Big, friendly numbers and playful counting",
"build confidence and fine-motor skills - one page at a time,",
"with a complete answer key for the counting pages."]
yy=H-2.3*inch
for ln in blurb: c.drawString(0.7*inch,yy,ln); yy-=0.3*inch
c.setFillColor(white); c.setFont("Helvetica-Bold",13); c.drawString(0.7*inch,yy-0.2*inch,"Inside this book:")
yy-=0.55*inch; c.setFont("Helvetica",12.5)
feats=["Trace numbers 0 to 20 with guided gray lines","Say, trace, then write it yourself","Count the pictures and write the number","Builds early writing and counting skills","Complete answer key for the counting pages"]
for f in feats:
    c.setFillColor(TEAL); c.circle(0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(white); c.drawString(1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("nt_cover.pdf",round(CW,3),"x",round(CH,3),"spine",round(spine,4))
