// Visualize the arm/body split: tint arm-region pixels red, body-region blue, over base_body, with
// the cut line + S/AP/wrist markers. Lets me see whether the cut captures the real bicep mass.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');
const W = 1024, H = 768;
const S = [772, 528], AP = [844, 502], WR = [825, 392];
const adx = AP[0] - S[0], ady = AP[1] - S[1];
const L1 = Math.hypot(adx, ady);
const d = [adx / L1, ady / L1];
const CUT_BACK = 26;
const C = [S[0] - CUT_BACK * d[0], S[1] - CUT_BACK * d[1]];
const proj = (x, y) => (x - C[0]) * d[0] + (y - C[1]) * d[1];

(async () => {
  const { data } = await sharp(path.join(dir, 'base_body.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (out[i + 3] < 40) continue;
    const isArm = proj(x, y) > 0 && y >= 442 && data[i + 3] >= 200;
    if (isArm) { out[i] = Math.min(255, out[i] + 90); out[i + 1] = Math.max(0, out[i + 1] - 40); out[i + 2] = Math.max(0, out[i + 2] - 40); }
    else { out[i + 2] = Math.min(255, out[i + 2] + 80); }
  }
  // perpendicular cut line through C
  const perp = [-d[1], d[0]];
  const x1 = C[0] + perp[0] * 400, y1 = C[1] + perp[1] * 400, x2 = C[0] - perp[0] * 400, y2 = C[1] - perp[1] * 400;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ffff00" stroke-width="3"/>
    <line x1="${S[0]}" y1="${S[1]}" x2="${AP[0]}" y2="${AP[1]}" stroke="#00ffff" stroke-width="2"/>
    <circle cx="${S[0]}" cy="${S[1]}" r="7" fill="#ffd000"/><text x="${S[0]+9}" y="${S[1]+5}" font-family="monospace" font-size="18" fill="#ffd000">S</text>
    <circle cx="${AP[0]}" cy="${AP[1]}" r="7" fill="#00e0ff"/><text x="${AP[0]+9}" y="${AP[1]+5}" font-family="monospace" font-size="18" fill="#00e0ff">AP</text>
    <circle cx="${WR[0]}" cy="${WR[1]}" r="7" fill="#ff00d0"/><text x="${WR[0]+9}" y="${WR[1]+5}" font-family="monospace" font-size="18" fill="#ff00d0">W</text>
  </svg>`;
  await sharp(Buffer.from(out), { raw: { width: W, height: H, channels: 4 } })
    .flatten({ background: '#0b0b0b' }).composite([{ input: Buffer.from(svg), left: 0, top: 0 }])
    .png().toFile(path.join(dir, 'cut_viz.png'));
  console.log('cut_viz.png (red=arm region, blue=body region, yellow=cut line)');
})();
