import * as THREE from 'three';

// ---- Runtime State ----
let renderer, scene, camera, animRaf;
let lastFrameTime = 0;
let initDone = false;

// Character parts
let characterGroup, torsoMesh, headGroup;
let armPivot, handPivot;
let fingers = []; // 5 Object3Ds
let gestureLight;

// Animation targets & current values
const arm = {
  cur: { rx: 0.25, ry: 0, rz: 0.32, px: 0, py: 0 },
  tgt: { rx: 0.25, ry: 0, rz: 0.32, px: 0, py: 0 },
};
const fCur = [0.35, 0.35, 0.35, 0.35, 0.35];
const fTgt = [0.35, 0.35, 0.35, 0.35, 0.35];
let glCur = 0;
let glTgt = 0;
let breathT = 0;

const camCur = new THREE.Vector3(0, 0.08, 2.2);
const camTgt = new THREE.Vector3(0, 0.08, 2.2);

// ---- Pose Library ----
const POSES = {
  idle:     { arm: { rx: 0.25, ry: 0,    rz: 0.32  }, f: [0.35, 0.35, 0.35, 0.35, 0.35] },
  open:     { arm: { rx: -0.7, ry: -0.1, rz: 0.08  }, f: [0,    0,    0,    0,    0    ] },
  closed:   { arm: { rx: -0.6, ry: -0.1, rz: 0.12  }, f: [1.35, 1.35, 1.35, 1.35, 1.35] },
  pointing: { arm: { rx: -0.8, ry: -0.06,rz: 0.04  }, f: [1.35, 0,    1.35, 1.35, 1.35] },
  victory:  { arm: { rx: -0.8, ry: -0.06,rz: 0.04  }, f: [1.35, 0,    0,    1.35, 1.35] },
};

const CAM_FRONT = new THREE.Vector3(0,   0.08, 2.2);
const CAM_SIDE  = new THREE.Vector3(-1.3, 0.1, 1.65);
const CAM_SIDE_R = new THREE.Vector3(1.3, 0.1, 1.65);

const SWIPE_POS = {
  up:    { px: 0,     py: 0.3  },
  down:  { px: 0,     py: -0.3 },
  left:  { px: -0.32, py: 0    },
  right: { px: 0.32,  py: 0    },
};

// ---- Helpers ----
function makeGradientMap() {
  const data = new Uint8Array([0, 120, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.needsUpdate = true;
  return tex;
}

let gradMap;
function toonMat(color) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradMap });
}

function addOutline(mesh, parent, scale = 1.05) {
  const out = new THREE.Mesh(
    mesh.geometry,
    new THREE.MeshBasicMaterial({ color: 0x0c0c0c, side: THREE.BackSide })
  );
  out.scale.setScalar(scale);
  parent.add(out);
}

function lerpN(a, b, t) { return a + (b - a) * t; }

// ---- Character Build ----
function buildCharacter() {
  characterGroup = new THREE.Group();
  characterGroup.position.y = -0.18;
  scene.add(characterGroup);

  const matBody   = toonMat(0x1c1c1c);
  const matSkin   = toonMat(0xc49870);
  const matHair   = toonMat(0x0e0e0e);
  const matWhite  = toonMat(0xefefef);
  const matDark   = toonMat(0x101010);
  const matAccent = toonMat(0x4ade80);
  const matShirt  = toonMat(0x161616);

  // ---- Torso ----
  const torsoGeo = new THREE.BoxGeometry(0.38, 0.48, 0.22);
  torsoMesh = new THREE.Mesh(torsoGeo, matShirt);
  torsoMesh.position.y = -0.04;
  characterGroup.add(torsoMesh);
  addOutline(torsoMesh, characterGroup, 1.04);

  // Collar accent
  const collarGeo = new THREE.BoxGeometry(0.11, 0.025, 0.24);
  const collar = new THREE.Mesh(collarGeo, matAccent);
  collar.position.set(0, 0.195, 0);
  characterGroup.add(collar);

  // ---- Neck ----
  const neckGeo = new THREE.CylinderGeometry(0.068, 0.074, 0.11, 12);
  const neck = new THREE.Mesh(neckGeo, matSkin);
  neck.position.y = 0.24;
  characterGroup.add(neck);

  // ---- Head Group ----
  headGroup = new THREE.Group();
  headGroup.position.y = 0.395;
  characterGroup.add(headGroup);

  // Head sphere
  const headGeo = new THREE.SphereGeometry(0.19, 20, 16);
  const headMesh = new THREE.Mesh(headGeo, matSkin);
  headGroup.add(headMesh);
  addOutline(headMesh, headGroup, 1.04);

  // Hair cap
  const hairGeo = new THREE.SphereGeometry(0.197, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52);
  const hairMesh = new THREE.Mesh(hairGeo, matHair);
  hairMesh.position.y = 0.022;
  headGroup.add(hairMesh);

  // Eyes
  const eyeGeo   = new THREE.SphereGeometry(0.034, 10, 8);
  const pupilGeo  = new THREE.SphereGeometry(0.019, 8, 6);
  const glintGeo  = new THREE.SphereGeometry(0.007, 6, 4);

  [[-0.068, 1], [0.068, -1]].forEach(([xOff, side]) => {
    const eye = new THREE.Mesh(eyeGeo, matWhite);
    eye.position.set(xOff, 0.048, 0.158);
    headGroup.add(eye);

    const pupil = new THREE.Mesh(pupilGeo, matDark);
    pupil.position.set(xOff + side * 0.006, 0.046, 0.172);
    headGroup.add(pupil);

    const glint = new THREE.Mesh(glintGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(xOff + side * 0.012, 0.058, 0.176);
    headGroup.add(glint);
  });

  // ---- Right Arm (character's right, viewer's left) ----
  armPivot = new THREE.Object3D();
  armPivot.position.set(0.27, 0.14, 0);
  characterGroup.add(armPivot);

  // Upper arm
  const uArmGeo = new THREE.CylinderGeometry(0.067, 0.056, 0.3, 12);
  const uArm = new THREE.Mesh(uArmGeo, matBody);
  uArm.position.y = -0.15;
  armPivot.add(uArm);
  addOutline(uArm, armPivot, 1.06);

  // Lower arm
  const lArmGeo = new THREE.CylinderGeometry(0.054, 0.045, 0.27, 12);
  const lArm = new THREE.Mesh(lArmGeo, matSkin);
  lArm.position.y = -0.445;
  armPivot.add(lArm);
  addOutline(lArm, armPivot, 1.06);

  // Wrist accent band
  const wristGeo = new THREE.CylinderGeometry(0.052, 0.052, 0.028, 12);
  const wristBand = new THREE.Mesh(wristGeo, matAccent);
  wristBand.position.y = -0.575;
  armPivot.add(wristBand);

  // Hand pivot at wrist
  handPivot = new THREE.Object3D();
  handPivot.position.y = -0.635;
  armPivot.add(handPivot);

  // Palm
  const palmGeo = new THREE.BoxGeometry(0.135, 0.108, 0.065);
  const palm = new THREE.Mesh(palmGeo, matSkin);
  palm.position.y = -0.054;
  handPivot.add(palm);
  addOutline(palm, handPivot, 1.06);

  // Fingers: [thumb, index, middle, ring, pinky]
  const fingerDefs = [
    { x: -0.077, y: -0.108, rz:  0.38, len: 0.072 }, // thumb
    { x: -0.038, y: -0.12,  rz:  0,    len: 0.082 }, // index
    { x: -0.01,  y: -0.124, rz:  0,    len: 0.086 }, // middle
    { x:  0.018, y: -0.12,  rz:  0,    len: 0.080 }, // ring
    { x:  0.046, y: -0.111, rz:  0,    len: 0.066 }, // pinky
  ];

  fingers = [];
  fingerDefs.forEach((fd) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(fd.x, fd.y, 0);
    pivot.rotation.z = fd.rz;
    handPivot.add(pivot);

    const fGeo  = new THREE.CylinderGeometry(0.016, 0.013, fd.len, 8);
    const fMesh = new THREE.Mesh(fGeo, matSkin);
    fMesh.position.y = -fd.len / 2;
    pivot.add(fMesh);
    addOutline(fMesh, pivot, 1.1);

    fingers.push(pivot);
  });

  // ---- Gesture light (near raised hand) ----
  gestureLight = new THREE.PointLight(0x4ade80, 0, 1.4);
  gestureLight.position.set(0.22, -0.42, 0.4);
  scene.add(gestureLight);
}

// ---- Init ----
export function initMascot(canvasEl) {
  if (initDone) return;
  initDone = true;

  gradMap = makeGradientMap();

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  function resize() {
    const parent = canvasEl.parentElement;
    if (!parent) return;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    renderer.setSize(w, h, false);
    if (camera) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  resize();
  new ResizeObserver(resize).observe(canvasEl.parentElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060606, 0.3);

  const w = canvasEl.parentElement.clientWidth || 400;
  const h = canvasEl.parentElement.clientHeight || 300;
  camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 20);
  camera.position.copy(camCur);
  camera.lookAt(0, 0.05, 0);

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(-1.5, 2.5, 1.8);
  scene.add(key);

  const fill = new THREE.DirectionalLight(0x8888ff, 0.15);
  fill.position.set(1.5, 0, 1);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0x4ade80, 0.12);
  rim.position.set(1, -1, -1.5);
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

// ---- Per-Frame Update ----
function update(dt) {
  // Frame-rate independent lerp factor (~350ms settle time)
  const a = 1 - Math.pow(0.002, dt / 500);

  // Arm
  arm.cur.rx = lerpN(arm.cur.rx, arm.tgt.rx, a);
  arm.cur.ry = lerpN(arm.cur.ry, arm.tgt.ry, a);
  arm.cur.rz = lerpN(arm.cur.rz, arm.tgt.rz, a);
  arm.cur.px = lerpN(arm.cur.px, arm.tgt.px, a);
  arm.cur.py = lerpN(arm.cur.py, arm.tgt.py, a);

  if (armPivot) {
    armPivot.rotation.x = arm.cur.rx;
    armPivot.rotation.y = arm.cur.ry;
    armPivot.rotation.z = arm.cur.rz;
    armPivot.position.x = 0.27 + arm.cur.px;
    armPivot.position.y = 0.14 + arm.cur.py;
  }

  // Fingers
  for (let i = 0; i < 5; i++) {
    fCur[i] = lerpN(fCur[i], fTgt[i], a);
    if (fingers[i]) fingers[i].rotation.x = -fCur[i];
  }

  // Gesture light
  glCur = lerpN(glCur, glTgt, a * 1.8);
  if (gestureLight) gestureLight.intensity = glCur;

  // Breathing: torso scale + head bob
  breathT += dt * 0.001;
  const breath = Math.sin(breathT * 0.75);
  if (torsoMesh) torsoMesh.scale.y = 1 + breath * 0.013;
  if (headGroup) headGroup.position.y = 0.395 + breath * 0.007;

  // Camera lerp (slightly slower)
  const ac = 1 - Math.pow(0.005, dt / 500);
  camCur.x = lerpN(camCur.x, camTgt.x, ac);
  camCur.y = lerpN(camCur.y, camTgt.y, ac);
  camCur.z = lerpN(camCur.z, camTgt.z, ac);
  if (camera) {
    camera.position.copy(camCur);
    camera.lookAt(0, 0.05, 0);
  }
}

// ---- Play Gesture ----
export function playGesture(pose, dir) {
  if (!initDone) return;

  const p     = POSES[pose] || POSES.open;
  const swipe = SWIPE_POS[dir] || { px: 0, py: 0 };

  // Move to pose
  arm.tgt.rx = p.arm.rx;
  arm.tgt.ry = p.arm.ry;
  arm.tgt.rz = p.arm.rz;
  arm.tgt.px = 0;
  arm.tgt.py = 0;
  for (let i = 0; i < 5; i++) fTgt[i] = p.f[i];
  glTgt = 1.6;

  // Camera angle based on swipe direction
  if (dir === 'left')       camTgt.copy(CAM_SIDE);
  else if (dir === 'right') camTgt.copy(CAM_SIDE_R);
  else                      camTgt.copy(CAM_FRONT);

  // Swipe after pose settle
  const t1 = setTimeout(() => {
    arm.tgt.px = swipe.px;
    arm.tgt.py = swipe.py;
  }, 380);

  // Return to idle
  const t2 = setTimeout(() => {
    const idle = POSES.idle;
    arm.tgt.rx = idle.arm.rx;
    arm.tgt.ry = idle.arm.ry;
    arm.tgt.rz = idle.arm.rz;
    arm.tgt.px = 0;
    arm.tgt.py = 0;
    for (let i = 0; i < 5; i++) fTgt[i] = idle.f[i];
    glTgt = 0;
    camTgt.copy(CAM_FRONT);
  }, 1150);

  // Store refs so rapid clicks don't pile up
  playGesture._timers = playGesture._timers || [];
  playGesture._timers.forEach(clearTimeout);
  playGesture._timers = [t1, t2];
}
