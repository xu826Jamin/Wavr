const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path=require('path'), fs=require('fs');
(async()=>{
  const img=await loadImage(path.join(__dirname,'..','src','assets','avatar','base_body.webp'));
  // 1024-space crop window
  const X0=400,Y0=320,CW=270,CH=110, SC=6;
  const cv=createCanvas(CW*SC,CH*SC), c=cv.getContext('2d');
  c.imageSmoothingEnabled=false;
  // draw the full image scaled so the crop fills the canvas
  c.drawImage(img, X0,Y0,CW,CH, 0,0,CW*SC,CH*SC);
  // grid every 20 (1024-space)
  c.font='10px sans-serif';
  for(let x=Math.ceil(X0/20)*20;x<X0+CW;x+=20){const px=(x-X0)*SC;c.strokeStyle='rgba(255,0,0,0.5)';c.beginPath();c.moveTo(px,0);c.lineTo(px,CH*SC);c.stroke();c.fillStyle='red';c.fillText(x,px+1,12);}
  for(let y=Math.ceil(Y0/20)*20;y<Y0+CH;y+=20){const py=(y-Y0)*SC;c.strokeStyle='rgba(0,128,255,0.5)';c.beginPath();c.moveTo(0,py);c.lineTo(CW*SC,py);c.stroke();c.fillStyle='#06f';c.fillText(y,1,py-1);}
  fs.writeFileSync(path.join(__dirname,'eye_grid.png'),cv.toBuffer('image/png'));
  console.log('wrote eye_grid.png  window x',X0,'-',X0+CW,' y',Y0,'-',Y0+CH);
})();
