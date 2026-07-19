from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
pages=96; TW,THh=8.268,11.693; spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
c=canvas.Canvas("sw_cover.pdf", pagesize=(CW*inch,CH*inch)); W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_x0=back_w+spine_w; front_w=(TW+bleed)*inch
CORAL=HexColor("#ef6c57"); LIGHT=HexColor("#fdeae6"); DARK=HexColor("#7a2a1c"); YEL=HexColor("#ffd23f"); TEAL=HexColor("#2a9d8f")
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(CORAL); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(fx,H-3.6*inch,front_w,3.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",50)
c.drawCentredString(cxf,H-1.6*inch,"Sight Words")
c.setFont("Helvetica-Bold",44); c.drawCentredString(cxf,H-2.5*inch,"Tracing")
c.setFillColor(white); c.setFont("Helvetica-Bold",40)
c.drawCentredString(cxf,H-5.2*inch,"the  and  you")
c.drawCentredString(cxf,H-5.9*inch,"is  we  can")
c.setFillColor(YEL); c.circle(fx+front_w-1.5*inch,H-4.5*inch,0.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",26); c.drawCentredString(fx+front_w-1.5*inch,H-4.7*inch,"4-7")
c.setFillColor(TEAL); c.roundRect(cxf-2.7*inch,H-7.35*inch,5.4*inch,0.6*inch,8,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",18); c.drawCentredString(cxf,H-7.16*inch,"Trace & Write 100 First Words")
c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,H-7.9*inch,"Kindergarten Reading Practice")
c.setFillColor(DARK); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
c.setFillColor(DARK); c.rect(back_w,0,spine_w,H,fill=1,stroke=0)
c.setFillColor(CORAL); c.rect(0,0,back_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(0,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",22); c.drawCentredString(back_w/2,H-1.05*inch,"Read with Confidence!")
c.setFillColor(white); c.setFont("Helvetica",13)
for i,ln in enumerate(["Sight words make up most of what children read. This fun,","colorful workbook helps young learners trace and write the","100 most common first words - building reading confidence,","spelling, and handwriting all at once."]):
    c.drawString(0.7*inch,H-2.3*inch-i*0.3*inch,ln)
c.setFillColor(white); c.setFont("Helvetica-Bold",13); c.drawString(0.7*inch,H-3.7*inch,"Inside this book:")
feats=["Trace & write 100 high-frequency words","Big guide lines for early writers","One word per page with plenty of practice","Perfect for pre-K and kindergarten","Builds reading, spelling & handwriting"]
yy=H-4.05*inch; c.setFont("Helvetica",12.5)
for f in feats:
    c.setFillColor(YEL); c.circle(0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(white); c.drawString(1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("sw_cover.pdf",round(CW,3),"x",round(CH,3),"spine",round(spine,4))
