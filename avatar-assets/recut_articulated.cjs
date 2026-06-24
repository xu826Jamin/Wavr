// Articulated recut: split base_body.png into (a) a body with the bicep removed and (b) a movable
// upper-arm sprite (shoulder->elbow), so the arm can ROTATE at the shoulder instead of the forearm
// sliding. The bicep is baked into base_body.png (arm_open.png is only forearm+hand), so we cut it
// out here. Seams are covered at render time by procedural deltoid/elbow caps; this script also
// renders a preview montage (body-only | upperarm-only | recomposed rest | recomposed rotated) so
// the seam coverage can be eyeballed before wiring avatar.js.
//
// Run: node avatar-assets/recut_articulated.cjs        (writes previews into v2/)
//      node avatar-assets/recut_articulated.cjs --emit (also exports webp to src/assets/avatar/)
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const dir = path.join(__dirname, 'v2');
const outDir = path.resolve(__dirname, '..', 'src', 'assets', 'avatar');
const W = 1024, H = 768;
const EMIT = process.argv.includes('--emit');

const S = [772, 528], AP = [844, 502];                 // shoulder socket + elbow (asset px)
const adx = AP[0] - S[0], ady = AP[1] - S[1];
const L1 = Math.hypot(adx, ady);                        // upper-arm length
const d = [adx / L1, ady / L1];                         // unit shoulder->elbow axis
const CUT_BACK = 26;                                    // move the cut line this far behind S (overlap)
const C = [S[0] - CUT_BACK * d[0], S[1] - CUT_BACK * d[1]];
// signed distance of a pixel along the arm axis past the cut line; >0 => belongs to the upper arm
const proj = (x, y) => (x - C[0]) * d[0] + (y - C[1]) * d[1];

const raw = async f => sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const toPng = buf => sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

(async () => {
  const { data } = await raw('base_body.png');
  // ---- probe: alpha bbox + a few suit-color samples ----
  let minx = 1e9, miny = 1e9, maxx = -1, maxy = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * 4 + 3] > 40) { n++; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  }
  const sample = (x, y) => { const i = (y * W + x) * 4; return hex(data[i], data[i + 1], data[i + 2]) + (data[i + 3] < 250 ? ` a=${data[i + 3]}` : ''); };
  console.log(`alpha bbox x[${minx}..${maxx}] y[${miny}..${maxy}] px=${n}`);
  console.log('fill samples bicep:', sample(800, 515), sample(820, 535), sample(860, 520), '| torso:', sample(560, 560));

  // ---- split: upper-arm = past the cut line (proj>0) AND below the head (y>=ARM_Y) AND solid
  // (drops the faint ghost-arm artifact). The cut line is perpendicular to the shoulder->elbow axis;
  // the y-floor keeps the line from also slicing the top-right of the hood. ----
  const ARM_Y = 442, SOLID = 200;
  const body = Buffer.from(data);          // bicep erased
  const arm = Buffer.from(data);           // only the bicep
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const isArm = proj(x, y) > 0 && y >= ARM_Y && data[i + 3] >= SOLID;
    if (isArm) body[i + 3] = 0; else arm[i + 3] = 0;
  }
  // kill the faint ghost-arm artifact (faint pixels in the upper-right box) from BOTH layers
  for (let y = 0; y < 560; y++) for (let x = 600; x < W; x++) {
    const i = (y * W + x) * 4; if (data[i + 3] < 230) { body[i + 3] = 0; arm[i + 3] = 0; }
  }

  const bodyPng = await toPng(body);
  const armPng = await toPng(arm);
  await sharp(bodyPng).png().toFile(path.join(dir, 'body_cut.png'));
  await sharp(armPng).png().toFile(path.join(dir, 'upperarm_cut.png'));

  // ---- procedural caps (suit fill + outline) used to hide joint seams ----
  const FILL = '#454b54', LINE = '#2a2f37', LW = 5;
  const cap = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${FILL}" stroke="${LINE}" stroke-width="${LW}"/>`;
  const deltoid = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${cap(S[0], S[1], 52)}</svg>`);
  const elbow = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${cap(AP[0], AP[1], 40)}</svg>`);

  const fore = await sharp(path.join(dir, 'forearm_base.png')).png().toBuffer();
  const hand = await sharp(path.join(dir, 'hand_open.png')).png().toBuffer();

  // rest recompose: body + deltoid cap + upperarm + elbow cap + forearm + hand (no rotation here;
  // rotation/seam coverage is validated in-browser with the real avatar.js).
  const layered = (withCaps) => {
    const layers = [{ input: bodyPng, left: 0, top: 0 }];
    if (withCaps) layers.push({ input: deltoid, left: 0, top: 0 });
    layers.push({ input: armPng, left: 0, top: 0 });
    if (withCaps) layers.push({ input: elbow, left: 0, top: 0 });
    layers.push({ input: fore, left: 0, top: 0 }, { input: hand, left: 0, top: 0 });
    return sharp({ create: { width: W, height: H, channels: 4, background: '#0b0b0b' } }).composite(layers).png().toBuffer();
  };
  const restNoCap = await layered(false);
  const restCap = await layered(true);
  // montage: body-only | upperarm-only | rest (no caps) | rest (with joint caps)
  const half = async (b) => sharp(b).resize(W / 2, H / 2).toBuffer();
  const cells = await Promise.all([
    half(await sharp(bodyPng).flatten({ background: '#1f7a3a' }).png().toBuffer()),   // body on green: any bicep remnant shows
    half(await sharp(armPng).flatten({ background: '#a01080' }).png().toBuffer()),     // upperarm on magenta: full shape shows
    half(restNoCap), half(restCap),
  ]);
  await sharp({ create: { width: W + 8, height: H + 8, channels: 4, background: '#141414' } })
    .composite([
      { input: cells[0], left: 2, top: 2 }, { input: cells[1], left: W / 2 + 6, top: 2 },
      { input: cells[2], left: 2, top: H / 2 + 6 }, { input: cells[3], left: W / 2 + 6, top: H / 2 + 6 },
    ]).png().toFile(path.join(dir, 'recut_preview.png'));
  console.log('recut_preview.png written (TL body | TR upperarm | BL rest no-cap | BR rest with caps)');

  if (EMIT) {
    await sharp(bodyPng).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outDir, 'base_body.webp'));
    await sharp(armPng).webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(outDir, 'upperarm.webp'));
    console.log('emitted base_body.webp + upperarm.webp ->', outDir);
  }
})();
