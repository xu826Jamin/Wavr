// Reusable 2D ninja Avatar — one static body, a shared forearm, and a swappable hand. Swipes
// TRANSLATE the forearm+hand (correct directions, palm to camera); a fill-only upper-arm capsule
// fills the gap during motion. Idle = a gap-free whole-body "breathe". Reactions (wave) on demand.
// Instances are cheap: assets load once and are shared; each instance pauses when off-screen.
//
//   const a = new Avatar(canvasEl, { interactive: true });
//   a.play('open', 'up');   a.react('wave');
//
// Geometry is in the 1024x768 asset space, scaled to the canvas (both 4:3).

const AW = 1024, AH = 768;
const S = [772, 528], AP = [844, 502];   // shoulder socket + elbow (forearm is shared)
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SWIPE_PX = 90, SWIPE_MS = 620, CAP_FILL = 82, REACT_MS = 1100;

// Hand centroid in the 1024x768 asset space, as a fraction of the canvas. Measured from the hand
// sprites (open/fist/pointing/victory all cluster near [800, 290]). Demos use this to anchor the
// neutral-zone circle and the cursor dot onto the avatar's hand.
export const HAND_REST = { x: 800 / AW, y: 290 / AH };

const ASSET = {
  base: 'assets/avatar/base_body.webp', fore: 'assets/avatar/forearm.webp',
  hand_open: 'assets/avatar/hand_open.webp', hand_closed: 'assets/avatar/hand_fist.webp',
  hand_pointing: 'assets/avatar/hand_pointing.webp', hand_victory: 'assets/avatar/hand_victory.webp',
};

const url = p => { try { return chrome.runtime.getURL(p); } catch { return p; } };
const prefersReduce = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const easeOut = u => 1 - Math.pow(1 - u, 3);
// swipe travel: brief wind-up against dir, swing through, ease back to rest
function swingMag(u){ if(u<0.20)return -0.25*easeOut(u/0.20); if(u<0.48)return -0.25+1.25*easeOut((u-0.20)/0.28); return 1-easeOut((u-0.48)/0.52); }

// ---- shared image cache (load once across every Avatar instance) ----
const _img = {};
let _assetsStarted = false, _assetsLoaded = false;
const _onReady = [];
function loadAssets() {
  if (_assetsStarted) return;
  _assetsStarted = true;
  const keys = Object.keys(ASSET);
  let n = 0;
  for (const k of keys) {
    const img = new Image();
    const done = () => { if (++n === keys.length) { _assetsLoaded = true; _onReady.forEach(f => f()); _onReady.length = 0; } };
    img.onload = done; img.onerror = done; img.src = url(ASSET[k]);
    _img[k] = img;
  }
}

export class Avatar {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.pose = opts.pose || 'open';
    this.dir = opts.dir || 'up';
    this.idle = opts.idle !== false;          // gentle breathe by default
    this.interactive = !!opts.interactive;
    this.onFrame = opts.onFrame || null;       // (now, avatar) — set pose/arm before drawing
    this.onAfterDraw = opts.onAfterDraw || null; // (ctx, metrics) — draw overlays on top
    this.xform = opts.transform || null;       // {scale,dx,dy,rot,originX,originY} whole-avatar transform
    this._armManual = null;                    // {ox,oy} demo-driven arm; overrides swipe/react
    this.s = 1; this.cssW = 0; this.cssH = 0;
    this.t0 = performance.now();
    this.swipeStart = -1e9; this.reactStart = -1e9; this.reactKind = null;
    this.visible = true; this._running = false;

    this._resize();
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(canvas.parentElement || canvas);
    this._io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this._start();
    }, { threshold: 0.01 });
    this._io.observe(canvas);

    if (this.interactive) {
      canvas.style.cursor = 'pointer';
      this._onClick = () => this.react('wave');
      canvas.addEventListener('click', this._onClick);
    }

    loadAssets();
    this._start();  // loop no-ops until assets finish loading, then picks them up
  }

  play(pose, dir) {
    if (ASSET['hand_' + pose]) this.pose = pose;
    if (DIR_VEC[dir]) this.dir = dir;
    this.swipeStart = performance.now();
    this._start();
  }

  react(kind = 'wave') {
    this.reactKind = kind;
    this.reactStart = performance.now();
    this._start();
  }

  // Demo control: drive the hand directly (asset px offset from rest). Pass null to release.
  setArm(ox, oy) { this._armManual = (ox == null) ? null : { ox, oy }; this._start(); }
  setPose(pose) { if (ASSET['hand_' + pose]) this.pose = pose; this._start(); }
  // Whole-avatar transform (compose dos/don'ts: scale=too close, dx/dy=offset out of frame, rot=lean).
  // scale uniform; dx/dy as fractions of canvas; rot in rad; origin as fractions (default centre).
  setTransform(xf) { this.xform = xf || null; this._start(); }

  destroy() {
    this._running = false;
    this._ro?.disconnect(); this._io?.disconnect();
    if (this._onClick) this.canvas.removeEventListener('click', this._onClick);
  }

  _resize() {
    const par = this.canvas.parentElement; if (!par) return;
    this.cssW = par.clientWidth; this.cssH = par.clientHeight;
    this.s = this.cssW / AW;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.cssW * dpr);
    this.canvas.height = Math.round(this.cssH * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _start() {
    if (this._running || !this.visible) return;
    this._running = true;
    requestAnimationFrame(this._frame);
  }

  _frame = (now) => {
    if (!this._running) return;
    if (!this.visible) { this._running = false; return; }   // pause off-screen
    requestAnimationFrame(this._frame);
    if (!_assetsLoaded) return;

    this.onFrame?.(now, this);   // demos set pose / arm offset for this frame

    const { ctx, s, cssW, cssH } = this;
    ctx.clearRect(0, 0, cssW, cssH);

    const calm = prefersReduce();
    const t = (now - this.t0) / 1000;

    // arm offset from a demo, a swipe, or a reaction (in asset px)
    let ox = 0, oy = 0, u = -1, showLines = false;
    if (this._armManual) {                 // demo-driven arm (overrides swipe/react)
      ox = this._armManual.ox; oy = this._armManual.oy;
    } else if (!calm) {
      u = (now - this.swipeStart) / SWIPE_MS;
      if (u >= 0 && u <= 1) {
        const [vx, vy] = DIR_VEC[this.dir];
        const m = swingMag(u) * SWIPE_PX;
        ox = vx * m; oy = vy * m; showLines = true;
      }
      const r = (now - this.reactStart) / REACT_MS;
      if (this.reactKind === 'wave' && r >= 0 && r <= 1) {
        const lift = r < 0.18 ? easeOut(r / 0.18) : 1 - easeOut((r - 0.18) / 0.82); // raise then lower
        oy += -16 * lift;
        ox += Math.sin(r * Math.PI * 6) * 34 * (1 - r);     // 3 decaying side-to-side waves
        showLines = false;
      }
    }
    const moving = Math.abs(ox) + Math.abs(oy) > 1.2;

    // gap-free idle breathe applied to the WHOLE avatar (body + arm move together)
    const breatheY = (this.idle && !calm) ? Math.sin(t * 1.1) * 2 : 0;

    ctx.save();
    const xf = this.xform;
    if (xf) {                                   // whole-avatar transform (scale/offset/rotate)
      const oxp = (xf.originX ?? 0.5) * cssW, oyp = (xf.originY ?? 0.5) * cssH;
      ctx.translate(oxp + (xf.dx || 0) * cssW, oyp + (xf.dy || 0) * cssH);
      if (xf.rot) ctx.rotate(xf.rot);
      const sc = xf.scale ?? 1; ctx.scale(sc, sc);
      ctx.translate(-oxp, -oyp);
    }
    ctx.translate(0, breatheY * s);

    this._draw(_img.base, 0, 0);
    if (moving) {                                            // fill-only upper-arm capsule
      ctx.save();
      ctx.lineCap = 'round'; ctx.strokeStyle = '#41474f'; ctx.lineWidth = CAP_FILL * s;
      ctx.beginPath(); ctx.moveTo(S[0] * s, S[1] * s); ctx.lineTo((AP[0] + ox) * s, (AP[1] + oy) * s); ctx.stroke();
      ctx.restore();
    }
    this._draw(_img.fore, ox * s, oy * s);
    this._draw(_img['hand_' + this.pose] || _img.hand_open, ox * s, oy * s);
    ctx.restore();

    if (showLines) this._motionLines(u, this.dir);

    if (this.onAfterDraw) {
      const handX = HAND_REST.x * cssW + ox * s;
      const handY = HAND_REST.y * cssH + oy * s;
      this.onAfterDraw(ctx, { s, ox, oy, cssW, cssH, now, handX, handY });
    }

    // stop the loop if nothing is animating and idle is off (saves CPU)
    if (!this.idle && !moving && !showLines && !calm && !this._armManual && !this.onFrame) this._running = false;
  };

  _draw(img, ox, oy) {
    if (img && img.complete && img.naturalWidth) this.ctx.drawImage(img, ox, oy, this.cssW, this.cssH);
  }

  _motionLines(u, dir) {
    let a; if (u < 0.30 || u > 0.74) a = 0; else a = Math.sin(Math.PI * (u - 0.30) / 0.44);
    if (a <= 0) return;
    const { ctx, s, cssW, cssH } = this;
    const [vx, vy] = DIR_VEC[dir];
    const hx = 0.82 * cssW, hy = 0.30 * cssH, len = Math.min(cssW, cssH) * 0.15;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(74,222,128,${(a * 0.6).toFixed(3)})`;
    for (let i = -1; i <= 1; i++) {
      const px = -vy, py = vx;
      const sx = hx + px * i * len * 0.5 - vx * len * 0.3;
      const sy = hy + py * i * len * 0.5 - vy * len * 0.3;
      ctx.lineWidth = (i === 0 ? 5 : 3) * s * 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx * len, sy + vy * len); ctx.stroke();
    }
    ctx.restore();
  }
}
