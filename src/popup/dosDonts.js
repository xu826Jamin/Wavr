// Dos & Don'ts (Phase 4) — avatar-driven, 0 Higgsfield credits, pure canvas.
//
// Four paired ✓/✗ mini-scenes, each composed from the SAME shared Avatar rig (no new art):
//   • Distance  — arm's length (scale 1) vs too close (scale up, fills/overflows frame)
//   • Framing   — hand in frame vs clipped at the edge (whole-avatar offset off-canvas)
//   • Reset     — return to neutral (swipe out + back inside the circle) vs holding mid-swipe
//                 (hand frozen outside the circle; ring turns red)
//   • Lighting  — even front light vs backlit / too dark (canvas vignette + backlight overlay)
//
// Reuses Avatar's transform / setArm / onFrame / onAfterDraw hooks, so every scene pauses
// off-screen for free and honours prefers-reduced-motion (holds a representative frame).

import { Avatar, HAND_REST } from './avatar.js';

const GREEN = '74,222,128', RED = '248,113,113';
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const easeInOut = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

// dashed neutral-zone circle centred on the hand-rest point (shared visual language with zoneDemos)
function neutralRing(ctx, m, colorRGB, alpha) {
  const cx = HAND_REST.x * m.cssW, cy = HAND_REST.y * m.cssH, r = 0.155 * m.cssW;
  ctx.save();
  ctx.strokeStyle = `rgba(${colorRGB},${alpha.toFixed(3)})`;
  ctx.lineWidth = 2 * Math.max(m.s, 1);
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -(m.now / 35) % 1000;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// ── scene factories ────────────────────────────────────────────────────────────
// Each returns the opts passed to `new Avatar`. Static scenes just set a transform; animated
// ones use onFrame/onAfterDraw.

const scenes = {
  // Distance ----------------------------------------------------------------
  distanceGood: () => ({ pose: 'open', idle: true }),
  distanceBad: () => ({ pose: 'open', idle: true,
    transform: { scale: 1.9, originX: 0.6, originY: 0.42 } }),   // zoom toward hand → fills/overflows

  // Framing -----------------------------------------------------------------
  framingGood: () => ({ pose: 'open', idle: true }),
  framingBad: () => ({ pose: 'open', idle: true,
    transform: { dx: 0.42, dy: 0.06 } }),                        // shove right → hand leaves frame

  // Reset -------------------------------------------------------------------
  resetGood: () => {
    let p = 0;                                                   // 0 = inside circle, 1 = fully out
    const T = 2400;
    return {
      pose: 'open', idle: false,
      onFrame: (now, av) => {
        av.pose = 'open';
        if (reduce()) { p = 0; av.setArm(0, 0); return; }
        const e = now % T;
        if (e < T * 0.42) p = easeInOut(e / (T * 0.42));         // swipe up, out of the circle
        else if (e < T * 0.55) p = 1;                            // brief hold
        else p = 1 - easeInOut((e - T * 0.55) / (T * 0.45));     // ease back into the circle
        av.setArm(0, -p * 118);
      },
      onAfterDraw: (ctx, m) => {
        const back = p < 0.25;                                   // hand has returned home
        neutralRing(ctx, m, GREEN, back ? 0.95 : 0.45 + 0.2 * Math.sin(m.now / 500));
      },
    };
  },
  resetBad: () => ({
    pose: 'open', idle: false,
    onFrame: (now, av) => { av.pose = 'open'; av.setArm(0, reduce() ? 0 : -118); }, // frozen mid-swipe
    onAfterDraw: (ctx, m) => {
      neutralRing(ctx, m, RED, 0.5 + 0.3 * Math.sin(m.now / 350));  // empty circle pulses red
      // a small "stuck" warning arrow back toward the circle
      const cx = HAND_REST.x * m.cssW, cy = HAND_REST.y * m.cssH;
      ctx.save();
      ctx.strokeStyle = `rgba(${RED},0.8)`; ctx.lineWidth = 2.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(cx, cy - 0.155 * m.cssW - 4); ctx.lineTo(cx, cy - 0.155 * m.cssW - 22);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 5, cy - 0.155 * m.cssW - 9); ctx.lineTo(cx, cy - 0.155 * m.cssW - 4);
      ctx.lineTo(cx + 5, cy - 0.155 * m.cssW - 9); ctx.stroke();
      ctx.restore();
    },
  }),

  // Lighting ----------------------------------------------------------------
  lightingGood: () => ({
    pose: 'open', idle: true,
    onAfterDraw: (ctx, m) => {                                   // soft even front light
      const g = ctx.createRadialGradient(m.cssW * 0.5, m.cssH * 0.32, 0, m.cssW * 0.5, m.cssH * 0.32, m.cssW * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.save(); ctx.fillStyle = g; ctx.fillRect(0, 0, m.cssW, m.cssH); ctx.restore();
    },
  }),
  lightingBad: () => ({
    pose: 'open', idle: true,
    onAfterDraw: (ctx, m) => {                                   // backlit silhouette + dark vignette
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,10,0.6)'; ctx.fillRect(0, 0, m.cssW, m.cssH);          // overall darken
      const bl = ctx.createRadialGradient(m.cssW * 0.5, m.cssH * 0.12, 0, m.cssW * 0.5, m.cssH * 0.12, m.cssW * 0.55);
      bl.addColorStop(0, 'rgba(255,250,235,0.42)'); bl.addColorStop(1, 'rgba(255,250,235,0)'); // bright light behind
      ctx.fillStyle = bl; ctx.fillRect(0, 0, m.cssW, m.cssH);
      const vg = ctx.createRadialGradient(m.cssW * 0.5, m.cssH * 0.5, m.cssH * 0.2, m.cssW * 0.5, m.cssH * 0.5, m.cssW * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');           // edge vignette
      ctx.fillStyle = vg; ctx.fillRect(0, 0, m.cssW, m.cssH);
      ctx.restore();
    },
  }),
};

function build(canvasId, factory) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !factory) return null;
  return new Avatar(canvas, factory());
}

export function initDosDonts() {
  for (const id of Object.keys(scenes)) {
    build('dd_' + id, scenes[id]);                              // canvas id = "dd_" + scene key
  }
}
