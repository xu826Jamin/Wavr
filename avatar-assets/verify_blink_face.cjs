const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const AW=1024,AH=768;
const dir=path.join(__dirname,'..','src','assets','avatar');
const load=f=>loadImage(path.join(dir,f));
function blink(ctx,s,p){ if(p<=0)return; const eyes=[[450,307,50,38],[562,303,48,40]]; ctx.save();
  for(const [x,y,w,h] of eyes){const lh=Math.max(2,p*h); ctx.fillStyle='rgb(247,201,170)';
    ctx.beginPath(); ctx.roundRect(x*s,y*s,w*s,lh*s,[0,0,7*s,7*s]); ctx.fill();
    ctx.strokeStyle='rgba(86,58,44,0.85)'; ctx.lineWidth=2.2*s; ctx.lineCap='round';
    ctx.beginPath(); ctx.moveTo((x+2)*s,(y+lh)*s); ctx.lineTo((x+w-2)*s,(y+lh)*s); ctx.stroke();}
  ctx.restore(); }
(async()=>{
  const base=await load('base_body.webp');
  // render full avatar large, then crop the face band
  const FW=1024, s=1; // 1:1 asset space
  const ps=[0,0.5,1];
  const cropX=400,cropY=270,cropW=270,cropH=130, SC=2.4;
  const cols=3,gap=10,tileW=cropW*SC,tileH=cropH*SC+18;
  const out=createCanvas(cols*tileW+(cols+1)*gap, tileH+2*gap);
  const o=out.getContext('2d'); o.fillStyle='#141414'; o.fillRect(0,0,out.width,out.height);
  for(let i=0;i<ps.length;i++){
    const full=createCanvas(1024,768); const c=full.getContext('2d');
    c.clearRect(0,0,1024,768); c.drawImage(base,0,0,1024,768); blink(c,1,ps[i]);
    const x=gap+i*(tileW+gap), y=gap;
    o.imageSmoothingEnabled=true;
    o.drawImage(full, cropX,cropY,cropW,cropH, x,y,tileW,cropH*SC);
    o.fillStyle='#aaa'; o.font='12px sans-serif'; o.fillText('blink '+ps[i],x+2,y+cropH*SC+13);
  }
  fs.writeFileSync(path.join(__dirname,'verify_blink_face.png'),out.toBuffer('image/png'));
  console.log('wrote');
})();
