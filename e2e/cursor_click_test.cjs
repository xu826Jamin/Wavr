// Cursor-mode click diagnosis: drive the REAL built extension and fire CURSOR_CLICK
// at different target types to see which ones actually click.
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const DIST = path.join(ROOT, 'dist');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const TEST_PAGE = `<!doctype html><title>click test</title><style>
  body{margin:0;font:14px sans-serif} .row{position:fixed;width:200px;height:60px;left:40px}
</style>
<button id="btn" class="row" style="top:40px">plain button</button>
<a id="link" href="#navved" class="row" style="top:140px;display:block;background:#dde">
  <img id="img" width="200" height="60" style="display:block" alt="thumb">
</a>
<div id="divbtn" class="row" style="top:240px;background:#edd;cursor:pointer">styled div button</div>
<span id="spanbtn" class="row" style="top:340px;display:block"><button style="width:100%;height:100%"><span id="inner">span inside button</span></button></span>
<pre id="log" style="position:fixed;top:440px;left:40px"></pre>
<script>
  window.__events = [];
  document.addEventListener('click', e => window.__events.push('click@' + (e.target.id || e.target.tagName)), true);
  document.getElementById('btn').addEventListener('click', () => window.__events.push('BTN-HANDLER'));
  document.getElementById('divbtn').addEventListener('click', () => window.__events.push('DIV-HANDLER'));
<\/script>`;

(async () => {
  const http = require('http');
  const srv = await new Promise(res => { const s = http.createServer((rq, rs) => { rs.writeHead(200, {'Content-Type':'text/html'}); rs.end(TEST_PAGE); }); s.listen(0,'127.0.0.1',()=>res(s)); });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wavr-click-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.HEADED !== '1',
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`,
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
    ],
    viewport: { width: 1280, height: 800 },
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await sw.evaluate(() => chrome.storage.local.set({ firstRunDone: true, onboardingComplete: true }));

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await opts.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ type: 'ENABLE' }, res)));

  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/t.html`, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(2000);

  const sendToTab = async (msg) => sw.evaluate(async (m) => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]) await chrome.tabs.sendMessage(tabs[0].id, m).catch(() => {});
  }, msg);
  await sendToTab({ type: 'CURSOR_MODE_CHANGE', active: true });

  const clickAt = async (id) => {
    const c = await page.evaluate((i) => {
      const r = document.getElementById(i).getBoundingClientRect();
      return { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
    }, id);
    await page.evaluate(() => { window.__events.length = 0; location.hash = ''; });
    await sendToTab({ type: 'CURSOR_CLICK', x: c.x, y: c.y });
    await sleep(400);
    return page.evaluate(() => ({ events: [...window.__events], hash: location.hash }));
  };

  console.log('button      :', JSON.stringify(await clickAt('btn')));
  console.log('img-in-link :', JSON.stringify(await clickAt('img')));
  console.log('styled div  :', JSON.stringify(await clickAt('divbtn')));
  console.log('span-in-btn :', JSON.stringify(await clickAt('inner')));

  // now with advancedClickTargets on
  await sw.evaluate(() => chrome.storage.local.set({ advancedClickTargets: true }));
  await sleep(400);
  console.log('--- advancedClickTargets: true ---');
  console.log('img-in-link :', JSON.stringify(await clickAt('img')));
  console.log('styled div  :', JSON.stringify(await clickAt('divbtn')));

  await ctx.close(); srv.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
