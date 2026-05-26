const ADVANCED_KEYS = [
  'closed_swipe_up', 'closed_swipe_down', 'closed_swipe_left', 'closed_swipe_right',
  'pointing_swipe_up', 'pointing_swipe_down', 'pointing_swipe_left', 'pointing_swipe_right',
  'victory_swipe_up', 'victory_swipe_down', 'victory_swipe_left', 'victory_swipe_right',
];

const defaults = {
  closed_swipe_up: 'SCROLL_TOP', closed_swipe_down: 'SCROLL_BOTTOM',
  closed_swipe_left: 'CLOSE_TAB', closed_swipe_right: 'NEW_TAB',
  pointing_swipe_up: 'NONE', pointing_swipe_down: 'NONE',
  pointing_swipe_left: 'NONE', pointing_swipe_right: 'NONE',
  victory_swipe_up: 'NONE', victory_swipe_down: 'NONE',
  victory_swipe_left: 'NONE', victory_swipe_right: 'NONE',
};

chrome.storage.local.get(['gestureMap'], (result) => {
  const map = result.gestureMap || {};
  for (const key of ADVANCED_KEYS) {
    const el = document.getElementById(key);
    if (el) el.value = map[key] ?? defaults[key];
  }
});

document.getElementById('saveBtn').addEventListener('click', () => {
  chrome.storage.local.get(['gestureMap'], (result) => {
    const map = { ...(result.gestureMap || {}) };
    for (const key of ADVANCED_KEYS) {
      const el = document.getElementById(key);
      if (el) map[key] = el.value;
    }
    chrome.storage.local.set({ gestureMap: map }, () => {
      const msg = document.getElementById('savedMsg');
      msg.textContent = '✓ Saved';
      setTimeout(() => { msg.textContent = ''; }, 2000);
    });
  });
});
