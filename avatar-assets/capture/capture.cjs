// Real-browser capture: serves the project, loads the ACTUAL avatar.js in headless Chromium,
// triggers each animation, samples real frames, and writes a labelled filmstrip per scenario.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const ROOT = path.join(__dirname, '..', '..');               // project root
const OUT = __dirname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json' };

function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, urlPath);
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found: ' + urlPath); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function montage(name, title, frames) {
  const imgs = await Promise.all(frames.map(d => loadImage(Buffer.from(d.split(',')[1], 'base64'))));
  const W = 200, H = 150, cols = Math.min(8, imgs.length), rows = Math.ceil(imgs.length / cols);
  const gap = 6, labelH = 16, dpr = 1.5;
  const cv = createCanvas((cols * W + (cols + 1) * gap) * dpr, (24 + rows * (H + labelH) + (rows + 1) * gap) * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.fillStyle = '#141414'; c.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(title, gap, 17);
  for (let i = 0; i < imgs.length; i++) {
    const x = gap + (i % cols) * (W + gap), y = 24 + gap + Math.floor(i / cols) * (H + labelH + gap);
    c.fillStyle = '#080808'; c.fillRect(x, y, W, H);
    c.drawImage(imgs[i], x, y, W, H);
    c.fillStyle = '#777'; c.font = '10px sans-serif'; c.fillText('f' + i, x + 2, y + H + 11);
  }
  const file = path.join(OUT, 'strip_' + name + '.png');
  fs.writeFileSync(file, cv.toBuffer('image/png'));
  console.log('wrote', path.basename(file), '(' + imgs.length + ' frames)');
}

// Large key-frame row: a few representative frames at full size to judge the actual poses.
async function keyframes(name, title, frames, idxs, tag) {
  const imgs = await Promise.all(idxs.map(i => loadImage(Buffer.from(frames[Math.min(i, frames.length - 1)].split(',')[1], 'base64'))));
  const W = 280, H = 210, gap = 8, labelH = 16, dpr = 2;
  const cv = createCanvas((imgs.length * W + (imgs.length + 1) * gap) * dpr, (26 + H + labelH + gap) * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.fillStyle = '#141414'; c.fillRect(0, 0, cv.width / dpr, cv.height / dpr);
  c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(title + '  [' + tag + ']', gap, 17);
  for (let i = 0; i < imgs.length; i++) {
    const x = gap + i * (W + gap), y = 26;
    c.fillStyle = '#080808'; c.fillRect(x, y, W, H); c.drawImage(imgs[i], x, y, W, H);
    c.fillStyle = '#777'; c.font = '10px sans-serif'; c.fillText('frame ' + idxs[i], x + 2, y + H + 11);
  }
  const file = path.join(OUT, 'key_' + tag + '_' + name + '.png');
  fs.writeFileSync(file, cv.toBuffer('image/png')); console.log('wrote', path.basename(file));
}

// Onion-skin: all frames stacked (faint) with the last opaque — reveals the motion path / any snap.
async function onion(name, title, frames, tag) {
  const imgs = await Promise.all(frames.map(d => loadImage(Buffer.from(d.split(',')[1], 'base64'))));
  const W = 460, H = 345, dpr = 2;
  const cv = createCanvas(W * dpr, (H + 26) * dpr); const c = cv.getContext('2d'); c.scale(dpr, dpr);
  c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, W, H + 26);
  for (let i = 0; i < imgs.length; i++) { c.globalAlpha = 0.16 + 0.5 * (i / (imgs.length - 1)); c.drawImage(imgs[i], 0, 0, W, H); }
  c.globalAlpha = 1; c.fillStyle = '#fff'; c.font = 'bold 13px sans-serif'; c.fillText(title + '  [' + tag + ']', 8, H + 18);
  const file = path.join(OUT, 'onion_' + tag + '_' + name + '.png');
  fs.writeFileSync(file, cv.toBuffer('image/png'));
  console.log('wrote', path.basename(file));
}

(async () => {
  const srv = await startServer();
  const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 460, height: 360 }, deviceScaleFactor: 2 });
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE ERROR:', m.text()); });
  page.on('pageerror', e => console.log('PAGE EXCEPTION:', e.message));
  await page.goto(`http://127.0.0.1:${port}/avatar-assets/capture/harness.html`);
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });

  const scenarios = [
    ['swipe_up',   'Swipe UP (open palm)',   'swipe', 'up',    700,  14],
    ['swipe_left', 'Swipe LEFT (open palm)', 'swipe', 'left',  700,  14],
    ['wave',       'Wave reaction',          'wave',  null,    1150, 16],
    ['shrug',      'Shrug (none-state)',     'shrug', null,    1000, 14],
    ['celebrate',  'Celebrate (achievement)','celebrate', null,1550, 16],
    ['idle',       'Idle (breathe + blink)', 'idle',  null,    4200, 16],
  ];
  const tag = process.argv[2] || 'before';
  // representative frame indices per scenario (start → peak/extremes → settle)
  const KEY = {
    swipe_up: [0, 5, 8, 13], swipe_left: [0, 5, 8, 13],
    wave: [3, 6, 9, 13], celebrate: [3, 6, 9, 15], shrug: [3, 6, 9, 13],
  };
  for (const [name, title, kind, dir, dur, n] of scenarios) {
    const frames = await page.evaluate(([k, d, ms, c]) => window.capture(k, d, ms, c), [kind, dir, dur, n]);
    await montage(name, title, frames);
    if (KEY[name]) await keyframes(name, title, frames, KEY[name], tag);
  }

  await browser.close();
  srv.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
