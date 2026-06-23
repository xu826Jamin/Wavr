// Consistent-forearm rig: ALL poses share OPEN's forearm; only the HAND swaps (grafted at a
// common wrist). One forearm shape => one connector capsule works for every pose.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;

const CUFF = { open:[825,392], fist:[823,376], pointing:[835,344], victory:[823,392] }; // wrist per pose
const WRIST = [825, 392];                 // common target wrist (open's)
const FORE_TOP = 382;                     // forearm = open arm, y >= this
const S = [772, 528], AP = [844, 502];    // shoulder + open elbow (one set for all)

const raw = async f => sharp(path.join(dir,f)).ensureAlpha().raw().toBuffer({ resolveWithObject:true });
const toPng = buf => sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toBuffer();

async function forearmBase() {                     // open arm, keep y >= FORE_TOP
  const { data } = await raw('arm_open.png');
  const out = Buffer.from(data);
  for (let y=0; y<FORE_TOP; y++) for (let x=0; x<W; x++) out[(y*W+x)*4+3] = 0;
  return toPng(out);
}
async function handSprite(pose) {                  // pose arm, keep y <= cuffY+14, shift to WRIST
  const { data } = await raw(`arm_${pose}.png`);
  const cut = CUFF[pose][1] + 14;
  const masked = Buffer.alloc(W*H*4);
  for (let y=0; y<=cut; y++) for (let x=0; x<W; x++) { const i=(y*W+x)*4; for (let k=0;k<4;k++) masked[i+k]=data[i+k]; }
  const dx = WRIST[0]-CUFF[pose][0], dy = WRIST[1]-CUFF[pose][1];
  const P=240;
  const big = await sharp({create:{width:W+2*P,height:H+2*P,channels:4,background:'#00000000'}})
    .composite([{ input: await toPng(masked), left:P+dx, top:P+dy }]).png().toBuffer();
  return sharp(big).extract({left:P,top:P,width:W,height:H}).png().toBuffer();
}

const P2=240;
async function shiftBuf(png, ox, oy) {
  const big = await sharp({create:{width:W+2*P2,height:H+2*P2,channels:4,background:'#00000000'}})
    .composite([{ input: png, left:P2+ox, top:P2+oy }]).png().toBuffer();
  return sharp(big).extract({left:P2,top:P2,width:W,height:H}).png().toBuffer();
}
const capFill = (ox,oy) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${S[0]}" y1="${S[1]}" x2="${AP[0]+ox}" y2="${AP[1]+oy}" stroke="#41474f" stroke-width="82" stroke-linecap="round"/></svg>`);

(async () => {
  const fore = await forearmBase();
  await sharp(fore).toFile(path.join(dir,'forearm_base.png'));
  const hands = {};
  for (const p of ['open','fist','pointing','victory']) { hands[p] = await handSprite(p); await sharp(hands[p]).toFile(path.join(dir,`hand_${p}.png`)); }

  async function frame(pose, ox, oy, cap) {
    const layers = [{ input: path.join(dir,'base_body.png'), left:0, top:0 }];
    if (cap) layers.push({ input: capFill(ox,oy), left:0, top:0 });
    layers.push({ input: await shiftBuf(fore, ox, oy), left:0, top:0 });
    layers.push({ input: await shiftBuf(hands[pose], ox, oy), left:0, top:0 });
    return sharp({create:{width:W,height:H,channels:4,background:'#050505'}}).composite(layers).png().toBuffer();
  }
  // static montage (rest, no capsule) for all 4
  const poses=['open','fist','pointing','victory'];
  const cells = await Promise.all(poses.map(async p => sharp(await frame(p,0,0,false)).resize(W/2,H/2).toBuffer()));
  await sharp({create:{width:W+8,height:H+8,channels:4,background:'#141414'}})
    .composite([{input:cells[0],left:2,top:2},{input:cells[1],left:W/2+6,top:2},{input:cells[2],left:2,top:H/2+6},{input:cells[3],left:W/2+6,top:H/2+6}])
    .png().toFile(path.join(dir,'consistent_rest.png'));
  // high-res failure-case checks with capsule
  await sharp(await frame('fist',0,-90,true)).toFile(path.join(dir,'consistent_fist_up.png'));
  await sharp(await frame('pointing',0,-90,true)).toFile(path.join(dir,'consistent_pointing_up.png'));
  await sharp(await frame('victory',0,-90,true)).toFile(path.join(dir,'consistent_victory_up.png'));

  // full rigorous check: 4 poses x 5 states
  const cols = [['rest',0,0],['up',0,-90],['down',0,90],['left',-90,0],['right',90,0]];
  const cw=Math.round(W/3.0), ch=Math.round(H/3.0), gap=5, comp=[];
  for (let r=0;r<poses.length;r++) for (let c=0;c<cols.length;c++) {
    const b = await sharp(await frame(poses[r], cols[c][1], cols[c][2], c>0)).resize(cw,ch).toBuffer();
    comp.push({ input:b, left: gap+c*(cw+gap), top: gap+r*(ch+gap) });
  }
  await sharp({create:{width:cols.length*cw+(cols.length+1)*gap,height:poses.length*ch+(poses.length+1)*gap,channels:4,background:'#141414'}})
    .composite(comp).png().toFile(path.join(dir,'consistent_all.png'));
  console.log('consistent_rest.png + consistent_fist_up.png + consistent_all.png');
})();
