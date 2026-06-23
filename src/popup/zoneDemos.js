// Concept visualizers (Phase 3) — avatar-driven, 0 Higgsfield credits, pure canvas/SVG.
//
//  • Neutral zone: the avatar's open palm rests inside a green dashed circle ("rest here between
//    gestures"); on a loop it drifts out (gesture fires, motion lines) and returns to re-arm.
//  • Cursor zone: an active-region rectangle; the open palm moves a cursor dot around (amplified,
//    mirroring the real zone→screen mapping), then a fist fires a click (ripple) on small targets.
//
// Both reuse the shared `Avatar` renderer via its onFrame/onAfterDraw hooks, so the overlays track
// the hand and everything pauses off-screen for free. Respects prefers-reduced-motion (holds a
// single representative frame instead of animating).

import { Avatar, HAND_REST } from './avatar.js';

const GREEN = '74,222,128';
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const easeInOut = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
const lerp = (a, b, u) => a + (b - a) * u;

// Set caption text only when it changes (avoids per-frame layout work).
function caption(el, text) { if (el && el._t !== text) { el._t = text; el.textContent = text; } }

// ── Neutral zone ───────────────────────────────────────────────────────────────
// circle radius as a fraction of canvas width; drift magnitudes (asset px) per direction.
const NZ_R = 0.155;
const NZ_DIRS = [
  { v: [0, -1], mag: 110, name: 'up' },
  { v: [1, 0],  mag: 132, name: 'right' },
  { v: [0, 1],  mag: 120, name: 'down' },
  { v: [-1, 0], mag: 132, name: 'left' },
];
const NZ_REST = 1500, NZ_OUT = 480, NZ_HOLD = 220, NZ_BACK = 640;
const NZ_CYCLE = NZ_REST + NZ_OUT + NZ_HOLD + NZ_BACK;

function makeNeutralDemo(canvas, capEl) {
  const state = { ox: 0, oy: 0, p: 0, dir: NZ_DIRS[0] };

  const onFrame = (now, av) => {
    av.pose = 'open';
    if (reduce()) { state.p = 0; state.ox = state.oy = 0; av.setArm(0, 0); caption(capEl, 'Rest your hand in the circle between gestures'); return; }

    const e = now % (NZ_CYCLE * NZ_DIRS.length);
    const idx = Math.floor(e / NZ_CYCLE) % NZ_DIRS.length;
    const dir = NZ_DIRS[idx];
    const te = e % NZ_CYCLE;
    let p, cap;
    if (te < NZ_REST)                       { p = 0;                                          cap = 'Rest here between gestures'; }
    else if (te < NZ_REST + NZ_OUT)         { p = easeInOut((te - NZ_REST) / NZ_OUT);         cap = 'Hand leaves the zone → gesture fires'; }
    else if (te < NZ_REST + NZ_OUT + NZ_HOLD){ p = 1;                                         cap = 'Hand leaves the zone → gesture fires'; }
    else                                    { p = 1 - easeInOut((te - NZ_REST - NZ_OUT - NZ_HOLD) / NZ_BACK); cap = 'Return to neutral to re-arm'; }

    state.dir = dir; state.p = p;
    state.ox = dir.v[0] * dir.mag * p;
    state.oy = dir.v[1] * dir.mag * p;
    av.setArm(state.ox, state.oy);
    caption(capEl, cap);
  };

  const onAfterDraw = (ctx, m) => {
    const cx = HAND_REST.x * m.cssW, cy = HAND_REST.y * m.cssH;
    const r = NZ_R * m.cssW;
    const p = state.p, fired = p > 0.55;

    // faint fill — strongest while resting, fades as the hand leaves
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${GREEN},${(0.10 * (1 - p)).toFixed(3)})`;
    ctx.fill();
    ctx.restore();

    // dashed ring — rotating dashes; brightens + thickens at the moment of firing
    ctx.save();
    const pulse = 0.55 + 0.25 * Math.sin(m.now / 600);
    const alpha = fired ? 0.95 : pulse;
    ctx.strokeStyle = `rgba(${GREEN},${alpha.toFixed(3)})`;
    ctx.lineWidth = (fired ? 3.2 : 2) * Math.max(m.s * 1, 1);
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -(m.now / 35) % 1000;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // motion lines streaking in the drift direction once the hand breaks out
    if (p > 0.12) {
      const [vx, vy] = state.dir.v, a = Math.min(1, p) * 0.7;
      const len = Math.min(m.cssW, m.cssH) * 0.14;
      const bx = cx + vx * r * 1.15, by = cy + vy * r * 1.15;
      ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(${GREEN},${a.toFixed(3)})`;
      const px = -vy, py = vx;
      for (let i = -1; i <= 1; i++) {
        const sx = bx + px * i * len * 0.5, sy = by + py * i * len * 0.5;
        ctx.lineWidth = (i === 0 ? 4 : 2.5);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx * len, sy + vy * len); ctx.stroke();
      }
      ctx.restore();
    }
  };

  return { onFrame, onAfterDraw };
}

// ── Cursor zone ──────────────────────────────────────────────────────────────
// active-region rectangle (canvas fractions) and cursor targets (dot screen-fractions).
const CZ_RECT = { x: 0.45, y: 0.13, w: 0.50, h: 0.52 };
const CZ_REST_DOT = { x: 0.78, y: 0.34 };
const CZ_TARGETS = [{ x: 0.56, y: 0.23 }, { x: 0.90, y: 0.30 }, { x: 0.69, y: 0.56 }];
const CZ_GAIN = 2.2;             // small wrist move → larger cursor move (mirrors zone→screen)
const CZ_MOVE = 720, CZ_SETTLE = 240, CZ_CLICK = 440, CZ_AFTER = 300;
const CZ_PER = CZ_MOVE + CZ_SETTLE + CZ_CLICK + CZ_AFTER;
// hand offset (asset px) that lands the amplified cursor dot on a given screen-fraction point
const offsetFor = d => ({ ox: (d.x - CZ_REST_DOT.x) * 1024 / CZ_GAIN, oy: (d.y - CZ_REST_DOT.y) * 768 / CZ_GAIN });

function makeCursorDemo(canvas, capEl) {
  const state = { dot: { ...CZ_REST_DOT }, clickP: 0, active: -1, fist: false };

  const onFrame = (now, av) => {
    if (reduce()) {
      state.dot = { ...CZ_REST_DOT }; state.clickP = 0; state.active = -1; state.fist = false;
      av.pose = 'open'; av.setArm(0, 0);
      caption(capEl, 'Open palm moves the cursor · close fist to click');
      return;
    }
    const N = CZ_TARGETS.length;
    const seg = Math.floor(now / CZ_PER) % N;
    const from = seg === 0 ? CZ_REST_DOT : CZ_TARGETS[seg - 1];
    const to = CZ_TARGETS[seg];
    const te = now % CZ_PER;

    let dot, fist = false, clickP = 0, cap;
    if (te < CZ_MOVE) {
      const u = easeInOut(te / CZ_MOVE);
      dot = { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) };
      cap = 'Open palm → move cursor';
    } else if (te < CZ_MOVE + CZ_SETTLE) {
      dot = to; cap = 'Open palm → move cursor';
    } else if (te < CZ_MOVE + CZ_SETTLE + CZ_CLICK) {
      dot = to; fist = true; clickP = (te - CZ_MOVE - CZ_SETTLE) / CZ_CLICK; cap = 'Close fist → click';
    } else {
      dot = to; cap = 'Open palm → move cursor';
    }

    state.dot = dot; state.fist = fist; state.clickP = clickP; state.active = fist ? seg : -1;
    av.pose = fist ? 'closed' : 'open';
    const off = offsetFor(dot);
    av.setArm(off.ox, off.oy);
    caption(capEl, cap);
  };

  const onAfterDraw = (ctx, m) => {
    const W = m.cssW, H = m.cssH;
    const rx = CZ_RECT.x * W, ry = CZ_RECT.y * H, rw = CZ_RECT.w * W, rh = CZ_RECT.h * H;

    // active-region rectangle
    ctx.save();
    ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 12);
    ctx.fillStyle = `rgba(${GREEN},0.05)`; ctx.fill();
    ctx.strokeStyle = `rgba(${GREEN},0.5)`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
    ctx.lineDashOffset = -(m.now / 50) % 1000; ctx.stroke();
    ctx.restore();

    // target buttons
    CZ_TARGETS.forEach((t, i) => {
      const tx = t.x * W, ty = t.y * H, hit = state.active === i;
      const rad = 11;
      ctx.save();
      ctx.beginPath(); ctx.roundRect(tx - rad, ty - rad, rad * 2, rad * 2, 6);
      ctx.fillStyle = hit ? `rgba(${GREEN},0.85)` : `rgba(${GREEN},0.10)`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${GREEN},${hit ? 1 : 0.5})`; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    });

    // click ripple
    if (state.fist && state.clickP > 0) {
      const dx = state.dot.x * W, dy = state.dot.y * H;
      const rr = lerp(6, 30, state.clickP);
      ctx.save();
      ctx.beginPath(); ctx.arc(dx, dy, rr, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${GREEN},${(0.8 * (1 - state.clickP)).toFixed(3)})`;
      ctx.lineWidth = 2.5; ctx.stroke();
      ctx.restore();
    }

    // cursor dot
    const dx = state.dot.x * W, dy = state.dot.y * H;
    ctx.save();
    ctx.beginPath(); ctx.arc(dx, dy, 7, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${GREEN},0.95)`; ctx.fill();
    ctx.beginPath(); ctx.arc(dx, dy, 12, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(${GREEN},0.45)`; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  };

  return { onFrame, onAfterDraw };
}

// ── wiring ───────────────────────────────────────────────────────────────────
function build(canvasId, capId, factory) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const capEl = capId ? document.getElementById(capId) : null;
  const hooks = factory(canvas, capEl);
  return new Avatar(canvas, { idle: true, onFrame: hooks.onFrame, onAfterDraw: hooks.onAfterDraw });
}

export function initZoneDemos() {
  build('neutralDemoCanvas', 'neutralDemoCaption', makeNeutralDemo);
  build('cursorDemoCanvas', 'cursorDemoCaption', makeCursorDemo);
}
