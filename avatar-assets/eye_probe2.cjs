const sharp = require('sharp');
const path = require('path');
(async () => {
  const f = path.join(__dirname, '..', 'src', 'assets', 'avatar', 'base_body.webp');
  const W=1024;
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch=info.channels; const px=(x,y)=>{const i=(y*W+x)*ch;return [data[i],data[i+1],data[i+2],data[i+3]];};
  // sample skin: a point clearly on cheek (between/below eyes, on face). Try several.
  for(const [x,y] of [[512,400],[470,395],[555,395],[512,360]]) console.log('sample',x,y,'=',px(x,y));
  // find pupils: scan a box y[350-420] x[400-650], dark pixels (pupils are pure dark on skin)
  const isDark=(r,g,b,a)=>a>120&&r<60&&g<60&&b<60;
  let pts=[];
  for(let y=350;y<425;y++)for(let x=400;x<650;x++){const [r,g,b,a]=px(x,y);if(isDark(r,g,b,a))pts.push([x,y]);}
  console.log('dark in pupil band:',pts.length,'yrange',pts.length?[Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[1]))]:'-');
  if(pts.length){
    const xs=pts.map(p=>p[0]);const mid=(Math.min(...xs)+Math.max(...xs))/2;
    const grp=g=>({cx:Math.round(g.reduce((s,p)=>s+p[0],0)/g.length),cy:Math.round(g.reduce((s,p)=>s+p[1],0)/g.length),x:[Math.min(...g.map(p=>p[0])),Math.max(...g.map(p=>p[0]))],y:[Math.min(...g.map(p=>p[1])),Math.max(...g.map(p=>p[1]))],n:g.length});
    console.log('L pupil',JSON.stringify(grp(pts.filter(p=>p[0]<mid))));
    console.log('R pupil',JSON.stringify(grp(pts.filter(p=>p[0]>=mid))));
  }
})();
