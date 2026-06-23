// Cut the flat-grey bg from an avatar still and composite it over the frame color so we can
// judge contrast/separation on the real UI. Usage: node frame.cjs <in.png> <out.png> [#bg]
const sharp = require('sharp');
const path = require('path');

const THRESH = 45;
async function cutBuffer(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const idx = (x, y) => (y * W + x) * 4;
  const c = [[2,2],[W-3,2],[2,H-3],[W-3,H-3]];
  let br=0,bg=0,bb=0; for (const [x,y] of c){const i=idx(x,y);br+=data[i];bg+=data[i+1];bb+=data[i+2];}
  br/=4;bg/=4;bb/=4;
  const isBg = i => { const a=data[i]-br,b=data[i+1]-bg,d=data[i+2]-bb; return a*a+b*b+d*d < THRESH*THRESH; };
  const seen = new Uint8Array(W*H); const st=[];
  const push=(x,y)=>{ if(x<0||y<0||x>=W||y>=H)return; const p=y*W+x; if(seen[p])return; seen[p]=1; if(isBg(idx(x,y)))st.push(x,y); };
  for(let x=0;x<W;x++){push(x,0);push(x,H-1);} for(let y=0;y<H;y++){push(0,y);push(W-1,y);}
  while(st.length){const y=st.pop(),x=st.pop(); data[idx(x,y)+3]=0; push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1);}
  return { buf: await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer() };
}

(async () => {
  const [inF, outF, bg='#050505'] = process.argv.slice(2);
  const { buf } = await cutBuffer(inF);
  const fg = await sharp(buf).trim().resize({ width: 520, height: 560, fit: 'inside' }).toBuffer();
  await sharp({ create: { width: 747, height: 560, channels: 4, background: bg } })
    .composite([{ input: fg, gravity: 'center' }])
    .png().toFile(outF);
  console.log('wrote', path.basename(outF));
})();
