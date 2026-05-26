const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/offscreen.html');

function migrateGestureMap(map) {
  if (!map) return null;
  let m = map;
  let changed = false;

  // Old 4-key format → 8-key
  if (m.open_swipe_up === undefined) {
    m = {
      open_swipe_up:    m.swipe_up    || 'SCROLL_UP',
      open_swipe_down:  m.swipe_down  || 'SCROLL_DOWN',
      open_swipe_left:  m.swipe_left  || 'GO_BACK',
      open_swipe_right: m.swipe_right || 'GO_FORWARD',
      closed_swipe_up:    'SCROLL_TOP',
      closed_swipe_down:  'SCROLL_BOTTOM',
      closed_swipe_left:  'CLOSE_TAB',
      closed_swipe_right: 'NEW_TAB',
    };
    changed = true;
  }

  // Add pointing/victory keys if missing
  for (const p of ['pointing', 'victory']) {
    for (const d of ['up', 'down', 'left', 'right']) {
      const key = `${p}_swipe_${d}`;
      if (!(key in m)) { m = { ...m, [key]: 'NONE' }; changed = true; }
    }
  }

  // CURSOR_MODE is no longer a valid action — strip it
  for (const [k, v] of Object.entries(m)) {
    if (v === 'CURSOR_MODE') { m = { ...m, [k]: 'NONE' }; changed = true; }
  }

  if (changed) chrome.storage.local.set({ gestureMap: m });
  return m;
}

async function createOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Webcam access for hand gesture detection',
    });
    chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
  }
}

async function closeOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (exists) await chrome.offscreen.closeDocument();
}

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (
        tab.url &&
        !tab.url.startsWith('chrome://') &&
        !tab.url.startsWith('chrome-extension://') &&
        tab.url !== 'about:blank'
      ) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.gestureMap) {
    chrome.runtime.sendMessage(
      { type: 'SET_GESTURE_MAP', gestureMap: migrateGestureMap(changes.gestureMap.newValue) },
      () => { chrome.runtime.lastError; }
    );
  }
  if (changes.deadZoneAnchor) {
    chrome.runtime.sendMessage(
      { type: 'SET_DEAD_ZONE_ANCHOR', anchor: changes.deadZoneAnchor.newValue ?? null },
      () => { chrome.runtime.lastError; }
    );
  }
  if (changes.deadZoneRadius != null) {
    chrome.runtime.sendMessage(
      { type: 'SET_DEAD_ZONE_RADIUS', radius: changes.deadZoneRadius.newValue },
      () => { chrome.runtime.lastError; }
    );
  }
  if (changes.cursorMirrorX != null) {
    const msg = { type: 'SET_MIRROR_X', mirrorX: changes.cursorMirrorX.newValue };
    chrome.runtime.sendMessage(msg, () => { chrome.runtime.lastError; });
    broadcastToTabs(msg);
  }
  if (changes.cursorZone) {
    chrome.runtime.sendMessage(
      { type: 'SET_CURSOR_ZONE', zone: changes.cursorZone.newValue },
      () => { chrome.runtime.lastError; }
    );
  }
  if (changes.cursorTimings) {
    chrome.runtime.sendMessage(
      { type: 'SET_CURSOR_TIMINGS', timings: changes.cursorTimings.newValue },
      () => { chrome.runtime.lastError; }
    );
  }
});

chrome.action.onClicked.addListener(async () => {
  const { firstRunDone } = await chrome.storage.local.get('firstRunDone');
  if (!firstRunDone) {
    await chrome.storage.local.set({ firstRunDone: true });
    chrome.runtime.openOptionsPage();
    return;
  }

  const exists = await chrome.offscreen.hasDocument();
  if (exists) {
    await closeOffscreen();
    broadcastToTabs({ type: 'HIDE_OVERLAY' });
    chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: false }).catch(() => {});
  } else {
    await createOffscreen();
    broadcastToTabs({ type: 'START_OVERLAY' });
    chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: true }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE') {
    chrome.offscreen.hasDocument().then(async (exists) => {
      if (exists) {
        await closeOffscreen();
        broadcastToTabs({ type: 'HIDE_OVERLAY' });
        sendResponse({ enabled: false });
      } else {
        await createOffscreen();
        broadcastToTabs({ type: 'START_OVERLAY' });
        sendResponse({ enabled: true });
      }
    });
    return true;
  }

  if (message.type === 'STOP') {
    chrome.offscreen.hasDocument().then(async (exists) => {
      if (exists) {
        await closeOffscreen();
        broadcastToTabs({ type: 'HIDE_OVERLAY' });
        chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: false }).catch(() => {});
      }
      sendResponse({ enabled: false });
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.offscreen.hasDocument().then(exists => {
      sendResponse({ enabled: exists });
    });
    return true;
  }

  if (message.type === 'GET_GESTURE_MAP') {
    chrome.storage.local.get(['gestureMap', 'deadZoneAnchor', 'deadZoneRadius', 'cursorMirrorX', 'cursorZone', 'cursorTimings'], (result) => {
      sendResponse({
        gestureMap:     migrateGestureMap(result.gestureMap),
        deadZoneAnchor: result.deadZoneAnchor ?? { x: 0.5, y: 0.5 },
        deadZoneRadius: result.deadZoneRadius ?? null,
        cursorMirrorX:  result.cursorMirrorX  ?? false,
        cursorZone:     result.cursorZone     ?? { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 },
        cursorTimings:  result.cursorTimings  ?? { thumbHoldMs: 400, clickDwellMs: 200 },
      });
    });
    return true;
  }

  if (message.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    return false;
  }

  if (message.type === 'OPEN_URL') {
    chrome.tabs.create({ url: message.url });
    return false;
  }

  if (message.type === 'VIDEO_FRAME') {
    broadcastToTabs(message);
    return false;
  }

  if (message.type === 'GESTURE_DISPLAY') {
    broadcastToTabs({ type: 'GESTURE_DISPLAY', label: message.label });
    return false;
  }

  if (message.type === 'OVERLAY_STATE') {
    broadcastToTabs(message);
    return false;
  }

  if (message.type === 'CURSOR_MODE_CHANGE') {
    broadcastToTabs(message);
    if (message.active) {
      chrome.storage.local.get(['achievements'], (r) => {
        const a = { ...(r.achievements || {}), cursorUsed: true };
        chrome.storage.local.set({ achievements: a });
      });
    }
    return false;
  }

  if (message.type === 'CURSOR_STATE' || message.type === 'CURSOR_CLICK') {
    broadcastToTabs(message);
    return false;
  }

  if (message.type === 'GESTURE_DETECTED') {
    if (message.action && message.action !== 'NONE') {
      chrome.storage.local.get(['achievements'], (r) => {
        const a = { ...(r.achievements || {}), gestureCount: ((r.achievements?.gestureCount) || 0) + 1 };
        chrome.storage.local.set({ achievements: a });
      });
    }

    chrome.tabs.query({}, (tabs) => {
      const target = tabs
        .filter(t =>
          t.url &&
          !t.url.startsWith('chrome://') &&
          !t.url.startsWith('chrome-extension://') &&
          t.url !== 'about:blank'
        )
        .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];

      if (target?.id) {
        const action = message.action;

        if (action === 'NEW_TAB') {
          chrome.tabs.create({});
          return;
        }
        if (action === 'CLOSE_TAB') {
          chrome.tabs.remove(target.id);
          return;
        }

        chrome.scripting.executeScript({
          target: { tabId: target.id },
          func: (action, amount) => {
            function getScrollTarget() {
              const candidates = Array.from(document.querySelectorAll('*'));
              let best = null;
              let bestScore = 0;
              for (const el of candidates) {
                const scrollable = el.scrollHeight - el.clientHeight;
                if (scrollable > bestScore) {
                  const style = window.getComputedStyle(el);
                  const overflow = style.overflow + style.overflowY;
                  if (overflow.includes('auto') || overflow.includes('scroll')) {
                    bestScore = scrollable;
                    best = el;
                  }
                }
              }
              return best || document.documentElement;
            }
            const t = getScrollTarget();
            if (action === 'SCROLL_DOWN') t.scrollBy({ top: amount, behavior: 'smooth' });
            else if (action === 'SCROLL_UP') t.scrollBy({ top: -amount, behavior: 'smooth' });
            else if (action === 'GO_BACK') history.back();
            else if (action === 'GO_FORWARD') history.forward();
            else if (action === 'SCROLL_TOP') t.scrollTo({ top: 0, behavior: 'smooth' });
            else if (action === 'SCROLL_BOTTOM') t.scrollTo({ top: t.scrollHeight, behavior: 'smooth' });
          },
          args: [action, 400]
        }).catch(() => {});
      }
    });
  }
});

async function injectIntoExistingTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')
    ) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/overlay.js'],
    }).catch(() => {});
  }
}

function registerKeepAliveAlarm() {
  chrome.alarms.create('keepAlive', { periodInMinutes: 0.4 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'keepAlive') return;
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) chrome.alarms.clear('keepAlive');
});

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs();
  registerKeepAliveAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoExistingTabs();
  registerKeepAliveAlarm();
});
