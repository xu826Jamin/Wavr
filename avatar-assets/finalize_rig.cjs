// Export rig assets (static body + 4 translatable arm sprites) to the bundled avatar folder,
// and remove the old full-puppet webps that the rig replaces.
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, 'v2');
const out = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');
fs.mkdirSync(out, { recursive: true });

const files = {
  'base_body':    'base_body.png',
  'arm_open':     'arm_open.png',
  'arm_fist':     'arm_fist.png',
  'arm_pointing': 'arm_pointing.png',
  'arm_victory':  'arm_victory.png',
};

(async () => {
  for (const [name, file] of Object.entries(files)) {
    const dst = path.join(out, `${name}.webp`);
    await sharp(path.join(src, file)).webp({ quality: 92, alphaQuality: 100 }).toFile(dst);
    console.log(`${name}.webp  ${Math.round(fs.statSync(dst).size/1024)} KB`);
  }
  // remove superseded full-puppet stills
  for (const old of ['open.webp','fist.webp','pointing.webp','victory.webp']) {
    const f = path.join(out, old); if (fs.existsSync(f)) { fs.unlinkSync(f); console.log('removed', old); }
  }
})();
