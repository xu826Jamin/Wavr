const sharp = require('sharp');
const path = require('path');
(async () => {
  const f = path.join(__dirname, '..', 'src', 'assets', 'avatar', 'base_body.webp');
  const W = 1024, H = 768;
  const left = Math.round(W * 0.36), top = Math.round(H * 0.36);
  const w = Math.round(W * 0.28), h = Math.round(H * 0.20);
  await sharp(f).extract({ left, top, width: w, height: h }).resize(w * 4).png()
    .toFile(path.join(__dirname, 'face_crop.png'));
  // also detect dark eye clusters (irises/pupils) within this band to get coords
  const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  // scan band, find very dark pixels that sit on light skin (eyes), excluding the mask sides
  let pts = [];
  for (let y = top; y < top + h; y++) for (let x = left; x < left + w; x++) {
    const i = (y * W + x) * ch, r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
    if (a > 120 && r < 70 && g < 70 && b < 70) pts.push([x, y]);
  }
  // cluster into left/right by x median
  pts.sort((p,q)=>p[0]-q[0]);
  console.log('crop band 1024:', {left, top, w, h}, 'dark px:', pts.length);
  if (pts.length) {
    const xs = pts.map(p=>p[0]); const mid = (Math.min(...xs)+Math.max(...xs))/2;
    const L = pts.filter(p=>p[0]<mid), R = pts.filter(p=>p[0]>=mid);
    const bb = g => ({x:[Math.min(...g.map(p=>p[0])),Math.max(...g.map(p=>p[0]))], y:[Math.min(...g.map(p=>p[1])),Math.max(...g.map(p=>p[1]))], cx:Math.round(g.reduce((s,p)=>s+p[0],0)/g.length), cy:Math.round(g.reduce((s,p)=>s+p[1],0)/g.length)});
    console.log('LEFT eye region', JSON.stringify(bb(L)));
    console.log('RIGHT eye region', JSON.stringify(bb(R)));
  }
})();
