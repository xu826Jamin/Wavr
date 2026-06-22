import * as THREE from 'three';

let renderer, scene, camera, animRaf, lastFrameTime = 0;
let initDone = false;

// Character parts
let characterGroup, headGroup, shoulder, elbow, wrist;
let fingers = [];
let gestureLight;

// ---- Animation state ----
// The arm is AIMED along a unit direction vector (from shoulder toward the hand).
// This is what makes left/right/up/down accurate: the hand literally ends up in
// the chosen direction, instead of being faked with body rotation.
const UP_BONE = new THREE.Vector3(0, -1, 0); // arm meshes extend along local -Y
const curDir  = new THREE.Vector3(0.45, -0.85, 0.25).normalize();
const tgtDir  = new THREE.Vector3(0.45, -0.85, 0.25).normalize();
const _aim    = new THREE.Vector3();

const fCur = [0.28, 0.28, 0.28, 0.28, 0.28];
const fTgt = [0.28, 0.28, 0.28, 0.28, 0.28];
let elbowCur = 0.55, elbowTgt = 0.55; // forearm bend (radians)
let glCur = 0, glTgt = 0, breathT = 0;
let dirTau = 300; // smoothing time-constant (ms); lowered during the swipe for snap

// Resting direction (arm relaxed at the side, slightly forward)
const IDLE_DIR = new THREE.Vector3(0.45, -0.85, 0.25).normalize();
const IDLE_F   = [0.28, 0.28, 0.28, 0.28, 0.28];

// ---- Pose library (finger curls only; placement comes from the swipe) ----
// finger order: [thumb, index, middle, ring, pinky]; 0 = extended, ~1.35 = curled
const POSE_FINGERS = {
  open:     [0,    0,    0,    0,    0   ],
  closed:   [1.15, 1.4,  1.4,  1.4,  1.4 ],
  pointing: [1.15, 0,    1.4,  1.4,  1.4 ],
  victory:  [1.15, 0,    0,    1.4,  1.4 ],
};

// ---- Swipe motion (wind-up -> follow-through), as aim directions ----
// +X = screen-right, +Y = up, +Z = toward camera. The shoulder sits on the
// character's right (+X), so reaching to -X crosses the body to the left.
const v = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const SWIPES = {
  up:    { from: v(0.32, 0.45, 0.45), to: v(0.18, 1.00, 0.12), elbow: 0.30 },
  down:  { from: v(0.32, 0.95, 0.30), to: v(0.55,-0.05, 0.55), elbow: 0.85 },
  left:  { from: v(0.95, 0.55, 0.25), to: v(-0.78,0.62, 0.30), elbow: 0.35 },
  right: { from: v(-0.55,0.60, 0.30), to: v(0.95, 0.55, 0.20), elbow: 0.35 },
};

// ---- Helpers ----
let gMap;
function makeGradMap() {
  const d = new Uint8Array([0, 110, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RedFormat);
  t.needsUpdate = true;
  return t;
}
const toon  = c => new THREE.MeshToonMaterial({ color:c, gradientMap:gMap });
const basic = (c, o={}) => new THREE.MeshBasicMaterial({ color:c, ...o });
const lerp  = (a, b, t) => a + (b - a) * t;
function outline(mesh, parent, s=1.06) {
  const m = new THREE.Mesh(mesh.geometry, basic(0x0c0c0c, { side:THREE.BackSide }));
  m.scale.setScalar(s);
  parent.add(m);
}

// ---- Build character ----
function buildCharacter() {
  characterGroup = new THREE.Group();
  scene.add(characterGroup);

  const mSkin   = toon(0xd4a878); // warm peach
  const mHair   = toon(0x18100e);
  const mHood   = toon(0x1e2a3a); // dark navy
  const mSleeve = toon(0x192433);
  const mAccent = toon(0x4ade80); // Wavr green
  const mBand   = toon(0x38b868);
  const mWhite  = toon(0xf2f2f2);
  const mIris   = toon(0x1a1045);
  const mPupil  = toon(0x060608);

  // Legs
  const legGeo = new THREE.CylinderGeometry(0.08, 0.085, 0.28, 12);
  [-0.095, 0.095].forEach(x => {
    const l = new THREE.Mesh(legGeo, mHood);
    l.position.set(x, -0.56, 0);
    characterGroup.add(l);
    outline(l, characterGroup, 1.05);
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.24), mHood);
  torso.position.y = -0.03;
  characterGroup.add(torso);
  outline(torso, characterGroup, 1.04);

  // Left (idle) arm bump for balance
  const lBump = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mSleeve);
  lBump.position.set(-0.25, 0.06, 0);
  lBump.scale.set(1, 1.35, 0.8);
  characterGroup.add(lBump);
  outline(lBump, characterGroup, 1.05);

  // Collar accent
  const col = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.26), mAccent);
  col.position.set(0, 0.165, 0);
  characterGroup.add(col);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.063, 0.068, 0.11, 12), mSkin);
  neck.position.y = 0.235;
  characterGroup.add(neck);

  // ---- Head ----
  headGroup = new THREE.Group();
  headGroup.position.y = 0.42;
  characterGroup.add(headGroup);

  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 20), mSkin);
  headMesh.scale.set(1.05, 0.97, 1);
  headGroup.add(headMesh);
  outline(headMesh, headGroup, 1.04);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.315, 22, 16, 0, Math.PI*2, 0, Math.PI*0.52), mHair
  );
  hairCap.position.y = 0.025;
  headGroup.add(hairCap);

  [{x:-0.27, rz:0.13},{x:0.27, rz:-0.13}].forEach(({x,rz}) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mHair);
    m.position.set(x, -0.13, -0.04);
    m.scale.set(0.52, 1.4, 0.45);
    m.rotation.z = rz;
    headGroup.add(m);
  });

  const backHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 18, 14, 0, Math.PI*2, Math.PI*0.38, Math.PI*0.58), mHair
  );
  backHair.position.y = -0.04;
  headGroup.add(backHair);

  const bangs = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mHair);
  bangs.position.set(0, 0.21, 0.24);
  bangs.scale.set(1.6, 0.45, 0.72);
  headGroup.add(bangs);

  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.022, 8, 30, Math.PI*1.18), mBand
  );
  band.position.y = 0.09;
  band.rotation.x = Math.PI/2 - 0.12;
  band.rotation.y = -0.05;
  headGroup.add(band);

  const eyeY = -0.038, eyeZ = 0.258;
  [[-0.105, 1],[0.105, -1]].forEach(([xOff, side]) => {
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), mWhite);
    sc.position.set(xOff, eyeY, eyeZ);
    sc.scale.set(1, 1.18, 0.58);
    headGroup.add(sc);
    outline(sc, headGroup, 1.08);

    const ir = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), mIris);
    ir.position.set(xOff, eyeY+0.002, eyeZ+0.016);
    ir.scale.set(1, 1.12, 0.42);
    headGroup.add(ir);

    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.029, 10, 8), mPupil);
    pu.position.set(xOff, eyeY-0.003, eyeZ+0.03);
    pu.scale.set(1, 1.05, 0.26);
    headGroup.add(pu);

    const h1 = new THREE.Mesh(new THREE.SphereGeometry(0.013, 7, 5), basic(0xffffff));
    h1.position.set(xOff + side*0.023, eyeY+0.026, eyeZ+0.035);
    headGroup.add(h1);
  });

  const bMat = basic(0xff9aaa, { transparent:true, opacity:0.2 });
  [-0.18, 0.18].forEach(x => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), bMat);
    b.position.set(x, eyeY-0.014, eyeZ-0.02);
    b.scale.set(1.3, 0.55, 0.28);
    headGroup.add(b);
  });

  // ---- Right arm ----
  // shoulder is AIMED via quaternion each frame; its position never changes.
  shoulder = new THREE.Object3D();
  shoulder.position.set(0.2, 0.12, 0.02);
  characterGroup.add(shoulder);

  const uArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.058, 0.27, 12), mSleeve);
  uArm.position.y = -0.135;
  shoulder.add(uArm);
  outline(uArm, shoulder, 1.06);

  // Elbow: hinges the forearm. rotation.x bends it forward (toward camera).
  elbow = new THREE.Object3D();
  elbow.position.y = -0.27;
  shoulder.add(elbow);

  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.046, 0.23, 12), mSkin);
  lArm.position.y = -0.115;
  elbow.add(lArm);
  outline(lArm, elbow, 1.06);

  const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.026, 12), mAccent);
  wb.position.y = -0.228;
  elbow.add(wb);

  // Wrist + hand. Palm faces the forearm's "down" so an open hand reads clearly.
  wrist = new THREE.Object3D();
  wrist.position.y = -0.255;
  elbow.add(wrist);

  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.06), mSkin);
  palm.position.y = -0.055;
  wrist.add(palm);
  outline(palm, wrist, 1.05);

  const fDefs = [
    { x:-0.082, y:-0.085, rz: 0.7,  len:0.07 }, // thumb (splays out)
    { x:-0.042, y:-0.125, rz: 0,    len:0.082 },
    { x:-0.012, y:-0.130, rz: 0,    len:0.088 },
    { x: 0.018, y:-0.126, rz: 0,    len:0.080 },
    { x: 0.046, y:-0.114, rz: 0,    len:0.066 },
  ];
  fingers = [];
  fDefs.forEach(fd => {
    const piv = new THREE.Object3D();
    piv.position.set(fd.x, fd.y, 0);
    piv.rotation.z = fd.rz;
    wrist.add(piv);
    const fMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.013, fd.len, 8), mSkin);
    fMesh.position.y = -fd.len / 2;
    piv.add(fMesh);
    outline(fMesh, piv, 1.12);
    fingers.push({ piv, len: fd.len });
  });

  gestureLight = new THREE.PointLight(0x4ade80, 0, 1.8);
  gestureLight.position.set(0.5, 0.3, 0.7);
  scene.add(gestureLight);
}

// ---- Init ----
export function initMascot(canvasEl) {
  if (initDone) return;
  initDone = true;
  gMap = makeGradMap();

  renderer = new THREE.WebGLRenderer({ canvas:canvasEl, antialias:true, alpha:true });
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
  scene.fog = new THREE.FogExp2(0x06060f, 0.22);

  const { clientWidth:w=400, clientHeight:h=300 } = canvasEl.parentElement;
  camera = new THREE.PerspectiveCamera(42, w/h, 0.1, 20);
  camera.position.set(0, 0.22, 2.7);
  camera.lookAt(0, 0.12, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(-1.0, 2.5, 2.2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.22);
  fill.position.set(1.5, 0.5, 1.0);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0x4ade80, 0.13);
  rim.position.set(0.5, -0.5, -1.5);
  scene.add(rim);

  buildCharacter();
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

  // Smooth the aim direction toward the target (frame-rate independent).
  const aDir = 1 - Math.exp(-dt / dirTau);
  curDir.lerp(tgtDir, aDir).normalize();

  if (shoulder) {
    // subtle idle bob layered on top of the current aim
    _aim.copy(curDir);
    _aim.x += Math.sin(breathT * 0.9) * 0.014;
    _aim.y += Math.sin(breathT * 1.3) * 0.011;
    _aim.normalize();
    shoulder.quaternion.setFromUnitVectors(UP_BONE, _aim);
  }

  const aGen = 1 - Math.exp(-dt / 220);
  elbowCur = lerp(elbowCur, elbowTgt, aGen);
  if (elbow) elbow.rotation.x = elbowCur;

  for (let i = 0; i < 5; i++) {
    fCur[i] = lerp(fCur[i], fTgt[i], aGen);
    if (fingers[i]) fingers[i].piv.rotation.x = -fCur[i];
  }

  glCur = lerp(glCur, glTgt, 1 - Math.exp(-dt / 140));
  if (gestureLight) gestureLight.intensity = glCur;

  if (headGroup) {
    headGroup.position.y = 0.42 + Math.sin(breathT * 0.72) * 0.007;
  }
}

// ---- Play gesture ----
export function playGesture(pose, dir) {
  if (!initDone) return;
  if (playGesture._t) playGesture._t.forEach(clearTimeout);

  const f  = POSE_FINGERS[pose] || POSE_FINGERS.open;
  const sw = SWIPES[dir] || SWIPES.up;

  // Phase 1 — wind-up: raise the hand to the anticipation position, form the pose.
  dirTau = 200;
  tgtDir.copy(sw.from);
  elbowTgt = sw.elbow + 0.25;
  for (let i = 0; i < 5; i++) fTgt[i] = f[i];
  glTgt = 1.6;

  // Phase 2 — sweep: snap the hand through to the follow-through direction.
  const t1 = setTimeout(() => {
    dirTau = 105;
    tgtDir.copy(sw.to);
    elbowTgt = sw.elbow;
  }, 240);

  // Phase 3 — return to a relaxed idle.
  const t2 = setTimeout(() => {
    dirTau = 340;
    tgtDir.copy(IDLE_DIR);
    elbowTgt = 0.55;
    for (let i = 0; i < 5; i++) fTgt[i] = IDLE_F[i];
    glTgt = 0;
  }, 240 + 320 + 360);

  playGesture._t = [t1, t2];
}
