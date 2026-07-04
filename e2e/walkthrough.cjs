// New-user walkthrough: drives the built extension like a first-time user and
// screenshots every state. Output: scratchpad/walk/*.png
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(__dirname, 'walk');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PAGE_HTML = `<!doctype html><title>Article</title><style>body{font:17px/1.6 Georgia,serif;max-width:720px;margin:0 auto;padding:40px 20px;color:#222;background:#fafaf7}h1{font-size:34px}</style>
<h1>A long article to read hands-free</h1>` + Array.from({length:60},(_,i)=>`<p>Paragraph ${i}. ${'The quick brown fox jumps over the lazy dog. '.repeat(6)}</p>`).join('');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const http = require('http');
  const srv = await new Promise(res => { const s = http.createServer((rq, rs) => { rs.writeHead(200, {'Content-Type':'text/html'}); rs.end(PAGE_HTML); }); s.listen(0,'127.0.0.1',()=>res(s)); });
  const pageUrl = `http://127.0.0.1:${srv.address().port}/article.html`;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wavr-walk-'));
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
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });

  // ── 1. First-run wizard (what a toolbar click opens on install) ──
  const popup = await ctx.newPage();
  await popup.goto(`chrome-extension://${extId}/src/popup/popup.html`, { waitUntil: 'load' });
  await sleep(2500);
  await shot(popup, '01_wizard_step1');
  await popup.click('#frNext1').catch(e => console.log('frNext1:', e.message));
  await sleep(700);
  await shot(popup, '02_wizard_step2');
  await popup.click('#frAllowCamera').catch(e => console.log('frAllowCamera:', e.message));
  await sleep(2000);
  await shot(popup, '03_wizard_step3');
  // fake camera has no hand → gesture test can never pass; what does the user see?
  await sleep(4000);
  await shot(popup, '04_wizard_step3_waiting');
  await popup.click('#frSkipGesture').catch(e => console.log('frSkipGesture:', e.message));
  await sleep(900);
  await shot(popup, '05_main_after_wizard');

  // ── 2. Options page tour ──
  const scrollShot = async (sel, name) => {
    const ok = await popup.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: 'start' }); return true; }, sel);
    await sleep(1200);
    if (ok) await shot(popup, name); else console.log('missing section', sel);
  };
  await scrollShot('#intro', '06_intro_bento');
  await scrollShot('#gesture-explorer', '07_explorer');
  await scrollShot('#setup', '08_setup');
  await scrollShot('#gestures', '09_gestures');
  await scrollShot('#settings', '10_settings');
  // open the first accordion
  await popup.evaluate(() => document.querySelector('.accord-header')?.click());
  await sleep(900);
  await shot(popup, '11_settings_accordion_open');
  await scrollShot('#tutorial', '12_dosdonts');

  // preset panel
  await popup.evaluate(() => { window.scrollTo(0, 0); });
  await sleep(400);
  const presetBtn = await popup.evaluate(() => {
    const btn = document.getElementById('openPresets') || document.querySelector('[id*="reset" i], [class*="preset" i] button, button[class*="preset" i]');
    if (btn) { btn.scrollIntoView({ block: 'center' }); return btn.id || btn.className; } return null;
  });
  console.log('preset trigger:', presetBtn);
  await sleep(500);
  await popup.evaluate(() => (document.getElementById('openPresets') || document.querySelector('button[class*="preset" i]'))?.click());
  await sleep(900);
  await shot(popup, '13_preset_panel');
  await popup.keyboard.press('Escape');
  await sleep(500);

  // cursor tab
  await popup.evaluate(() => { document.querySelectorAll('.tab-bar button, .tab-bar .tab').forEach(t => { if (/cursor/i.test(t.textContent)) t.click(); }); });
  await sleep(1200);
  await shot(popup, '14_cursor_tab');
  await popup.evaluate(() => window.scrollBy(0, 800)); await sleep(800);
  await shot(popup, '15_cursor_tab_settings');

  // status pill state
  const pill = await popup.evaluate(() => document.querySelector('#statusPill, .status-pill')?.textContent?.trim());
  console.log('status pill after wizard:', JSON.stringify(pill));

  // ── 3. On-page widget states ──
  const page = await ctx.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.bringToFront();
  await sleep(2500);
  await shot(page, '20_widget_initial');

  const sendToTab = async (msg) => sw.evaluate(async (m) => {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs[0]) await chrome.tabs.sendMessage(tabs[0].id, m).catch(() => {});
  }, msg);

  // gesture fired state (+ reaction avatar)
  await sendToTab({ type: 'GESTURE_DISPLAY', label: '🖐 SWIPE UP → Scroll up (0.93)', pose: 'open', dir: 'up' });
  await sleep(500);
  await shot(page, '21_widget_gesture');

  // waiting-for-reset (neutral zone ring)
  await sendToTab({ type: 'OVERLAY_STATE', wristX: 0.7, wristY: 0.3, bufferFill: 3, bufferMax: 8, waitingForReset: true, originX: 0.5, originY: 0.55, deadZoneRadius: 0.10 });
  await sleep(400);
  await shot(page, '22_widget_reset_ring');

  // scroll noop + mirror suggestion + camera error
  await sendToTab({ type: 'SCROLL_NOOP' }); await sleep(300); await shot(page, '23_widget_noop');
  await sendToTab({ type: 'MIRROR_SUGGEST' }); await sleep(300); await shot(page, '24_widget_mirror_hint');
  await sendToTab({ type: 'CAMERA_ERROR', message: 'Camera unavailable. Check that no other app is using it.' }); await sleep(300); await shot(page, '25_widget_cam_error');

  // cursor mode visuals
  await sendToTab({ type: 'CURSOR_MODE_CHANGE', active: true });
  await sendToTab({ type: 'CURSOR_STATE', x: 0.4, y: 0.35, clicking: false, dwellProgress: 0.6, cursorZone: { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 }, wristX: 0.45, wristY: 0.4 });
  await sleep(400);
  await shot(page, '26_cursor_mode');

  // widget after page reload mid-session (does it come back?)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await shot(page, '27_widget_after_reload');

  console.log('done. shots in', OUT);
  await ctx.close(); srv.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
