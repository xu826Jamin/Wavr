// Build rig assets by flood-filling the raised arm from the hand (bounded at the shoulder line),
// so the cut follows the arm silhouette and never clips the hood.
//  - base_body.png   : hero with the raised arm removed (static)
//  - arm_<pose>.png  : forearm+hand on a full 1024x768 canvas (translatable), skin->glove
// Previews: rest vs up/left swipe to confirm only the arm moves and the palm stays to camera.
const sharp = require('sharp');
const path = require('path');
const dir = path.join(__dirname, 'v2');

const W = 1024, H = 768;
const SHOULDER_Y = 510;     // flood stops just above where arm+torso merge (y~536)
const XMIN = 665;           // keep the flood RIGHT of the head (head right edge ~660) so it
                            // can't leak across the neck into the head (fist/pointing sit close)
const GLOVE = [65, 71, 81];
// Continuous skin→glove: map each skin pixel's brightness onto a glove gradient so shading,
// knuckles and finger creases survive (two flat tones merged the curled fingers into a blob).
const GLOVE_LIGHT = [80, 87, 99], GLOVE_DARK = [36, 41, 51];
const SKIN_LO = 145, SKIN_HI = 207;                        // skin luma range (deep crease → highlight)
const luma = (R,G,B) => 0.3*R + 0.6*G + 0.1*B;
function skinToGlove(R,G,B) {
  const t = Math.max(0, Math.min(1, (luma(R,G,B) - SKIN_LO) / (SKIN_HI - SKIN_LO)));
  return [0,1,2].map(k => Math.round(GLOVE_DARK[k] + t * (GLOVE_LIGHT[k] - GLOVE_DARK[k])));
}
const SH = [772, 528];      // shoulder joint (short capsule root)

const load = async f => (await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })).data;
const isSkin = (R,G,B) => R>120 && R>G && G>=B && R-B>22;   // warm tones incl. darker creases
const toPng = buf => sharp(buf,{raw:{width:W,height:H,channels:4}}).png().toBuffer();
const op = (data,i) => data[i+3] > 40;

function findSeed(data) {            // RIGHT-most opaque pixel in the upper area = the hand
  let bestX=-1, sx=740, sy=150;
  for (let y=20; y<380; y++) for (let x=W-1; x>=600; x--) {
    if (op(data,(y*W+x)*4)) { if (x>bestX){ bestX=x; sx=x; sy=y; } break; }
  }
  return [sx, sy];
}
function floodArm(data) {
  const mask = new Uint8Array(W*H);
  const [sx, sy] = findSeed(data);
  const st = [sx, sy];
  const visit = (x,y) => {
    if (x<XMIN || x>=W || y<0 || y>SHOULDER_Y) return;
    const p=y*W+x; if (mask[p]) return; if (!op(data,p*4)) return;
    mask[p]=1; st.push(x,y);
  };
  mask[sy*W+sx]=1;
  while (st.length) { const y=st.pop(), x=st.pop(); visit(x+1,y); visit(x-1,y); visit(x,y+1); visit(x,y-1); }
  return mask;
}
function splitBodyArm(pose) {
  const mask = floodArm(pose);
  const body = Buffer.from(pose), arm = Buffer.alloc(W*H*4);
  let maxY=0; for (let p=0;p<W*H;p++) if (mask[p]) { const y=(p/W)|0; if (y>maxY) maxY=y; }
  let apx=0, apn=0;
  for (let p=0;p<W*H;p++) {
    if (!mask[p]) continue;
    const i=p*4, y=(p/W)|0, x=p%W;
    arm[i]=pose[i]; arm[i+1]=pose[i+1]; arm[i+2]=pose[i+2]; arm[i+3]=pose[i+3];
    if (isSkin(pose[i],pose[i+1],pose[i+2])) {
      const c = skinToGlove(pose[i],pose[i+1],pose[i+2]);   // preserve shading/creases as glove gradient
      arm[i]=c[0]; arm[i+1]=c[1]; arm[i+2]=c[2];
    }
    body[i+3]=0;
    if (y >= maxY-18) { apx += x; apn++; }
  }
  const ap = [Math.round(apx/Math.max(1,apn)), maxY-8]; // elbow attach (bottom-centre of arm)
  return { body, arm, ap };
}

const P = 160;
async function shift(armPng, ox, oy) {
  const big = await sharp({ create:{ width:W+2*P, height:H+2*P, channels:4, background:'#00000000' } })
    .composite([{ input: armPng, left:P+ox, top:P+oy }]).png().toBuffer();
  return sharp(big).extract({ left:P, top:P, width:W, height:H }).png().toBuffer();
}
function capsuleSvg(ax, ay) {
  const [sx, sy] = SH;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <line x1="${sx}" y1="${sy}" x2="${ax}" y2="${ay}" stroke="#11151a" stroke-width="84" stroke-linecap="round"/>
    <line x1="${sx}" y1="${sy}" x2="${ax}" y2="${ay}" stroke="#41474f" stroke-width="70" stroke-linecap="round"/>
  </svg>`;
}
async function frame(bodyPng, armPng, ap, ox, oy) {
  const cap = capsuleSvg(ap[0]+ox, ap[1]+oy);
  const armShifted = await shift(armPng, ox, oy);
  return sharp({create:{width:W,height:H,channels:4,background:'#050505'}})
    .composite([
      { input: bodyPng, left:0, top:0 },
      { input: Buffer.from(cap), left:0, top:0 },
      { input: armShifted, left:0, top:0 },
    ]).png().toBuffer();
}

(async () => {
  const heroes = { open:'registered_open.png', fist:'registered_fist.png', pointing:'registered_pointing.png', victory:'registered_victory.png' };
  let baseBodyPng; const armPngs = {}, aps = {};
  for (const [pose,file] of Object.entries(heroes)) {
    const { body, arm, ap } = splitBodyArm(await load(file));
    const armPng = await toPng(arm);
    armPngs[pose] = armPng; aps[pose] = ap;
    await sharp(armPng).toFile(path.join(dir, `arm_${pose}.png`));
    if (pose==='open') { baseBodyPng = await toPng(body); await sharp(baseBodyPng).toFile(path.join(dir,'base_body.png')); }
  }
  console.log('SH', SH, 'AP', aps);
  // rest montage of all 4 poses (base + capsule + arm)
  const half = b => sharp(b).resize(W/2,H/2).toBuffer();
  const rc = [];
  for (const p of ['open','fist','pointing','victory']) rc.push(await half(await frame(baseBodyPng, armPngs[p], aps[p], 0, 0)));
  await sharp({create:{width:W+8,height:H+8,channels:4,background:'#141414'}})
    .composite([{input:rc[0],left:2,top:2},{input:rc[1],left:W/2+6,top:2},{input:rc[2],left:2,top:H/2+6},{input:rc[3],left:W/2+6,top:H/2+6}])
    .png().toFile(path.join(dir,'rig_rest_montage.png'));
  // open swipe directions
  const dirs = [['rest',0,0],['up',0,-46],['down',0,46],['left',-46,0],['right',46,0]];
  const sc = [];
  for (const [,ox,oy] of dirs) sc.push(await sharp(await frame(baseBodyPng, armPngs.open, aps.open, ox, oy)).resize(Math.round(W/2.6),Math.round(H/2.6)).toBuffer());
  const cw=Math.round(W/2.6), ch=Math.round(H/2.6);
  await sharp({create:{width:cw*5+24,height:ch+8,channels:4,background:'#141414'}})
    .composite(sc.map((b,i)=>({input:b,left:4+i*(cw+4),top:4})))
    .png().toFile(path.join(dir,'rig_swipes.png'));
  console.log('rig assets + rig_rest_montage.png + rig_swipes.png');
})();
