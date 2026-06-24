// Reusable 2D ninja Avatar — a body (no arm), a movable upper-arm, a shared forearm, and a
// swappable hand, posed as a real ARTICULATED 2-bone chain. A swipe/reaction/demo sets a HAND
// TARGET; closed-form 2-bone IK (law of cosines) solves the shoulder + elbow angles so the arm
// BENDS to reach it and never detaches. Procedural joint caps hide the sprite seams. Idle = a
// gap-free whole-body "breathe". Instances are cheap: assets load once and are shared; each
// instance pauses when off-screen.
//
//   const a = new Avatar(canvasEl, { interactive: true });
//   a.play('open', 'up');   a.react('wave');
//
// Geometry is in the 1024x768 asset space, scaled to the canvas (both 4:3).

const AW = 1024, AH = 768;
const S = [772, 528], AP = [844, 502], WRIST = [825, 392];   // shoulder · rest elbow · rest wrist
const L1 = Math.hypot(AP[0] - S[0], AP[1] - S[1]);            // upper-arm bone (shoulder→elbow) ≈ 76.5
const L2 = Math.hypot(WRIST[0] - AP[0], WRIST[1] - AP[1]);    // forearm bone (elbow→wrist) ≈ 111.6
const REST_SHO = Math.atan2(AP[1] - S[1], AP[0] - S[0]);      // rest shoulder→elbow angle
const REST_FORE = Math.atan2(WRIST[1] - AP[1], WRIST[0] - AP[0]); // rest elbow→wrist angle
const BEND = 1;                                               // elbow bend side (so rest solves back to AP)
const SUIT_FILL = '#454b54', DELTOID_R = 46, ELBOW_R = 33;   // procedural joint caps hide the sprite seams
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const SWIPE_PX = 88, SWIPE_MS = 720, REACT_MS = 1100;        // swipe = hand-target travel; IK reaches it
const REACT_DUR = { wave: 1150, nod: 700, shrug: 1000, celebrate: 1500 };

// Hand centroid in the 1024x768 asset space, as a fraction of the canvas. Measured from the hand
// sprites (open/fist/pointing/victory all cluster near [800, 290]). Demos use this to anchor the
// neutral-zone circle and the cursor dot onto the avatar's hand.
export const HAND_REST = { x: 800 / AW, y: 290 / AH };

const ASSET = {
  base: 'assets/avatar/base_body.webp', upperarm: 'assets/avatar/upperarm.webp',
  fore: 'assets/avatar/forearm.webp',
  hand_open: 'assets/avatar/hand_open.webp', hand_closed: 'assets/avatar/hand_fist.webp',
  hand_pointing: 'assets/avatar/hand_pointing.webp', hand_victory: 'assets/avatar/hand_victory.webp',
};

const url = p => { try { return chrome.runtime.getURL(p); } catch { return p; } };
// Cache the live MediaQueryList once — matchMedia(query) re-parses the query string every call, which
// the profiler showed costing ~18% of the heavy section when polled per-frame per-avatar. Reading
// `.matches` on the cached list is a cheap boolean getter and still updates if the OS setting changes.
let _rmQuery = null;
const prefersReduce = () => { try { return (_rmQuery ||= window.matchMedia('(prefers-reduced-motion: reduce)')).matches; } catch { return false; } };
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
let _rafId = 0, _hidden = false;
function _tickAll(now) {
  _rafId = 0;
  for (const a of _active) a._tick(now);   // deleting `a` from the Set mid-loop is safe in JS
  // A `_tick` can re-schedule mid-loop: demo avatars call setArm/setPose → _start → _wake from inside
  // onFrame, which (since _rafId was zeroed above) schedules a frame and sets _rafId. Guard with
  // `!_rafId` so we never schedule a SECOND one here — otherwise the pending-rAF count multiplies
  // every frame into an exponential storm (was ~295k drawImage/s at Dos&Don'ts; now one frame each).
  if (_active.size && !_rafId && !_hidden) _rafId = requestAnimationFrame(_tickAll);
}
function _wake(a) {
  _active.add(a);
  if (!_rafId && !_hidden) _rafId = requestAnimationFrame(_tickAll);
}
// Stop the shared ticker entirely while the tab is hidden; re-wake the active set when it returns.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    _hidden = document.hidden;
    if (_hidden) { if (_rafId) cancelAnimationFrame(_rafId); _rafId = 0; }
    else if (_active.size && !_rafId) _rafId = requestAnimationFrame(_tickAll);
  });
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
    // Setting canvas.width clears it — wake the ticker for one repaint so STATIC avatars (idle:false,
    // which paint once then leave the loop) don't blank out after a resize / DPR change.
    this._start();
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

    // Hand TARGET offset (asset px from the rest wrist) from a demo, a swipe, or a reaction. The
    // 2-bone IK below turns this target into shoulder + elbow angles so the arm bends to reach it.
    let offX = 0, offY = 0, u = -1, showLines = false;
    if (this._armManual) {                 // demo-driven hand target (overrides swipe/react)
      offX = this._armManual.ox; offY = this._armManual.oy;
    } else if (!calm) {
      u = (now - this.swipeStart) / SWIPE_MS;
      if (u >= 0 && u <= 1) {
        const [vx, vy] = DIR_VEC[this.dir];
        const m = swipePath(u) * SWIPE_PX;
        offX = vx * m; offY = vy * m;        // push the hand target along the swipe direction
        showLines = true;
      }
      const r = (now - this.reactStart) / this.reactDur;
      if (r >= 0 && r <= 1) {
        const env = Math.sin(r * Math.PI);                       // 0→1→0 envelope (no snap in/out)
        if (this.reactKind === 'wave') {
          offY += -34 * env;                                     // raise the hand to wave height
          offX += Math.sin(r * Math.PI * 5) * 30 * env;          // waggle side-to-side (IK swings the forearm)
        } else if (this.reactKind === 'celebrate') {
          offY += -60 * env;                                     // raise high
          offX += Math.sin(r * Math.PI * 7) * 34 * env;          // faster, bigger waggle
        } else if (this.reactKind === 'shrug') {
          offX += 50 * env; offY += -4 * env;                    // hand opens outward ("dunno")
        }
      }
    }
    const ik = this._solveIK(WRIST[0] + offX, WRIST[1] + offY);
    const moving = Math.abs(offX) + Math.abs(offY) > 1.2;

    // hand centre in screen px (rides the IK forearm), for streaks + overlay hooks
    const hand = this._handPos(ik);

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

    this._draw(_img.base, 0, 0);                              // body (arm removed)
    this._drawUpperArm(ik.shoRot);                           // upper-arm sprite, rotated about the shoulder
    this._cap(S[0], S[1], DELTOID_R);                        // deltoid: hides the shoulder seam
    this._cap(ik.ex, ik.ey, ELBOW_R);                        // elbow joint: hides the elbow seam
    this._drawArm(ik);                                       // forearm + hand, pivoting at the IK elbow
    this._drawBlink(this._blinkP);                           // lids ride the transform (drawn on the face)
    ctx.restore();

    if (showLines) this._motionLines(u, this.dir, hand);     // streaks trail the actual hand

    if (this.onAfterDraw) {
      this.onAfterDraw(ctx, { s, ox: offX, oy: offY, rot: ik.foreRot, cssW, cssH, now, handX: hand.x, handY: hand.y });
    }

    // leave the shared ticker when nothing is animating (saves CPU). Under reduced motion there is
    // never any animation, so paint one frame and stop — any state change re-wakes via _start().
    if (calm || (!this.idle && !this.life && !moving && !showLines && !this._armManual && !this.onFrame)) {
      this._running = false; _active.delete(this);
    }
  }

  // Closed-form 2-bone IK (law of cosines): solve shoulder + elbow so the wrist reaches (tx,ty).
  // Returns the elbow position + the rotation DELTAS to apply to the upper-arm / forearm sprites.
  _solveIK(tx, ty) {
    const dx = tx - S[0], dy = ty - S[1];
    const dist = Math.hypot(dx, dy) || 1e-3;
    const cd = Math.max(Math.abs(L1 - L2) + 0.5, Math.min(L1 + L2 - 0.5, dist));  // clamp to reach
    const base = Math.atan2(dy, dx);
    let cosA = (L1 * L1 + cd * cd - L2 * L2) / (2 * L1 * cd);
    cosA = Math.max(-1, Math.min(1, cosA));
    const shoAngle = base + BEND * Math.acos(cosA);            // shoulder→elbow absolute angle
    const ex = S[0] + L1 * Math.cos(shoAngle), ey = S[1] + L1 * Math.sin(shoAngle);
    const cx = S[0] + cd * Math.cos(base), cy = S[1] + cd * Math.sin(base);       // clamped target
    const foreAngle = Math.atan2(cy - ey, cx - ex);           // elbow→wrist absolute angle
    return { ex, ey, shoRot: shoAngle - REST_SHO, foreRot: foreAngle - REST_FORE };
  }

  _draw(img, ox, oy) {
    if (img && img.complete && img.naturalWidth) this.ctx.drawImage(img, ox, oy, this.cssW, this.cssH);
  }

  // Procedural joint cap (fill-only, suit colour) — bridges the gap where two arm sprites meet.
  _cap(cx, cy, r) {
    const { ctx, s } = this;
    ctx.save();
    ctx.fillStyle = SUIT_FILL;
    ctx.beginPath(); ctx.arc(cx * s, cy * s, r * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Upper-arm sprite, rotated `shoRot` about the shoulder socket S.
  _drawUpperArm(shoRot) {
    const { ctx, s } = this;
    if (Math.abs(shoRot) < 1e-4) { this._draw(_img.upperarm, 0, 0); return; }
    ctx.save();
    const px = S[0] * s, py = S[1] * s;
    ctx.translate(px, py); ctx.rotate(shoRot); ctx.translate(-px, -py);
    this._draw(_img.upperarm, 0, 0);
    ctx.restore();
  }

  // Forearm + hand drawn together: rest-elbow AP mapped onto the IK elbow, rotated `foreRot`.
  _drawArm(ik) {
    const { ctx, s } = this;
    const hand = _img['hand_' + this.pose] || _img.hand_open;
    ctx.save();
    ctx.translate(ik.ex * s, ik.ey * s); ctx.rotate(ik.foreRot); ctx.translate(-AP[0] * s, -AP[1] * s);
    this._draw(_img.fore, 0, 0);
    this._draw(hand, 0, 0);
    ctx.restore();
  }

  // Hand centre (screen px): rest hand point carried by the IK forearm (rotate about elbow + offset).
  _handPos(ik) {
    const { s } = this;
    const rx = HAND_REST.x * AW - AP[0], ry = HAND_REST.y * AH - AP[1];
    const c = Math.cos(ik.foreRot), sn = Math.sin(ik.foreRot);
    return { x: (ik.ex + rx * c - ry * sn) * s, y: (ik.ey + rx * sn + ry * c) * s };
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
