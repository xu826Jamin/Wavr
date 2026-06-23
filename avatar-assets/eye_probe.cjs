const sharp = require('sharp');
const path = require('path');
(async () => {
  const f = path.join(__dirname, '..', 'src', 'assets', 'avatar', 'base_body.webp');
  const W = 1024, H = 768;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const px = (x,y)=>{const i=(y*W+x)*ch; return [data[i],data[i+1],data[i+2],data[i+3]];};
  const isSkin = (r,g,b)=> r>185 && g>150 && b>115 && r>b+25;
  const isDark = (r,g,b,a)=> a>120 && r<70 && g<70 && b<70;
  // facial dark = dark pixel with skin within 22px horizontally (excludes mask/headband)
  let pts=[];
  for (let y=300; y<420; y++) for (let x=380; x<650; x++){
    const [r,g,b,a]=px(x,y);
    if(!isDark(r,g,b,a)) continue;
    let skinNear=false;
    for(let d=4; d<=24 && !skinNear; d+=3){
      for(const xx of [x-d,x+d]){ const [rr,gg,bb]=px(xx,y); if(isSkin(rr,gg,bb)){skinNear=true;break;} }
    }
    if(skinNear) pts.push([x,y]);
  }
  // split eyebrows (upper) vs pupils (lower): pupils are the rounder lower cluster.
  // find y histogram gap
  const ys = pts.map(p=>p[1]).sort((a,b)=>a-b);
  console.log('facial-dark y range', ys[0], '-', ys[ys.length-1], 'count', pts.length);
  // cluster by simple y threshold sweep: pick split where density dips
  const hist={}; ys.forEach(y=>hist[y]=(hist[y]||0)+1);
  let split=355, best=1e9;
  for(let s=335;s<375;s++){ const v=(hist[s]||0)+(hist[s-1]||0)+(hist[s+1]||0); if(v<best){best=v;split=s;} }
  const brows=pts.filter(p=>p[1]<split), pupils=pts.filter(p=>p[1]>=split);
  const bb=(g,n)=>{ if(!g.length){console.log(n,'none');return;} const xs=g.map(p=>p[0]),yy=g.map(p=>p[1]);
    const mid=(Math.min(...xs)+Math.max(...xs))/2; const Lr=g.filter(p=>p[0]<mid),Rr=g.filter(p=>p[0]>=mid);
    const stat=q=>({cx:Math.round(q.reduce((s,p)=>s+p[0],0)/q.length),cy:Math.round(q.reduce((s,p)=>s+p[1],0)/q.length),x:[Math.min(...q.map(p=>p[0])),Math.max(...q.map(p=>p[0]))],y:[Math.min(...q.map(p=>p[1])),Math.max(...q.map(p=>p[1]))]});
    console.log(n+' split@y='+split); console.log('  L',JSON.stringify(stat(Lr))); console.log('  R',JSON.stringify(stat(Rr)));
  };
  bb(pupils,'PUPILS');
  bb(brows,'BROWS');
  // sample skin near each pupil (just outside, above)
  const samp=(x,y)=>{let r=0,g=0,b=0,n=0;for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const [rr,gg,bb2]=px(x+dx,y+dy);if(isSkin(rr,gg,bb2)){r+=rr;g+=gg;b+=bb2;n++;}}return n?[Math.round(r/n),Math.round(g/n),Math.round(b/n),n]:null;};
  console.log('skin@ left-of-Lpupil', samp(430,360), '| right cheek', samp(560,375));
})();
