// Spike Q-C: prove clean transparent cutout of a flat-bg z_image sticker — no credits.
// Edge flood-fill: from the image border, lift any "light" pixel (grey bg + white sticker
// halo) until we hit the character's dark outline. Interior light areas (eye highlights,
// skin) are protected because the flood can't cross the black outline to reach them.
const sharp = require('sharp');
const path = require('path');

const THRESH = 45; // flood a pixel if it's within this RGB distance of the sampled bg grey
                   // (keeps the white sticker border, dist ~78, and skin, dist ~60)

async function cut(inFile, outFile) {
  const { data, info } = await sharp(inFile)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const idx = (x, y) => (y * W + x) * 4;
  // Sample bg grey from the four corners
  const corners = [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]];
  let br = 0, bgc = 0, bb = 0;
  for (const [x, y] of corners) { const i = idx(x, y); br += data[i]; bgc += data[i + 1]; bb += data[i + 2]; }
  br /= 4; bgc /= 4; bb /= 4;
  const isLight = i => {
    const dr = data[i] - br, dg = data[i + 1] - bgc, db = data[i + 2] - bb;
    return dr * dr + dg * dg + db * db < THRESH * THRESH;
  };

  const seen = new Uint8Array(W * H);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const p = y * W + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isLight(idx(x, y))) stack.push(x, y);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }

  let cleared = 0;
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    data[idx(x, y) + 3] = 0; // transparent
    cleared++;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }

  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(outFile);
  const pct = ((cleared / (W * H)) * 100).toFixed(1);
  console.log(`${path.basename(outFile)}: cleared ${pct}% of pixels -> ${W}x${H}`);
}

(async () => {
  const dir = path.join(__dirname, 'spike');
  await cut(path.join(dir, 'A_openpalm_z.png'), path.join(dir, 'A_openpalm_cutout.png'));
  await cut(path.join(dir, 'B_fist_z.png'), path.join(dir, 'B_fist_cutout.png'));
})();
