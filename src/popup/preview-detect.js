import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

const GESTURES = { SWIPE_UP: 'SWIPE_UP', SWIPE_DOWN: 'SWIPE_DOWN', SWIPE_LEFT: 'SWIPE_LEFT', SWIPE_RIGHT: 'SWIPE_RIGHT', NONE: 'NONE' };
const ACTION_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'Scroll to top', SCROLL_BOTTOM: 'Scroll to bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab',
  NONE: 'Do nothing',
};

const BUFFER_SIZE    = 8;
const COOLDOWN_MS    = 600;
const VELOCITY_THRESHOLD = 0.12;
const TRAIL_LENGTH   = 16;
const VIDEO_ASPECT   = 640 / 480;

let deadZoneRadius = 0.10;
let gestureRecognizer = null;
let lastGestureTime   = 0;
const positionBuffer  = [];
const wristTrail      = [];
let waitingForReset   = false;
let deadZoneAnchor    = { x: 0.5, y: 0.5 };
let pickModeActive    = false;
let cursorMirrorX     = false;
let gestureMap = {
  open_swipe_up: 'SCROLL_UP', open_swipe_down: 'SCROLL_DOWN',
  open_swipe_left: 'GO_BACK', open_swipe_right: 'GO_FORWARD',
  closed_swipe_up: 'SCROLL_TOP', closed_swipe_down: 'SCROLL_BOTTOM',
  closed_swipe_left: 'CLOSE_TAB', closed_swipe_right: 'NEW_TAB',
  pointing_swipe_up: 'NONE', pointing_swipe_down: 'NONE',
  pointing_swipe_left: 'NONE', pointing_swipe_right: 'NONE',
  victory_swipe_up: 'NONE', victory_swipe_down: 'NONE',
  victory_swipe_left: 'NONE', victory_swipe_right: 'NONE',
};

const video          = document.getElementById('previewVideo');
const canvas         = document.getElementById('previewCanvas');
const ctx            = canvas.getContext('2d');
const indicator      = document.getElementById('gestureIndicator');
const previewArea    = document.querySelector('.preview-area');
const anchorStatus   = document.getElementById('anchorStatus');
const anchorPickBtn  = document.getElementById('anchorPickBtn');
const anchorClearBtn = document.getElementById('anchorClearBtn');
const zoneSizeSlider = document.getElementById('zoneSizeSlider');
const zoneSizeStatus = document.getElementById('zoneSizeStatus');
const cursorCanvas   = document.getElementById('cursorCanvas');
const cursorCtx      = cursorCanvas ? cursorCanvas.getContext('2d') : null;
const cursorVideoEl  = document.getElementById('cursorVideo');

// ── Storage ──────────────────────────────────────────────────────────────────

function applyMirrorX(mirrored) {
  cursorMirrorX = mirrored;
  video.style.transform = mirrored ? 'scaleX(-1)' : '';
  if (cursorVideoEl) cursorVideoEl.style.transform = mirrored ? 'scaleX(-1)' : '';
}

chrome.storage.local.get(['gestureMap', 'deadZoneAnchor', 'deadZoneRadius', 'cursorMirrorX'], (result) => {
  if (result.gestureMap)   gestureMap = result.gestureMap;
  if (result.deadZoneAnchor) applyAnchor(result.deadZoneAnchor, false);
  if (result.deadZoneRadius != null) applyZoneSize(result.deadZoneRadius, false);
  if (result.cursorMirrorX !== undefined) applyMirrorX(result.cursorMirrorX);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.gestureMap)    gestureMap = changes.gestureMap.newValue;
  if (changes.deadZoneAnchor) applyAnchor(changes.deadZoneAnchor.newValue, false);
  if (changes.deadZoneRadius != null) applyZoneSize(changes.deadZoneRadius.newValue, false);
  if (changes.cursorMirrorX != null) applyMirrorX(changes.cursorMirrorX.newValue);
});

// ── Anchor UI ────────────────────────────────────────────────────────────────

function applyAnchor(anchor, save) {
  deadZoneAnchor = anchor ?? { x: 0.5, y: 0.5 };
  const xPct = Math.round(deadZoneAnchor.x * 100);
  const yPct = Math.round(deadZoneAnchor.y * 100);
  anchorStatus.textContent = `${xPct}%, ${yPct}%`;
  if (save) chrome.storage.local.set({ deadZoneAnchor });
}

function applyZoneSize(radius, save) {
  deadZoneRadius = radius;
  const pct = Math.round(radius * 100);
  zoneSizeSlider.value = pct;
  // Sync wavr-range fill visual
  const fillPct = ((pct - parseInt(zoneSizeSlider.min, 10)) / (parseInt(zoneSizeSlider.max, 10) - parseInt(zoneSizeSlider.min, 10)) * 100).toFixed(1);
  zoneSizeSlider.style.setProperty('--slider-fill', fillPct + '%');
  const label = pct <= 8 ? 'Small' : pct <= 15 ? 'Medium' : pct <= 22 ? 'Large' : 'Very large';
  zoneSizeStatus.textContent = `${label} (${pct}%)`;
  if (save) chrome.storage.local.set({ deadZoneRadius: radius });
}

function enterPickMode() {
  pickModeActive = true;
  anchorPickBtn.classList.add('picking');
  anchorPickBtn.textContent = 'Click on preview…';
  previewArea.classList.add('picking');
  canvas.style.pointerEvents = 'auto';
}

function exitPickMode() {
  pickModeActive = false;
  anchorPickBtn.classList.remove('picking');
  anchorPickBtn.textContent = 'Click preview to set';
  previewArea.classList.remove('picking');
  canvas.style.pointerEvents = 'none';
}

anchorPickBtn.addEventListener('click', () => {
  if (pickModeActive) exitPickMode(); else enterPickMode();
});

anchorClearBtn.addEventListener('click', () => {
  applyAnchor({ x: 0.5, y: 0.5 }, true);
  waitingForReset = false;
});

canvas.addEventListener('click', (e) => {
  if (!pickModeActive) return;
  const rect = canvas.getBoundingClientRect();
  // No mirror — x in display space = x in MediaPipe space
  applyAnchor({ x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height }, true);
  exitPickMode();
});

zoneSizeSlider.addEventListener('input', () => {
  applyZoneSize(parseInt(zoneSizeSlider.value, 10) / 100, true);
});

// ── Gesture detection ────────────────────────────────────────────────────────

async function init() {
  try {
    const vision = await FilesetResolver.forVisionTasks(chrome.runtime.getURL('assets/wasm'));
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: chrome.runtime.getURL('assets/gesture_recognizer.task'),
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
    });
    setInterval(processFrame, 33);
  } catch (err) {
    console.error('wavr preview error:', err);
  }
}

function detectSwipe() {
  if (positionBuffer.length < BUFFER_SIZE) return GESTURES.NONE;
  const oldest = positionBuffer[0];
  const newest = positionBuffer[positionBuffer.length - 1];
  const dx  = newest.x - oldest.x;
  const dy  = newest.y - oldest.y;
  const dxA = dx * VIDEO_ASPECT;
  const t   = VELOCITY_THRESHOLD;
  if (Math.abs(dy) > Math.abs(dxA)) {
    if (dy < -t) return GESTURES.SWIPE_UP;
    if (dy > t)  return GESTURES.SWIPE_DOWN;
  } else {
    if (cursorMirrorX) {
      if (dxA > t)  return GESTURES.SWIPE_LEFT;
      if (dxA < -t) return GESTURES.SWIPE_RIGHT;
    } else {
      if (dxA < -t) return GESTURES.SWIPE_LEFT;
      if (dxA > t)  return GESTURES.SWIPE_RIGHT;
    }
  }
  return GESTURES.NONE;
}

// ── Canvas drawing ───────────────────────────────────────────────────────────

function syncCanvasSize() {
  const w = video.clientWidth;
  const h = video.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width  = w;
    canvas.height = h;
  }
}

function syncCursorCanvasSize() {
  if (!cursorCanvas) return;
  const w = cursorCanvas.clientWidth;
  const h = cursorCanvas.clientHeight;
  if (cursorCanvas.width !== w || cursorCanvas.height !== h) {
    cursorCanvas.width  = w;
    cursorCanvas.height = h;
  }
}

function drawOverlay(wx, wy) {
  syncCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const W = canvas.width;
  const H = canvas.height;

  const flipX = (v) => cursorMirrorX ? (1 - v) * W : v * W;

  const px = flipX(wx);
  const py = wy * H;

  const ox = flipX(deadZoneAnchor.x);
  const oy = deadZoneAnchor.y * H;
  const r  = deadZoneRadius * W;

  const ddx  = px - ox;
  const ddy  = py - oy;
  const dist = Math.sqrt(ddx * ddx + ddy * ddy);
  const near = dist < r;

  // ── Dead zone circle ─────────────────────────────────────────────
  let strokeColor, fillAlpha, lineDash, showLabel;
  if (waitingForReset) {
    strokeColor = near ? '#4ade80' : '#f59e0b';
    fillAlpha   = 0.08;
    lineDash    = [5, 4];
    showLabel   = true;
  } else {
    strokeColor = 'rgba(74,222,128,0.35)';
    fillAlpha   = 0.04;
    lineDash    = [3, 3];
    showLabel   = false;
  }

  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(74,222,128,${fillAlpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(ox, oy, r, 0, Math.PI * 2);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.setLineDash(lineDash);
  ctx.stroke();
  ctx.setLineDash([]);

  if (showLabel) {
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(px, py);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = strokeColor;
    ctx.fillText(near ? '✓ Ready' : '↩ Return here', ox, Math.max(oy - r - 8, 14));
  } else {
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(74,222,128,0.4)';
    ctx.fillText('home', ox, Math.max(oy - r - 5, 12));
  }

  // ── Wrist trail ──────────────────────────────────────────────────
  const trailLen = wristTrail.length;
  for (let i = 0; i < trailLen - 1; i++) {
    const t      = i / (TRAIL_LENGTH - 1);           // 0 = oldest, ~1 = newest
    const trailX = flipX(wristTrail[i].x);
    const trailY = wristTrail[i].y * H;
    const radius = 2 + t * 3.5;                      // 2 → 5.5 px
    const alpha  = 0.06 + t * 0.30;                  // 0.06 → 0.36
    ctx.beginPath();
    ctx.arc(trailX, trailY, radius, 0, Math.PI * 2);
    ctx.fillStyle = waitingForReset
      ? `rgba(245,158,11,${alpha})`
      : `rgba(74,222,128,${alpha})`;
    ctx.fill();
  }

  // ── Wrist dot ────────────────────────────────────────────────────
  const dotColor = waitingForReset ? '#f59e0b' : '#4ade80';
  ctx.beginPath();
  ctx.arc(px, py, 9, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fillStyle = dotColor;
  ctx.fill();

  // ── Cursor canvas wrist dot ──────────────────────────────────────
  if (cursorCtx) {
    syncCursorCanvasSize();
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
    const cW  = cursorCanvas.width;
    const cH  = cursorCanvas.height;
    const cpx = (cursorMirrorX ? 1 - wx : wx) * cW;
    const cpy = wy * cH;
    cursorCtx.beginPath();
    cursorCtx.arc(cpx, cpy, 9, 0, Math.PI * 2);
    cursorCtx.fillStyle = 'rgba(0,0,0,0.4)';
    cursorCtx.fill();
    cursorCtx.beginPath();
    cursorCtx.arc(cpx, cpy, 7, 0, Math.PI * 2);
    cursorCtx.fillStyle = dotColor;
    cursorCtx.fill();
  }

  // ── Buffer bar ───────────────────────────────────────────────────
  const barW = Math.min(W * 0.55, 200);
  const segW = barW / BUFFER_SIZE;
  const barX = (W - barW) / 2;
  const barY = H - 18;
  for (let i = 0; i < BUFFER_SIZE; i++) {
    ctx.beginPath();
    ctx.roundRect(barX + i * segW + 1.5, barY, segW - 3, 5, 2);
    ctx.fillStyle = i < positionBuffer.length ? '#4ade80' : 'rgba(255,255,255,0.15)';
    ctx.fill();
  }
  ctx.font = '10px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('buffer', W / 2, barY - 4);

  // ── Pick mode overlay ────────────────────────────────────────────
  if (pickModeActive) {
    ctx.strokeStyle = 'rgba(74,222,128,0.6)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 12px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(74,222,128,0.9)';
    ctx.fillText('Click to place dead zone', W / 2, 22);
  }
}

function clearCanvas() {
  syncCanvasSize();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (cursorCtx) {
    syncCursorCanvasSize();
    cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  }
}

// ── Process frame ─────────────────────────────────────────────────────────────

let resetTimer = null;

function processFrame() {
  const cursorPanel = document.querySelector('.panel[data-panel="cursor"]');
  const onCursorTab = cursorPanel && !cursorPanel.classList.contains('panel--hidden');
  const activeVid = (onCursorTab && cursorVideoEl && cursorVideoEl.srcObject && cursorVideoEl.readyState >= 2)
    ? cursorVideoEl
    : video;

  if (!gestureRecognizer || !activeVid.srcObject || activeVid.readyState < 2) {
    indicator.textContent = '';
    clearCanvas();
    return;
  }
  const results = gestureRecognizer.recognizeForVideo(activeVid, Date.now());
  if (results.landmarks?.length > 0) {
    const wrist = results.landmarks[0][0];

    if (waitingForReset) {
      const dx = wrist.x - deadZoneAnchor.x;
      const dy = wrist.y - deadZoneAnchor.y;
      if (Math.sqrt(dx * dx + dy * dy) < deadZoneRadius) {
        waitingForReset = false;
        positionBuffer.length = 0;
        wristTrail.length = 0;
      } else {
        wristTrail.push({ x: wrist.x, y: wrist.y });
        if (wristTrail.length > TRAIL_LENGTH) wristTrail.shift();
        drawOverlay(wrist.x, wrist.y);
        return;
      }
    }

    positionBuffer.push({ x: wrist.x, y: wrist.y });
    if (positionBuffer.length > BUFFER_SIZE) positionBuffer.shift();
    wristTrail.push({ x: wrist.x, y: wrist.y });
    if (wristTrail.length > TRAIL_LENGTH) wristTrail.shift();

    drawOverlay(wrist.x, wrist.y);

    const pose = results.gestures?.[0]?.[0]?.categoryName ?? 'None';
    const isOpen     = pose === 'Open_Palm' || pose === 'None';
    const isClosed   = pose === 'Closed_Fist';
    const isPointing = pose === 'Pointing_Up';
    const isVictory  = pose === 'Victory';
    const isThumbUp  = pose === 'Thumb_Up';

    if (isThumbUp) {
      indicator.textContent = '👍 Hold for cursor mode…';
    } else if (isOpen || isClosed || isPointing || isVictory) {
      const gesture = detectSwipe();
      const now = Date.now();
      if (gesture !== GESTURES.NONE && now - lastGestureTime > COOLDOWN_MS) {
        lastGestureTime = now;
        waitingForReset = true;
        positionBuffer.length = 0;

        const prefix    = isClosed ? 'closed_' : isPointing ? 'pointing_' : isVictory ? 'victory_' : 'open_';
        const mapKey    = prefix + gesture.toLowerCase();
        const action    = gestureMap[mapKey] || 'NONE';
        const poseEmoji = isClosed ? '✊' : isPointing ? '☝' : isVictory ? '✌' : '🖐';

        indicator.textContent = `${poseEmoji} ${gesture.replace('_', ' ')} → ${ACTION_LABELS[action] || action}`;
        previewArea.classList.remove('preview-flash');
        void previewArea.offsetWidth;
        previewArea.classList.add('preview-flash');
        clearTimeout(resetTimer);
        resetTimer = setTimeout(() => { indicator.textContent = 'No gesture detected'; }, 1500);
      }
    }
  } else {
    positionBuffer.length = 0;
    wristTrail.length = 0;
    waitingForReset = false;
    clearTimeout(resetTimer);
    resetTimer = null;
    indicator.textContent = 'No gesture detected';
    clearCanvas();
  }
}

init();
