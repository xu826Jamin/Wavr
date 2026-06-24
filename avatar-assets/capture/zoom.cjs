// Zoomed joint check: load the REAL avatar.js, play each swipe direction, grab a full-res frame at
// the swipe peak, and tile them large so the shoulder/elbow seams + arm connection are visible.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..', '..');
const OUT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('nf'); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 360 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
  await page.goto(`http://127.0.0.1:${port}/avatar-assets/capture/harness.html`);
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });

  // grab one full-res frame `ms` into a swipe in direction `dir` (or rest if dir=null)
  async function grab(dir, ms) {
    return page.evaluate(([d, t]) => new Promise(res => {
      window.reset();
      requestAnimationFrame(() => {
        if (d) window.av.play('open', d);
        const start = performance.now();
        function g(now) { if (now - start >= t) res(document.getElementById('cv').toDataURL('image/png')); else requestAnimationFrame(g); }
        requestAnimationFrame(g);
      });
    }), [dir, ms]);
  }

  const peak = 250; // ~ flick-out peak of the 720ms swipePath
  const shots = [['rest', null, 0], ['up', 'up', peak], ['down', 'down', peak], ['left', 'left', peak], ['right', 'right', peak]];
  const imgs = [];
  for (const [label, dir, ms] of shots) imgs.push([label, await loadImage(Buffer.from((await grab(dir, ms)).split(',')[1], 'base64'))]);

  // tile: each shot full-frame, large
  const W = 360, H = 270, gap = 8, labelH = 18, cols = shots.length, dpr = 2;
  const cv = createCanvas((cols * W + (cols + 1) * gap) * dpr, (26 + H + labelH + gap) * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.fillStyle = '#141414'; c.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText('Swipe peak — joint/connection check  [after]', gap, 17);
  imgs.forEach(([label, im], i) => {
    const x = gap + i * (W + gap), y = 26;
    c.fillStyle = '#0b0b0b'; c.fillRect(x, y, W, H); c.drawImage(im, x, y, W, H);
    c.fillStyle = '#9fe'; c.font = 'bold 12px sans-serif'; c.fillText(label, x + 4, y + H + 13);
  });
  fs.writeFileSync(path.join(OUT, 'zoom_swipes.png'), cv.toBuffer('image/png'));
  console.log('wrote zoom_swipes.png');

  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
