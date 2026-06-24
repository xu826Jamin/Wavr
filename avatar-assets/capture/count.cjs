// Definitive diagnostic: hook drawImage to count, per <canvas>, how many times it's drawn over 1s at
// the Dos&Don'ts section — reveals which avatars are still redrawing (should be only reset×2 after the
// static-scene fix) and the canvas sizes (to explain raster cost).
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist');
const SHIM = require('./shim.cjs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function srvUp() { return new Promise(res => { const s = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (/\/assets\/wasm\//.test(u) || /\.task$/.test(u)) { rs.writeHead(404); return rs.end(); }
  const f = path.join(DIST, u); fs.readFile(f, (e, d) => { if (e) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rs.end(d); }); });
  s.listen(0, '127.0.0.1', () => res(s)); }); }

(async () => {
  const srv = await srvUp(); const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await page.addInitScript(SHIM);
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    window.__draws = new Map();
    proto.drawImage = function (...a) { const c = this.canvas; const id = c.id || c.className || '(no-id)';
      window.__draws.set(id, (window.__draws.get(id) || 0) + 1); return orig.apply(this, a); };
    window.__countReset = () => window.__draws.clear();
  });
  await page.goto(`http://127.0.0.1:${port}/src/popup/popup.html`, { waitUntil: 'load' });
  await sleep(3500);
  await page.evaluate(() => document.getElementById('tutorial')?.scrollIntoView());
  await sleep(1500);
  await page.evaluate(() => window.__countReset());
  await sleep(1000);
  const res = await page.evaluate(() => {
    const draws = [...window.__draws.entries()].sort((a, b) => b[1] - a[1]);
    const canvases = [...document.querySelectorAll('canvas')].map(c => ({
      id: c.id, w: c.width, h: c.height,
      cssW: Math.round(c.getBoundingClientRect().width), cssH: Math.round(c.getBoundingClientRect().height),
      inView: (() => { const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })(),
    }));
    return { draws, canvases };
  });
  console.log('\n=== drawImage calls in 1s @ Dos&Donts ===');
  for (const [id, n] of res.draws) console.log(String(n).padStart(5), id);
  console.log('\n=== canvases (inView only), backing-store px ===');
  for (const c of res.canvases.filter(c => c.inView)) console.log(`${(c.id || '?').padEnd(22)} store ${c.w}x${c.h}  css ${c.cssW}x${c.cssH}`);
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
