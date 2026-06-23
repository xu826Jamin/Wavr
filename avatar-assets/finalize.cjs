// Phase 3 finalize: export the 4 locked puppet stills as optimized WebP into the extension's
// bundled asset folder (src/assets/avatar -> dist/assets/avatar via vite copyAssets).
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const src = path.join(__dirname, 'v2');
const out = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');
fs.mkdirSync(out, { recursive: true });

const map = { open: 'puppet_open.png', fist: 'puppet_fist.png', pointing: 'puppet_pointing.png', victory: 'puppet_victory.png' };

(async () => {
  for (const [name, file] of Object.entries(map)) {
    const dst = path.join(out, `${name}.webp`);
    await sharp(path.join(src, file)).webp({ quality: 92, alphaQuality: 100 }).toFile(dst);
    const kb = Math.round(fs.statSync(dst).size / 1024);
    console.log(`${name}.webp  ${kb} KB`);
  }
})();
