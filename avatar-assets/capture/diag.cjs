// Diagnostic: capture a CDP CPU profile during the pegged "scrolled to bottom" window and print
// the hottest functions by self time. Reuses the profiler's server + shim.
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm' };
function startServer() { return new Promise(res => { const s = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (/\/assets\/wasm\//.test(u) || /\.task$/.test(u)) { rs.writeHead(404); return rs.end(); }
  const f = path.join(DIST, u); fs.readFile(f, (e, d) => { if (e) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rs.end(d); }); });
  s.listen(0, '127.0.0.1', () => res(s)); }); }
const SHIM = require('./shim.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await startServer(); const port = srv.address().port;
  const browser = await chromium.launch();
  const dpr = +(process.argv[3] || 1);
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  await page.addInitScript(SHIM);
  const msgs = [];
  page.on('console', m => msgs.push(m.type() + ': ' + m.text().slice(0, 120)));
  page.on('pageerror', e => msgs.push('PAGEERR: ' + e.message.slice(0, 160)));
  const cdp = await page.context().newCDPSession(page);
  await page.goto(`http://127.0.0.1:${port}/src/popup/popup.html`, { waitUntil: 'load' });
  await sleep(3500);
  const where = process.argv[2] || 'bottom';
  if (where === 'bottom') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  else if (where === 'dos') await page.evaluate(() => document.getElementById('tutorial')?.scrollIntoView());
  else await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1500);

  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 }); // 100us
  await cdp.send('Profiler.start');
  await sleep(3000);
  const { profile } = await cdp.send('Profiler.stop');

  // aggregate self time by function (nodeId hit counts × sample interval)
  const nodes = {}; for (const n of profile.nodes) nodes[n.id] = n;
  const self = {};
  for (const id of profile.samples) {
    const n = nodes[id]; if (!n) continue;
    const cf = n.callFrame;
    const key = (cf.functionName || '(anon)') + ' @ ' + (cf.url || '').split('/').pop() + ':' + (cf.lineNumber + 1);
    self[key] = (self[key] || 0) + 1;
  }
  const total = profile.samples.length;
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 20);
  console.log(`\n=== CPU profile @ ${where} dpr=${dpr}  (${total} samples / 3s) ===`);
  for (const [k, c] of top) console.log(String((c / total * 100).toFixed(1) + '%').padStart(6), k);
  console.log('\n--- recent console (last 12) ---');
  console.log(msgs.slice(-12).join('\n'));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
