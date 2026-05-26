const ACTION_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'Scroll to top', SCROLL_BOTTOM: 'Scroll to bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab', NONE: 'Do nothing',
};

// ── Status pill ──────────────────────────────────────────────────────────────

const statusPill  = document.getElementById('statusPill');
const statusLabel = document.getElementById('statusLabel');

function applyStatus(on) {
  statusPill.classList.toggle('on', on);
  statusLabel.textContent = on ? 'ON' : 'OFF';
}

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  if (chrome.runtime.lastError) return;
  applyStatus(!!response?.enabled);
});

statusPill.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE' }, (response) => {
    if (chrome.runtime.lastError) return;
    applyStatus(!!response?.enabled);
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATUS_CHANGED') applyStatus(message.enabled);
});

// ── Tutorial videos ──────────────────────────────────────────────────────────

function loadVideo(videoEl, placeholderEl, assetPath) {
  videoEl.addEventListener('canplay', () => {
    videoEl.style.display = 'block';
    placeholderEl.style.display = 'none';
  }, { once: true });
  videoEl.addEventListener('error', () => {
    placeholderEl.querySelector('.ph-text').textContent = 'Video not available';
  }, { once: true });
  videoEl.src = chrome.runtime.getURL(assetPath);
}

loadVideo(
  document.getElementById('videoGood'),
  document.getElementById('placeholderGood'),
  'assets/videos/do.mp4'
);
loadVideo(
  document.getElementById('videoBad'),
  document.getElementById('placeholderBad'),
  'assets/videos/dont.mp4'
);

// ── Feature chips + gesture reference (kept in sync with storage) ────────────

const chipDefaults = {
  open_swipe_up: 'SCROLL_UP', open_swipe_down: 'SCROLL_DOWN',
  open_swipe_left: 'GO_BACK', open_swipe_right: 'GO_FORWARD',
};

function updateChips(gestureMap) {
  const map = gestureMap || chipDefaults;
  const chipMap = {
    'swipe_up':    map.open_swipe_up    || chipDefaults.open_swipe_up,
    'swipe_down':  map.open_swipe_down  || chipDefaults.open_swipe_down,
    'swipe_left':  map.open_swipe_left  || chipDefaults.open_swipe_left,
    'swipe_right': map.open_swipe_right || chipDefaults.open_swipe_right,
  };
  for (const [chipKey, action] of Object.entries(chipMap)) {
    const el = document.getElementById('chip-' + chipKey);
    if (!el) continue;
    const newText = ACTION_LABELS[action] || action;
    if (el.textContent === newText) continue;      // already correct — skip animation

    // Slide current text up then swap in new text from below
    el.classList.add('slide-out');
    const onOut = () => {
      el.removeEventListener('transitionend', onOut);
      el.textContent = newText;
      el.classList.remove('slide-out');
      el.classList.add('slide-in-from');
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('slide-in-from')));

      // Flash the parent chip card
      const chip = el.closest('.gmap-chip');
      if (chip) {
        chip.classList.remove('gesture-flash');
        void chip.offsetWidth;
        chip.classList.add('gesture-flash');
        chip.addEventListener('animationend', () => chip.classList.remove('gesture-flash'), { once: true });
      }
    };
    el.addEventListener('transitionend', onOut, { once: true });
  }
}

chrome.storage.local.get(['gestureMap'], (result) => {
  updateChips(result.gestureMap);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.gestureMap) {
    updateChips(changes.gestureMap.newValue);
  }
});

// ── Tab switching ────────────────────────────────────────────────────────────

const tabBar      = document.getElementById('tabBar');
const tabIndicator = document.getElementById('tabIndicator');
const tabBtns     = Array.from(tabBar.querySelectorAll('.tab-btn'));

function showPanels(key) {
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.toggle('panel--hidden', panel.dataset.panel !== key);
  });
}

function moveIndicator(btn) {
  const barRect = tabBar.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  tabIndicator.style.width = btnRect.width + 'px';
  tabIndicator.style.left  = (btnRect.left - barRect.left) + 'px';
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showPanels(btn.dataset.panel);
    moveIndicator(btn);
    window.scrollTo({ top: 0, behavior: 'instant' });
  });
});

// Position indicator without transition on load
tabIndicator.style.transition = 'none';
moveIndicator(tabBtns.find(b => b.classList.contains('active')));
requestAnimationFrame(() => { tabIndicator.style.transition = ''; });

