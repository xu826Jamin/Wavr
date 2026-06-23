// Find the wrist (cuff) in each arm sprite = the narrow waist between the hand (above) and the
// forearm (below). Print per-row opaque width so I can pick a wrist-cut Y + center per pose.
const sharp = require('sharp');
const path = require('path');
const W = 1024, H = 768;
(async () => {
  for (const pose of ['open','fist','pointing','victory']) {
    const { data } = await sharp(path.join(__dirname,'v2',`arm_${pose}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const op = (x,y) => data[(y*W+x)*4+3] > 40;
    console.log(`\n== ${pose} ==`);
    for (let y = 120; y <= 520; y += 16) {
      let min=1e9,max=-1,n=0;
      for (let x=0;x<W;x++) if (op(x,y)) { if(x<min)min=x; if(x>max)max=x; n++; }
      if (n>0) console.log(`y=${String(y).padStart(3)}  x[${min}-${max}]  w=${max-min}  cx=${Math.round((min+max)/2)}`);
    }
  }
})();
