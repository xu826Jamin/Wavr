// Records a real-motion video of the actual avatar.js animating in Chromium, so motion (timing,
// smoothness, feel) can be judged without loading the extension. Output: avatar-assets/capture/motion.webm
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 460, height: 360 }, deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: 460, height: 360 } } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/avatar-assets/capture/harness.html`);
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });

  const fire = async (js, ms) => { await page.evaluate(js); await wait(ms); };
  await wait(500);
  // each gesture, with a beat to settle between
  await fire(`(()=>{av.reactStart=-1e9;av._nextBlink=performance.now()+9e9;av.play('open','up')})()`, 1100);
  await fire(`av.play('open','down')`, 1100);
  await fire(`av.play('open','left')`, 1100);
  await fire(`av.play('open','right')`, 1100);
  await fire(`av.react('wave')`, 1500);
  await fire(`av.react('celebrate')`, 1800);
  await fire(`av.react('shrug')`, 1300);
  // idle life: let it breathe + blink for a few seconds
  await fire(`(()=>{av._nextBlink=performance.now()+300;av._nextGlance=performance.now()+800})()`, 5000);

  await context.close();           // finalizes the video file
  const vp = await page.video().path();
  const dest = path.join(OUT, 'motion.webm');
  fs.copyFileSync(vp, dest); try { fs.unlinkSync(vp); } catch {}
  await browser.close();
  srv.close();
  console.log('wrote', dest);
})().catch(e => { console.error(e); process.exit(1); });
