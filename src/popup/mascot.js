import * as THREE from 'three';

// ---- Runtime ----
let renderer, scene, camera, animRaf, lastFrameTime = 0;
let initDone = false;

// ---- Character parts ----
let characterGroup, headGroup, armPivot, handPivot;
let fingers = [];
let gestureLight;

// ---- Animation state ----
// Arm rotation lerp — using Z as the primary "raise" axis (correct for side-of-body shoulder)
const arm = {
  cur: { rx: -0.1, ry: 0, rz: 0.22 },
  tgt: { rx: -0.1, ry: 0, rz: 0.22 },
};
const fCur = [0.28, 0.28, 0.28, 0.28, 0.28];
const fTgt = [0.28, 0.28, 0.28, 0.28, 0.28];
let glCur = 0, glTgt = 0;
let breathT = 0;
const headRot = { cur: 0, tgt: 0 }; // Y rotation (cute head turn for L/R swipes)

// ---- Pose Library ----
// rz is the main raise axis: rz≈0.2 = arm at side, rz≈2.1 = arm raised
// rx tilts arm forward (toward camera): -0.3 looks natural when raised
// NO position changes — swipe is always pure rotation
const POSES = {
  idle:     { arm: { rx: -0.1,  ry: 0,  rz: 0.22 }, f: [0.28, 0.28, 0.28, 0.28, 0.28] },
  open:     { arm: { rx: -0.32, ry: 0,  rz: 2.05 }, f: [0,    0,    0,    0,    0    ] },
  closed:   { arm: { rx: -0.28, ry: 0,  rz: 1.95 }, f: [1.3,  1.3,  1.3,  1.3,  1.3 ] },
  pointing: { arm: { rx: -0.38, ry: 0,  rz: 2.1  }, f: [1.3,  0,    1.3,  1.3,  1.3 ] },
  victory:  { arm: { rx: -0.38, ry: 0,  rz: 2.1  }, f: [1.3,  0,    0,    1.3,  1.3 ] },
};

// Swipe end rotations — arm STAYS in socket, only rotates further
const SWIPE_END = {
  up:    { rx: -0.28, ry: 0,    rz: 2.55 },  // arm pushes higher
  down:  { rx: -0.08, ry: 0,    rz: 0.38 },  // arm drops below rest
  left:  { rx: -0.28, ry: 0.62, rz: 2.0  },  // arm sweeps across body
  right: { rx: -0.28, ry:-0.52, rz: 1.85 },  // arm sweeps outward
};

// Head Y turn for left/right (chibi head turn — no camera orbit)
const HEAD_TURN = { up: 0, down: 0, left: 0.32, right: -0.32 };

// ---- Gradient map (3-step toon) ----
function makeGradMap() {
  const d = new Uint8Array([0, 100, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.needsUpdate = true;
  return t;
}

let gMap;
const toon  = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: gMap });
const basic = (c, o = {}) => new THREE.MeshBasicMaterial({ color: c, ...o });
const lerp  = (a, b, t) => a + (b - a) * t;

function addOutline(mesh, parent, s = 1.06) {
  const m = new THREE.Mesh(mesh.geometry, basic(0x0b0b0b, { side: THREE.BackSide }));
  m.scale.setScalar(s);
  parent.add(m);
}

// ---- Build Character ----
function buildCharacter() {
  characterGroup = new THREE.Group();
  scene.add(characterGroup);

  // Materials
  const mSkin   = toon(0xc8997a); // warm skin
  const mHair   = toon(0x100c0c); // very dark, slight warm tint
  const mBody   = toon(0x181818); // near-black hoodie
  const mSleeve = toon(0x1e1e1e); // slightly lighter sleeve
  const mAccent = toon(0x4ade80); // wavr green accent
  const mWhite  = toon(0xefefef); // eye white
  const mIris   = toon(0x1a1050); // deep purple-blue iris
  const mPupil  = toon(0x060608); // near-black pupil
  const mHilit  = basic(0xffffff); // specular dot

  // ---- Legs (tiny chibi stumps, barely in frame) ----
  const legGeo = new THREE.CylinderGeometry(0.075, 0.08, 0.3, 12);
  [-0.09, 0.09].forEach(x => {
    const leg = new THREE.Mesh(legGeo, mBody);
    leg.position.set(x, -0.58, 0);
    characterGroup.add(leg);
    addOutline(leg, characterGroup, 1.05);
  });

  // ---- Torso (compact chibi body) ----
  const torsoGeo = new THREE.BoxGeometry(0.32, 0.36, 0.22);
  const torso = new THREE.Mesh(torsoGeo, mBody);
  torso.position.y = -0.04;
  characterGroup.add(torso);
  addOutline(torso, characterGroup, 1.04);

  // Collar accent strip
  const colGeo = new THREE.BoxGeometry(0.12, 0.02, 0.24);
  const col = new THREE.Mesh(colGeo, mAccent);
  col.position.set(0, 0.158, 0);
  characterGroup.add(col);

  // ---- Neck ----
  const neckGeo = new THREE.CylinderGeometry(0.06, 0.065, 0.1, 12);
  const neck = new THREE.Mesh(neckGeo, mSkin);
  neck.position.y = 0.225;
  characterGroup.add(neck);

  // ---- Head (BIG — chibi proportion) ----
  headGroup = new THREE.Group();
  headGroup.position.y = 0.42;
  characterGroup.add(headGroup);

  // Head sphere (slightly wider than tall for cute look)
  const headGeo = new THREE.SphereGeometry(0.3, 24, 20);
  const headMesh = new THREE.Mesh(headGeo, mSkin);
  headMesh.scale.set(1.04, 0.96, 1);
  headGroup.add(headMesh);
  addOutline(headMesh, headGroup, 1.04);

  // ---- Hair ----
  // Cap (top ~55% of sphere)
  const hairCapGeo = new THREE.SphereGeometry(0.315, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const hairCap = new THREE.Mesh(hairCapGeo, mHair);
  hairCap.position.y = 0.018;
  headGroup.add(hairCap);

  // Side hair panels — elongated ovals hanging at cheeks
  [{x:-0.26, rz: 0.12}, {x: 0.26, rz: -0.12}].forEach(({x, rz}) => {
    const g = new THREE.SphereGeometry(0.18, 12, 10);
    const m = new THREE.Mesh(g, mHair);
    m.position.set(x, -0.14, -0.04);
    m.scale.set(0.52, 1.45, 0.45);
    m.rotation.z = rz;
    headGroup.add(m);
  });

  // Back hair (covers back of head + hangs slightly)
  const backGeo = new THREE.SphereGeometry(0.32, 18, 14, 0, Math.PI * 2, Math.PI * 0.38, Math.PI * 0.58);
  const back = new THREE.Mesh(backGeo, mHair);
  back.position.y = -0.04;
  headGroup.add(back);

  // Front fringe / bangs
  const bangsGeo = new THREE.SphereGeometry(0.13, 10, 8);
  const bangs = new THREE.Mesh(bangsGeo, mHair);
  bangs.position.set(0, 0.22, 0.24);
  bangs.scale.set(1.65, 0.45, 0.7);
  headGroup.add(bangs);

  // ---- Eyes (large chibi / anime style) ----
  // Eyes placed in LOWER half of face — big forehead is key to chibi look
  const eyeY = -0.04;
  const eyeZ =  0.26;

  [[-0.105, 1], [0.105, -1]].forEach(([xOff, side]) => {
    // Sclera (white)
    const scGeo = new THREE.SphereGeometry(0.072, 16, 12);
    const sc = new THREE.Mesh(scGeo, mWhite);
    sc.position.set(xOff, eyeY, eyeZ);
    sc.scale.set(1, 1.18, 0.6);
    headGroup.add(sc);
    addOutline(sc, headGroup, 1.08);

    // Iris (large dark circle, ~75% of eye width)
    const irGeo = new THREE.SphereGeometry(0.054, 14, 10);
    const ir = new THREE.Mesh(irGeo, mIris);
    ir.position.set(xOff, eyeY + 0.002, eyeZ + 0.016);
    ir.scale.set(1, 1.12, 0.44);
    headGroup.add(ir);

    // Pupil
    const puGeo = new THREE.SphereGeometry(0.03, 10, 8);
    const pu = new THREE.Mesh(puGeo, mPupil);
    pu.position.set(xOff, eyeY - 0.003, eyeZ + 0.03);
    pu.scale.set(1, 1.05, 0.28);
    headGroup.add(pu);

    // Main highlight (large, catches eye)
    const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 7, 5), mHilit);
    h1.position.set(xOff + side * 0.024, eyeY + 0.026, eyeZ + 0.036);
    headGroup.add(h1);

    // Secondary small highlight
    const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 4), mHilit);
    h2.position.set(xOff - side * 0.018, eyeY - 0.022, eyeZ + 0.036);
    headGroup.add(h2);
  });

  // Blush marks (very subtle pink, characteristic of chibi)
  const blushMat = basic(0xff9aaa, { transparent: true, opacity: 0.2 });
  [-0.175, 0.175].forEach(x => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), blushMat);
    b.position.set(x, eyeY - 0.02, eyeZ - 0.01);
    b.scale.set(1.35, 0.55, 0.3);
    headGroup.add(b);
  });

  // ---- Arm (character's right, viewer's left) ----
  // IMPORTANT: armPivot position is set ONCE and never changed during animation.
  // ALL animation is pure rotation around this fixed pivot.
  armPivot = new THREE.Object3D();
  armPivot.position.set(0.22, 0.1, 0);
  characterGroup.add(armPivot);

  // Upper arm (sleeve)
  const uArmGeo = new THREE.CylinderGeometry(0.068, 0.056, 0.25, 12);
  const uArm = new THREE.Mesh(uArmGeo, mSleeve);
  uArm.position.y = -0.125;
  armPivot.add(uArm);
  addOutline(uArm, armPivot, 1.06);

  // Lower arm / forearm (skin)
  const lArmGeo = new THREE.CylinderGeometry(0.054, 0.044, 0.22, 12);
  const lArm = new THREE.Mesh(lArmGeo, mSkin);
  lArm.position.y = -0.375;
  armPivot.add(lArm);
  addOutline(lArm, armPivot, 1.06);

  // Wrist accent band
  const wbGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.025, 12);
  const wb = new THREE.Mesh(wbGeo, mAccent);
  wb.position.y = -0.49;
  armPivot.add(wb);

  // Hand pivot (at wrist, CHILD of armPivot — so arm + hand always move together)
  handPivot = new THREE.Object3D();
  handPivot.position.y = -0.525;
  armPivot.add(handPivot);

  // Palm
  const palmGeo = new THREE.BoxGeometry(0.12, 0.1, 0.058);
  const palm = new THREE.Mesh(palmGeo, mSkin);
  palm.position.y = -0.05;
  handPivot.add(palm);
  addOutline(palm, handPivot, 1.06);

  // Fingers: thumb, index, middle, ring, pinky
  const fDefs = [
    { x: -0.072, y: -0.1,   rz: 0.36, len: 0.065 }, // thumb
    { x: -0.036, y: -0.115, rz: 0,    len: 0.075 }, // index
    { x: -0.009, y: -0.118, rz: 0,    len: 0.079 }, // middle
    { x:  0.018, y: -0.114, rz: 0,    len: 0.073 }, // ring
    { x:  0.043, y: -0.106, rz: 0,    len: 0.06  }, // pinky
  ];

  fingers = [];
  fDefs.forEach(fd => {
    const pivot = new THREE.Object3D();
    pivot.position.set(fd.x, fd.y, 0);
    pivot.rotation.z = fd.rz;
    handPivot.add(pivot);
    const fGeo = new THREE.CylinderGeometry(0.015, 0.012, fd.len, 8);
    const fMesh = new THREE.Mesh(fGeo, mSkin);
    fMesh.position.y = -fd.len / 2;
    pivot.add(fMesh);
    addOutline(fMesh, pivot, 1.12);
    fingers.push(pivot);
  });

  // Gesture glow light (near hand area)
  gestureLight = new THREE.PointLight(0x4ade80, 0, 1.6);
  gestureLight.position.set(0.3, -0.3, 0.6);
  scene.add(gestureLight);
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
    const p = canvasEl.parentElement;
    if (!p) return;
    renderer.setSize(p.clientWidth, p.clientHeight, false);
    if (camera) { camera.aspect = p.clientWidth / p.clientHeight; camera.updateProjectionMatrix(); }
  }
  resize();
  new ResizeObserver(resize).observe(canvasEl.parentElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, 0.28);

  const { clientWidth: w = 400, clientHeight: h = 300 } = canvasEl.parentElement;
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 20);
  // Fixed front-facing camera — never changes angle during gestures
  camera.position.set(0, 0.28, 2.75);
  camera.lookAt(0, 0.18, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(-1.2, 2.5, 2.0);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0xaaccff, 0.18);
  fill.position.set(1.5, 0.5, 1.0);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x4ade80, 0.14);
  rim.position.set(0.8, -0.5, -1.5);
  scene.add(rim);

  buildCharacter();
  startLoop();
}

// ---- Render Loop (30 fps) ----
function startLoop() {
  const INTERVAL = 1000 / 30;
  function tick(now) {
    animRaf = requestAnimationFrame(tick);
    const dt = now - lastFrameTime;
    if (dt < INTERVAL) return;
    lastFrameTime = now - (dt % INTERVAL);
    update(Math.min(dt, 100));
    renderer.render(scene, camera);
  }
  animRaf = requestAnimationFrame(tick);
}

// ---- Update ----
function update(dt) {
  // Frame-rate independent lerp (~400ms settle)
  const a = 1 - Math.pow(0.001, dt / 450);

  // Arm rotation
  arm.cur.rx = lerp(arm.cur.rx, arm.tgt.rx, a);
  arm.cur.ry = lerp(arm.cur.ry, arm.tgt.ry, a);
  arm.cur.rz = lerp(arm.cur.rz, arm.tgt.rz, a);

  if (armPivot) {
    armPivot.rotation.x = arm.cur.rx;
    armPivot.rotation.y = arm.cur.ry;
    armPivot.rotation.z = arm.cur.rz;
    // armPivot.position is NEVER modified after buildCharacter — that was the socket bug
  }

  // Fingers
  for (let i = 0; i < 5; i++) {
    fCur[i] = lerp(fCur[i], fTgt[i], a);
    if (fingers[i]) fingers[i].rotation.x = -fCur[i]; // negative = curl toward viewer
  }

  // Gesture light
  glCur = lerp(glCur, glTgt, a * 2);
  if (gestureLight) gestureLight.intensity = glCur;

  // Head turn (cute chibi look)
  headRot.cur = lerp(headRot.cur, headRot.tgt, a * 0.8);
  if (headGroup) headGroup.rotation.y = headRot.cur;

  // Breathing: gentle head float
  breathT += dt * 0.001;
  const b = Math.sin(breathT * 0.72);
  if (headGroup) headGroup.position.y = 0.42 + b * 0.007;
}

// ---- Play Gesture ----
export function playGesture(pose, dir) {
  if (!initDone) return;

  // Cancel any in-progress animation
  if (playGesture._timers) playGesture._timers.forEach(clearTimeout);

  const p = POSES[pose] || POSES.open;
  const sw = SWIPE_END[dir] || SWIPE_END.up;

  // Step 1: move to pose
  arm.tgt.rx = p.arm.rx;
  arm.tgt.ry = p.arm.ry;
  arm.tgt.rz = p.arm.rz;
  for (let i = 0; i < 5; i++) fTgt[i] = p.f[i];
  glTgt = 1.8;
  headRot.tgt = HEAD_TURN[dir] ?? 0;

  // Step 2: swipe (arm swings in direction via rotation, stays in socket)
  const t1 = setTimeout(() => {
    arm.tgt.rx = sw.rx;
    arm.tgt.ry = sw.ry;
    arm.tgt.rz = sw.rz;
  }, 380);

  // Step 3: return to idle
  const t2 = setTimeout(() => {
    const idle = POSES.idle;
    arm.tgt.rx = idle.arm.rx;
    arm.tgt.ry = idle.arm.ry;
    arm.tgt.rz = idle.arm.rz;
    for (let i = 0; i < 5; i++) fTgt[i] = idle.f[i];
    glTgt = 0;
    headRot.tgt = 0;
  }, 1150);

  playGesture._timers = [t1, t2];
}
