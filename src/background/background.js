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
      closed_swipe_up:    'SCROLL_UP_PAGE',
      closed_swipe_down:  'SCROLL_DOWN_PAGE',
      closed_swipe_left:  'NONE', // B3: scroll-first, non-destructive defaults
      closed_swipe_right: 'NONE',
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
  // Persist intent first so a crash mid-creation still resumes on next startup.
  await chrome.storage.local.set({ wavrEnabled: true });
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: ['USER_MEDIA'],
      justification: 'Webcam access for hand gesture detection',
    });
    chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 });
  }
}

async function closeOffscreen() {
  await chrome.storage.local.set({ wavrEnabled: false });
  chrome.alarms.clear('keepAlive');
  const exists = await chrome.offscreen.hasDocument();
  if (exists) await chrome.offscreen.closeDocument();
}

async function enableWavr() {
  await createOffscreen();
  showOverlayOnActiveTab();
  chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: true }).catch(() => {});
}

async function disableWavr() {
  await closeOffscreen();
  overlayTabId = null;
  broadcastToTabs({ type: 'HIDE_OVERLAY' });
  chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: false }).catch(() => {});
}

// Re-arm the live controller after a service-worker restart / browser launch
// if the user had Wavr enabled. Foundation for the habit loop (B1) — without
// this, Wavr is OFF after every restart because "enabled" was only ever derived
// live from chrome.offscreen.hasDocument(), which is false on a cold start.
async function resumeIfEnabled() {
  const { wavrEnabled } = await chrome.storage.local.get('wavrEnabled');
  if (!wavrEnabled) return;
  await enableWavr();
}

function isRestrictedUrl(url) {
  if (!url) return true;
  return url.startsWith('chrome://') ||
         url.startsWith('chrome-extension://') ||
         url.startsWith('about:') ||
         url.startsWith('edge://') ||
         url.endsWith('.pdf');
}

async function updatePageRestrictedBadge(tabId) {
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (!exists) {
      chrome.action.setBadgeText({ text: '', tabId });
      return;
    }
    const tab = await chrome.tabs.get(tabId);
    if (isRestrictedUrl(tab.url)) {
      chrome.action.setBadgeText({ text: 'OFF', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#555', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch { /* tab may have closed */ }
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  updatePageRestrictedBadge(tabId);
  moveOverlayIfEnabled(); // A2: follow the user's active tab
});
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url && tab.active) updatePageRestrictedBadge(tabId);
});
chrome.windows.onFocusChanged.addListener((winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  moveOverlayIfEnabled(); // A2: follow the user across windows
});

function isInjectableTab(tab) {
  return !!tab?.url &&
    !tab.url.startsWith('chrome://') &&
    !tab.url.startsWith('chrome-extension://') &&
    tab.url !== 'about:blank';
}

function broadcastToTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (isInjectableTab(tab)) {
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}

// ── Active-tab routing (A2) ─────────────────────────────────────────────────────
// The PiP widget + camera feed should live in exactly one tab: the one the user is
// looking at. Broadcasting VIDEO_FRAME (10×/s JPEG) and START_OVERLAY to every tab
// made every open tab decode frames and build a widget — large idle CPU drain.
// We track the single tab that currently owns the overlay and route per-frame
// traffic only there, moving it as the user switches tabs/windows.
let overlayTabId = null;

// Route a per-frame / per-state message to the overlay-owning tab only.
function routeToOverlayTab(message) {
  if (overlayTabId != null) {
    chrome.tabs.sendMessage(overlayTabId, message).catch(() => {});
  }
}

// Build/show the widget on the active tab of the focused window, hiding it on the
// tab that previously owned it. Self-heals overlayTabId after SW restarts.
function showOverlayOnActiveTab() {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!isInjectableTab(tab)) return;
    if (overlayTabId != null && overlayTabId !== tab.id) {
      chrome.tabs.sendMessage(overlayTabId, { type: 'HIDE_OVERLAY' }).catch(() => {});
    }
    overlayTabId = tab.id;
    chrome.tabs.sendMessage(tab.id, { type: 'START_OVERLAY' }).catch(() => {});
  });
}

async function moveOverlayIfEnabled() {
  const { wavrEnabled } = await chrome.storage.local.get('wavrEnabled');
  if (wavrEnabled) showOverlayOnActiveTab();
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
    // B2: first click opens the wizard (a thin overlay). Camera permission must be
    // requested from a *visible* page — an offscreen getUserMedia can't show a
    // prompt — so the wizard's "Allow camera" grants it and then enables the live
    // controller (B5/ensureEnabled), making the first interaction a working feed.
    await chrome.storage.local.set({ firstRunDone: true });
    chrome.runtime.openOptionsPage();
    return;
  }

  // Subsequent clicks toggle the live controller directly.
  const exists = await chrome.offscreen.hasDocument();
  if (exists) await disableWavr();
  else        await enableWavr();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-wavr') return;
  const { firstRunDone } = await chrome.storage.local.get('firstRunDone');
  if (!firstRunDone) return;
  const exists = await chrome.offscreen.hasDocument();
  if (exists) await disableWavr();
  else        await enableWavr();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE') {
    chrome.offscreen.hasDocument().then(async (exists) => {
      if (exists) { await disableWavr(); sendResponse({ enabled: false }); }
      else        { await enableWavr();  sendResponse({ enabled: true }); }
    });
    return true;
  }

  if (message.type === 'ENABLE') {
    // Idempotent turn-on used by the onboarding wizard (B5) so finishing onboarding
    // leaves the real controller running — not just the popup's preview recognizer.
    chrome.offscreen.hasDocument().then(async (exists) => {
      if (!exists) await enableWavr();
      sendResponse({ enabled: true });
    });
    return true;
  }

  if (message.type === 'STOP') {
    chrome.offscreen.hasDocument().then(async (exists) => {
      if (exists) await disableWavr();
      sendResponse({ enabled: false });
    });
    return true;
  }

  if (message.type === 'GET_STATUS') {
    chrome.offscreen.hasDocument().then(async (exists) => {
      // A content script self-heals by showing its widget when enabled. Under A2
      // only the active tab should — so a content script only sees enabled:true
      // when it IS the active tab (and we adopt it as the overlay owner, which
      // re-establishes overlayTabId after a SW restart). The popup has no
      // sender.tab and always gets the raw global state for its status pill.
      if (sender.tab && exists) {
        const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const isActive = !!active && active.id === sender.tab.id;
        if (isActive) overlayTabId = sender.tab.id;
        sendResponse({ enabled: isActive });
        return;
      }
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

  // Per-frame / per-state traffic goes only to the active overlay tab (A2).
  if (message.type === 'VIDEO_FRAME') {
    routeToOverlayTab(message);
    return false;
  }

  if (message.type === 'GESTURE_DISPLAY') {
    routeToOverlayTab({ type: 'GESTURE_DISPLAY', label: message.label });
    return false;
  }

  if (message.type === 'OVERLAY_STATE') {
    routeToOverlayTab(message);
    return false;
  }

  if (message.type === 'CURSOR_MODE_CHANGE') {
    routeToOverlayTab(message);
    if (message.active) {
      chrome.storage.local.get(['achievements'], (r) => {
        const a = { ...(r.achievements || {}), cursorUsed: true };
        chrome.storage.local.set({ achievements: a });
      });
    }
    return false;
  }

  if (message.type === 'CURSOR_STATE' || message.type === 'CURSOR_CLICK') {
    routeToOverlayTab(message);
    return false;
  }

  if (message.type === 'CAMERA_ERROR') {
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

    // A9: act ONLY on the tab the user is actually looking at. The old code
    // fell back to the most-recently-accessed eligible tab across *all* windows,
    // so a stray gesture could scroll — or CLOSE_TAB — a page the user can't see.
    // Use lastFocusedWindow and, if that tab is ineligible, do nothing.
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const target = tabs[0];
      if (target?.id && !isRestrictedUrl(target.url)) {
        const action = message.action;

        if (action === 'NEW_TAB') {
          chrome.tabs.create({});
          return;
        }
        if (action === 'CLOSE_TAB') {
          chrome.tabs.remove(target.id);
          return;
        }

        chrome.storage.local.get(['scrollAmount'], ({ scrollAmount }) => {
          const amount = Math.max(100, Math.min(1200, scrollAmount ?? 400));

          // Runs in the page (and, on the fallback pass, in every frame). Returns
          // true if this frame had a usable scroll target / handled the action —
          // used to decide whether to retry across iframes (A7, Finding 4D).
          const doScroll = (action, amount) => {
            // Navigation acts on the top frame only.
            if (action === 'GO_BACK')    { if (window.top === window) { history.back();    return true; } return false; }
            if (action === 'GO_FORWARD') { if (window.top === window) { history.forward(); return true; } return false; }

            const canScroll = (el) => {
              if (!el || el.nodeType !== 1) return false;
              if (el.scrollHeight - el.clientHeight <= 1) return false;
              if (el === document.scrollingElement || el === document.documentElement || el === document.body) return true;
              const oy = getComputedStyle(el).overflowY;
              return oy === 'auto' || oy === 'scroll';
            };

            function getScrollTarget() {
              // 1) Whatever is under the viewport centre — walk up to a scrollable
              //    ancestor. Targets the pane the user is actually reading, incl.
              //    nested SPA containers the old direct-children scan missed.
              let el = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
              for (let i = 0; el && i < 20 && el !== document.body && el !== document.documentElement; i++, el = el.parentElement) {
                if (canScroll(el)) return el;
              }
              // 2) The page scroller, if the document itself scrolls.
              const se = document.scrollingElement;
              if (se && se.scrollHeight - se.clientHeight > 1) return se;
              // 3) Deep scan for the largest scrollable container (bounded).
              let best = null, bestScore = 0, budget = 1500;
              const stack = document.body ? [...document.body.children] : [];
              while (stack.length && budget-- > 0) {
                const node = stack.pop();
                if (node.nodeType !== 1) continue;
                const score = node.scrollHeight - node.clientHeight;
                if (score > bestScore && canScroll(node)) { bestScore = score; best = node; }
                if (node.children.length) stack.push(...node.children);
              }
              return best;
            }

            const t = getScrollTarget();
            if (!t) return false; // nothing scrollable here — let the fallback try iframes
            if (action === 'SCROLL_DOWN')        t.scrollBy({ top: amount, behavior: 'smooth' });
            else if (action === 'SCROLL_UP')     t.scrollBy({ top: -amount, behavior: 'smooth' });
            else if (action === 'SCROLL_TOP')    t.scrollTo({ top: 0, behavior: 'smooth' });
            else if (action === 'SCROLL_BOTTOM') t.scrollTo({ top: t.scrollHeight, behavior: 'smooth' });
            else if (action === 'SCROLL_UP_PAGE')   t.scrollBy({ top: -innerHeight * 0.85, behavior: 'smooth' });
            else if (action === 'SCROLL_DOWN_PAGE') t.scrollBy({ top: innerHeight * 0.85, behavior: 'smooth' });
            return true;
          };

          chrome.scripting.executeScript({
            target: { tabId: target.id },
            func: doScroll,
            args: [action, amount],
          }).then((results) => {
            // If the top frame had nothing to scroll, retry across all frames so
            // iframed reading content (docs/embedded viewers) still moves (A7).
            const handled = results?.some(r => r.result);
            if (!handled) {
              chrome.scripting.executeScript({
                target: { tabId: target.id, allFrames: true },
                func: doScroll,
                args: [action, amount],
              }).catch(() => {});
            }
          }).catch(() => {});
        });
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

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'keepAlive') return;
  const exists = await chrome.offscreen.hasDocument();
  if (exists) return;
  // No live document — but if the user still wants Wavr on (e.g. the SW woke
  // before resumeIfEnabled ran), re-arm rather than tearing the UI down.
  const { wavrEnabled } = await chrome.storage.local.get('wavrEnabled');
  if (wavrEnabled) {
    await resumeIfEnabled();
    return;
  }
  chrome.alarms.clear('keepAlive');
  broadcastToTabs({ type: 'HIDE_OVERLAY' });
  chrome.runtime.sendMessage({ type: 'STATUS_CHANGED', enabled: false }).catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs();
  resumeIfEnabled();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoExistingTabs();
  resumeIfEnabled();
});
