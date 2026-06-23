// Render a faithful mock of the .mascot-frame (dark bg, green border, ● DEMO badge, scanlines)
// with the avatar inside, so we can preview the integrated look without launching Chrome.
const sharp = require('sharp');
const path = require('path');

const W = 760, H = 570; // 4:3 @ ~2x of the ~390x293 render size
const av = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');

const bgSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="${W-2}" height="${H-2}" rx="18" fill="#050505"
        stroke="rgba(74,222,128,0.30)" stroke-width="2"/>
</svg>`;

function overlaySvg(label) {
  let lines = '';
  for (let y = 0; y < H; y += 4) lines += `<rect x="0" y="${y}" width="${W}" height="1.5" fill="rgba(0,0,0,0.06)"/>`;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${lines}
    <g>
      <rect x="18" y="16" rx="11" width="92" height="26" fill="rgba(0,0,0,0.7)" stroke="rgba(74,222,128,0.25)"/>
      <circle cx="34" cy="29" r="4" fill="#4ade80"/>
      <text x="46" y="33" font-family="SF Mono, Consolas, monospace" font-size="13"
            letter-spacing="1.5" fill="#4ade80">${label}</text>
    </g>
  </svg>`;
}

(async () => {
  const poses = ['open', 'fist', 'pointing', 'victory'];
  const framed = [];
  for (const p of poses) {
    const avatar = await sharp(path.join(av, `${p}.webp`))
      .resize({ width: Math.round(W * 0.92), height: Math.round(H * 0.92), fit: 'inside' }).toBuffer();
    const buf = await sharp(Buffer.from(bgSvg))
      .composite([
        { input: avatar, gravity: 'south' },
        { input: Buffer.from(overlaySvg('DEMO')), top: 0, left: 0 },
      ]).png().toBuffer();
    framed.push(buf);
  }
  // single hero frame
  await sharp(framed[0]).toFile(path.join(__dirname, 'v2', 'frame_demo_open.png'));
  // 2x2 of all four framed
  const cells = await Promise.all(framed.map(b => sharp(b).resize(Math.round(W/2), Math.round(H/2)).toBuffer()));
  const cw = Math.round(W/2), ch = Math.round(H/2);
  await sharp({ create: { width: cw*2+24, height: ch*2+24, channels: 4, background: '#0b0b0b' } })
    .composite([
      { input: cells[0], left: 8, top: 8 }, { input: cells[1], left: cw+16, top: 8 },
      { input: cells[2], left: 8, top: ch+16 }, { input: cells[3], left: cw+16, top: ch+16 },
    ]).png().toFile(path.join(__dirname, 'v2', 'frame_demo_all.png'));
  console.log('frame mocks written');
})();
