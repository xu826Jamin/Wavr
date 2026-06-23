// High-res scrutiny (full 1024x768) of the capsule blend. Compare:
//  1) open at REST with NO capsule (clean baseline = original puppet)
//  2) open UP with a FILL-ONLY capsule (no dark outline)
//  3) fist UP with a FILL-ONLY capsule
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;
const S = [772, 528];
const AP = { open:[844,502], fist:[797,502] };
const FILL = '#41474f';

const P = 220;
async function shift(armFile, ox, oy) {
  const big = await sharp({ create:{ width:W+2*P, height:H+2*P, channels:4, background:'#00000000' } })
    .composite([{ input: path.join(dir, armFile), left:P+ox, top:P+oy }]).png().toBuffer();
  return sharp(big).extract({ left:P, top:P, width:W, height:H }).png().toBuffer();
}
const capsuleFill = (ap,ox,oy,wd) => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <line x1="${S[0]}" y1="${S[1]}" x2="${ap[0]+ox}" y2="${ap[1]+oy}" stroke="${FILL}" stroke-width="${wd}" stroke-linecap="round"/></svg>`);

async function frame(pose, ox, oy, drawCap, wd=82) {
  const layers = [{ input: path.join(dir,'base_body.png'), left:0, top:0 }];
  if (drawCap) layers.push({ input: capsuleFill(AP[pose], ox, oy, wd), left:0, top:0 });
  layers.push({ input: await shift(`arm_${pose}.png`, ox, oy), left:0, top:0 });
  return sharp({ create:{ width:W, height:H, channels:4, background:'#050505' } }).composite(layers).png().toBuffer();
}

(async () => {
  await sharp(await frame('open', 0, 0, false)).toFile(path.join(dir,'hires_open_rest_nocap.png'));
  await sharp(await frame('open', 0, -90, true)).toFile(path.join(dir,'hires_open_up_fill.png'));
  await sharp(await frame('fist', 0, -90, true)).toFile(path.join(dir,'hires_fist_up_fill.png'));
  console.log('hires_*.png written');
})();
