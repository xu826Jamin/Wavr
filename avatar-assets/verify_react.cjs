// Faithful check of Phase-6 reactions (shrug / celebrate) — arm offset + fill capsule + life transform.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const AW=1024,AH=768,S=[772,528],AP=[844,502],CAP_FILL=82;
const dir=path.join(__dirname,'..','src','assets','avatar');
const load=f=>loadImage(path.join(dir,f));
function draw(ctx,imgs,W,H,pose,ox,oy,xf){
  const s=W/AW; ctx.clearRect(0,0,W,H); ctx.fillStyle='#0c0c0c'; ctx.fillRect(0,0,W,H);
  ctx.save();
  if(xf){const oxp=(xf.originX??0.5)*W,oyp=(xf.originY??0.5)*H;
    ctx.translate(oxp+(xf.dx||0)*W,oyp+(xf.dy||0)*H); if(xf.rot)ctx.rotate(xf.rot);
    const sc=xf.scale??1; ctx.scale(sc,sc); ctx.translate(-oxp,-oyp);}
  ctx.drawImage(imgs.base,0,0,W,H);
  if(Math.abs(ox)+Math.abs(oy)>1.2){ctx.save();ctx.lineCap='round';ctx.strokeStyle='#41474f';ctx.lineWidth=CAP_FILL*s;
    ctx.beginPath();ctx.moveTo(S[0]*s,S[1]*s);ctx.lineTo((AP[0]+ox)*s,(AP[1]+oy)*s);ctx.stroke();ctx.restore();}
  ctx.drawImage(imgs.fore,ox*s,oy*s,W,H);
  ctx.drawImage(imgs['hand_'+pose],ox*s,oy*s,W,H);
  ctx.restore();
}
(async()=>{
  const imgs={base:await load('base_body.webp'),fore:await load('forearm.webp'),hand_open:await load('hand_open.webp')};
  const W=300,H=225,dpr=2;
  const frames=[
    ['idle / hero',c=>draw(c,imgs,W,H,'open',0,0,null)],
    ['shrug peak',c=>draw(c,imgs,W,H,'open',30,-8,{rot:-0.05,dy:-0.012,scale:1,originX:0.5,originY:0.62})],
    ['celebrate r=.2',c=>draw(c,imgs,W,H,'open',-32,-21,{scale:1.015,dy:-0.023,originX:0.5,originY:0.62})],
    ['celebrate r=.45',c=>draw(c,imgs,W,H,'open',22,-24,{scale:1.025,dy:-0.005,originX:0.5,originY:0.62})],
  ];
  const cols=4,gap=8,labelH=18,tileW=W,tileH=H+labelH;
  const out=createCanvas((cols*tileW+(cols+1)*gap)*dpr,(tileH+2*gap)*dpr);
  const o=out.getContext('2d'); o.scale(dpr,dpr); o.fillStyle='#141414'; o.fillRect(0,0,out.width/dpr,out.height/dpr);
  for(let i=0;i<frames.length;i++){const [label,d]=frames[i];const cx=gap+i*(tileW+gap),cy=gap;
    const tile=createCanvas(W*dpr,H*dpr);const t=tile.getContext('2d');t.scale(dpr,dpr);d(t);
    o.drawImage(tile,cx,cy,W,H);o.fillStyle='#aaa';o.font='12px sans-serif';o.fillText(label,cx+2,cy+H+13);}
  fs.writeFileSync(path.join(__dirname,'verify_react.png'),out.toBuffer('image/png'));console.log('wrote');
})();
