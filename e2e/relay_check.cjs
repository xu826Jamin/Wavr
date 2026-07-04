// Verify the VIDEO_FRAME relay never stops: count relay messages in the SW
// during the active window (right after enable) and after idle (>4s no hand).
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const { chromium } = require(path.join(ROOT, 'node_modules', 'playwright'));
const DIST = path.join(ROOT, 'dist');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wavr-relay-'));
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: process.env.HEADED !== '1',
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
    viewport: { width: 1280, height: 800 },
  });
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await sw.evaluate(() => {
    chrome.storage.local.set({ firstRunDone: true, onboardingComplete: true });
    self.__vf = 0; self.__lastLen = 0; self.__sigs = new Set();
    chrome.runtime.onMessage.addListener(m => {
      if (m.type === 'VIDEO_FRAME') { self.__vf++; self.__lastLen = m.data.length; self.__sigs.add(m.data.length + ':' + m.data.slice(500, 520)); }
    });
  });

  const opts = await ctx.newPage();
  await opts.goto(`chrome-extension://${extId}/src/popup/popup.html`, { waitUntil: 'domcontentloaded' });
  await opts.evaluate(() => new Promise(res => chrome.runtime.sendMessage({ type: 'ENABLE' }, res)));
  console.log('enabled; waiting for camera spin-up...');
  await sleep(2500);

  const sample = async (label, ms) => {
    const a = await sw.evaluate(() => ({ n: self.__vf, sigs: self.__sigs.size }));
    await sleep(ms);
    const b = await sw.evaluate(() => ({ n: self.__vf, sigs: self.__sigs.size, len: self.__lastLen }));
    console.log(`${label}: ${((b.n - a.n) / (ms / 1000)).toFixed(1)} frames/s  (uniqueFrameSigs total=${b.sigs}, lastJpegLen=${b.len})`);
  };

  await sample('ACTIVE  (0-3s after spin-up)', 3000);
  console.log('waiting 7s for idle threshold (4s no-hand)...');
  await sleep(7000);
  await sample('IDLE    (post-threshold)   ', 3000);

  await ctx.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
