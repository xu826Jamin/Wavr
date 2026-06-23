// Verify base_body + each arm sprite connect cleanly at rest (2x2), and view base_body alone.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;

(async () => {
  const base = path.join(dir, 'base_body.png');
  const poses = ['open','fist','pointing','victory'];
  const cells = [];
  for (const p of poses) {
    const buf = await sharp({create:{width:W,height:H,channels:4,background:'#050505'}})
      .composite([{ input: base, left:0, top:0 }, { input: path.join(dir,`arm_${p}.png`), left:0, top:0 }])
      .png().toBuffer();
    cells.push(await sharp(buf).resize(W/2,H/2).toBuffer());
  }
  await sharp({create:{width:W+8,height:H+8,channels:4,background:'#141414'}})
    .composite([
      {input:cells[0],left:2,top:2},{input:cells[1],left:W/2+6,top:2},
      {input:cells[2],left:2,top:H/2+6},{input:cells[3],left:W/2+6,top:H/2+6},
    ]).png().toFile(path.join(dir,'rig_rest_montage.png'));

  const bb = await sharp({create:{width:W,height:H,channels:4,background:'#050505'}})
    .composite([{ input: base, left:0, top:0 }]).png().toBuffer();
  await sharp(bb).resize(W/2,H/2).png().toFile(path.join(dir,'base_body_on_frame.png'));
  console.log('rig_rest_montage.png + base_body_on_frame.png');
})();
