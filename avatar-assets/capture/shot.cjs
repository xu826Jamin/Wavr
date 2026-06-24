// Screenshot a region of the built popup to eyeball visual regressions.
//   node shot.cjs <selector> <outfile>   e.g. node shot.cjs "#tutorial" dos.png
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
  const sel = process.argv[2] || '#tutorial', out = path.join(__dirname, process.argv[3] || 'shot.png');
  const srv = await srvUp(); const port = srv.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(SHIM);
  await page.goto(`http://127.0.0.1:${port}/src/popup/popup.html`, { waitUntil: 'load' });
  await sleep(3500);
  const el = await page.$(sel);
  if (el) { await el.scrollIntoViewIfNeeded(); await sleep(1200); await el.screenshot({ path: out }); }
  else { await page.screenshot({ path: out }); }
  console.log('wrote', path.relative(ROOT, out));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
