const sharp = require('sharp');
const path = require('path');
const files = ['hand_open','hand_fist','hand_pointing','hand_victory','forearm'];
const dir = path.join(__dirname, '..', 'src', 'assets', 'avatar');
(async () => {
  for (const f of files) {
    const img = sharp(path.join(dir, `${f}.webp`));
    const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height, ch = info.channels;
    let minX=W, minY=H, maxX=0, maxY=0, sumX=0, sumY=0, cnt=0;
    for (let y=0; y<H; y++) for (let x=0; x<W; x++) {
      const a = data[(y*W+x)*ch + 3];
      if (a > 40) { if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; sumX+=x; sumY+=y; cnt++; }
    }
    const sx = 1024/W, sy = 768/H;
    console.log(`${f}: img ${W}x${H} | bbox x[${minX}-${maxX}] y[${minY}-${maxY}] | centroid1024 [${Math.round(sumX/cnt*sx)}, ${Math.round(sumY/cnt*sy)}] | bboxCenter1024 [${Math.round((minX+maxX)/2*sx)}, ${Math.round((minY+maxY)/2*sy)}]`);
  }
})();
