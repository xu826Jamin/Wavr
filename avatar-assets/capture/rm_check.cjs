// Verifies prefers-reduced-motion: with reduce emulated, a swipe/wave must produce NO motion
// (every captured frame identical to rest). Reports max per-frame pixel diff.
const http=require('http'),fs=require('fs'),path=require('path');
const { chromium }=require('playwright');
const { loadImage, createCanvas }=require('@napi-rs/canvas');
const ROOT=path.join(__dirname,'..','..');
const MIME={'.html':'text/html','.js':'text/javascript','.webp':'image/webp'};
const srvP=new Promise(res=>{const s=http.createServer((q,r)=>{fs.readFile(path.join(ROOT,decodeURIComponent(q.url.split('?')[0])),(e,d)=>{if(e){r.writeHead(404);return r.end();}r.writeHead(200,{'Content-Type':MIME[path.extname(q.url)]||'application/octet-stream'});r.end(d);});});s.listen(0,'127.0.0.1',()=>res(s));});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function px(d){const im=await loadImage(Buffer.from(d.split(',')[1],'base64'));const c=createCanvas(im.width,im.height);const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,im.width,im.height).data;}
function maxDiff(a,b){let m=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d>m)m=d;}return m;}
(async()=>{
  const srv=await srvP,port=srv.address().port;
  const b=await chromium.launch();
  const pg=await b.newPage({viewport:{width:460,height:360},deviceScaleFactor:1});
  await pg.emulateMedia({ reducedMotion:'reduce' });
  await pg.goto(`http://127.0.0.1:${port}/avatar-assets/capture/harness.html`);
  await pg.waitForFunction('window.__ready===true',{timeout:8000});
  await wait(300);
  const snap=()=>pg.evaluate(()=>document.getElementById('cv').toDataURL('image/png'));
  const rest=await snap();
  await pg.evaluate(()=>{av.play('open','up');av.react('wave');});
  const frames=[]; for(let i=0;i<8;i++){ await wait(90); frames.push(await snap()); }
  const restPx=await px(rest); let worst=0;
  for(const f of frames){ worst=Math.max(worst, maxDiff(restPx, await px(f))); }
  console.log('reduced-motion max pixel diff during swipe+wave vs rest:', worst, worst<8?'PASS (static)':'FAIL (moved)');
  await b.close(); srv.close();
})().catch(e=>{console.error(e);process.exit(1);});
