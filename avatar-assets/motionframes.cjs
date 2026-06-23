// Motion timeline using arm ROTATION about the shoulder (matches mascot2d.js). Two rows show the
// two swing senses: row1 = up/left (negative), row2 = down/right (positive).
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;
const PV = [844, 502], PEAK = 19;   // open-pose pivot

const easeOut = u => 1 - Math.pow(1 - u, 3);
const swingMag = u => u<0.20 ? -0.25*easeOut(u/0.20) : u<0.48 ? -0.25+1.25*easeOut((u-0.20)/0.28) : 1-easeOut((u-0.48)/0.52);

async function rotatedArm(deg) {
  const CW = PV[0]*2, CH = PV[1]*2;
  const centered = await sharp({ create:{ width:CW, height:CH, channels:4, background:'#00000000' } })
    .composite([{ input: path.join(dir,'arm_open.png'), left:0, top:0 }]).png().toBuffer();
  const rot = await sharp(centered).rotate(deg, { background:'#00000000' }).png().toBuffer();
  const m = await sharp(rot).metadata();
  return sharp(rot).extract({ left: Math.round(m.width/2-PV[0]), top: Math.round(m.height/2-PV[1]), width:W, height:H }).png().toBuffer();
}
async function frame(deg) {
  return sharp({ create:{ width:W, height:H, channels:4, background:'#050505' } })
    .composite([{ input: path.join(dir,'base_body.png'), left:0, top:0 }, { input: await rotatedArm(deg), left:0, top:0 }])
    .png().toBuffer();
}

(async () => {
  const us = [0, 0.18, 0.34, 0.48, 0.66, 1.0];
  const cw = 440, ch = Math.round(cw*H/W), gap = 8;
  const row = async sign => Promise.all(us.map(async u => sharp(await frame(sign*swingMag(u)*PEAK)).resize(cw,ch).toBuffer()));
  const up = await row(-1), down = await row(1);
  const rowW = us.length*cw + (us.length+1)*gap;
  const comp = (cells, top) => cells.map((b,i)=>({ input:b, left: gap+i*(cw+gap), top }));
  await sharp({ create:{ width: rowW, height: ch*2+gap*3, channels:4, background:'#141414' } })
    .composite([...comp(up, gap), ...comp(down, ch+gap*2)])
    .png().toFile(path.join(dir,'motion_frames.png'));
  console.log('motion_frames.png (row1 = up/left swing, row2 = down/right swing)');
})();
