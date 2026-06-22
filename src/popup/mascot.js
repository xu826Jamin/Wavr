import * as THREE from 'three';

let renderer, scene, camera, animRaf, lastFrameTime = 0;
let initDone = false;

// Character parts
let characterGroup, headGroup, armPivot, elbowPivot, handPivot;
let fingers = [];
let gestureLight;

// Animation state — shoulder + elbow + body
const sh  = { cur: { rx:-0.08, ry:0, rz:1.7 },  tgt: { rx:-0.08, ry:0, rz:1.7  } };
const el  = { cur: { rz:-1.0 },                   tgt: { rz:-1.0 } };
const fCur = [0.28, 0.28, 0.28, 0.28, 0.28];
const fTgt = [0.28, 0.28, 0.28, 0.28, 0.28];
let glCur = 0, glTgt = 0, breathT = 0;
const bodyRot = { cur:0, tgt:0 };
const headRot = { cur:0, tgt:0 };

// ---- Pose library ----
// sh.rz:  1.7 = arm at side (nearly horizontal shoulder), 2.0-2.5 = arm raised
// el.rz:  negative = forearm drops down (bent), 0 = straight arm
// Key: elbowPivot.rotation.Z is the correct visible-bend axis when shoulder rotates in Z
const POSES = {
  idle:     { sh:{rx:-0.08,ry:0,rz:1.7 }, el:{rz:-1.0}, f:[0.28,0.28,0.28,0.28,0.28] },
  open:     { sh:{rx:-0.32,ry:0,rz:2.0 }, el:{rz:0   }, f:[0,   0,   0,   0,   0   ] },
  closed:   { sh:{rx:-0.26,ry:0,rz:1.95}, el:{rz:0.08}, f:[1.3, 1.3, 1.3, 1.3, 1.3 ] },
  pointing: { sh:{rx:-0.36,ry:0,rz:2.05}, el:{rz:-0.1}, f:[1.3, 0,   1.3, 1.3, 1.3 ] },
  victory:  { sh:{rx:-0.36,ry:0,rz:2.05}, el:{rz:-0.1}, f:[1.3, 0,   0,   1.3, 1.3 ] },
};

// Swipe end-states — arm stays in socket, only rotations change
// bodyY: character turns to sell the direction (arm sweeps with body)
const SWIPES = {
  up:    { sh:{rx:-0.25,ry:0,   rz:2.5 }, el:{rz:0.12 }, bodyY:0,     headY:0     },
  down:  { sh:{rx:-0.1, ry:0,   rz:1.72}, el:{rz:-1.55}, bodyY:0,     headY:0     },
  left:  { sh:{rx:-0.3, ry:0,   rz:2.0 }, el:{rz:0.05 }, bodyY:0.28,  headY:0.22  },
  right: { sh:{rx:-0.3, ry:0,   rz:2.0 }, el:{rz:0.05 }, bodyY:-0.28, headY:-0.22 },
};

// ---- Helpers ----
let gMap;
function makeGradMap() {
  const d = new Uint8Array([0, 100, 255]);
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

  // Colors — distinct from near-black bg so the character reads clearly
  const mSkin   = toon(0xd4a878); // warm peach — clearly visible
  const mHair   = toon(0x18100e);
  const mHood   = toon(0x1e2a3a); // dark navy — distinct from bg
  const mSleeve = toon(0x192433);
  const mAccent = toon(0x4ade80); // Wavr green
  const mBand   = toon(0x38b868); // slightly muted green headband
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
  const torsoGeo = new THREE.BoxGeometry(0.34, 0.38, 0.24);
  const torso = new THREE.Mesh(torsoGeo, mHood);
  torso.position.y = -0.03;
  characterGroup.add(torso);
  outline(torso, characterGroup, 1.04);

  // Left arm bump (non-animated, gives body balance)
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

  // Hair cap
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.315, 22, 16, 0, Math.PI*2, 0, Math.PI*0.52), mHair
  );
  hairCap.position.y = 0.025;
  headGroup.add(hairCap);

  // Side hair panels
  [{x:-0.27, rz:0.13},{x:0.27, rz:-0.13}].forEach(({x,rz}) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), mHair);
    m.position.set(x, -0.13, -0.04);
    m.scale.set(0.52, 1.4, 0.45);
    m.rotation.z = rz;
    headGroup.add(m);
  });

  // Back hair
  const backHair = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 18, 14, 0, Math.PI*2, Math.PI*0.38, Math.PI*0.58), mHair
  );
  backHair.position.y = -0.04;
  headGroup.add(backHair);

  // Bangs
  const bangs = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mHair);
  bangs.position.set(0, 0.21, 0.24);
  bangs.scale.set(1.6, 0.45, 0.72);
  headGroup.add(bangs);

  // Headband (green, inspired by ninja bandana in reference)
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.022, 8, 30, Math.PI*1.18), mBand
  );
  band.position.y = 0.09;
  band.rotation.x = Math.PI/2 - 0.12;
  band.rotation.y = -0.05;
  headGroup.add(band);

  // Eyes
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

  // Blush
  const bMat = basic(0xff9aaa, { transparent:true, opacity:0.2 });
  [-0.18, 0.18].forEach(x => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 6), bMat);
    b.position.set(x, eyeY-0.014, eyeZ-0.02);
    b.scale.set(1.3, 0.55, 0.28);
    headGroup.add(b);
  });

  // ---- Right arm (character's right = viewer's right in Three.js default cam) ----
  // armPivot.position is SET ONCE — never modified during animation
  armPivot = new THREE.Object3D();
  armPivot.position.set(0.215, 0.1, 0);
  characterGroup.add(armPivot);

  // Upper arm
  const uArm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.058, 0.26, 12), mSleeve);
  uArm.position.y = -0.13;
  armPivot.add(uArm);
  outline(uArm, armPivot, 1.06);

  // Elbow pivot at end of upper arm
  // CRITICAL: rotate elbowPivot.rotation.Z — this is the correct bend axis.
  // When armPivot.rz rotates the shoulder in the XY plane, the local Z axis of
  // elbowPivot stays aligned with world Z, so rz produces a visible XY-plane bend
  // that the front camera clearly sees as an elbow bending up or down.
  elbowPivot = new THREE.Object3D();
  elbowPivot.position.y = -0.26;
  armPivot.add(elbowPivot);

  // Lower arm / forearm
  const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.046, 0.23, 12), mSkin);
  lArm.position.y = -0.115;
  elbowPivot.add(lArm);
  outline(lArm, elbowPivot, 1.06);

  // Wristband
  const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.026, 12), mAccent);
  wb.position.y = -0.228;
  elbowPivot.add(wb);

  // Hand pivot
  handPivot = new THREE.Object3D();
  handPivot.position.y = -0.255;
  elbowPivot.add(handPivot);

  // Palm
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.102, 0.062), mSkin);
  palm.position.y = -0.051;
  handPivot.add(palm);
  outline(palm, handPivot, 1.06);

  // Fingers
  const fDefs = [
    { x:-0.073, y:-0.103, rz:0.36, len:0.066 },
    { x:-0.037, y:-0.118, rz:0,    len:0.076 },
    { x:-0.009, y:-0.122, rz:0,    len:0.080 },
    { x: 0.019, y:-0.118, rz:0,    len:0.074 },
    { x: 0.044, y:-0.107, rz:0,    len:0.062 },
  ];
  fingers = [];
  fDefs.forEach(fd => {
    const piv = new THREE.Object3D();
    piv.position.set(fd.x, fd.y, 0);
    piv.rotation.z = fd.rz;
    handPivot.add(piv);
    const fMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, fd.len, 8), mSkin);
    fMesh.position.y = -fd.len / 2;
    piv.add(fMesh);
    outline(fMesh, piv, 1.12);
    fingers.push(piv);
  });

  gestureLight = new THREE.PointLight(0x4ade80, 0, 1.8);
  gestureLight.position.set(0.5, 0.1, 0.6);
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
  camera.position.set(0, 0.22, 2.65);
  camera.lookAt(0, 0.14, 0);

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

// ---- Loop (30 fps) ----
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
  const a = 1 - Math.pow(0.002, dt / 450);

  sh.cur.rx = lerp(sh.cur.rx, sh.tgt.rx, a);
  sh.cur.ry = lerp(sh.cur.ry, sh.tgt.ry, a);
  sh.cur.rz = lerp(sh.cur.rz, sh.tgt.rz, a);
  if (armPivot) {
    armPivot.rotation.x = sh.cur.rx;
    armPivot.rotation.y = sh.cur.ry;
    armPivot.rotation.z = sh.cur.rz;
  }

  el.cur.rz = lerp(el.cur.rz, el.tgt.rz, a);
  if (elbowPivot) elbowPivot.rotation.z = el.cur.rz;

  for (let i = 0; i < 5; i++) {
    fCur[i] = lerp(fCur[i], fTgt[i], a);
    if (fingers[i]) fingers[i].rotation.x = -fCur[i];
  }

  glCur = lerp(glCur, glTgt, a * 2);
  if (gestureLight) gestureLight.intensity = glCur;

  bodyRot.cur = lerp(bodyRot.cur, bodyRot.tgt, a);
  headRot.cur = lerp(headRot.cur, headRot.tgt, a * 0.9);
  if (characterGroup) characterGroup.rotation.y = bodyRot.cur;

  breathT += dt * 0.001;
  if (headGroup) {
    headGroup.rotation.y = headRot.cur;
    headGroup.position.y = 0.42 + Math.sin(breathT * 0.72) * 0.007;
  }
}

// ---- Play gesture ----
export function playGesture(pose, dir) {
  if (!initDone) return;
  if (playGesture._t) playGesture._t.forEach(clearTimeout);

  const p  = POSES[pose] || POSES.open;
  const sw = SWIPES[dir]  || SWIPES.up;

  // Step 1: pose
  sh.tgt.rx = p.sh.rx; sh.tgt.ry = p.sh.ry; sh.tgt.rz = p.sh.rz;
  el.tgt.rz = p.el.rz;
  for (let i = 0; i < 5; i++) fTgt[i] = p.f[i];
  glTgt = 1.8;
  bodyRot.tgt = 0; headRot.tgt = 0;

  // Step 2: swipe
  const t1 = setTimeout(() => {
    sh.tgt.rx = sw.sh.rx; sh.tgt.ry = sw.sh.ry; sh.tgt.rz = sw.sh.rz;
    el.tgt.rz = sw.el.rz;
    bodyRot.tgt = sw.bodyY;
    headRot.tgt = sw.headY;
  }, 380);

  // Step 3: return to idle
  const t2 = setTimeout(() => {
    const id = POSES.idle;
    sh.tgt.rx = id.sh.rx; sh.tgt.ry = id.sh.ry; sh.tgt.rz = id.sh.rz;
    el.tgt.rz = id.el.rz;
    for (let i = 0; i < 5; i++) fTgt[i] = id.f[i];
    glTgt = 0; bodyRot.tgt = 0; headRot.tgt = 0;
  }, 1150);

  playGesture._t = [t1, t2];
}
