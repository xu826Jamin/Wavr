// Verify the REAL zone/dos-donts demos (real avatar.js + zoneDemos.js + dosDonts.js, not a replica)
// under the IK rig. Samples each demo canvas over time into a filmstrip so the hand motion vs the
// neutral circle / cursor dot can be eyeballed.
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

async function strip(name, title, frames) {
  const imgs = await Promise.all(frames.map(d => loadImage(Buffer.from(d.split(',')[1], 'base64'))));
  const W = 220, H = 165, cols = Math.min(8, imgs.length), rows = Math.ceil(imgs.length / cols);
  const gap = 6, labelH = 14, dpr = 1.5;
  const cv = createCanvas((cols * W + (cols + 1) * gap) * dpr, (24 + rows * (H + labelH) + (rows + 1) * gap) * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.fillStyle = '#141414'; c.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(title, gap, 17);
  for (let i = 0; i < imgs.length; i++) {
    const x = gap + (i % cols) * (W + gap), y = 24 + gap + Math.floor(i / cols) * (H + labelH + gap);
    c.fillStyle = '#080808'; c.fillRect(x, y, W, H); c.drawImage(imgs[i], x, y, W, H);
    c.fillStyle = '#777'; c.font = '10px sans-serif'; c.fillText('f' + i, x + 2, y + H + 11);
  }
  fs.writeFileSync(path.join(OUT, 'demo_' + name + '.png'), cv.toBuffer('image/png'));
  console.log('wrote demo_' + name + '.png');
}

// sample a canvas id every `iv` ms for `n` frames
async function sample(page, id, iv, n) {
  const frames = [];
  for (let i = 0; i < n; i++) {
    frames.push(await page.evaluate(x => window.grab(x), id));
    await page.waitForTimeout(iv);
  }
  return frames;
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
  await page.goto(`http://127.0.0.1:${port}/avatar-assets/capture/demos_harness.html`);
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });
  await page.waitForTimeout(400); // let assets load + first paints

  await strip('neutral', 'Neutral zone demo (hand drifts out of circle, returns)', await sample(page, 'neutralDemoCanvas', 520, 24));
  await strip('cursor', 'Cursor zone demo (palm moves dot, fist clicks)', await sample(page, 'cursorDemoCanvas', 360, 16));
  await strip('resetGood', "Dos&Don'ts reset GOOD (swipe out + back in)", await sample(page, 'dd_resetGood', 200, 14));
  await strip('resetBad', "Dos&Don'ts reset BAD (stuck mid-swipe)", await sample(page, 'dd_resetBad', 300, 6));

  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
