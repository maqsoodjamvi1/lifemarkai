from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, HexColor, white
TW, THh = 8.268, 11.693
pages=38; spine=pages*0.002252; bleed=0.125
CW=2*TW+spine+2*bleed; CH=THh+2*bleed
c=canvas.Canvas("cover_print.pdf", pagesize=(CW*inch, CH*inch))
W=CW*inch; H=CH*inch
back_w=(TW+bleed)*inch; spine_w=spine*inch; front_w=(TW+bleed)*inch
back_x0=0; spine_x0=back_w; front_x0=spine_x0+spine_w
# FRONT
fx=front_x0; cxf=fx+front_w/2
c.setFillColor(HexColor("#ffd23f")); c.rect(fx,0,front_w,H,fill=1,stroke=0)
c.setFillColor(HexColor("#1f6feb")); c.rect(fx,H-4.2*inch,front_w,4.2*inch,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",46)
c.drawCentredString(cxf,H-1.7*inch,"Multiplication")
c.drawCentredString(cxf,H-2.5*inch,"& Division")
c.setFont("Helvetica-Bold",30); c.drawCentredString(cxf,H-3.35*inch,"WORKBOOK")
c.setFillColor(HexColor("#e63946")); c.circle(cxf,H-5.6*inch,0.95*inch,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",30); c.drawCentredString(cxf,H-5.75*inch,"Gr 3")
c.setFillColor(HexColor("#2a9d8f")); c.roundRect(cxf-2.4*inch,H-7.35*inch,4.8*inch,0.55*inch,8,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",20); c.drawCentredString(cxf,H-7.18*inch,"140 Practice Problems")
c.setFillColor(HexColor("#1d3557")); c.setFont("Helvetica",15); c.drawCentredString(cxf,H-7.9*inch,"Facts 0-12  -  With Answer Key")
c.setFillColor(HexColor("#1f6feb")); c.setFont("Helvetica-Bold",40)
for (dx,dy,s) in [(-2.0,-9.1,"x"),(2.0,-9.4,"/"),(-1.3,-9.9,"+"),(1.5,-8.7,"=")]:
    c.drawCentredString(cxf+dx*inch,H+dy*inch,s)
c.setFillColor(HexColor("#1d3557")); c.setFont("Helvetica-Bold",15); c.drawCentredString(cxf,0.55*inch,"EducationWorksheet.com")
# SPINE
c.setFillColor(HexColor("#1d3557")); c.rect(spine_x0,0,spine_w,H,fill=1,stroke=0)
# BACK
bx=back_x0
c.setFillColor(HexColor("#ffd23f")); c.rect(bx,0,back_w,H,fill=1,stroke=0)
c.setFillColor(HexColor("#1f6feb")); c.rect(bx,H-1.6*inch,back_w,1.6*inch,fill=1,stroke=0)
c.setFillColor(white); c.setFont("Helvetica-Bold",22); c.drawCentredString(bx+back_w/2,H-1.05*inch,"Build Math Confidence!")
c.setFillColor(HexColor("#1d3557")); c.setFont("Helvetica",13)
blurb=["Give your Grade 3 learner the daily practice they need to",
"master multiplication and division facts through 12. Clear,",
"uncluttered pages with room to show their work keep kids",
"focused and building real fluency - one page at a time."]
yy=H-2.3*inch
for ln in blurb: c.drawString(bx+0.7*inch,yy,ln); yy-=0.3*inch
c.setFont("Helvetica-Bold",13); c.drawString(bx+0.7*inch,yy-0.2*inch,"Inside this book:")
yy-=0.55*inch; c.setFont("Helvetica",12.5)
feats=["140 practice problems (multiplication & division)",
"Alternating pages keep both skills fresh",
"Big, easy-to-read type with room to show work",
"Complete answer key for easy self-checking",
"Great for home, school, or tutoring"]
for f in feats:
    c.setFillColor(HexColor("#2a9d8f")); c.circle(bx+0.8*inch,yy+4,0.06*inch,fill=1,stroke=0)
    c.setFillColor(HexColor("#1d3557")); c.drawString(bx+1.0*inch,yy,f); yy-=0.32*inch
c.setFillColor(white); c.rect(bx+back_w-2.4*inch,0.35*inch,2.0*inch,1.0*inch,fill=1,stroke=0)
c.setFillColor(black); c.setFont("Helvetica",7); c.drawString(bx+back_w-2.3*inch,0.5*inch,"ISBN barcode area")
c.showPage(); c.save()
print("cover_print.pdf", round(CW,3),"x",round(CH,3),"in ; spine",round(spine,4))
