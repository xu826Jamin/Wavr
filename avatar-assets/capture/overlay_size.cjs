// Renders the avatar at the overlay's reaction-popup size (64x48) on a dark pill, scaled up, to
// confirm a swipe still reads at that scale.
const http=require('http'),fs=require('fs'),path=require('path');
const { chromium }=require('playwright');
const { createCanvas, loadImage }=require('@napi-rs/canvas');
const ROOT=path.join(__dirname,'..','..'),OUT=__dirname;
const MIME={'.html':'text/html','.js':'text/javascript','.webp':'image/webp'};
const srvP=new Promise(res=>{const s=http.createServer((q,r)=>{fs.readFile(path.join(ROOT,decodeURIComponent(q.url.split('?')[0])),(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':MIME[path.extname(q.url)]||'application/octet-stream'});r.end(d);});});s.listen(0,'127.0.0.1',()=>res(s));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const srv=await srvP, port=srv.address().port;
  const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:200,height:160},deviceScaleFactor:2});
  await pg.goto(`http://127.0.0.1:${port}/avatar-assets/capture/harness.html`);
  await pg.waitForFunction('window.__ready===true',{timeout:8000});
  await pg.evaluate(()=>{const w=document.getElementById('wrap'); w.style.width='64px'; w.style.height='48px'; w.style.background='rgba(8,8,10,0.55)'; w.style.borderRadius='10px';});
  await wait(300);
  const grab=async(k,d,atMs)=>{ await pg.evaluate(([k,d])=>{av.reactStart=-1e9;av._nextBlink=performance.now()+9e9; if(k==='swipe')av.play('open',d); else av.react(k);},[k,d]); await wait(atMs); return await pg.evaluate(()=>document.getElementById('cv').toDataURL('image/png')); };
  const shots=[['rest','swipe','up',0],['swipe up peak','swipe','up',300],['swipe left peak','swipe','left',300],['wave','wave',null,250]];
  const imgs=[]; for(const [label,k,d,ms] of shots){ const u=await grab(k,d,ms); imgs.push([label,await loadImage(Buffer.from(u.split(',')[1],'base64'))]); }
  const SC=4,W=64*SC,H=48*SC,gap=10,labelH=16;
  const cv=createCanvas((imgs.length*W+(imgs.length+1)*gap),(H+labelH+2*gap)); const c=cv.getContext('2d');
  c.fillStyle='#1a1a1a'; c.fillRect(0,0,cv.width,cv.height);
  imgs.forEach(([label,im],i)=>{const x=gap+i*(W+gap),y=gap; c.imageSmoothingEnabled=false; c.drawImage(im,x,y,W,H); c.fillStyle='#bbb'; c.font='11px sans-serif'; c.fillText(label,x,y+H+12);});
  fs.writeFileSync(path.join(OUT,'overlay_size.png'),cv.toBuffer('image/png'));
  await b.close(); srv.close(); console.log('wrote overlay_size.png');
})().catch(e=>{console.error(e);process.exit(1);});
