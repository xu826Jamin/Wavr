import { createIcons, Camera, Crosshair, Move, Star, Info, ExternalLink } from 'lucide';
import { initScrollReveal } from './scrollReveal.js';

const WAVR_CWS_URL = 'https://chromewebstore.google.com/detail/wavr/placeholder';

const GESTURE_KEYS = [
  'open_swipe_up',    'open_swipe_down',    'open_swipe_left',    'open_swipe_right',
  'closed_swipe_up',  'closed_swipe_down',  'closed_swipe_left',  'closed_swipe_right',
  'pointing_swipe_up','pointing_swipe_down','pointing_swipe_left','pointing_swipe_right',
  'victory_swipe_up', 'victory_swipe_down', 'victory_swipe_left', 'victory_swipe_right',
];

const defaults = {
  open_swipe_up:    'SCROLL_UP',  open_swipe_down:  'SCROLL_DOWN',
  open_swipe_left:  'GO_BACK',    open_swipe_right: 'GO_FORWARD',
  closed_swipe_up:  'SCROLL_TOP', closed_swipe_down: 'SCROLL_BOTTOM',
  closed_swipe_left:'CLOSE_TAB',  closed_swipe_right:'NEW_TAB',
  pointing_swipe_up:'NONE', pointing_swipe_down:'NONE',
  pointing_swipe_left:'NONE', pointing_swipe_right:'NONE',
  victory_swipe_up: 'NONE', victory_swipe_down: 'NONE',
  victory_swipe_left:'NONE', victory_swipe_right:'NONE',
};

// ── Gesture dropdowns ─────────────────────────────────────────────────────────

function applyGestureMap(map) {
  for (const key of GESTURE_KEYS) {
    const el = document.getElementById(key);
    if (el) el.value = map[key] ?? defaults[key];
  }
  updateAllAccordSums();
}

// ── Animated counter helper ───────────────────────────────────────────────────

function animateCounter(el, from, to, durationMs = 600) {
  if (!el || from === to) { if (el) el.textContent = to; return; }
  const start = performance.now();
  const tick = (now) => {
    const t    = Math.min((now - start) / durationMs, 1);
    const ease = 1 - Math.pow(1 - t, 3);          // ease-out cubic
    el.textContent = Math.round(from + (to - from) * ease);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

const _countEl  = document.getElementById('bentoGestureCount');
const _barEl    = document.getElementById('bentoGestureBar');
const _lblEl    = document.getElementById('bentoProgressLabel');
const _achNumEl = document.getElementById('achCountNum');
const _achBarEl = document.getElementById('achProgressFill');
let   _lastGestureCount = 0;

function updateGestureCountUI(count) {
  animateCounter(_countEl,  _lastGestureCount, count);
  animateCounter(_achNumEl, _lastGestureCount, count, 700);
  _lastGestureCount = count;
  if (_barEl)   _barEl.style.width    = Math.min(count / 10 * 100, 100) + '%';
  if (_lblEl)   _lblEl.textContent    = `${count} / 10 for Ten Waves`;
  if (_achBarEl) _achBarEl.style.width = Math.min(count / 10 * 100, 100) + '%';
  const ring = document.getElementById('bentoRing');
  if (ring) ring.style.strokeDashoffset = String(226 - Math.min(count / 10, 1) * 226);
}

let _achFirstLoad = true;

function applyAchievements(a) {
  const count = a?.gestureCount || 0;
  const map = {
    'ach-first':  count >= 1,
    'ach-ten':    count >= 10,
    'ach-cursor': a?.cursorUsed === true,
    'ach-preset': a?.presetApplied === true,
  };
  const animate = !_achFirstLoad;
  _achFirstLoad = false;
  for (const [id, unlocked] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const wasUnlocked = el.classList.contains('unlocked');
    el.classList.toggle('unlocked', unlocked);
    if (animate && unlocked && !wasUnlocked) {
      el.classList.remove('just-unlocked');
      void el.offsetWidth;
      el.classList.add('just-unlocked');
      el.addEventListener('animationend', () => el.classList.remove('just-unlocked'), { once: true });
    }
  }
  updateGestureCountUI(count);
}

function applyTimings(timings) {
  const thumbMs = timings?.thumbHoldMs ?? 400;
  const clickMs = timings?.clickDwellMs ?? 200;
  const thumbEl = document.getElementById('thumbHoldMs');
  const clickEl = document.getElementById('clickDwellMs');
  if (thumbEl) { thumbEl.value = thumbMs; document.getElementById('thumbHoldLabel').textContent = (thumbMs / 1000).toFixed(1) + ' s'; }
  if (clickEl) { clickEl.value = clickMs; document.getElementById('clickDwellLabel').textContent = (clickMs / 1000).toFixed(1) + ' s'; }
}

const MIRROR_X_IDS = ['scrollMirrorX', 'cursorMirrorXLive'];

function setAllMirrorX(value, save = false) {
  MIRROR_X_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = value;
  });
  if (save) chrome.storage.local.set({ cursorMirrorX: value });
}

chrome.storage.local.get(['gestureMap', 'cursorZone', 'cursorMirrorX', 'cursorTimings', 'achievements'], (result) => {
  applyGestureMap(result.gestureMap || defaults);
  applyCursorZone(result.cursorZone ?? { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 });
  setAllMirrorX(result.cursorMirrorX ?? false);
  applyTimings(result.cursorTimings);
  applyAchievements(result.achievements);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.gestureMap) applyGestureMap(changes.gestureMap.newValue || defaults);
  if (changes.cursorZone) applyCursorZone(changes.cursorZone.newValue);
  if (changes.cursorMirrorX != null) setAllMirrorX(changes.cursorMirrorX.newValue);
  if (changes.cursorTimings) applyTimings(changes.cursorTimings.newValue);
  if (changes.achievements) applyAchievements(changes.achievements.newValue);
});

['scrollMirrorX', 'cursorMirrorXLive'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', (e) => {
    setAllMirrorX(e.target.checked, true);
  });
});

document.getElementById('saveBtn').addEventListener('click', () => {
  const saveBtn = document.getElementById('saveBtn');
  saveBtn.classList.add('saving');
  saveBtn.textContent = 'Saving…';
  chrome.storage.local.get(['gestureMap'], (result) => {
    const map = { ...(result.gestureMap || {}) };
    for (const key of GESTURE_KEYS) {
      const el = document.getElementById(key);
      if (el) map[key] = el.value;
    }
    chrome.storage.local.set({ gestureMap: map }, () => {
      saveBtn.classList.remove('saving');
      saveBtn.classList.add('saved');
      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        saveBtn.classList.remove('saved');
        saveBtn.textContent = 'Save';
      }, 2000);
    });
  });
});

document.getElementById('cursorSaveBtn')?.addEventListener('click', () => {
  const thumbEl  = document.getElementById('thumbHoldMs');
  const clickEl  = document.getElementById('clickDwellMs');
  const mirrorEl = document.getElementById('cursorMirrorXLive');
  const cursorTimings = {
    thumbHoldMs:  thumbEl ? parseInt(thumbEl.value, 10)  : 400,
    clickDwellMs: clickEl ? parseInt(clickEl.value, 10) : 200,
  };
  const cursorMirrorX = mirrorEl ? mirrorEl.checked : false;
  chrome.storage.local.set({ cursorTimings, cursorMirrorX }, () => {
    const msg = document.getElementById('cursorSavedMsg');
    msg.textContent = '✓ Saved';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  });
});

document.getElementById('thumbHoldMs')?.addEventListener('input', (e) => {
  document.getElementById('thumbHoldLabel').textContent = (parseInt(e.target.value, 10) / 1000).toFixed(1) + ' s';
});

document.getElementById('clickDwellMs')?.addEventListener('input', (e) => {
  document.getElementById('clickDwellLabel').textContent = (parseInt(e.target.value, 10) / 1000).toFixed(1) + ' s';
});

// ── Accordion ─────────────────────────────────────────────────────────────────

const ACTION_SHORT = {
  SCROLL_UP: 'Scroll ↑', SCROLL_DOWN: 'Scroll ↓',
  GO_BACK: '← Back', GO_FORWARD: 'Forward →',
  SCROLL_TOP: 'Top', SCROLL_BOTTOM: 'Bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab', NONE: '—',
};
const ACCORD_GROUPS = [
  { id: 'open',     keys: ['open_swipe_up',    'open_swipe_down',    'open_swipe_left',    'open_swipe_right'] },
  { id: 'closed',   keys: ['closed_swipe_up',  'closed_swipe_down',  'closed_swipe_left',  'closed_swipe_right'] },
  { id: 'pointing', keys: ['pointing_swipe_up','pointing_swipe_down','pointing_swipe_left','pointing_swipe_right'] },
  { id: 'victory',  keys: ['victory_swipe_up', 'victory_swipe_down', 'victory_swipe_left', 'victory_swipe_right'] },
];
const DIR_ARROWS = ['↑', '↓', '←', '→'];

function updateAccordSum(groupId) {
  const g = ACCORD_GROUPS.find(g => g.id === groupId);
  if (!g) return;
  const parts = g.keys.map((k, i) => {
    const el = document.getElementById(k);
    return el ? `${DIR_ARROWS[i]} ${ACTION_SHORT[el.value] ?? el.value}` : '';
  });
  const sum = document.getElementById(`sum-${groupId}`);
  if (sum) sum.textContent = parts.join('  ');
}

function updateAllAccordSums() {
  for (const g of ACCORD_GROUPS) updateAccordSum(g.id);
}

// ── Accordion spring physics ──────────────────────────────────────────────────

function accordOpen(body) {
  body.classList.add('accord-open');
  body.style.height = '0px';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    body.style.height = body.scrollHeight + 'px';
    body.addEventListener('transitionend', () => {
      if (body.classList.contains('accord-open')) body.style.height = 'auto';
    }, { once: true });
  }));
}

function accordClose(body) {
  body.style.height = body.scrollHeight + 'px';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    body.style.height = '0px';
  }));
  body.classList.remove('accord-open');
}

// Initialize open accordions on load
document.querySelectorAll('.accord-body.accord-open').forEach(b => {
  requestAnimationFrame(() => { b.style.height = 'auto'; });
});

document.querySelectorAll('.accord-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const id   = btn.dataset.accord;
    const body = document.getElementById(`body-${id}`);
    const isOpen = body.classList.contains('accord-open');

    document.querySelectorAll('.accord-body.accord-open').forEach(b => accordClose(b));
    document.querySelectorAll('.accord-header.accord-open').forEach(h => h.classList.remove('accord-open'));

    if (!isOpen) {
      accordOpen(body);
      btn.classList.add('accord-open');
      btn.style.background = 'var(--accent-dim)';
      setTimeout(() => { btn.style.background = ''; }, 300);
    }
  });
});

document.querySelectorAll('.accord-wrap select').forEach(sel => {
  sel.addEventListener('change', () => {
    for (const g of ACCORD_GROUPS) {
      if (g.keys.includes(sel.id)) {
        updateAccordSum(g.id);
        const chip = document.getElementById(`sum-${g.id}`);
        if (chip) {
          chip.classList.remove('flash');
          void chip.offsetWidth;
          chip.classList.add('flash');
          chip.addEventListener('animationend', () => chip.classList.remove('flash'), { once: true });
        }
        break;
      }
    }
  });
});

// ── Share ─────────────────────────────────────────────────────────────────────

document.getElementById('shareWavrBtn')?.addEventListener('click', () => {
  const text = encodeURIComponent('Wave to scroll, navigate, and click Chrome with hand gestures 🖐 — try Wavr, the no-touch browser extension');
  const url  = encodeURIComponent(WAVR_CWS_URL);
  chrome.tabs.create({ url: `https://twitter.com/intent/tweet?text=${text}&url=${url}` });
});

document.getElementById('exportConfigBtn')?.addEventListener('click', () => {
  chrome.storage.local.get(['gestureMap'], (result) => {
    const map  = result.gestureMap || {};
    const code = btoa(JSON.stringify(map));
    navigator.clipboard.writeText(code).then(() => {
      const btn = document.getElementById('exportConfigBtn');
      const orig = btn.textContent;
      btn.textContent = '✓ Copied';
      setTimeout(() => { btn.textContent = orig; }, 1800);
    });
  });
});

document.getElementById('importConfigBtn')?.addEventListener('click', () => {
  const row = document.getElementById('importRow');
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
  if (row.style.display === 'flex') document.getElementById('importConfigInput').focus();
});

document.getElementById('importCancelBtn')?.addEventListener('click', () => {
  document.getElementById('importRow').style.display = 'none';
  document.getElementById('importConfigInput').value = '';
  document.getElementById('importErr').textContent = '';
});

document.getElementById('importApplyBtn')?.addEventListener('click', () => {
  const raw = document.getElementById('importConfigInput').value.trim();
  const err = document.getElementById('importErr');
  try {
    const map = JSON.parse(atob(raw));
    if (typeof map !== 'object' || Array.isArray(map)) throw new Error('invalid');
    chrome.storage.local.get(['gestureMap'], (result) => {
      const merged = { ...(result.gestureMap || {}), ...map };
      chrome.storage.local.set({ gestureMap: merged }, () => {
        applyGestureMap(merged);
        document.getElementById('importRow').style.display = 'none';
        document.getElementById('importConfigInput').value = '';
        err.textContent = '';
        const msg = document.getElementById('savedMsg');
        msg.textContent = '✓ Config imported';
        setTimeout(() => { msg.textContent = ''; }, 2200);
      });
    });
  } catch {
    err.textContent = 'Invalid code';
  }
});

// ── Status pill ───────────────────────────────────────────────────────────────

const statusPill  = document.getElementById('statusPill');
const statusLabel = document.getElementById('statusLabel');

function setStatus(enabled) {
  statusPill.classList.toggle('on', enabled);
  statusLabel.textContent = enabled ? 'ON' : 'OFF';
}

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
  setStatus(resp?.enabled ?? false);
});

statusPill.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE' }, (resp) => {
    setStatus(resp?.enabled ?? false);
  });
});


// ── Camera preview ─────────────────────────────────────────────────────────────

let previewStream = null;

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    previewStream = stream;
    const vid = document.getElementById('previewVideo');
    vid.srcObject = stream;
    vid.style.display = 'block';
    const cursorVid = document.getElementById('cursorVideo');
    if (cursorVid) cursorVid.srcObject = stream;
    const card = document.getElementById('permCard');
    if (card) card.style.display = 'none';
  } catch {
    const card = document.getElementById('permCard');
    if (card) {
      card.querySelector('.ph-text').textContent = 'Camera blocked — allow in browser settings';
      const btn = card.querySelector('.enable-camera-btn');
      if (btn) btn.style.display = 'none';
    }
  }
}

document.getElementById('enableCameraBtn')?.addEventListener('click', startCamera);

startCamera();

window.addEventListener('beforeunload', () => {
  if (previewStream) previewStream.getTracks().forEach(t => t.stop());
});

// ── Cursor Zone ───────────────────────────────────────────────────────────────

let cursorZoneState = { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 };

function applyCursorZone(zone, save = false) {
  cursorZoneState = zone;
  const { cx, cy, w, h } = zone;

  const rect = document.getElementById('cursorZoneRect');
  rect.style.left   = `${(cx - w / 2) * 100}%`;
  rect.style.top    = `${(cy - h / 2) * 100}%`;
  rect.style.width  = `${w * 100}%`;
  rect.style.height = `${h * 100}%`;

  const wPct = Math.round(w * 100);
  const hPct = Math.round(h * 100);
  const cxPct = Math.round(cx * 100);
  const cyPct = Math.round(cy * 100);

  const zoneWEl = document.getElementById('cursorZoneW');
  const zoneHEl = document.getElementById('cursorZoneH');
  if (zoneWEl) { zoneWEl.value = wPct; syncSliderFill(zoneWEl); }
  if (zoneHEl) { zoneHEl.value = hPct; syncSliderFill(zoneHEl); }
  document.getElementById('cursorZoneWLabel').textContent = `${wPct}%`;
  document.getElementById('cursorZoneHLabel').textContent = `${hPct}%`;
  document.getElementById('cursorZoneStatus').textContent =
    `Centre ${cxPct}%, ${cyPct}% — ${wPct}% × ${hPct}%`;

  if (save) chrome.storage.local.set({ cursorZone: zone });
}

document.getElementById('cursorZoneFrame').addEventListener('click', (e) => {
  const frame = e.currentTarget;
  const r = frame.getBoundingClientRect();
  const cx = (e.clientX - r.left) / r.width;
  const cy = (e.clientY - r.top)  / r.height;
  applyCursorZone({ ...cursorZoneState, cx, cy }, true);
});

document.getElementById('cursorZoneW').addEventListener('input', (e) => {
  applyCursorZone({ ...cursorZoneState, w: parseInt(e.target.value, 10) / 100 }, true);
});

document.getElementById('cursorZoneH').addEventListener('input', (e) => {
  applyCursorZone({ ...cursorZoneState, h: parseInt(e.target.value, 10) / 100 }, true);
});

document.getElementById('cursorZoneReset').addEventListener('click', () => {
  applyCursorZone({ cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 }, true);
});

// ── First-run onboarding ───────────────────────────────────────────────────────

const frOverlay = document.getElementById('firstRunOverlay');

chrome.storage.local.get(['onboardingComplete'], ({ onboardingComplete }) => {
  if (onboardingComplete) frOverlay.style.display = 'none';
});

function frGoToStep(n) {
  const steps   = Array.from(frOverlay.querySelectorAll('.fr-step'));
  const current = steps.find(s => s.classList.contains('fr-active'));
  const next    = steps[n - 1];
  if (!next || current === next) return;

  if (current) {
    current.classList.remove('fr-active');
    current.classList.add('fr-exiting');
    current.addEventListener('animationend', () => current.classList.remove('fr-exiting'), { once: true });
  }

  next.classList.add('fr-active', 'fr-entering');
  next.addEventListener('animationend', () => next.classList.remove('fr-entering'), { once: true });

  frOverlay.querySelectorAll('.fr-dot').forEach((d, i) =>
    d.classList.toggle('fr-active', i === n - 1)
  );
}

function frFinish() {
  frOverlay.style.opacity = '0';
  setTimeout(() => { frOverlay.style.display = 'none'; }, 400);
  chrome.storage.local.set({ onboardingComplete: true });
}

document.getElementById('frNext1').addEventListener('click', () => frGoToStep(2));

document.getElementById('frAllowCamera').addEventListener('click', async () => {
  if (!previewStream) await startCamera();
  const frVid = document.getElementById('frVideo');
  if (previewStream) {
    if (frVid) frVid.srcObject = previewStream;
    frGoToStep(3);
    frWatchGesture();
  } else {
    document.getElementById('frCamError').textContent =
      'Camera blocked — allow access in your browser settings.';
  }
});

document.getElementById('frSkipCamera').addEventListener('click', () => {
  const frVid = document.getElementById('frVideo');
  if (frVid && previewStream) frVid.srcObject = previewStream;
  frGoToStep(3);
  if (previewStream) frWatchGesture();
});

document.getElementById('frSkipGesture').addEventListener('click', frFinish);

function frWatchGesture() {
  const badge     = document.getElementById('frGestureBadge');
  const indicator = document.getElementById('gestureIndicator');
  if (!indicator || !badge) return;

  let done = false;
  const obs = new MutationObserver(() => {
    const text = indicator.textContent.trim();
    badge.textContent = text;
    if (text && !done) {
      done = true;
      obs.disconnect();
      setTimeout(frFinish, 1000);
    }
  });
  obs.observe(indicator, { childList: true, subtree: true, characterData: true });
}

// ── Mockup panel ───────────────────────────────────────────────────────────────

const MOCK_GESTURES = [
  { dir: 'up',    arrow: '↑', label: 'Swipe up',    key: 'open_swipe_up' },
  { dir: 'right', arrow: '→', label: 'Swipe right', key: 'open_swipe_right' },
  { dir: 'down',  arrow: '↓', label: 'Swipe down',  key: 'open_swipe_down' },
  { dir: 'left',  arrow: '←', label: 'Swipe left',  key: 'open_swipe_left' },
];

const MOCK_ACTION_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'Scroll to top', SCROLL_BOTTOM: 'Scroll to bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab', NONE: 'Do nothing',
};

let mockStep = 0;
let mockGestureMap = {};
let mockIntervalId = null;

function runMockStep() {
  const g      = MOCK_GESTURES[mockStep % MOCK_GESTURES.length];
  mockStep++;
  const action = mockGestureMap[g.key] ?? defaults[g.key] ?? 'NONE';

  const arrow = document.getElementById('mockupArrow');
  if (!arrow) return;
  arrow.className = 'mockup-arrow';
  void arrow.offsetWidth;
  arrow.textContent = g.arrow;
  arrow.className = `mockup-arrow a-${g.dir}`;
  const dirName = document.getElementById('mockupDirName');
  if (dirName) dirName.textContent = g.label;

  const card = document.getElementById('mockupCard');
  if (card) { card.className = 'mockup-gesture-card'; void card.offsetWidth; card.className = 'mockup-gesture-card glow'; }

  const actionTag = document.getElementById('mockupActionTag');
  if (actionTag) actionTag.textContent = MOCK_ACTION_LABELS[action] || action;

  const track   = document.getElementById('mockupTrack');
  const overlay = document.getElementById('mockupOverlay');
  const navBack = document.getElementById('mockupNavBack');
  const navFwd  = document.getElementById('mockupNavFwd');

  overlay.className = 'mockup-overlay';
  overlay.textContent = '';
  navBack.classList.remove('lit');
  navFwd.classList.remove('lit');

  if (action === 'SCROLL_UP' || action === 'SCROLL_TOP') {
    track.style.transition = 'none';
    track.style.transform  = 'translateY(-52px)';
    setTimeout(() => {
      track.style.transition = 'transform 0.52s cubic-bezier(0.4,0,0.2,1)';
      track.style.transform  = 'translateY(0)';
    }, 20);
  } else if (action === 'SCROLL_DOWN' || action === 'SCROLL_BOTTOM') {
    track.style.transition = 'none';
    track.style.transform  = 'translateY(0)';
    setTimeout(() => {
      track.style.transition = 'transform 0.52s cubic-bezier(0.4,0,0.2,1)';
      track.style.transform  = 'translateY(-52px)';
    }, 20);
  } else if (action === 'GO_BACK') {
    navBack.classList.add('lit');
    overlay.textContent = '←';
    overlay.className = 'mockup-overlay show';
    setTimeout(() => { overlay.className = 'mockup-overlay'; }, 700);
  } else if (action === 'GO_FORWARD') {
    navFwd.classList.add('lit');
    overlay.textContent = '→';
    overlay.className = 'mockup-overlay show';
    setTimeout(() => { overlay.className = 'mockup-overlay'; }, 700);
  } else if (action === 'NEW_TAB') {
    overlay.textContent = '+';
    overlay.className = 'mockup-overlay show';
    setTimeout(() => { overlay.className = 'mockup-overlay'; }, 700);
  } else if (action === 'CLOSE_TAB') {
    overlay.textContent = '✕';
    overlay.className = 'mockup-overlay show';
    setTimeout(() => { overlay.className = 'mockup-overlay'; }, 700);
  }
}

chrome.storage.local.get(['gestureMap'], (result) => {
  mockGestureMap = result.gestureMap || {};
  runMockStep();
  mockIntervalId = setInterval(runMockStep, 2500);
});

window.addEventListener('pagehide', () => { clearInterval(mockIntervalId); });

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.gestureMap) mockGestureMap = changes.gestureMap.newValue || {};
});

// ── Preset panel ───────────────────────────────────────────────────────────────

const PRESETS = [
  {
    id: 'reader',
    icon: '📖',
    name: 'Reader',
    desc: 'All gestures focused on scrolling through long content',
    map: {
      open_swipe_up: 'SCROLL_UP',    open_swipe_down: 'SCROLL_DOWN',
      open_swipe_left: 'SCROLL_TOP', open_swipe_right: 'SCROLL_BOTTOM',
      closed_swipe_up: 'SCROLL_UP',    closed_swipe_down: 'SCROLL_DOWN',
      closed_swipe_left: 'SCROLL_TOP', closed_swipe_right: 'SCROLL_BOTTOM',
      pointing_swipe_up: 'SCROLL_UP',    pointing_swipe_down: 'SCROLL_DOWN',
      pointing_swipe_left: 'SCROLL_TOP', pointing_swipe_right: 'SCROLL_BOTTOM',
      victory_swipe_up: 'NONE', victory_swipe_down: 'NONE',
      victory_swipe_left: 'NONE', victory_swipe_right: 'NONE',
    },
  },
  {
    id: 'navigator',
    icon: '🧭',
    name: 'Navigator',
    desc: 'Balanced mix of scrolling and browser navigation',
    map: {
      open_swipe_up: 'SCROLL_UP',     open_swipe_down: 'SCROLL_DOWN',
      open_swipe_left: 'GO_BACK',     open_swipe_right: 'GO_FORWARD',
      closed_swipe_up: 'SCROLL_TOP',  closed_swipe_down: 'SCROLL_BOTTOM',
      closed_swipe_left: 'GO_BACK',   closed_swipe_right: 'GO_FORWARD',
      pointing_swipe_up: 'SCROLL_UP',   pointing_swipe_down: 'SCROLL_DOWN',
      pointing_swipe_left: 'GO_BACK',   pointing_swipe_right: 'GO_FORWARD',
      victory_swipe_up: 'SCROLL_TOP',   victory_swipe_down: 'SCROLL_BOTTOM',
      victory_swipe_left: 'GO_BACK',    victory_swipe_right: 'GO_FORWARD',
    },
  },
  {
    id: 'power',
    icon: '⚡',
    name: 'Power User',
    desc: 'Full gesture suite — scroll, navigate, and manage tabs',
    map: {
      open_swipe_up: 'SCROLL_UP',      open_swipe_down: 'SCROLL_DOWN',
      open_swipe_left: 'GO_BACK',      open_swipe_right: 'GO_FORWARD',
      closed_swipe_up: 'SCROLL_TOP',   closed_swipe_down: 'SCROLL_BOTTOM',
      closed_swipe_left: 'CLOSE_TAB',  closed_swipe_right: 'NEW_TAB',
      pointing_swipe_up: 'SCROLL_UP',    pointing_swipe_down: 'SCROLL_DOWN',
      pointing_swipe_left: 'GO_BACK',    pointing_swipe_right: 'GO_FORWARD',
      victory_swipe_up: 'NEW_TAB',       victory_swipe_down: 'CLOSE_TAB',
      victory_swipe_left: 'GO_BACK',     victory_swipe_right: 'GO_FORWARD',
    },
  },
];

const PRESET_CHIP_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'To top', SCROLL_BOTTOM: 'To bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab', NONE: 'Nothing',
};

let selectedPresetId = null;

function getCurrentOpenPalmMap() {
  const map = {};
  for (const key of GESTURE_KEYS) {
    const el = document.getElementById(key);
    if (el) map[key] = el.value;
  }
  return map;
}

function buildPresetCards() {
  const container = document.getElementById('presetCards');
  container.innerHTML = '';
  const current = getCurrentOpenPalmMap();

  for (const preset of PRESETS) {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.preset = preset.id;

    const chips = [
      { arrow: '↑', key: 'open_swipe_up' },
      { arrow: '↓', key: 'open_swipe_down' },
      { arrow: '←', key: 'open_swipe_left' },
      { arrow: '→', key: 'open_swipe_right' },
    ].map(({ arrow, key }) => {
      const action  = preset.map[key];
      const changed = action !== (current[key] ?? defaults[key]);
      return `<span class="preset-map-chip${changed ? ' changed' : ''}">${arrow} ${PRESET_CHIP_LABELS[action] ?? action}</span>`;
    }).join('');

    card.innerHTML = `
      <div class="preset-card-icon">${preset.icon}</div>
      <div class="preset-card-body">
        <div class="preset-card-name">${preset.name}</div>
        <div class="preset-card-desc">${preset.desc}</div>
        <div class="preset-card-map">${chips}</div>
      </div>`;

    card.addEventListener('click', () => {
      container.querySelectorAll('.preset-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPresetId = preset.id;
      document.getElementById('presetApplyBtn').disabled = false;
    });

    container.appendChild(card);
  }
}

function openPresetPanel() {
  selectedPresetId = null;
  document.getElementById('presetApplyBtn').disabled = true;
  buildPresetCards();
  document.getElementById('presetBackdrop').classList.add('show');
  document.getElementById('presetPanel').classList.add('show');
}

function closePresetPanel() {
  document.getElementById('presetBackdrop').classList.remove('show');
  document.getElementById('presetPanel').classList.remove('show');
}

function applyPreset() {
  const preset = PRESETS.find(p => p.id === selectedPresetId);
  if (!preset) return;

  for (const key of GESTURE_KEYS) {
    const el = document.getElementById(key);
    if (el && preset.map[key]) el.value = preset.map[key];
  }
  updateAllAccordSums();

  chrome.storage.local.get(['gestureMap', 'achievements'], (result) => {
    const map = { ...(result.gestureMap || {}), ...preset.map };
    const ach = { ...(result.achievements || {}), presetApplied: true };
    chrome.storage.local.set({ gestureMap: map, achievements: ach }, () => {
      const msg = document.getElementById('savedMsg');
      msg.textContent = `✓ ${preset.name} preset applied`;
      setTimeout(() => { msg.textContent = ''; }, 2500);
    });
  });

  closePresetPanel();
}

document.getElementById('presetTriggerBtn').addEventListener('click', openPresetPanel);
document.getElementById('presetCancelBtn').addEventListener('click', closePresetPanel);
document.getElementById('presetBackdrop').addEventListener('click', closePresetPanel);
document.getElementById('presetApplyBtn').addEventListener('click', applyPreset);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePresetPanel(); });

// ── Bento status toggle ───────────────────────────────────────────────────────

const bentoToggleInput = document.getElementById('bentoStatusToggle');

function setBentoToggle(enabled) {
  if (bentoToggleInput) bentoToggleInput.checked = enabled;
}

if (bentoToggleInput) {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError) return;
    setBentoToggle(!!resp?.enabled);
  });
  bentoToggleInput.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE' }, (resp) => {
      if (chrome.runtime.lastError) return;
      setBentoToggle(!!resp?.enabled);
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'STATUS_CHANGED') return;
  setStatus(message.enabled);
  setBentoToggle(message.enabled);
});

// ── Toggle ripple effect (all .wavr-toggle elements) ──────────────────────────

document.querySelectorAll('.wavr-toggle-input').forEach(input => {
  input.addEventListener('change', () => {
    const ripple = input.closest('.wavr-toggle')?.querySelector('.wavr-toggle-ripple');
    if (!ripple) return;
    ripple.classList.remove('fire');
    void ripple.offsetWidth;                       // force reflow to restart animation
    ripple.classList.add('fire');
    ripple.addEventListener('animationend', () => ripple.classList.remove('fire'), { once: true });
  });
});

// ── Slider fill sync (wavr-range inputs) ─────────────────────────────────────

function syncSliderFill(slider) {
  const pct = (slider.value - slider.min) / (slider.max - slider.min) * 100;
  slider.style.setProperty('--slider-fill', pct.toFixed(1) + '%');
}

document.querySelectorAll('input[type=range].wavr-range').forEach(slider => {
  syncSliderFill(slider);
  slider.addEventListener('input', () => syncSliderFill(slider));
});

createIcons({ icons: { Camera, Crosshair, Move, Star, Info, ExternalLink } });

initScrollReveal();


document.getElementById('heroCta')?.addEventListener('click', startCamera);

// ── Topbar scroll shadow ──────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  document.querySelector('.topbar')?.classList.toggle('scrolled', window.scrollY > 80);
}, { passive: true });

// ── Gesture Explorer ──────────────────────────────────────────────────────────

const EXPLORER_ACTION_LABELS = {
  SCROLL_UP: 'Scroll Up', SCROLL_DOWN: 'Scroll Down',
  GO_BACK: 'Go Back', GO_FORWARD: 'Go Forward',
  SCROLL_TOP: 'Scroll to Top', SCROLL_BOTTOM: 'Scroll to Bottom',
  NEW_TAB: 'New Tab', CLOSE_TAB: 'Close Tab', NONE: 'No action mapped',
};

let explorerPose = 'open';
let explorerDir  = 'up';
let explorerMap  = {};
let explorerDebounce = null;

function getExplorerAction() {
  const key = `${explorerPose}_swipe_${explorerDir}`;
  return explorerMap[key] ?? defaults[key] ?? 'NONE';
}

function showExplorerBadge(text) {
  const badge = document.getElementById('explorerActionBadge');
  if (!badge) return;
  badge.textContent = text;
  badge.classList.add('visible');
  clearTimeout(badge._timer);
  badge._timer = setTimeout(() => badge.classList.remove('visible'), 1200);
}

function runExplorerAnimation(action) {
  const track   = document.getElementById('explorerTrack');
  const overlay = document.getElementById('explorerOverlay');
  const navBack = document.getElementById('explorerNavBack');
  const navFwd  = document.getElementById('explorerNavFwd');
  const urlEl   = document.getElementById('explorerUrl');
  const noneEl  = document.getElementById('explorerNoneLabel');
  if (!track) return;

  if (overlay) { overlay.className = 'mockup-overlay'; overlay.textContent = ''; }
  if (navBack) navBack.classList.remove('lit');
  if (navFwd)  navFwd.classList.remove('lit');
  if (noneEl)  noneEl.style.display = 'none';

  showExplorerBadge(EXPLORER_ACTION_LABELS[action] || action);

  if (action === 'SCROLL_UP') {
    track.style.transition = 'none';
    track.style.transform  = 'translateY(0)';
    setTimeout(() => {
      track.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
      track.style.transform  = 'translateY(60px)';
    }, 20);
    setTimeout(() => {
      track.style.transition = 'transform 0.6s cubic-bezier(0.4,0,0.2,1)';
      track.style.transform  = 'translateY(0)';
    }, 1200);
  } else if (action === 'SCROLL_DOWN') {
    track.style.transition = 'none';
    track.style.transform  = 'translateY(0)';
    setTimeout(() => {
      track.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
      track.style.transform  = 'translateY(-60px)';
    }, 20);
    setTimeout(() => {
      track.style.transition = 'transform 0.6s cubic-bezier(0.4,0,0.2,1)';
      track.style.transform  = 'translateY(0)';
    }, 1200);
  } else if (action === 'SCROLL_TOP') {
    track.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
    track.style.transform  = 'translateY(0)';
  } else if (action === 'SCROLL_BOTTOM') {
    track.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
    track.style.transform  = 'translateY(-120px)';
    setTimeout(() => {
      track.style.transition = 'transform 0.6s cubic-bezier(0.16,1,0.3,1)';
      track.style.transform  = 'translateY(0)';
    }, 1200);
  } else if (action === 'GO_BACK') {
    if (navBack) navBack.classList.add('lit');
    if (urlEl) {
      urlEl.style.opacity = '0';
      const urls = ['prev.io/page', 'google.com/search', 'wavr.io'];
      setTimeout(() => {
        urlEl.textContent = urls[Math.floor(Math.random() * urls.length)];
        urlEl.style.opacity = '1';
      }, 150);
    }
    if (overlay) { overlay.textContent = '←'; overlay.className = 'mockup-overlay show'; }
    setTimeout(() => {
      if (overlay) overlay.className = 'mockup-overlay';
      if (navBack) navBack.classList.remove('lit');
    }, 700);
  } else if (action === 'GO_FORWARD') {
    if (navFwd) navFwd.classList.add('lit');
    if (urlEl) {
      urlEl.style.opacity = '0';
      const urls = ['wavr.io/next', 'docs.io/guide', 'github.com/wavr'];
      setTimeout(() => {
        urlEl.textContent = urls[Math.floor(Math.random() * urls.length)];
        urlEl.style.opacity = '1';
      }, 150);
    }
    if (overlay) { overlay.textContent = '→'; overlay.className = 'mockup-overlay show'; }
    setTimeout(() => {
      if (overlay) overlay.className = 'mockup-overlay';
      if (navFwd) navFwd.classList.remove('lit');
    }, 700);
  } else if (action === 'NEW_TAB') {
    if (overlay) { overlay.textContent = '+'; overlay.className = 'mockup-overlay show'; }
    setTimeout(() => { if (overlay) overlay.className = 'mockup-overlay'; }, 1500);
  } else if (action === 'CLOSE_TAB') {
    if (overlay) { overlay.textContent = '✕'; overlay.className = 'mockup-overlay show'; }
    setTimeout(() => { if (overlay) overlay.className = 'mockup-overlay'; }, 700);
  } else if (action === 'NONE') {
    if (noneEl) noneEl.style.display = 'block';
  }
}

function updateExplorer() {
  const key    = `${explorerPose}_swipe_${explorerDir}`;
  const action = getExplorerAction();
  const keyEl    = document.getElementById('explorerKey');
  const actionEl = document.getElementById('explorerActionText');
  if (keyEl)    keyEl.textContent    = key;
  if (actionEl) actionEl.textContent = EXPLORER_ACTION_LABELS[action] || action;
  runExplorerAnimation(action);
}

(function initExplorer() {
  chrome.storage.local.get(['gestureMap'], (result) => {
    explorerMap = result.gestureMap || {};
    updateExplorer();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.gestureMap) {
      explorerMap = changes.gestureMap.newValue || {};
      updateExplorer();
    }
  });

  document.querySelectorAll('.explorer-pose-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.explorer-pose-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      explorerPose = btn.dataset.pose;
      clearTimeout(explorerDebounce);
      explorerDebounce = setTimeout(updateExplorer, 150);
    });
  });

  const dpadBtns = document.querySelectorAll('.dpad-btn');
  dpadBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      dpadBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      explorerDir = btn.dataset.dir;
      clearTimeout(explorerDebounce);
      explorerDebounce = setTimeout(updateExplorer, 150);
    });
  });

  const initUp = document.querySelector('.dpad-btn[data-dir="up"]');
  if (initUp) initUp.classList.add('active');
})();

