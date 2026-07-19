from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
W,H=1600,2560
c=canvas.Canvas("ul_kindle_tmp.pdf",pagesize=(W,H))
TEAL=(0.16,0.63,0.65);YEL=(1.0,0.85,0.30);CREAM=(1.0,0.98,0.92);DK=(0.10,0.28,0.30);CORAL=(0.98,0.55,0.42)
c.setFillColorRGB(*TEAL);c.rect(0,0,W,H,fill=1,stroke=0)
c.setFillColorRGB(*CREAM);c.roundRect(120,240,W-240,H-480,50,fill=1,stroke=0)
c.setFillColorRGB(*YEL);c.roundRect(200,H-720,W-400,360,40,fill=1,stroke=0)
c.setFillColorRGB(*DK);c.setFont("Helvetica-Bold",115);c.drawCentredString(W/2,H-560,"UPPERCASE")
c.setFont("Helvetica-Bold",92);c.drawCentredString(W/2,H-700,"LETTER TRACING")
c.setFillColorRGB(*TEAL);c.setFont("Helvetica-Bold",50);c.drawCentredString(W/2,H-880,"Trace Capital Letters A to Z")
c.setFillColorRGB(*DK);c.setFont("Helvetica",40);c.drawCentredString(W/2,H-960,"Handwriting Practice for Kids  -  Ages 3-5")
def dt(txt,x,y,s,col,lw,d):
    c.saveState();c.setDash(d[0],d[1]);c.setLineWidth(lw);c.setStrokeColorRGB(*col)
    t=c.beginText();t.setTextRenderMode(1);t.setFont("Helvetica-Bold",s);t.setTextOrigin(x,y);t.textOut(txt);c.drawText(t);c.restoreState()
dt("A B C",W/2-stringWidth("A B C","Helvetica-Bold",240)/2,1050,240,CORAL,6,(9,11))
dt("D E",W/2-stringWidth("D E","Helvetica-Bold",170)/2,760,170,TEAL,5,(9,11))
c.setFillColorRGB(*TEAL);c.setFont("Helvetica-Bold",38);c.drawCentredString(W/2,540,"26 Letters  -  Word Tracing  -  Letter Hunt Games")
c.setFillColorRGB(*CORAL);c.setFont("Helvetica-Bold",34);c.drawCentredString(W/2,470,"88 Pages of Practice")
c.setFillColorRGB(*DK);c.setFont("Helvetica-Bold",36);c.drawCentredString(W/2,320,"EducationWorksheet.com")
c.showPage();c.save()
