// Puppet step 1: register all 4 cut poses to a common head position+scale, using the green
// headband as the anchor. Output registered_*.png (1024x768, transparent) + a verify montage.
// This normalizes scale drift and aligns bodies so we can later swap only the raised arm.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');

const CW = 1024, CH = 768;       // canonical canvas
const HX = 512, HY = 250, TW = 300; // target headband center + width
const THRESH = 45;

async function cutFlipRaw(file, flip) {
  let img = sharp(path.join(dir, file)).ensureAlpha();
  let { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  let { width: W, height: H } = info;
  const idx = (x, y) => (y * W + x) * 4;
  const c = [[2,2],[W-3,2],[2,H-3],[W-3,H-3]];
  let br=0,bg=0,bb=0; for (const [x,y] of c){const i=idx(x,y);br+=data[i];bg+=data[i+1];bb+=data[i+2];}
  br/=4;bg/=4;bb/=4;
  const isBg = i => { const a=data[i]-br,b=data[i+1]-bg,d=data[i+2]-bb; return a*a+b*b+d*d < THRESH*THRESH; };
  const seen = new Uint8Array(W*H); const st=[];
  const push=(x,y)=>{ if(x<0||y<0||x>=W||y>=H)return; const p=y*W+x; if(seen[p])return; seen[p]=1; if(isBg(idx(x,y)))st.push(x,y); };
  for(let x=0;x<W;x++){push(x,0);push(x,H-1);} for(let y=0;y<H;y++){push(0,y);push(W-1,y);}
  while(st.length){const y=st.pop(),x=st.pop(); data[idx(x,y)+3]=0; push(x+1,y);push(x-1,y);push(x,y+1);push(x,y-1);}
  if (flip) {
    const r = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).flop().raw().toBuffer({ resolveWithObject: true });
    data = r.data; // W,H unchanged
  }
  return { data, W, H };
}

function headband(data, W, H) {
  let sx=0, sy=0, n=0, minx=1e9, maxx=-1e9;
  for (let y=0; y<H*0.5; y++) for (let x=0; x<W; x++) {
    const i=(y*W+x)*4; if (data[i+3]<128) continue;
    const r=data[i],g=data[i+1],b=data[i+2];
    if (g>150 && g-r>45 && g-b>35) { sx+=x; sy+=y; n++; if(x<minx)minx=x; if(x>maxx)maxx=x; }
  }
  return n ? { cx: sx/n, cy: sy/n, w: maxx-minx, n } : null;
}

async function register(file, flip) {
  const { data, W, H } = await cutFlipRaw(file, flip);
  const hb = headband(data, W, H);
  if (!hb) throw new Error('no headband found in ' + file);
  const scale = TW / hb.w;
  const png = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
  const sw = Math.round(W*scale), sh = Math.round(H*scale);
  const scaled = await sharp(png).resize(sw, sh).raw().toBuffer();
  // place so headband centroid -> (HX,HY); handle clipping with extract
  const left = Math.round(HX - hb.cx*scale), top = Math.round(HY - hb.cy*scale);
  const sx0 = Math.max(0,-left), sy0 = Math.max(0,-top);
  const sx1 = Math.min(sw, CW-left), sy1 = Math.min(sh, CH-top);
  const cw = sx1-sx0, ch = sy1-sy0;
  const sub = await sharp(scaled, { raw:{width:sw,height:sh,channels:4} }).extract({ left:sx0, top:sy0, width:cw, height:ch }).png().toBuffer();
  const out = await sharp({ create:{ width:CW, height:CH, channels:4, background:'#00000000' } })
    .composite([{ input: sub, left: Math.max(0,left), top: Math.max(0,top) }]).png().toBuffer();
  await sharp(out).toFile(path.join(dir, `registered_${file.replace('_z.png','')}.png`));
  return out;
}

(async () => {
  const set = [['open_z.png',false],['fist_z.png',true],['pointing_z.png',true],['victory_z.png',true]];
  const outs = [];
  for (const [f,fl] of set) outs.push(await register(f,fl));
  // verify montage over frame color
  const cells = await Promise.all(outs.map(async b =>
    sharp({create:{width:CW/2,height:CH/2,channels:4,background:'#050505'}})
      .composite([{ input: await sharp(b).resize(CW/2,CH/2).toBuffer(), left:0, top:0 }]).png().toBuffer()
  ));
  await sharp({create:{width:CW+8,height:CH+8,channels:4,background:'#141414'}})
    .composite([
      {input:cells[0],left:2,top:2},{input:cells[1],left:CW/2+6,top:2},
      {input:cells[2],left:2,top:CH/2+6},{input:cells[3],left:CW/2+6,top:CH/2+6},
    ]).png().toFile(path.join(dir,'registered_montage.png'));
  console.log('registered + montage done');
})();
