// Show the swipe animation as a keyframe filmstrip (open palm, swipe UP), replicating the
// mascot2d.js motion math (directional nudge + green motion streaks).
const sharp = require('sharp');
const path = require('path');

const W = 340, H = 255;
const av = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');

const easeOut = u => 1 - Math.pow(1 - u, 3);
function swingMag(u){ if(u<0.20)return -0.25*easeOut(u/0.20); if(u<0.48)return -0.25+1.25*easeOut((u-0.20)/0.28); return 1.0*(1-easeOut((u-0.48)/0.52)); }
function lineAlpha(u){ if(u<0.28||u>0.72)return 0; const m=(u-0.28)/0.44; return Math.sin(Math.PI*m); }

function linesSvg(u){
  const a=lineAlpha(u); if(a<=0) return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"></svg>`;
  const vx=0, vy=-1; const hx=W*0.62, hy=H*0.30; const len=Math.min(W,H)*0.16;
  let s='';
  for(let i=-1;i<=1;i++){ const px=-vy,py=vx; const ox=px*i*len*0.42, oy=py*i*len*0.42;
    const sx=hx+ox-vx*len*0.2, sy=hy+oy-vy*len*0.2; const ll=len*(0.7+0.3*(1-Math.abs(i)));
    const ex=sx+vx*ll, ey=sy+vy*ll; const w=i===0?5:3.2;
    s+=`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="rgba(74,222,128,${(a*0.55).toFixed(3)})" stroke-width="${w}" stroke-linecap="round"/>`; }
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${s}</svg>`;
}

(async () => {
  const avatar = await sharp(path.join(av, 'open.webp')).resize({ width: Math.round(W*0.9), height: Math.round(H*0.9), fit: 'inside' }).toBuffer();
  const meta = await sharp(avatar).metadata();
  const us = [0.0, 0.18, 0.34, 0.5, 0.64, 1.0];
  const frames = [];
  for (const u of us) {
    const mag = swingMag(u) * Math.min(W,H) * 0.085;
    const dy = -1 * mag; // up
    const left = Math.round((W - meta.width)/2);
    const top  = Math.round((H - meta.height) + dy); // south-anchored + nudge
    const cell = await sharp({ create:{ width:W, height:H, channels:4, background:'#050505' } })
      .composite([
        { input: avatar, left, top },
        { input: Buffer.from(linesSvg(u)), top:0, left:0 },
      ]).png().toBuffer();
    frames.push(cell);
  }
  const gap = 8;
  const stripW = frames.length*W + (frames.length+1)*gap;
  const comp = frames.map((f,i)=>({ input:f, left: gap + i*(W+gap), top: gap }));
  await sharp({ create:{ width:stripW, height:H+2*gap, channels:4, background:'#141414' } })
    .composite(comp).png().toFile(path.join(__dirname,'v2','swipe_filmstrip.png'));
  console.log('swipe_filmstrip.png written');
})();
