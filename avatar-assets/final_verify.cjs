// Comprehensive check mirroring mascot2d.js: 4 poses (rows) x 5 states (rest/up/down/left/right).
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;
const S = [772, 528];
const AP = { open:[844,502], fist:[797,502], pointing:[806,502], victory:[858,502] };
const MAG = 90;

const P = 220;
async function shift(armFile, ox, oy) {
  const big = await sharp({ create:{ width:W+2*P, height:H+2*P, channels:4, background:'#00000000' } })
    .composite([{ input: path.join(dir, armFile), left:P+ox, top:P+oy }]).png().toBuffer();
  return sharp(big).extract({ left:P, top:P, width:W, height:H }).png().toBuffer();
}
const capsule = (ap,ox,oy) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${S[0]}" y1="${S[1]}" x2="${ap[0]+ox}" y2="${ap[1]+oy}" stroke="#11151a" stroke-width="100" stroke-linecap="round"/>
  <line x1="${S[0]}" y1="${S[1]}" x2="${ap[0]+ox}" y2="${ap[1]+oy}" stroke="#41474f" stroke-width="84" stroke-linecap="round"/></svg>`);
async function frame(pose, ox, oy) {
  return sharp({ create:{ width:W, height:H, channels:4, background:'#050505' } })
    .composite([
      { input: path.join(dir,'base_body.png'), left:0, top:0 },
      { input: capsule(AP[pose], ox, oy), left:0, top:0 },
      { input: await shift(`arm_${pose}.png`, ox, oy), left:0, top:0 },
    ]).png().toBuffer();
}

(async () => {
  const poses = ['open','fist','pointing','victory'];
  const cols = [['rest',0,0],['up',0,-MAG],['down',0,MAG],['left',-MAG,0],['right',MAG,0]];
  const cw=Math.round(W/3.0), ch=Math.round(H/3.0), gap=5;
  const comp = [];
  for (let r=0;r<poses.length;r++) for (let c=0;c<cols.length;c++) {
    const b = await sharp(await frame(poses[r], cols[c][1], cols[c][2])).resize(cw,ch).toBuffer();
    comp.push({ input:b, left: gap+c*(cw+gap), top: gap+r*(ch+gap) });
  }
  await sharp({ create:{ width: cols.length*cw+(cols.length+1)*gap, height: poses.length*ch+(poses.length+1)*gap, channels:4, background:'#141414' } })
    .composite(comp).png().toFile(path.join(dir,'final_verify.png'));
  console.log('final_verify.png (rows: open/fist/pointing/victory; cols: rest/up/down/left/right)');
})();
