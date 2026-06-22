import * as THREE from 'three';

let renderer, scene, camera, animRaf, lastFrameTime = 0;
let initDone = false;

// Character parts
let characterGroup, headGroup, handGroup;
let upperArm, foreArm, elbowJoint;
let fingers = [];
let gestureLight;

// ---- Rig constants ----
// The HAND is driven directly in screen space (it translates left/right/up/down)
// and always faces the camera. A 2-bone IK arm reaches to follow it. This is the
// key to an accurate, palm-to-camera swipe.
const S      = new THREE.Vector3(0.20, 0.20, 0.06); // right shoulder (fixed)
const L1     = 0.30;  // upper arm length
const L2     = 0.30;  // forearm length
const REACH  = L1 + L2 - 0.005;
const YAXIS  = new THREE.Vector3(0, 1, 0);
const POLE   = new THREE.Vector3(0.30, -1, -0.10); // elbow bends down & slightly back

// ---- Animation state ----
const handCur = new THREE.Vector3(0.30, -0.02, 0.30);
const handTgt = new THREE.Vector3(0.30, -0.02, 0.30);
let handTau = 300;

const fCur = [0.5, 0.4, 0.4, 0.4, 0.45];
const fTgt = [0.5, 0.4, 0.4, 0.4, 0.45];
let glCur = 0, glTgt = 0, breathT = 0;

const IDLE_HAND = new THREE.Vector3(0.30, -0.02, 0.30);
const IDLE_F    = [0.5, 0.4, 0.4, 0.4, 0.45];

// ---- Pose finger curls [thumb, index, middle, ring, pinky] (0 = straight up) ----
const POSE_FINGERS = {
  open:     [0,    0,    0,    0,    0   ],
  closed:   [1.5,  1.65, 1.65, 1.65, 1.65],
  pointing: [1.2,  0,    1.65, 1.65, 1.65],
  victory:  [1.2,  0,    0,    1.65, 1.65],
};

// ---- Swipe = hand translation (wind-up -> follow-through), palm stays to camera ----
const p = (x, y, z) => new THREE.Vector3(x, y, z);
const SWIPES = {
  up:    { from: p(0.26, 0.10, 0.42), to: p(0.22, 0.50, 0.40) },
  down:  { from: p(0.24, 0.48, 0.40), to: p(0.30,-0.06, 0.44) },
  left:  { from: p(0.48, 0.26, 0.40), to: p(-0.24,0.28, 0.40) },
  right: { from: p(-0.18,0.28, 0.40), to: p(0.52, 0.26, 0.38) },
};

// ---- Helpers ----
let gMap;
function makeGradMap() {
  const d = new Uint8Array([60, 150, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.needsUpdate = true;
  return t;
}
const toon  = c => new THREE.MeshToonMaterial({ color: c, gradientMap: gMap });
const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function outline(mesh, parent, s = 1.06) {
  const m = new THREE.Mesh(mesh.geometry, basic(0x0b0b0b, { side: THREE.BackSide }));
  m.scale.setScalar(s);
  m.position.copy(mesh.position);
  m.quaternion.copy(mesh.quaternion);
  parent.add(m);
  return m;
}

// Materials (module scope so the arm builder can reuse them)
let mSkin, mSkinShade, mHair, mHood, mHoodDark, mAccent, mWhite, mIris, mPupil, mMouth, mBrow;

// ---- Build character ----
function buildCharacter() {
  mSkin      = toon(0xf1c6a0); // light warm skin
  mSkinShade = toon(0xe0a87f);
  mHair      = toon(0x5a3a22); // warm brown
  mHood      = toon(0x34a85b); // green hoodie
  mHoodDark  = toon(0x238044); // hood lining / shade
  mAccent    = toon(0x4ade80);
  mWhite     = toon(0xfbfbfb);
  mIris      = toon(0x6b4327); // warm brown eyes
  mPupil     = toon(0x140d08);
  mMouth     = toon(0xb45c50);
  mBrow      = toon(0x4a2f1c);

  characterGroup = new THREE.Group();
  scene.add(characterGroup);

  // ---------- Hoodie torso (fills the bottom of the webcam frame) ----------
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.40, 0.62, 24), mHood);
  torso.position.y = -0.20;
  characterGroup.add(torso);
  outline(torso, characterGroup, 1.03);

  // Shoulders
  [-0.255, 0.255].forEach(x => {
    const sh = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 14), mHood);
    sh.position.set(x, 0.12, 0);
    sh.scale.set(1, 0.85, 1);
    characterGroup.add(sh);
    outline(sh, characterGroup, 1.04);
  });

  // Resting left sleeve (silhouette only)
  const lSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.42, 14), mHood);
  lSleeve.position.set(-0.30, -0.12, 0.05);
  lSleeve.rotation.z = 0.22;
  characterGroup.add(lSleeve);
  outline(lSleeve, characterGroup, 1.05);

  // Hood collar around the neck
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.05, 12, 28), mHoodDark);
  collar.position.set(0, 0.17, 0.02);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(1, 0.8, 1);
  characterGroup.add(collar);

  // Drawstrings
  [-0.045, 0.045].forEach(x => {
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 6), mAccent);
    str.position.set(x, 0.05, 0.16);
    characterGroup.add(str);
  });

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.082, 0.12, 14), mSkin);
  neck.position.y = 0.25;
  characterGroup.add(neck);

  // ---------- Head ----------
  headGroup = new THREE.Group();
  headGroup.position.y = 0.46;
  characterGroup.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 28, 24), mSkin);
  head.scale.set(1.0, 1.06, 0.96);
  headGroup.add(head);
  outline(head, headGroup, 1.035);

  // Ears
  [-0.275, 0.275].forEach(x => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), mSkin);
    ear.position.set(x, -0.02, 0.02);
    ear.scale.set(0.6, 1, 0.8);
    headGroup.add(ear);
  });

  // Hair — cap + fringe framing the face
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.295, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), mHair
  );
  hairCap.position.y = 0.012;
  hairCap.scale.set(1.02, 1.06, 1.0);
  headGroup.add(hairCap);

  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mHair);
  fringe.position.set(0, 0.165, 0.18);
  fringe.scale.set(1.5, 0.6, 0.7);
  headGroup.add(fringe);

  [-0.2, 0.2].forEach(x => {
    const sb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mHair);
    sb.position.set(x, 0.1, 0.13);
    sb.scale.set(0.7, 1.3, 0.7);
    headGroup.add(sb);
  });

  // ---------- Face features ----------
  const eyeY = -0.012, eyeZ = 0.247, eyeX = 0.097;
  [[-eyeX, 1], [eyeX, -1]].forEach(([xOff, side]) => {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.054, 18, 14), mWhite);
    sc.position.set(xOff, eyeY, eyeZ);
    sc.scale.set(1, 1.12, 0.5);
    headGroup.add(sc);
    outline(sc, headGroup, 1.07);

    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.034, 16, 12), mIris);
    ir.position.set(xOff, eyeY - 0.003, eyeZ + 0.016);
    ir.scale.set(1, 1, 0.5);
    headGroup.add(ir);

    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), mPupil);
    pu.position.set(xOff, eyeY - 0.004, eyeZ + 0.028);
    pu.scale.set(1, 1, 0.4);
    headGroup.add(pu);

    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), basic(0xffffff));
    hl.position.set(xOff + side * 0.014, eyeY + 0.018, eyeZ + 0.034);
    headGroup.add(hl);

    // Eyebrow
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.016, 0.02), mBrow);
    brow.position.set(xOff, eyeY + 0.072, eyeZ + 0.01);
    brow.rotation.z = side * 0.12;
    headGroup.add(brow);
  });

  // Nose
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), mSkinShade);
  nose.position.set(0, eyeY - 0.06, 0.272);
  nose.scale.set(0.9, 0.8, 1);
  headGroup.add(nose);

  // Smiling mouth (lower-half torus arc)
  const mouth = new THREE.Mesh(
    new THREE.TorusGeometry(0.05, 0.013, 10, 20, Math.PI), mMouth
  );
  mouth.position.set(0, eyeY - 0.125, 0.244);
  mouth.rotation.z = Math.PI; // open upward -> smile
  mouth.scale.set(1, 0.7, 1);
  headGroup.add(mouth);

  // Cheek blush
  const bMat = basic(0xff9a8c, { transparent: true, opacity: 0.22 });
  [-0.16, 0.16].forEach(x => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bMat);
    b.position.set(x, eyeY - 0.05, 0.235);
    b.scale.set(1.2, 0.7, 0.3);
    headGroup.add(b);
  });

  // ---------- Gesturing right arm (transformed each frame via IK) ----------
  const shoulderJoint = new THREE.Mesh(new THREE.SphereGeometry(0.092, 16, 14), mHood);
  shoulderJoint.position.copy(S);
  characterGroup.add(shoulderJoint);

  upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.066, 1, 14), mHood);
  characterGroup.add(upperArm);
  upperArm.userData.outline = outline(upperArm, characterGroup, 1.07);

  elbowJoint = new THREE.Mesh(new THREE.SphereGeometry(0.068, 14, 12), mHood);
  characterGroup.add(elbowJoint);

  foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 1, 14), mHood);
  characterGroup.add(foreArm);
  foreArm.userData.outline = outline(foreArm, characterGroup, 1.07);

  buildHand();

  gestureLight = new THREE.PointLight(0x4ade80, 0, 2.0);
  gestureLight.position.set(0.4, 0.4, 0.9);
  scene.add(gestureLight);
}

// Hand: independent group, palm faces camera (+Z), fingers point up (+Y).
function buildHand() {
  handGroup = new THREE.Group();
  handGroup.rotation.x = -0.12; // tilt palm slightly up toward the camera
  characterGroup.add(handGroup);

  // Sleeve cuff where the green sleeve meets the skin hand
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.058, 0.05, 14), mHoodDark);
  cuff.position.y = -0.03;
  handGroup.add(cuff);

  // Palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.055), mSkin);
  palm.position.y = 0.055;
  palm.geometry.translate(0, 0, 0);
  handGroup.add(palm);
  outline(palm, handGroup, 1.05);

  const fDefs = [
    { x: -0.088, y: 0.045, rz: -0.85, len: 0.078, r: 0.018 }, // thumb (splays left)
    { x: -0.052, y: 0.125, rz: 0,     len: 0.092, r: 0.017 }, // index
    { x: -0.017, y: 0.132, rz: 0,     len: 0.100, r: 0.018 }, // middle
    { x:  0.018, y: 0.128, rz: 0,     len: 0.092, r: 0.017 }, // ring
    { x:  0.050, y: 0.118, rz: 0,     len: 0.076, r: 0.015 }, // pinky
  ];
  fingers = [];
  fDefs.forEach(fd => {
    const piv = new THREE.Object3D();
    piv.position.set(fd.x, fd.y, 0);
    piv.rotation.z = fd.rz;
    handGroup.add(piv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(fd.r, fd.r * 0.85, fd.len, 8), mSkin);
    m.position.y = fd.len / 2;
    piv.add(m);
    outline(m, piv, 1.12);
    // rounded fingertip
    const tip = new THREE.Mesh(new THREE.SphereGeometry(fd.r, 8, 6), mSkin);
    tip.position.y = fd.len;
    piv.add(tip);
    fingers.push({ piv, baseZ: fd.rz });
  });
}

// Orient a unit-height cylinder (centred at origin, +Y axis) to span p1->p2.
const _mid = new THREE.Vector3();
const _seg = new THREE.Vector3();
function orientSegment(mesh, p1, p2) {
  _mid.copy(p1).add(p2).multiplyScalar(0.5);
  _seg.copy(p2).sub(p1);
  const len = _seg.length() || 0.0001;
  _seg.divideScalar(len);
  mesh.position.copy(_mid);
  mesh.quaternion.setFromUnitVectors(YAXIS, _seg);
  mesh.scale.set(1, len, 1);
  const o = mesh.userData.outline;
  if (o) { o.position.copy(mesh.position); o.quaternion.copy(mesh.quaternion); o.scale.set(1.07, len, 1.07); }
}

// 2-bone IK: given the wrist target, find the elbow and orient both bones.
const _toH = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _bend = new THREE.Vector3();
const _elbow = new THREE.Vector3();
function solveArm(wrist) {
  _toH.copy(wrist).sub(S);
  let d = _toH.length();
  d = clamp(d, Math.abs(L1 - L2) + 0.02, REACH);
  _dir.copy(_toH).normalize();

  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));

  // bend direction = component of POLE perpendicular to the shoulder->hand line
  _bend.copy(POLE).addScaledVector(_dir, -POLE.dot(_dir));
  if (_bend.lengthSq() < 1e-6) _bend.set(0, -1, 0);
  _bend.normalize();

  _elbow.copy(S).addScaledVector(_dir, a).addScaledVector(_bend, h);

  orientSegment(upperArm, S, _elbow);
  orientSegment(foreArm, _elbow, wrist);
  elbowJoint.position.copy(_elbow);
}

// ---- Init ----
export function initMascot(canvasEl) {
  if (initDone) return;
  initDone = true;
  gMap = makeGradMap();

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  function resize() {
    const par = canvasEl.parentElement;
    if (!par) return;
    renderer.setSize(par.clientWidth, par.clientHeight, false);
    if (camera) { camera.aspect = par.clientWidth / par.clientHeight; camera.updateProjectionMatrix(); }
  }
  resize();
  new ResizeObserver(resize).observe(canvasEl.parentElement);

  scene = new THREE.Scene();

  const { clientWidth: w = 400, clientHeight: h = 300 } = canvasEl.parentElement;
  camera = new THREE.PerspectiveCamera(33, w / h, 0.1, 20);
  camera.position.set(0, 0.30, 2.6);
  camera.lookAt(0, 0.26, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(-1.2, 2.2, 2.4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd6ff, 0.28);
  fill.position.set(1.8, 0.4, 1.2);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x4ade80, 0.18);
  rim.position.set(0.4, 0.6, -1.6);
  scene.add(rim);

  buildCharacter();
  solveArm(handCur);
  startLoop();
}

// ---- Loop (~30 fps) ----
function startLoop() {
  const IV = 1000 / 30;
  function tick(now) {
    animRaf = requestAnimationFrame(tick);
    const dt = now - lastFrameTime;
    if (dt < IV) return;
    lastFrameTime = now - (dt % IV);
    update(Math.min(dt, 100));
    renderer.render(scene, camera);
  }
  animRaf = requestAnimationFrame(tick);
}

// ---- Update ----
function update(dt) {
  breathT += dt * 0.001;

  const aHand = 1 - Math.exp(-dt / handTau);
  handCur.lerp(handTgt, aHand);

  // gentle idle float so the resting hand isn't dead-still
  const floatY = Math.sin(breathT * 1.1) * 0.006;
  _toH.copy(handCur);
  _toH.y += floatY;
  handGroup.position.copy(_toH);
  solveArm(_toH);

  const aGen = 1 - Math.exp(-dt / 200);
  for (let i = 0; i < 5; i++) {
    fCur[i] = lerp(fCur[i], fTgt[i], aGen);
    if (fingers[i]) fingers[i].piv.rotation.x = fCur[i];
  }

  glCur = lerp(glCur, glTgt, 1 - Math.exp(-dt / 140));
  if (gestureLight) gestureLight.intensity = glCur;

  if (headGroup) {
    headGroup.position.y = 0.46 + Math.sin(breathT * 0.72) * 0.006;
    headGroup.rotation.y = handCur.x * 0.14;   // glance toward the hand
    headGroup.rotation.x = 0.02 + handCur.y * 0.05;
  }
}

// ---- Play gesture ----
export function playGesture(pose, dir) {
  if (!initDone) return;
  if (playGesture._t) playGesture._t.forEach(clearTimeout);

  const f  = POSE_FINGERS[pose] || POSE_FINGERS.open;
  const sw = SWIPES[dir] || SWIPES.up;

  // Phase 1 — wind-up: raise the open hand to the anticipation spot, form the pose.
  handTau = 190;
  handTgt.copy(sw.from);
  for (let i = 0; i < 5; i++) fTgt[i] = f[i];
  glTgt = 1.7;

  // Phase 2 — sweep: snap the hand through to the follow-through (palm stays to cam).
  const t1 = setTimeout(() => {
    handTau = 95;
    handTgt.copy(sw.to);
  }, 230);

  // Phase 3 — relax back to idle.
  const t2 = setTimeout(() => {
    handTau = 330;
    handTgt.copy(IDLE_HAND);
    for (let i = 0; i < 5; i++) fTgt[i] = IDLE_F[i];
    glTgt = 0;
  }, 230 + 300 + 360);

  playGesture._t = [t1, t2];
}
