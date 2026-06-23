// Faithful verification of the Phase-3 zone demos: reproduces avatar.js's exact drawImage layering
// (base + fill capsule + translated forearm + translated hand) and the zoneDemos.js overlays, then
// captures representative frames into a montage so the result can actually be eyeballed.
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

const AW = 1024, AH = 768;
const S = [772, 528], AP = [844, 502], CAP_FILL = 82;
const HAND_REST = { x: 800 / AW, y: 290 / AH };
const GREEN = '74,222,128';
const lerp = (a, b, u) => a + (b - a) * u;

const dir = path.join(__dirname, '..', 'src', 'assets', 'avatar');
const load = f => loadImage(path.join(dir, f));

function drawAvatar(ctx, imgs, W, H, pose, ox, oy) {
  const s = W / AW;
  ctx.clearRect(0, 0, W, H);
  // subtle card bg (matches .zone-demo)
  ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, W, H);
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
}

function neutralOverlay(ctx, W, H, s, now, p, dirv) {
  const cx = HAND_REST.x * W, cy = HAND_REST.y * H, r = 0.155 * W, fired = p > 0.55;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${GREEN},${(0.10 * (1 - p)).toFixed(3)})`; ctx.fill();
  ctx.restore();
  ctx.save();
  const pulse = 0.55 + 0.25 * Math.sin(now / 600);
  ctx.strokeStyle = `rgba(${GREEN},${(fired ? 0.95 : pulse).toFixed(3)})`;
  ctx.lineWidth = (fired ? 3.2 : 2) * Math.max(s, 1);
  ctx.setLineDash([10, 8]); ctx.lineDashOffset = -(now / 35) % 1000;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
  if (p > 0.12) {
    const [vx, vy] = dirv, a = Math.min(1, p) * 0.7, len = Math.min(W, H) * 0.14;
    const bx = cx + vx * r * 1.15, by = cy + vy * r * 1.15, px = -vy, py = vx;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(${GREEN},${a.toFixed(3)})`;
    for (let i = -1; i <= 1; i++) {
      const sx = bx + px * i * len * 0.5, sy = by + py * i * len * 0.5;
      ctx.lineWidth = i === 0 ? 4 : 2.5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx * len, sy + vy * len); ctx.stroke();
    }
    ctx.restore();
  }
}

const CZ_RECT = { x: 0.45, y: 0.13, w: 0.50, h: 0.52 };
const CZ_TARGETS = [{ x: 0.56, y: 0.23 }, { x: 0.90, y: 0.30 }, { x: 0.69, y: 0.56 }];
function cursorOverlay(ctx, W, H, now, dot, clickP, fist, active) {
  const rx = CZ_RECT.x * W, ry = CZ_RECT.y * H, rw = CZ_RECT.w * W, rh = CZ_RECT.h * H;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 12);
  ctx.fillStyle = `rgba(${GREEN},0.05)`; ctx.fill();
  ctx.strokeStyle = `rgba(${GREEN},0.5)`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -(now / 50) % 1000; ctx.stroke();
  ctx.restore();
  CZ_TARGETS.forEach((t, i) => {
    const tx = t.x * W, ty = t.y * H, hit = active === i, rad = 11;
    ctx.save();
    ctx.beginPath(); ctx.roundRect(tx - rad, ty - rad, rad * 2, rad * 2, 6);
    ctx.fillStyle = hit ? `rgba(${GREEN},0.85)` : `rgba(${GREEN},0.10)`; ctx.fill();
    ctx.strokeStyle = `rgba(${GREEN},${hit ? 1 : 0.5})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  });
  if (fist && clickP > 0) {
    const dx = dot.x * W, dy = dot.y * H, rr = lerp(6, 30, clickP);
    ctx.save(); ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${GREEN},${(0.8 * (1 - clickP)).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
  }
  const dx = dot.x * W, dy = dot.y * H;
  ctx.save();
  ctx.beginPath(); ctx.arc(dx, dy, 7, 0, Math.PI * 2); ctx.fillStyle = `rgba(${GREEN},0.95)`; ctx.fill();
  ctx.beginPath(); ctx.arc(dx, dy, 12, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${GREEN},0.45)`; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

const offsetFor = d => ({ ox: (d.x - 0.78) * 1024 / 2.2, oy: (d.y - 0.34) * 768 / 2.2 });

(async () => {
  const imgs = {
    base: await load('base_body.webp'), fore: await load('forearm.webp'),
    hand_open: await load('hand_open.webp'), hand_closed: await load('hand_fist.webp'),
  };
  const W = 320, H = 240, s = W / AW, dpr = 2;

  const frames = [
    ['Neutral · rest',     c => { drawAvatar(c, imgs, W, H, 'open', 0, 0); neutralOverlay(c, W, H, s, 0, 0, [0, -1]); }],
    ['Neutral · fire up',  c => { const o = { ox: 0, oy: -110 }; drawAvatar(c, imgs, W, H, 'open', o.ox, o.oy); neutralOverlay(c, W, H, s, 0, 1, [0, -1]); }],
    ['Neutral · fire right', c => { const o = { ox: 132, oy: 0 }; drawAvatar(c, imgs, W, H, 'open', o.ox, o.oy); neutralOverlay(c, W, H, s, 0, 1, [1, 0]); }],
    ['Cursor · move T0',   c => { const d = CZ_TARGETS[0], o = offsetFor(d); drawAvatar(c, imgs, W, H, 'open', o.ox, o.oy); cursorOverlay(c, W, H, 0, d, 0, false, -1); }],
    ['Cursor · click T1',  c => { const d = CZ_TARGETS[1], o = offsetFor(d); drawAvatar(c, imgs, W, H, 'closed', o.ox, o.oy); cursorOverlay(c, W, H, 0, d, 0.5, true, 1); }],
    ['Cursor · move T2',   c => { const d = CZ_TARGETS[2], o = offsetFor(d); drawAvatar(c, imgs, W, H, 'open', o.ox, o.oy); cursorOverlay(c, W, H, 0, d, 0, false, -1); }],
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
    octx.fillStyle = '#888'; octx.font = '12px sans-serif';
    octx.fillText(label, cx + 2, cy + H + 13);
  }

  const file = path.join(__dirname, 'verify_zones.png');
  fs.writeFileSync(file, out.toBuffer('image/png'));
  console.log('wrote', file);
})();
