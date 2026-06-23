// Export the consistent-forearm rig to the bundled avatar folder; remove the old per-pose arms.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const src = path.join(__dirname, 'v2');
const out = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');

const files = {
  base_body: 'base_body.png', forearm: 'forearm_base.png',
  hand_open: 'hand_open.png', hand_fist: 'hand_fist.png',
  hand_pointing: 'hand_pointing.png', hand_victory: 'hand_victory.png',
};
(async () => {
  for (const [name, file] of Object.entries(files)) {
    const dst = path.join(out, `${name}.webp`);
    await sharp(path.join(src, file)).webp({ quality: 92, alphaQuality: 100 }).toFile(dst);
    console.log(`${name}.webp  ${Math.round(fs.statSync(dst).size/1024)} KB`);
  }
  for (const old of ['arm_open.webp','arm_fist.webp','arm_pointing.webp','arm_victory.webp']) {
    const f = path.join(out, old); if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed', old); }
  }
})();
