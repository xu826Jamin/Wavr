// Print opaque x-runs per row for registered_open so I can see where the head, torso and arm
// are, and design an accurate body/arm cut. Each run = [startX, endX].
const sharp = require('sharp');
const path = require('path');
const W = 1024, H = 768;
(async () => {
  const { data } = await sharp(path.join(__dirname,'v2','registered_open.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const op = (x,y) => data[(y*W+x)*4+3] > 40;
  for (let y = 80; y <= 660; y += 24) {
    const runs = [];
    let s = -1;
    for (let x = 0; x < W; x++) {
      if (op(x,y)) { if (s<0) s=x; }
      else if (s>=0) { if (x-s > 6) runs.push([s, x-1]); s=-1; }
    }
    if (s>=0) runs.push([s, W-1]);
    console.log(`y=${String(y).padStart(3)}  ` + runs.map(r=>`[${r[0]}-${r[1]}]`).join(' '));
  }
})();
