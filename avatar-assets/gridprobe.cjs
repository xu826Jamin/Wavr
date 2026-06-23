// Overlay a coordinate grid on the registered hero so I can read shoulder/arm/head positions
// for the rig (base body cut line, shoulder anchor, arm-sprite region).
const sharp = require('sharp');
const path = require('path');
const W = 1024, H = 768;
let g = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for (let x = 0; x <= W; x += 64) {
  g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,80,80,${x%128?0.25:0.55})" stroke-width="1"/>`;
  if (x % 128 === 0) g += `<text x="${x+2}" y="14" font-family="monospace" font-size="13" fill="#ff5050">${x}</text>`;
}
for (let y = 0; y <= H; y += 64) {
  g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(80,160,255,${y%128?0.25:0.55})" stroke-width="1"/>`;
  if (y % 128 === 0) g += `<text x="2" y="${y+14}" font-family="monospace" font-size="13" fill="#4aa0ff">${y}</text>`;
}
g += `</svg>`;
(async () => {
  await sharp(path.join(__dirname, 'v2', 'registered_open.png'))
    .flatten({ background: '#0b0b0b' })
    .composite([{ input: Buffer.from(g), top: 0, left: 0 }])
    .png().toFile(path.join(__dirname, 'v2', 'grid_open.png'));
  console.log('grid_open.png written');
})();
