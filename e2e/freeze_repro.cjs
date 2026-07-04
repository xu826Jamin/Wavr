// Reproduce the "page freezes when Wavr starts" report.
// Loads the BUILT dist/ as a real extension in Chromium (fake camera), enables Wavr
// while a content page is open, and measures:
//   1. page main-thread health (rAF gaps + longtasks) before/after enable
//   2. whether the PiP widget's camera feed freezes (screenshot diffing)
// Usage: node freeze_repro.cjs [url]   (HEADED=1 for a visible browser)
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const DIST = path.join(ROOT, 'dist');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Heavy-ish local page: long scrollable doc + animated canvas + a looping <video>.
const HEAVY_PAGE = `<!doctype html><title>heavy</title><style>body{font:16px sans-serif;margin:0;padding:20px}</style>
<canvas id=c width=640 height=360 style="position:fixed;top:0;right:0;width:320px;height:180px"></canvas>
<div id=content></div>
<script>
  const el = document.getElementById('content');
  let html = '';
  for (let i = 0; i < 800; i++) html += '<p>paragraph ' + i + ' — ' + 'lorem ipsum dolor sit amet '.repeat(20) + '</p>';
  el.innerHTML = html;
  const ctx = document.getElementById('c').getContext('2d');
  let t = 0;
  (function anim(){ t++; ctx.fillStyle = 'hsl(' + (t % 360) + ',60%,40%)'; ctx.fillRect(0,0,640,360);
    for (let i=0;i<60;i++){ ctx.fillStyle='hsl('+((t*3+i*20)%360)+',80%,60%)'; ctx.beginPath();
      ctx.arc(320+Math.sin(t/30+i)*300, 180+Math.cos(t/40+i)*160, 12, 0, 7); ctx.fill(); }
    requestAnimationFrame(anim); })();
<\/script>`;

const LAG_PROBE = `
  window.__lag = (() => {
    let gaps = [], last = 0, running = false, longTotal = 0, longCount = 0, maxLong = 0;
    const po = new PerformanceObserver(list => { for (const e of list.getEntries()) {
      longTotal += e.duration; longCount++; if (e.duration > maxLong) maxLong = e.duration; } });
    function loop(now) { if (!running) return; if (last) gaps.push(now - last); last = now; requestAnimationFrame(loop); }
    return {
      start() { gaps = []; last = 0; longTotal = 0; longCount = 0; maxLong = 0; running = true;
        try { po.observe({ entryTypes: ['longtask'] }); } catch {}
        requestAnimationFrame(loop); },
      stop() { running = false; try { po.disconnect(); } catch {}
        gaps.sort((a,b)=>a-b);
        const q = p => gaps.length ? gaps[Math.min(gaps.length-1, Math.floor(gaps.length*p))] : 0;
        return { frames: gaps.length, medGapMs: +q(0.5).toFixed(1), p95GapMs: +q(0.95).toFixed(1),
                 maxGapMs: +(gaps[gaps.length-1]||0).toFixed(1), longTaskMs: +longTotal.toFixed(0),
                 longTaskCount: longCount, maxLongTaskMs: +maxLong.toFixed(0) }; }
    };
  })();`;

function startServer() {
  const http = require('http');
  return new Promise(res => {
    const s = http.createServer((rq, rs) => { rs.writeHead(200, { 'Content-Type': 'text/html' }); rs.end(HEAVY_PAGE); });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

(async () => {
  let url = process.argv[2] || null;
  let srv = null;
  if (!url) { srv = await startServer(); url = `http://127.0.0.1:${srv.address().port}/heavy.html`; }
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wavr-repro-'));
  const headed = process.env.HEADED === '1';
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
    viewport: { width: 1280, height: 800 },
  });

  // wait for the extension service worker
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  console.log('extension sw up:', sw.url());

  // skip first-run so ENABLE actually enables
  await sw.evaluate(() => chrome.storage.local.set({ firstRunDone: true, onboardingComplete: true }));

  // content page under test
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(1500);
  await page.evaluate(LAG_PROBE);

  // ---- baseline (5s, extension off) ----
  await page.evaluate(() => window.__lag.start());
  await sleep(5000);
  const baseline = await page.evaluate(() => window.__lag.stop());
  console.log('BASELINE  ', JSON.stringify(baseline));

  // ---- enable Wavr from an extension page (mirrors toolbar click) ----
  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await opts.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ type: 'ENABLE' }, res)));
  console.log('wavr enabled');
  await page.bringToFront();

  // ---- during-startup window (first 6s after enable: wasm load + camera spin-up) ----
  await page.evaluate(() => window.__lag.start());
  await sleep(6000);
  const startup = await page.evaluate(() => window.__lag.stop());
  console.log('STARTUP-6s', JSON.stringify(startup));

  // ---- steady state (next 8s) ----
  await page.evaluate(() => window.__lag.start());
  await sleep(8000);
  const steady = await page.evaluate(() => window.__lag.stop());
  console.log('STEADY-8s ', JSON.stringify(steady));

  // widget present?
  const hostBox = await page.evaluate(() => {
    const h = document.getElementById('wavr-pip-host');
    if (!h) return null;
    const r = h.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  console.log('widget:', hostBox ? JSON.stringify(hostBox) : 'NOT PRESENT');

  // ---- camera-feed freeze check: screenshot widget every second for 8s, diff bytes ----
  if (hostBox) {
    // camera area only: skip the ~47px header (live-dot pulses) and the gesture bar below
    const clip = { x: hostBox.x + 4, y: hostBox.y + 50, width: hostBox.w - 8, height: 200 };
    let prev = null; const diffs = [];
    for (let i = 0; i < 8; i++) {
      const shot = await page.screenshot({ clip });
      if (prev) diffs.push(Buffer.compare(prev, shot) === 0 ? 'IDENTICAL' : 'changed');
      prev = shot;
      if (i === 0) fs.writeFileSync(path.join(__dirname, 'widget_t0.png'), shot);
      if (i === 7) fs.writeFileSync(path.join(__dirname, 'widget_t7.png'), shot);
      await sleep(1000);
    }
    console.log('widget feed per-second diffs:', diffs.join(','));
  }

  // is the page still responsive to input?
  const t0 = Date.now();
  await page.evaluate(() => document.title);
  console.log('page eval roundtrip after run:', Date.now() - t0, 'ms');

  await ctx.close();
  if (srv) srv.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
