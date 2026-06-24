// chrome.* shim + in-page perf helpers, installed via page.addInitScript before any page script.
// Returning user (no first-run wizard) with a full gestureMap so mockup/explorer behave normally.
module.exports = () => {
  const G = {};
  for (const p of ['open', 'closed', 'pointing', 'victory'])
    for (const d of ['up', 'down', 'left', 'right']) G[p + '_swipe_' + d] = 'NONE';
  Object.assign(G, { open_swipe_up: 'SCROLL_UP', open_swipe_down: 'SCROLL_DOWN',
    open_swipe_left: 'GO_BACK', open_swipe_right: 'GO_FORWARD' });
  const store = { gestureMap: G, onboardingComplete: true, overlayAvatar: true,
    achievements: { gestureCount: 12, cursorUsed: true, presetApplied: true },
    scrollAmount: 400, cursorTimings: { thumbHoldMs: 400, clickDwellMs: 700 },
    cursorMirrorX: false, advancedClickTargets: false, poseChangeScroll: false };
  const noop = () => {};
  window.chrome = {
    runtime: {
      getURL: p => '/' + String(p).replace(/^\//, ''),
      sendMessage: (_m, cb) => { if (typeof cb === 'function') setTimeout(() => cb(undefined), 0); },
      onMessage: { addListener: noop, removeListener: noop },
      lastError: undefined, id: 'profiler',
    },
    storage: {
      local: {
        get: (keys, cb) => {
          let out = {};
          if (keys == null) out = { ...store };
          else if (typeof keys === 'string') out[keys] = store[keys];
          else if (Array.isArray(keys)) keys.forEach(k => { out[k] = store[k]; });
          else { Object.keys(keys).forEach(k => { out[k] = (k in store) ? store[k] : keys[k]; }); }
          setTimeout(() => cb && cb(out), 0);
        },
        set: (obj, cb) => { Object.assign(store, obj); setTimeout(() => cb && cb(), 0); },
        remove: (k, cb) => { setTimeout(() => cb && cb(), 0); },
      },
      onChanged: { addListener: noop, removeListener: noop },
    },
    tabs: { create: noop, query: (_q, cb) => cb && cb([]) },
  };
  window.__fps = {
    start() { this.f = []; this.last = performance.now(); const loop = t => { this.f.push(t - this.last); this.last = t; this._id = requestAnimationFrame(loop); }; this._id = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(this._id); const f = this.f.slice(1).filter(x => x > 0); f.sort((a, b) => a - b);
      const n = f.length, sum = f.reduce((a, b) => a + b, 0);
      return { frames: n, fps: n ? +(1000 / (sum / n)).toFixed(1) : 0, medMs: n ? +f[Math.floor(n / 2)].toFixed(2) : 0, p95Ms: n ? +f[Math.floor(n * 0.95)].toFixed(2) : 0 }; },
  };
  window.__rafCount = ms => new Promise(res => { let c = 0; const t0 = performance.now();
    const loop = () => { if (performance.now() - t0 >= ms) return res(c); c++; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
};
