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
const SWIPE_PX = 168, SWIPE_MS = 720, CAP_FILL = 82, REACT_MS = 1100;
const DEG = Math.PI / 180;
const SWIPE_LEAD = 17 * DEG;                 // forearm "leads" the swipe (flick), pivoting at the elbow
const DIR_SIGN = { up: -1, down: 1, left: -1, right: 1 };  // lead-rotation sign per direction
const REACT_DUR = { wave: 1150, nod: 700, shrug: 1000, celebrate: 1500 };

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
const easeInOut = u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const easeOutBack = (u, k = 1.9) => 1 + (k + 1) * Math.pow(u - 1, 3) + k * Math.pow(u - 1, 2); // overshoot
// Swipe travel (0→~1.1→0): anticipation pull-back, flick out with overshoot, spring-settle to rest.
function swipePath(u) {
  if (u < 0.14) return -0.18 * easeOut(u / 0.14);                         // wind up against the dir
  if (u < 0.46) return -0.18 + 1.18 * easeOutBack((u - 0.14) / 0.32);     // flick out, overshoot past 1
  return 1 - easeInOut((u - 0.46) / 0.54);                                // ease back home
}

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

// ---- shared RAF ticker: ONE requestAnimationFrame drives every visible Avatar (pooled, Phase 6) ----
const _active = new Set();
let _rafId = 0;
function _tickAll(now) {
  _rafId = 0;
  for (const a of _active) a._tick(now);   // deleting `a` from the Set mid-loop is safe in JS
  if (_active.size) _rafId = requestAnimationFrame(_tickAll);
}
function _wake(a) {
  _active.add(a);
  if (!_rafId) _rafId = requestAnimationFrame(_tickAll);
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
    this.swipeStart = -1e9; this.reactStart = -1e9; this.reactKind = null; this.reactDur = REACT_MS;
    this.visible = true; this._running = false;

    // ── idle life (blink / glance / hover-lean / periodic wave) — on for interactive avatars ──
    this.life = opts.life ?? this.interactive;
    this._blinkP = 0; this._blinkStart = -1e9; this._blinkDur = 150;
    this._nextBlink = this.t0 + 1400 + Math.random() * 3200;
    this._lifeX = { rot: 0, scale: 1, dx: 0, dy: 0 };          // eased lean transform
    this._hover = false;
    this._glanceStart = -1e9; this._glanceDir = 1;
    this._nextGlance = this.t0 + 4500 + Math.random() * 6000;
    this._nextIdleWave = this.t0 + 12000 + Math.random() * 10000;
    this._reactCycle = 0;

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
      this._onClick = () => this._clickReact();
      this._onEnter = () => { this._hover = true; this._start(); };
      this._onLeave = () => { this._hover = false; this._start(); };
      canvas.addEventListener('click', this._onClick);
      canvas.addEventListener('pointerenter', this._onEnter);
      canvas.addEventListener('pointerleave', this._onLeave);
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
    this.reactDur = REACT_DUR[kind] || REACT_MS;
    this.reactStart = performance.now();
    this._start();
  }

  // Demo control: drive the hand directly (asset px offset from rest). Pass null to release.
  setArm(ox, oy) { this._armManual = (ox == null) ? null : { ox, oy }; this._start(); }
  setPose(pose) { if (ASSET['hand_' + pose]) this.pose = pose; this._start(); }
  // Whole-avatar transform (compose dos/don'ts: scale=too close, dx/dy=offset out of frame, rot=lean).
  // scale uniform; dx/dy as fractions of canvas; rot in rad; origin as fractions (default centre).
  setTransform(xf) { this.xform = xf || null; this._start(); }

  // Click cycles through small reactions; demos/non-interactive use react() directly.
  _clickReact() { this.react(['wave', 'nod', 'wave'][this._reactCycle++ % 3]); }

  destroy() {
    this._running = false; _active.delete(this);
    this._ro?.disconnect(); this._io?.disconnect();
    if (this._onClick) this.canvas.removeEventListener('click', this._onClick);
    if (this._onEnter) { this.canvas.removeEventListener('pointerenter', this._onEnter); this.canvas.removeEventListener('pointerleave', this._onLeave); }
  }

  // Idle life: schedule blinks, drive an eased lean (hover > glance), nod dips, and periodic waves.
  // Owns this.xform for life avatars; demos (onFrame / static transform) are left untouched.
  _updateLife(now) {
    if (!this.life) { this._blinkP = 0; return; }   // life (blink/lean) only for interactive/hero avatars
    const calm = prefersReduce();
    if (!calm && now >= this._nextBlink && now - this._blinkStart > this._blinkDur + 40) {
      this._blinkStart = now;
      this._blinkDur = 130 + Math.random() * 60;
      this._nextBlink = (Math.random() < 0.16) ? now + 230 : now + 2600 + Math.random() * 4200; // sometimes double-blink
    }
    const bp = (now - this._blinkStart) / this._blinkDur;
    this._blinkP = (!calm && bp >= 0 && bp <= 1) ? Math.sin(bp * Math.PI) : 0;   // 0 → 1 → 0

    if (this.onFrame) return;   // a life avatar that also drives its own frame keeps its own transform

    let tRot = 0, tScale = 1, tDx = 0, tDy = 0;
    if (!calm) {
      if (this._hover) { tRot = -0.035; tScale = 1.025; tDy = -0.012; }
      else if (now >= this._glanceStart && now <= this._glanceStart + 1400) {
        const e = Math.sin((now - this._glanceStart) / 1400 * Math.PI);
        tRot = this._glanceDir * 0.02 * e; tDx = this._glanceDir * 0.012 * e;
      } else if (now >= this._nextGlance) {
        this._glanceStart = now; this._glanceDir = Math.random() < 0.5 ? -1 : 1;
        this._nextGlance = now + 5000 + Math.random() * 7000;
      }
      const r = (now - this.reactStart) / this.reactDur;
      if (r >= 0 && r <= 1) {
        const e = Math.sin(r * Math.PI);
        if (this.reactKind === 'nod') { tDy += 0.03 * e; tScale *= 1 - 0.012 * e; }          // downward dip
        else if (this.reactKind === 'shrug') { tRot += -0.05 * e; tDy += -0.012 * e; }       // shoulders/head tilt up
        else if (this.reactKind === 'celebrate') { tDy += -0.03 * Math.abs(Math.sin(r * Math.PI * 3)) * (1 - r); tScale *= 1 + 0.025 * e; } // happy hops
      }
      if (this.idle && now >= this._nextIdleWave && now - this.reactStart > 2000 && now - this.swipeStart > 2000) {
        this.react('wave'); this._nextIdleWave = now + 13000 + Math.random() * 9000;
      }
    }
    const k = 0.12, L = this._lifeX;
    L.rot += (tRot - L.rot) * k; L.scale += (tScale - L.scale) * k;
    L.dx += (tDx - L.dx) * k; L.dy += (tDy - L.dy) * k;
    this.xform = { rot: L.rot, scale: L.scale, dx: L.dx, dy: L.dy, originX: 0.5, originY: 0.62 };
  }

  // Upper-lid blink: skin-coloured lids descend over the pupils (asset space, ride the transform).
  _drawBlink(p) {
    if (p <= 0) return;
    const { ctx, s } = this;
    const eyes = [[450, 307, 50, 38], [562, 303, 48, 40]];   // [x,y,w,h] eye openings (asset px)
    ctx.save();
    for (const [x, y, w, h] of eyes) {
      const lh = Math.max(2, p * h);
      ctx.fillStyle = 'rgb(247,201,170)';
      ctx.beginPath(); ctx.roundRect(x * s, y * s, w * s, lh * s, [0, 0, 7 * s, 7 * s]); ctx.fill();
      ctx.strokeStyle = 'rgba(86,58,44,0.85)'; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo((x + 2) * s, (y + lh) * s); ctx.lineTo((x + w - 2) * s, (y + lh) * s); ctx.stroke();
    }
    ctx.restore();
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
    if (!this.visible) return;
    this._running = true;
    _wake(this);                 // join the shared ticker (idempotent)
  }

  _tick(now) {
    if (!this.visible) { this._running = false; _active.delete(this); return; }  // pause off-screen
    if (!_assetsLoaded) return;  // stay scheduled; wait for the shared image cache

    this.onFrame?.(now, this);   // demos set pose / arm offset for this frame
    this._updateLife(now);       // blink + lean for life avatars (no-op for demos)

    const { ctx, s, cssW, cssH } = this;
    ctx.clearRect(0, 0, cssW, cssH);

    const calm = prefersReduce();
    const t = (now - this.t0) / 1000;

    // arm motion (asset px translate + elbow rotation in rad) from a demo, a swipe, or a reaction
    let ox = 0, oy = 0, rot = 0, u = -1, showLines = false;
    if (this._armManual) {                 // demo-driven arm (overrides swipe/react)
      ox = this._armManual.ox; oy = this._armManual.oy;
    } else if (!calm) {
      u = (now - this.swipeStart) / SWIPE_MS;
      if (u >= 0 && u <= 1) {
        const [vx, vy] = DIR_VEC[this.dir];
        const m = swipePath(u) * SWIPE_PX;
        ox = vx * m; oy = vy * m;
        rot = DIR_SIGN[this.dir] * SWIPE_LEAD * swipePath(u);   // forearm flicks/leads the sweep
        showLines = true;
      }
      const r = (now - this.reactStart) / this.reactDur;
      if (r >= 0 && r <= 1) {
        const env = Math.sin(r * Math.PI);                       // 0→1→0 envelope (no snap in/out)
        if (this.reactKind === 'wave') {
          oy += -30 * env;                                       // lift the forearm to wave height
          rot += Math.sin(r * Math.PI * 5) * 20 * DEG * env;     // pivot side-to-side at the elbow (a real wave)
        } else if (this.reactKind === 'celebrate') {
          oy += -54 * env;                                       // raise high
          rot += Math.sin(r * Math.PI * 7) * 24 * DEG * env;     // faster, bigger pivots
        } else if (this.reactKind === 'shrug') {
          ox += 46 * env; oy += -6 * env;                        // hand opens outward…
          rot += 15 * DEG * env;                                 // …palm rolls up ("dunno")
        }
      }
    }
    const moving = Math.abs(ox) + Math.abs(oy) > 1.2 || Math.abs(rot) > 0.012;

    // hand centre in screen px (forearm rotates about the elbow), for streaks + overlay hooks
    const hand = this._handPos(ox, oy, rot);

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
    if (moving) {                                            // fill-only upper-arm capsule (shoulder→elbow)
      ctx.save();
      ctx.lineCap = 'round'; ctx.strokeStyle = '#41474f'; ctx.lineWidth = CAP_FILL * s;
      ctx.beginPath(); ctx.moveTo(S[0] * s, S[1] * s); ctx.lineTo((AP[0] + ox) * s, (AP[1] + oy) * s); ctx.stroke();
      ctx.restore();
    }
    this._drawArm(ox, oy, rot);                              // forearm + hand, pivoting at the elbow
    this._drawBlink(this._blinkP);                           // lids ride the transform (drawn on the face)
    ctx.restore();

    if (showLines) this._motionLines(u, this.dir, hand);     // streaks trail the actual hand

    if (this.onAfterDraw) {
      this.onAfterDraw(ctx, { s, ox, oy, rot, cssW, cssH, now, handX: hand.x, handY: hand.y });
    }

    // leave the shared ticker when nothing is animating (saves CPU). Under reduced motion there is
    // never any animation, so paint one frame and stop — any state change re-wakes via _start().
    if (calm || (!this.idle && !this.life && !moving && !showLines && !this._armManual && !this.onFrame)) {
      this._running = false; _active.delete(this);
    }
  }

  _draw(img, ox, oy) {
    if (img && img.complete && img.naturalWidth) this.ctx.drawImage(img, ox, oy, this.cssW, this.cssH);
  }

  // Forearm + hand drawn together, translated by (ox,oy) and rotated `rot` about the elbow.
  _drawArm(ox, oy, rot) {
    const { ctx, s } = this;
    const hand = _img['hand_' + this.pose] || _img.hand_open;
    if (Math.abs(rot) < 1e-4) { this._draw(_img.fore, ox * s, oy * s); this._draw(hand, ox * s, oy * s); return; }
    ctx.save();
    const px = (AP[0] + ox) * s, py = (AP[1] + oy) * s;       // elbow pivot in screen space
    ctx.translate(px, py); ctx.rotate(rot); ctx.translate(-px, -py);
    this._draw(_img.fore, ox * s, oy * s);
    this._draw(hand, ox * s, oy * s);
    ctx.restore();
  }

  // Hand centre (screen px): rest point, translated by (ox,oy), then rotated about the elbow.
  _handPos(ox, oy, rot) {
    const { s } = this;
    const hx = HAND_REST.x * AW + ox, hy = HAND_REST.y * AH + oy;
    const ex = AP[0] + ox, ey = AP[1] + oy;
    const dx = hx - ex, dy = hy - ey, c = Math.cos(rot), sn = Math.sin(rot);
    return { x: (ex + dx * c - dy * sn) * s, y: (ey + dx * sn + dy * c) * s };
  }

  _motionLines(u, dir, hand) {
    let a; if (u < 0.18 || u > 0.62) a = 0; else a = Math.sin(Math.PI * (u - 0.18) / 0.44);
    if (a <= 0) return;
    const { ctx, s, cssW, cssH } = this;
    const [vx, vy] = DIR_VEC[dir];
    const len = Math.min(cssW, cssH) * 0.22;                  // streaks trail behind the hand
    const px = -vy, py = vx;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(74,222,128,${(a * 0.55).toFixed(3)})`;
    for (let i = -1; i <= 1; i++) {
      const sx = hand.x + px * i * len * 0.34 - vx * len * 0.7;
      const sy = hand.y + py * i * len * 0.34 - vy * len * 0.7;
      ctx.lineWidth = (i === 0 ? 5 : 3) * s * 2;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + vx * len * 0.66, sy + vy * len * 0.66); ctx.stroke();
    }
    ctx.restore();
  }
}
