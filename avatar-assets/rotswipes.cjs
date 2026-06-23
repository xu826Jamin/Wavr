// Verify each pose's arm rotates cleanly about ITS OWN shoulder attach point (per-pose pivot).
// 4 rows (open/fist/pointing/victory) x 3 angles (-18, 0, +18). Should stay attached, no head.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;
const PIV = { open:[844,502], fist:[797,502], pointing:[806,502], victory:[858,502] };

async function rotatedArm(armFile, piv, deg) {
  const CW = piv[0]*2, CH = piv[1]*2;
  const centered = await sharp({ create:{ width:CW, height:CH, channels:4, background:'#00000000' } })
    .composite([{ input: path.join(dir, armFile), left:0, top:0 }]).png().toBuffer();
  const rot = await sharp(centered).rotate(deg, { background:'#00000000' }).png().toBuffer();
  const m = await sharp(rot).metadata();
  return sharp(rot).extract({ left: Math.round(m.width/2-piv[0]), top: Math.round(m.height/2-piv[1]), width:W, height:H }).png().toBuffer();
}
async function frame(pose, deg) {
  const arm = await rotatedArm(`arm_${pose}.png`, PIV[pose], deg);
  return sharp({ create:{ width:W, height:H, channels:4, background:'#050505' } })
    .composite([{ input: path.join(dir,'base_body.png'), left:0, top:0 }, { input: arm, left:0, top:0 }])
    .png().toBuffer();
}

(async () => {
  const poses = ['open','fist','pointing','victory'];
  const degs = [-18, 0, 18];
  const cw = Math.round(W/3.2), ch = Math.round(H/3.2), gap = 6;
  const rows = [];
  for (const p of poses) {
    const cells = [];
    for (const d of degs) cells.push(await sharp(await frame(p, d)).resize(cw, ch).toBuffer());
    rows.push(cells);
  }
  const comp = [];
  rows.forEach((cells, r) => cells.forEach((b, c) => comp.push({ input:b, left: gap+c*(cw+gap), top: gap+r*(ch+gap) })));
  await sharp({ create:{ width: degs.length*cw + (degs.length+1)*gap, height: poses.length*ch + (poses.length+1)*gap, channels:4, background:'#141414' } })
    .composite(comp).png().toFile(path.join(dir,'rot_all.png'));
  console.log('rot_all.png (rows: open/fist/pointing/victory; cols: -18 / 0 / +18 deg)');
})();
