// Faithful verification of the Phase-4 dos/don'ts scenes: reproduces avatar.js's exact drawImage
// layering AND the new whole-avatar transform, plus dosDonts.js's per-scene overlays, into a montage.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const AW = 1024, AH = 768;
const S = [772, 528], AP = [844, 502], CAP_FILL = 82;
const HAND_REST = { x: 800 / AW, y: 290 / AH };
const GREEN = '74,222,128', RED = '248,113,113';

const dir = path.join(__dirname, '..', 'src', 'assets', 'avatar');
const load = f => loadImage(path.join(dir, f));

// mirrors Avatar._frame: optional transform, then base + (capsule) + translated forearm + hand
function drawAvatar(ctx, imgs, W, H, pose, ox, oy, xf) {
  const s = W / AW;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#080808'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (xf) {
    const oxp = (xf.originX ?? 0.5) * W, oyp = (xf.originY ?? 0.5) * H;
    ctx.translate(oxp + (xf.dx || 0) * W, oyp + (xf.dy || 0) * H);
    if (xf.rot) ctx.rotate(xf.rot);
    const sc = xf.scale ?? 1; ctx.scale(sc, sc);
    ctx.translate(-oxp, -oyp);
  }
  ctx.drawImage(imgs.base, 0, 0, W, H);
  const moving = Math.abs(ox) + Math.abs(oy) > 1.2;
  if (moving) {
    ctx.save();
    ctx.lineCap = 'round'; ctx.strokeStyle = '#41474f'; ctx.lineWidth = CAP_FILL * s;
    ctx.beginPath(); ctx.moveTo(S[0] * s, S[1] * s); ctx.lineTo((AP[0] + ox) * s, (AP[1] + oy) * s); ctx.stroke();
    ctx.restore();
  }
  ctx.drawImage(imgs.fore, ox * s, oy * s, W, H);
  ctx.drawImage(imgs['hand_' + pose], ox * s, oy * s, W, H);
  ctx.restore();
}

function neutralRing(ctx, W, H, now, colorRGB, alpha) {
  const cx = HAND_REST.x * W, cy = HAND_REST.y * H, r = 0.155 * W, s = W / AW;
  ctx.save();
  ctx.strokeStyle = `rgba(${colorRGB},${alpha.toFixed(3)})`;
  ctx.lineWidth = 2 * Math.max(s, 1);
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -(now / 35) % 1000;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
function resetBadArrow(ctx, W, H) {
  const cx = HAND_REST.x * W, cy = HAND_REST.y * H, top = cy - 0.155 * W;
  ctx.save();
  ctx.strokeStyle = `rgba(${RED},0.8)`; ctx.lineWidth = 2.5; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx, top - 4); ctx.lineTo(cx, top - 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 5, top - 9); ctx.lineTo(cx, top - 4); ctx.lineTo(cx + 5, top - 9); ctx.stroke();
  ctx.restore();
}
function lightingGood(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.32, 0, W * 0.5, H * 0.32, W * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
}
function lightingBad(ctx, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,10,0.6)'; ctx.fillRect(0, 0, W, H);
  const bl = ctx.createRadialGradient(W * 0.5, H * 0.12, 0, W * 0.5, H * 0.12, W * 0.55);
  bl.addColorStop(0, 'rgba(255,250,235,0.42)'); bl.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = bl; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.2, W * 0.5, H * 0.5, W * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

(async () => {
  const imgs = {
    base: await load('base_body.webp'), fore: await load('forearm.webp'),
    hand_open: await load('hand_open.webp'), hand_closed: await load('hand_fist.webp'),
  };
  const W = 280, H = 210, dpr = 2;

  const frames = [
    ['Distance ✓ arm\'s length', c => drawAvatar(c, imgs, W, H, 'open', 0, 0, null)],
    ['Distance ✗ too close',     c => drawAvatar(c, imgs, W, H, 'open', 0, 0, { scale: 1.9, originX: 0.6, originY: 0.42 })],
    ['Framing ✓ in frame',       c => drawAvatar(c, imgs, W, H, 'open', 0, 0, null)],
    ['Framing ✗ clipped',        c => drawAvatar(c, imgs, W, H, 'open', 0, 0, { dx: 0.42, dy: 0.06 })],
    ['Reset ✓ out (returns)',    c => { drawAvatar(c, imgs, W, H, 'open', 0, -118, null); neutralRing(c, W, H, 0, GREEN, 0.6); }],
    ['Reset ✓ home',             c => { drawAvatar(c, imgs, W, H, 'open', 0, 0, null); neutralRing(c, W, H, 0, GREEN, 0.95); }],
    ['Reset ✗ stuck out',        c => { drawAvatar(c, imgs, W, H, 'open', 0, -118, null); neutralRing(c, W, H, 0, RED, 0.7); resetBadArrow(c, W, H); }],
    ['Lighting ✓ even',          c => { drawAvatar(c, imgs, W, H, 'open', 0, 0, null); lightingGood(c, W, H); }],
    ['Lighting ✗ backlit',       c => { drawAvatar(c, imgs, W, H, 'open', 0, 0, null); lightingBad(c, W, H); }],
  ];

  const cols = 3, rows = Math.ceil(frames.length / cols), gap = 8, labelH = 18;
  const tileW = W, tileH = H + labelH;
  const out = createCanvas((cols * tileW + (cols + 1) * gap) * dpr, (rows * tileH + (rows + 1) * gap) * dpr);
  const octx = out.getContext('2d'); octx.scale(dpr, dpr);
  octx.fillStyle = '#141414'; octx.fillRect(0, 0, out.width / dpr, out.height / dpr);

  for (let i = 0; i < frames.length; i++) {
    const [label, draw] = frames[i];
    const cx = gap + (i % cols) * (tileW + gap), cy = gap + Math.floor(i / cols) * (tileH + gap);
    const tile = createCanvas(W * dpr, H * dpr);
    const tctx = tile.getContext('2d'); tctx.scale(dpr, dpr);
    draw(tctx);
    octx.drawImage(tile, cx, cy, W, H);
    octx.fillStyle = '#aaa'; octx.font = '12px sans-serif';
    octx.fillText(label, cx + 2, cy + H + 13);
  }

  const file = path.join(__dirname, 'verify_dosdonts.png');
  fs.writeFileSync(file, out.toBuffer('image/png'));
  console.log('wrote', file);
})();
