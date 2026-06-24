// Canonical popup profiler (P0/P4 source of truth). Boots the BUILT dist/ popup headless with the
// chrome.* shim, then uses the CDP SAMPLING Profiler (reliable; the aggregate Performance.getMetrics
// ScriptDuration proved bogus in headless) to measure main-thread busy% + hottest functions while
// avatars are visible and ticking, at two locations:
//    top  → hero + explorer avatars
//    dos  → Dos & Don'ts (8 avatars) — the heavy section
// Also probes continuous-rAF-at-idle. Writes perf/<tag>.json and prints a table.
//   node prof.cjs <tag> [dpr]
const http = require('http'); const fs = require('fs'); const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..', '..'), DIST = path.join(ROOT, 'dist'), PERF = path.join(ROOT, 'perf');
const SHIM = require('./shim.cjs');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function startServer() { return new Promise(res => { const s = http.createServer((rq, rs) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (/\/assets\/wasm\//.test(u) || /\.task$/.test(u)) { rs.writeHead(404); return rs.end(); } // skip MediaPipe (on-demand; not the avatar-UI cost)
  const f = path.join(DIST, u); if (!f.startsWith(DIST)) { rs.writeHead(403); return rs.end(); }
  fs.readFile(f, (e, d) => { if (e) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); rs.end(d); }); });
  s.listen(0, '127.0.0.1', () => res(s)); }); }

async function sampleAt(page, cdp, where, ms) {
  if (where === 'top') await page.evaluate(() => window.scrollTo(0, 0));
  else if (where === 'dos') await page.evaluate(() => document.getElementById('tutorial')?.scrollIntoView());
  await sleep(1200); // settle scroll + let rAF resume
  await page.evaluate(() => window.__fps.start());   // achieved frame rate (the gate once busy% saturates)
  await cdp.send('Profiler.start');
  await sleep(ms);
  const { profile } = await cdp.send('Profiler.stop');
  const fps = await page.evaluate(() => window.__fps.stop());
  const nodes = {}; for (const n of profile.nodes) nodes[n.id] = n;
  const self = {}; let idle = 0;
  for (const id of profile.samples) {
    const cf = nodes[id]?.callFrame; if (!cf) continue;
    const fn = cf.functionName || '(anon)';
    if (fn === '(idle)') { idle++; continue; }
    const key = fn + (cf.url ? ' @' + (cf.lineNumber + 1) : '');
    self[key] = (self[key] || 0) + 1;
  }
  const total = profile.samples.length || 1;
  const top = Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([k, c]) => [k, +(c / total * 100).toFixed(1)]);
  return { samples: total, busyPct: +(100 - idle / total * 100).toFixed(1), idlePct: +(idle / total * 100).toFixed(1), fps: fps.fps, frameMedMs: fps.medMs, frameP95Ms: fps.p95Ms, top };
}

(async () => {
  fs.mkdirSync(PERF, { recursive: true });
  const tag = process.argv[2] || 'before';
  const dpr = +(process.argv[3] || 1);
  const srv = await startServer(); const port = srv.address().port;
  // Headless Chromium rasterizes Canvas2D in SOFTWARE (SwiftShader) → drawImage downscaling is
  // ~50–100× slower than real GPU Chrome, so headless ABSOLUTE fps is meaningless (only the sample
  // COMPOSITION/ranking is valid). HEADED=1 launches real Chrome with GPU for representative fps.
  const headed = process.env.HEADED === '1';
  const browser = await chromium.launch(headed
    ? { headless: false, args: ['--use-gl=angle', '--enable-gpu', '--window-size=1320,860'] }
    : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: dpr });
  await page.addInitScript(SHIM);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await page.goto(`http://127.0.0.1:${port}/src/popup/popup.html`, { waitUntil: 'load' });
  await sleep(3500);

  const report = { tag, dpr, when: new Date().toISOString(), tool: 'cdp-sampling-profiler' };
  report.top = await sampleAt(page, cdp, 'top', 3000);
  report.dos = await sampleAt(page, cdp, 'dos', 3000);
  // continuous-rAF-at-idle probe (at top, where rAF isn't headless-throttled)
  await page.evaluate(() => window.scrollTo(0, 0)); await sleep(600);
  report.idleRafIn1s = await page.evaluate(() => window.__rafCount(1000));

  const out = path.join(PERF, tag + '_dpr' + dpr + '.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  await browser.close(); srv.close();

  for (const loc of ['top', 'dos']) {
    const s = report[loc];
    console.log(`\n=== ${loc.toUpperCase()}  busy=${s.busyPct}%  fps=${s.fps}  frame med/p95=${s.frameMedMs}/${s.frameP95Ms}ms  (${s.samples} samples) ===`);
    for (const [k, p] of s.top) console.log(String(p + '%').padStart(7), k);
  }
  console.log(`\nidle rAF in 1s @ top: ${report.idleRafIn1s} (continuous loop running if >0)`);
  console.log('wrote', path.relative(ROOT, out));
})().catch(e => { console.error(e); process.exit(1); });
