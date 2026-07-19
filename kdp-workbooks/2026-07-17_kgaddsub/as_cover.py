from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
pages=38; TW,THh=8.268,11.693; spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
c=canvas.Canvas("as_cover.pdf", pagesize=(CW*inch,CH*inch)); W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_x0=back_w+spine_w; front_w=(TW+bleed)*inch
GREEN=HexColor("#2f9e6e"); LIGHT=HexColor("#e3f6ee"); DARK=HexColor("#134b36"); YEL=HexColor("#ffd23f"); ORANGE=HexColor("#ef7d34")
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(GREEN); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(fx,H-3.6*inch,front_w,3.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",46)
c.drawCentredString(cxf,H-1.5*inch,"Addition &")
c.drawCentredString(cxf,H-2.3*inch,"Subtraction")
c.setFont("Helvetica-Bold",24); c.drawCentredString(cxf,H-3.0*inch,"NUMBERS TO 10")
c.setFillColor(white); c.setFont("Helvetica-Bold",96); c.drawCentredString(cxf,H-5.7*inch,"3 + 2 = 5")
c.setFillColor(YEL); c.circle(fx+front_w-1.5*inch,H-4.5*inch,0.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",30); c.drawCentredString(fx+front_w-1.5*inch,H-4.7*inch,"K")
c.setFillColor(ORANGE); c.roundRect(cxf-2.6*inch,H-7.35*inch,5.2*inch,0.6*inch,8,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",19); c.drawCentredString(cxf,H-7.16*inch,"140 Practice Problems")
c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,H-7.9*inch,"Beginning Math  -  With Answer Key")
c.setFillColor(DARK); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
c.setFillColor(DARK); c.rect(back_w,0,spine_w,H,fill=1,stroke=0)
c.setFillColor(GREEN); c.rect(0,0,back_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(0,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",22); c.drawCentredString(back_w/2,H-1.05*inch,"First Steps in Math!")
c.setFillColor(white); c.setFont("Helvetica",13)
for i,ln in enumerate(["Give your kindergartner a confident start with math. This","colorful workbook builds adding and subtracting skills with","numbers up to 10 - clear, simple problems with room to","count and a complete answer key to check every page."]):
    c.drawString(0.7*inch,H-2.3*inch-i*0.3*inch,ln)
c.setFillColor(white); c.setFont("Helvetica-Bold",13); c.drawString(0.7*inch,H-3.7*inch,"Inside this book:")
feats=["140 addition & subtraction problems","Numbers 0 to 10 - just right for beginners","Big, easy-to-read type with space to work","Alternating pages keep both skills fresh","Complete answer key for grown-ups"]
yy=H-4.05*inch; c.setFont("Helvetica",12.5)
for f in feats:
    c.setFillColor(YEL); c.circle(0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(white); c.drawString(1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("as_cover.pdf",round(CW,3),"x",round(CH,3),"spine",round(spine,4))
