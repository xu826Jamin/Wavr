if (!window.__wavrActive) {
  window.__wavrActive = true;

  const GESTURES = { SWIPE_UP: 'SWIPE_UP', SWIPE_DOWN: 'SWIPE_DOWN', SWIPE_LEFT: 'SWIPE_LEFT', SWIPE_RIGHT: 'SWIPE_RIGHT', NONE: 'NONE' };
  const GESTURE_MAP = { SWIPE_UP: 'SCROLL_UP', SWIPE_DOWN: 'SCROLL_DOWN', SWIPE_LEFT: 'GO_BACK', SWIPE_RIGHT: 'GO_FORWARD' };
  const settings = { scrollAmount: 400, cooldownMs: 600, velocityThreshold: 0.12, bufferSize: 8 };

  let gestureRecognizer = null;
  let lastGestureTime = 0;
  let animationId = null;
  const positionBuffer = [];

  // ── Overlay UI ──
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;bottom:20px;right:20px;width:200px;
    background:rgba(0,0,0,0.85);border-radius:12px;
    z-index:2147483647;display:flex;flex-direction:column;
    align-items:center;padding:10px;gap:6px;
    border:1px solid #4ade80;font-family:sans-serif;
  `;
  overlay.innerHTML = `
    <div style="color:#4ade80;font-size:11px;font-weight:600;width:100%;display:flex;justify-content:space-between;align-items:center;">
      wavr
      <button id="__gsClose" style="background:none;border:none;color:#888;cursor:pointer;font-size:14px;padding:0;">✕</button>
    </div>
    <video id="__gsVideo" autoplay playsinline muted style="width:180px;border-radius:6px;"></video>
    <div id="__gsStatus" style="color:#888;font-size:10px;">Loading...</div>
    <div id="__gsGesture" style="color:#4ade80;font-size:11px;min-height:14px;"></div>
  `;
  document.body.appendChild(overlay);

  const video = document.getElementById('__gsVideo');
  const statusEl = document.getElementById('__gsStatus');
  const gestureEl = document.getElementById('__gsGesture');

  document.getElementById('__gsClose').onclick = () => window.__wavrStop();

  window.__wavrStop = () => {
    window.__wavrActive = false;
    if (animationId) cancelAnimationFrame(animationId);
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    overlay.remove();
    delete window.__wavrStop;
  };

  async function init() {
    try {
      statusEl.textContent = 'Loading model...';

      const bundleUrl = chrome.runtime.getURL('vision_bundle.mjs');
      const { GestureRecognizer, FilesetResolver } = await import(bundleUrl);

      const vision = await FilesetResolver.forVisionTasks(
        chrome.runtime.getURL('assets/wasm')
      );

      gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: chrome.runtime.getURL('assets/gesture_recognizer.task'),
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        numHands: 1,
      });

      statusEl.textContent = 'Starting camera...';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
        audio: false,
      });

      video.srcObject = stream;
      await new Promise(resolve => { video.onloadedmetadata = () => { video.play(); resolve(); }; });

      statusEl.textContent = 'Active ✓';
      animationId = requestAnimationFrame(processFrame);

    } catch (err) {
      statusEl.textContent = 'Error: ' + err.message;
      console.error('wavr:', err);
    }
  }

  function detectSwipe() {
    if (positionBuffer.length < settings.bufferSize) return GESTURES.NONE;
    const oldest = positionBuffer[0];
    const newest = positionBuffer[positionBuffer.length - 1];
    const dx = newest.x - oldest.x;
    const dy = newest.y - oldest.y;
    const t = settings.velocityThreshold;
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < -t) return GESTURES.SWIPE_UP;
      if (dy > t) return GESTURES.SWIPE_DOWN;
    } else {
      if (dx < -t) return GESTURES.SWIPE_LEFT;
      if (dx > t) return GESTURES.SWIPE_RIGHT;
    }
    return GESTURES.NONE;
  }

  function executeAction(action) {
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
    const target = best || document.documentElement;
    if (action === 'SCROLL_DOWN') target.scrollBy({ top: settings.scrollAmount, behavior: 'smooth' });
    else if (action === 'SCROLL_UP') target.scrollBy({ top: -settings.scrollAmount, behavior: 'smooth' });
    else if (action === 'GO_BACK') history.back();
    else if (action === 'GO_FORWARD') history.forward();
  }

  function processFrame() {
    if (!window.__wavrActive) return;
    if (!gestureRecognizer || video.readyState < 2) {
      animationId = requestAnimationFrame(processFrame);
      return;
    }
    const results = gestureRecognizer.recognizeForVideo(video, Date.now());
    if (results.landmarks?.length > 0) {
      const wrist = results.landmarks[0][0];
      positionBuffer.push({ x: wrist.x, y: wrist.y });
      if (positionBuffer.length > settings.bufferSize) positionBuffer.shift();
      const pose = results.gestures?.[0]?.[0]?.categoryName ?? 'None';
      if (['Open_Palm', 'Pointing_Up', 'None'].includes(pose)) {
        const gesture = detectSwipe();
        const now = Date.now();
        if (gesture !== GESTURES.NONE && now - lastGestureTime > settings.cooldownMs) {
          lastGestureTime = now;
          const action = GESTURE_MAP[gesture];
          gestureEl.textContent = gesture.replace('_', ' ').toLowerCase();
          setTimeout(() => { gestureEl.textContent = ''; }, 2000);
          executeAction(action);
        }
      }
    } else {
      positionBuffer.length = 0;
    }
    animationId = requestAnimationFrame(processFrame);
  }

  init();
}