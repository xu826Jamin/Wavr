// Grid overlay on base_body.png to read the bicep region + shoulder seam for the articulated recut.
const sharp = require('sharp');
const path = require('path');
const W = 1024, H = 768;
let g = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
for (let x = 0; x <= W; x += 32) {
  g += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="rgba(255,80,80,${x%128?0.18:0.55})" stroke-width="1"/>`;
  if (x % 128 === 0) g += `<text x="${x+2}" y="14" font-family="monospace" font-size="13" fill="#ff5050">${x}</text>`;
}
for (let y = 0; y <= H; y += 32) {
  g += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(80,160,255,${y%128?0.18:0.55})" stroke-width="1"/>`;
  if (y % 128 === 0) g += `<text x="2" y="${y+14}" font-family="monospace" font-size="13" fill="#4aa0ff">${y}</text>`;
}
// mark known rig anchors: shoulder S, elbow AP, wrist
const pts = [[772,528,'#ffd000','S'],[844,502,'#00e0ff','AP'],[825,392,'#ff00d0','W']];
for (const [x,y,c,l] of pts) { g += `<circle cx="${x}" cy="${y}" r="6" fill="${c}"/><text x="${x+8}" y="${y+4}" font-family="monospace" font-size="15" fill="${c}">${l}</text>`; }
g += `</svg>`;
(async () => {
  await sharp(path.join(__dirname, 'v2', 'base_body.png'))
    .flatten({ background: '#0b0b0b' })
    .composite([{ input: Buffer.from(g), top: 0, left: 0 }])
    .png().toFile(path.join(__dirname, 'v2', 'grid_body.png'));
  console.log('grid_body.png written');
})();
