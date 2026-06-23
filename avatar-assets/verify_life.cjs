// Faithful check of Phase-5 idle life: blink lids (skin-coloured, over the pupils) at several
// progress values, plus hover-lean and glance transforms — mirrors avatar.js exactly.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs=require('fs'),path=require('path');
const AW=1024,AH=768;
const dir=path.join(__dirname,'..','src','assets','avatar');
const load=f=>loadImage(path.join(dir,f));

function drawAvatar(ctx,imgs,W,H,xf,blinkP){
  const s=W/AW;
  ctx.clearRect(0,0,W,H); ctx.fillStyle='#0c0c0c'; ctx.fillRect(0,0,W,H);
  ctx.save();
  if(xf){const oxp=(xf.originX??0.5)*W,oyp=(xf.originY??0.5)*H;
    ctx.translate(oxp+(xf.dx||0)*W,oyp+(xf.dy||0)*H); if(xf.rot)ctx.rotate(xf.rot);
    const sc=xf.scale??1; ctx.scale(sc,sc); ctx.translate(-oxp,-oyp);}
  ctx.drawImage(imgs.base,0,0,W,H);
  ctx.drawImage(imgs.fore,0,0,W,H);
  ctx.drawImage(imgs.hand_open,0,0,W,H);
  // blink
  if(blinkP>0){
    const eyes=[[450,307,50,38],[562,303,48,40]];
    ctx.save();
    for(const [x,y,w,h] of eyes){const lh=Math.max(2,blinkP*h);
      ctx.fillStyle='rgb(247,201,170)';
      ctx.beginPath(); ctx.roundRect(x*s,y*s,w*s,lh*s,[0,0,7*s,7*s]); ctx.fill();
      ctx.strokeStyle='rgba(86,58,44,0.85)'; ctx.lineWidth=2.2*s; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo((x+2)*s,(y+lh)*s); ctx.lineTo((x+w-2)*s,(y+lh)*s); ctx.stroke();}
    ctx.restore();
  }
  ctx.restore();
}

(async()=>{
  const imgs={base:await load('base_body.webp'),fore:await load('forearm.webp'),hand_open:await load('hand_open.webp')};
  const W=300,H=225,dpr=2;
  const frames=[
    ['open (no blink)',c=>drawAvatar(c,imgs,W,H,null,0)],
    ['blink 40%',c=>drawAvatar(c,imgs,W,H,null,0.4)],
    ['blink 75%',c=>drawAvatar(c,imgs,W,H,null,0.75)],
    ['blink closed',c=>drawAvatar(c,imgs,W,H,null,1)],
    ['hover lean',c=>drawAvatar(c,imgs,W,H,{rot:-0.035,scale:1.025,dy:-0.012,originX:0.5,originY:0.62},0)],
    ['glance L',c=>drawAvatar(c,imgs,W,H,{rot:-0.02,dx:-0.012,scale:1,originX:0.5,originY:0.62},0)],
  ];
  const cols=3,rows=2,gap=8,labelH=18,tileW=W,tileH=H+labelH;
  const out=createCanvas((cols*tileW+(cols+1)*gap)*dpr,(rows*tileH+(rows+1)*gap)*dpr);
  const octx=out.getContext('2d'); octx.scale(dpr,dpr);
  octx.fillStyle='#141414'; octx.fillRect(0,0,out.width/dpr,out.height/dpr);
  for(let i=0;i<frames.length;i++){const [label,draw]=frames[i];
    const cx=gap+(i%cols)*(tileW+gap),cy=gap+Math.floor(i/cols)*(tileH+gap);
    const tile=createCanvas(W*dpr,H*dpr); const tctx=tile.getContext('2d'); tctx.scale(dpr,dpr); draw(tctx);
    octx.drawImage(tile,cx,cy,W,H);
    octx.fillStyle='#aaa'; octx.font='12px sans-serif'; octx.fillText(label,cx+2,cy+H+13);}
  fs.writeFileSync(path.join(__dirname,'verify_life.png'),out.toBuffer('image/png'));
  console.log('wrote verify_life.png');
})();
