// Puppet step 2: build each pose as HERO body/face + that pose's raised arm grafted in.
// Registered images share a canvas, so the arm is already positioned. We take pose pixels only
// in the "arm zone" (right of the head, above the shoulder) and recolor skin->glove. Everything
// else (head, face, eyes, torso, chest emblem, lower body) is the hero -> identical every pose.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');

const CW = 1024, CH = 768;
const XARM = 630;   // swap only x >= this (right of the head)
const YBOT = 470;   // ...and y <= this (above the shoulder, so no torso seam)

const load = async f => (await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;

function sampleGlove(hero) {
  // average opaque, non-green, non-outline, non-skin pixels in the centre torso
  let r=0,g=0,b=0,n=0;
  for (let y=560; y<660; y++) for (let x=440; x<584; x++) {
    const i=(y*CW+x)*4; if (hero[i+3]<200) continue;
    const R=hero[i],G=hero[i+1],B=hero[i+2];
    if (R+G+B < 140) continue;                 // outline
    if (G>150 && G-R>45 && G-B>35) continue;    // green
    if (R>170 && R>G && G>B) continue;          // skin
    r+=R; g+=G; b+=B; n++;
  }
  return n ? [Math.round(r/n),Math.round(g/n),Math.round(b/n)] : [60,68,76];
}
const isSkin = (R,G,B) => R>165 && R>=G && G>=B && R-B>25 && G>110;

async function build(file, hero, glove) {
  const pose = await load(file);
  const out = Buffer.from(hero); // start from hero
  for (let y=0; y<=YBOT; y++) for (let x=XARM; x<CW; x++) {
    const i=(y*CW+x)*4;
    // take pose pixel (replaces hero's right arm / open hand)
    out[i]=pose[i]; out[i+1]=pose[i+1]; out[i+2]=pose[i+2]; out[i+3]=pose[i+3];
    if (pose[i+3]>40 && isSkin(pose[i],pose[i+1],pose[i+2])) { // recolor skin -> glove
      out[i]=glove[0]; out[i+1]=glove[1]; out[i+2]=glove[2];
    }
  }
  const png = await sharp(out,{raw:{width:CW,height:CH,channels:4}}).png().toBuffer();
  await sharp(png).toFile(path.join(dir, `puppet_${file.replace('registered_','').replace('.png','')}.png`));
  return png;
}

(async () => {
  const hero = await load('registered_open.png');
  const glove = sampleGlove(hero);
  console.log('glove fill', glove);
  const files = ['registered_open.png','registered_fist.png','registered_pointing.png','registered_victory.png'];
  const outs = [];
  for (const f of files) outs.push(await build(f, hero, glove));
  const cells = await Promise.all(outs.map(async b =>
    sharp({create:{width:CW/2,height:CH/2,channels:4,background:'#050505'}})
      .composite([{ input: await sharp(b).resize(CW/2,CH/2).toBuffer(), left:0, top:0 }]).png().toBuffer()));
  await sharp({create:{width:CW+8,height:CH+8,channels:4,background:'#141414'}})
    .composite([
      {input:cells[0],left:2,top:2},{input:cells[1],left:CW/2+6,top:2},
      {input:cells[2],left:2,top:CH/2+6},{input:cells[3],left:CW/2+6,top:CH/2+6},
    ]).png().toFile(path.join(dir,'puppet_montage.png'));
  console.log('puppet montage done');
})();
