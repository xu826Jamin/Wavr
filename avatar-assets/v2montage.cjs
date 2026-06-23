// v2 review montage: cut grey bg, canonicalize raised hand to the RIGHT (flip the 3 that came
// out on the left), trim/scale, composite over #050505, tile 2x2 for R2 sign-off.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');

const THRESH = 45;
async function cutBuffer(file) {
  const { data, info } = await sharp(path.join(dir, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  return sharp(data,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
}

async function cell(file, flip) {
  let img = sharp(await cutBuffer(file));
  if (flip) img = sharp(await img.flop().toBuffer());
  const trimmed = await img.trim().resize({ width: 470, height: 340, fit: 'inside' }).toBuffer();
  return sharp({ create: { width: 500, height: 370, channels: 4, background: '#050505' } })
    .composite([{ input: trimmed, gravity: 'center' }]).png().toBuffer();
}

(async () => {
  // [file, flipToRight?]
  const set = [['open_z.png', false], ['fist_z.png', true], ['pointing_z.png', true], ['victory_z.png', true]];
  const [a,b,c,d] = await Promise.all(set.map(([f,fl]) => cell(f, fl)));
  await sharp({ create: { width: 1012, height: 752, channels: 4, background: '#141414' } })
    .composite([
      { input: a, left: 4, top: 4 }, { input: b, left: 508, top: 4 },
      { input: c, left: 4, top: 378 }, { input: d, left: 508, top: 378 },
    ]).png().toFile(path.join(dir, 'SET_v2_montage.png'));
  console.log('SET_v2_montage.png (TL open, TR fist, BL pointing, BR victory)');
})();
