const sharp=require('sharp'),path=require('path');
(async()=>{
  const f=path.join(__dirname,'..','src','assets','avatar','base_body.webp');
  const W=1024;const {data,info}=await sharp(f).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const ch=info.channels;const px=(x,y)=>{const i=(y*W+x)*ch;return [data[i],data[i+1],data[i+2],data[i+3]];};
  // sample peach skin spots
  for(const [x,y] of [[440,330],[520,330],[630,330],[500,345]]) console.log('skin?',x,y,'=',px(x,y));
  // pupils: very dark, in y[300-350]
  const isDark=(r,g,b,a)=>a>120&&r<55&&g<60&&b<70;
  let pts=[];for(let y=298;y<352;y++)for(let x=420;x<640;x++){const [r,g,b,a]=px(x,y);if(isDark(r,g,b,a))pts.push([x,y]);}
  const xs=pts.map(p=>p[0]);const mid=535;
  const grp=g=>({cx:Math.round(g.reduce((s,p)=>s+p[0],0)/g.length),cy:Math.round(g.reduce((s,p)=>s+p[1],0)/g.length),x:[Math.min(...g.map(p=>p[0])),Math.max(...g.map(p=>p[0]))],y:[Math.min(...g.map(p=>p[1])),Math.max(...g.map(p=>p[1]))],n:g.length});
  console.log('L pupil',JSON.stringify(grp(pts.filter(p=>p[0]<mid))));
  console.log('R pupil',JSON.stringify(grp(pts.filter(p=>p[0]>=mid))));
})();
