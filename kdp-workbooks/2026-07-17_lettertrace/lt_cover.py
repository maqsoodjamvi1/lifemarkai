from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
pages=67; TW,THh=8.268,11.693; spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
c=canvas.Canvas("lt_cover.pdf", pagesize=(CW*inch,CH*inch)); W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_x0=back_w+spine_w; front_w=(TW+bleed)*inch
TEAL=HexColor("#0e9aa7"); LIGHT=HexColor("#e0f7f9"); DARK=HexColor("#0a5560"); YEL=HexColor("#ffd23f")
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(TEAL); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(fx,H-3.4*inch,front_w,3.4*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",50)
c.drawCentredString(cxf,H-1.6*inch,"Letter")
c.drawCentredString(cxf,H-2.45*inch,"Tracing")
c.setFont("Helvetica-Bold",30); c.drawCentredString(cxf,H-3.05*inch,"FOR KIDS")
c.setFillColor(white); c.setFont("Helvetica-Bold",120); c.drawCentredString(cxf,H-5.9*inch,"A B C")
c.setFillColor(YEL); c.circle(fx+front_w-1.5*inch,H-4.5*inch,0.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",26); c.drawCentredString(fx+front_w-1.5*inch,H-4.7*inch,"3-5")
c.setFillColor(HexColor("#e63946")); c.roundRect(cxf-2.7*inch,H-7.35*inch,5.4*inch,0.6*inch,8,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",18); c.drawCentredString(cxf,H-7.16*inch,"Trace A-Z, a-z, Numbers & First Words")
c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,H-7.9*inch,"Handwriting Practice Workbook")
c.setFillColor(DARK); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
c.setFillColor(DARK); c.rect(back_w,0,spine_w,H,fill=1,stroke=0)
c.setFillColor(TEAL); c.rect(0,0,back_w,H,fill=1,stroke=0)
c.setFillColor(LIGHT); c.rect(0,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(DARK); c.setFont("Helvetica-Bold",22); c.drawCentredString(back_w/2,H-1.05*inch,"First Steps to Writing!")
c.setFillColor(white); c.setFont("Helvetica",13)
for i,ln in enumerate(["Give your child a confident start with writing. This fun,","colorful workbook guides little hands through tracing every","capital and small letter, the numbers 0-9, and simple first","words - with big, easy-to-follow guide lines."]):
    c.drawString(0.7*inch,H-2.3*inch-i*0.3*inch,ln)
c.setFillColor(white); c.setFont("Helvetica-Bold",13); c.drawString(0.7*inch,H-3.7*inch,"Inside this book:")
feats=["Trace uppercase A to Z","Trace lowercase a to z","Trace numbers 0 to 9","Trace simple first words","Big guide lines for little hands"]
yy=H-4.05*inch; c.setFont("Helvetica",12.5)
for f in feats:
    c.setFillColor(YEL); c.circle(0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(white); c.drawString(1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("lt_cover.pdf",round(CW,3),"x",round(CH,3),"spine",round(spine,4))
