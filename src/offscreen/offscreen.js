import { GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

const DEV_MODE = typeof chrome !== 'undefined' &&
  chrome.runtime?.getManifest?.()?.version?.includes('dev');

function debug(...args) {
  if (DEV_MODE) console.log('[wavr/offscreen]', ...args);
}

const GESTURES = { SWIPE_UP: 'SWIPE_UP', SWIPE_DOWN: 'SWIPE_DOWN', SWIPE_LEFT: 'SWIPE_LEFT', SWIPE_RIGHT: 'SWIPE_RIGHT', NONE: 'NONE' };
const ACTION_LABELS = {
  SCROLL_UP: 'Scroll up', SCROLL_DOWN: 'Scroll down',
  GO_BACK: 'Go back', GO_FORWARD: 'Go forward',
  SCROLL_TOP: 'Scroll to top', SCROLL_BOTTOM: 'Scroll to bottom',
  NEW_TAB: 'New tab', CLOSE_TAB: 'Close tab',
  NONE: 'Do nothing',
};
const settings = { cooldownMs: 600, velocityThreshold: 0.12, bufferSize: 8 };

let deadZoneRadius = 0.10;
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

let gestureRecognizer = null;
let lastGestureTime = 0;
let lastStateTime = 0;
const positionBuffer = [];
let gestureOrigin = null;
let waitingForReset = false;
let deadZoneAnchor = null;

// ── Cursor mode state ─────────────────────────────────────────────────────────
let cursorMode    = false;
let cursorMirrorX = false;
let cursorZone    = { cx: 0.5, cy: 0.5, w: 0.6, h: 0.6 };
let smoothX       = 0.5;
let smoothY       = 0.5;
const EMA         = 0.28;
let handWasOpen   = true;
let handOpenSince = 0;
let lastClickTime = 0;
let CLICK_DWELL_MS    = 200;
const CLICK_COOLDOWN_MS = 500;

// ── Thumb Up hold state ───────────────────────────────────────────────────────
let thumbUpStart   = 0;
let thumbUpToggled = false; // blocks re-trigger until thumb is lowered
let THUMB_UP_HOLD_MS = 400;

const video = document.getElementById('video');

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SET_GESTURE_MAP')   gestureMap     = message.gestureMap;
  if (message.type === 'SET_DEAD_ZONE_ANCHOR') deadZoneAnchor = message.anchor;
  if (message.type === 'SET_DEAD_ZONE_RADIUS') deadZoneRadius = message.radius;
  if (message.type === 'SET_MIRROR_X')      cursorMirrorX  = message.mirrorX;
  if (message.type === 'SET_CURSOR_ZONE')   cursorZone     = message.zone;
  if (message.type === 'SET_CURSOR_TIMINGS') {
    if (message.timings?.thumbHoldMs  != null) THUMB_UP_HOLD_MS = message.timings.thumbHoldMs;
    if (message.timings?.clickDwellMs != null) CLICK_DWELL_MS   = message.timings.clickDwellMs;
  }
});

async function init() {
  try {
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

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });

    video.srcObject = stream;
    await new Promise(resolve => { video.onloadedmetadata = () => { video.play(); resolve(); }; });

    debug('ready');
    chrome.runtime.sendMessage({ type: 'GET_GESTURE_MAP' }, (response) => {
      if (response?.gestureMap)                gestureMap     = response.gestureMap;
      deadZoneAnchor = response?.deadZoneAnchor ?? { x: 0.5, y: 0.5 };
      if (response?.deadZoneRadius != null)    deadZoneRadius = response.deadZoneRadius;
      if (response?.cursorMirrorX !== undefined) cursorMirrorX = response.cursorMirrorX;
      if (response?.cursorZone)                cursorZone     = response.cursorZone;
      if (response?.cursorTimings?.thumbHoldMs  != null) THUMB_UP_HOLD_MS = response.cursorTimings.thumbHoldMs;
      if (response?.cursorTimings?.clickDwellMs != null) CLICK_DWELL_MS   = response.cursorTimings.clickDwellMs;
    });
    setInterval(processFrame, 33);

    // Relay camera frames to PiP overlay (content scripts can't open a second stream on most cameras)
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width  = 320;
    frameCanvas.height = 240;
    const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });
    setInterval(() => {
      if (video.readyState < 2) return;
      frameCtx.drawImage(video, 0, 0, 320, 240);
      chrome.runtime.sendMessage({
        type: 'VIDEO_FRAME',
        data: frameCanvas.toDataURL('image/jpeg', 0.8),
      }).catch(() => {});
    }, 100);

  } catch (err) {
    console.error('wavr offscreen error:', err.name, err.message);
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

function mapCursorPosition(wrist) {
  const rawX   = cursorMirrorX ? 1 - wrist.x : wrist.x;
  const left   = cursorZone.cx - cursorZone.w / 2;
  const right  = cursorZone.cx + cursorZone.w / 2;
  const top    = cursorZone.cy - cursorZone.h / 2;
  const bottom = cursorZone.cy + cursorZone.h / 2;
  // Outside zone: cursor freezes at last position
  if (rawX < left || rawX > right || wrist.y < top || wrist.y > bottom) return;
  const zx = (rawX    - left) / (right - left);
  const zy = (wrist.y - top)  / (bottom - top);
  smoothX = EMA * zx + (1 - EMA) * smoothX;
  smoothY = EMA * zy + (1 - EMA) * smoothY;
}

function processFrame() {
  if (!gestureRecognizer || video.readyState < 2) return;
  const results = gestureRecognizer.recognizeForVideo(video, Date.now());

  if (!results.landmarks?.length) {
    positionBuffer.length = 0;
    waitingForReset = false;
    thumbUpStart   = 0;
    thumbUpToggled = false;
    return;
  }

  const wrist = results.landmarks[0][0];
  const now   = Date.now();
  const pose  = results.gestures?.[0]?.[0]?.categoryName ?? 'None';

  const isOpen     = pose === 'Open_Palm' || pose === 'None';
  const isClosed   = pose === 'Closed_Fist';
  const isPointing = pose === 'Pointing_Up';
  const isVictory  = pose === 'Victory';
  const isThumbUp  = pose === 'Thumb_Up';

  // ── Thumb Up hold → toggle cursor mode ───────────────────────────────────────
  if (isThumbUp) {
    if (!thumbUpStart) thumbUpStart = now;
    if (!thumbUpToggled && now - thumbUpStart > THUMB_UP_HOLD_MS && now - lastGestureTime > settings.cooldownMs) {
      lastGestureTime = now;
      thumbUpStart    = 0;
      thumbUpToggled  = true;
      cursorMode      = !cursorMode;
      if (cursorMode) {
        mapCursorPosition(wrist);
        handWasOpen   = isOpen;
        handOpenSince = now;
      }
      chrome.runtime.sendMessage({ type: 'CURSOR_MODE_CHANGE', active: cursorMode });
      chrome.runtime.sendMessage({ type: 'GESTURE_DISPLAY', label: cursorMode ? '👍 Cursor ON' : '👍 Cursor OFF' });
    }
    return;
  } else {
    thumbUpStart   = 0;
    thumbUpToggled = false;
  }

  // ── Cursor mode ───────────────────────────────────────────────────────────────
  if (cursorMode) {
    // Cursor position — always tracks wrist (open palm is the "move" state)
    mapCursorPosition(wrist);

    // Click logic: open palm arms the click; only open-palm → fist fires a click
    if (isOpen) {
      if (!handWasOpen) handOpenSince = now;
      handWasOpen = true;
    } else if (isClosed) {
      if (handWasOpen && (now - handOpenSince > CLICK_DWELL_MS) && (now - lastClickTime > CLICK_COOLDOWN_MS)) {
        lastClickTime = now;
        handWasOpen   = false;
        chrome.runtime.sendMessage({ type: 'CURSOR_CLICK', x: smoothX, y: smoothY });
      } else {
        handWasOpen = false;
      }
    } else {
      // Pointing, victory, etc. — disarm click so fist after these doesn't click
      handWasOpen = false;
    }

    if (now - lastStateTime > 33) {
      lastStateTime = now;
      chrome.runtime.sendMessage({ type: 'CURSOR_STATE', x: smoothX, y: smoothY, clicking: isClosed, cursorZone, wristX: wrist.x, wristY: wrist.y }).catch(() => {});
    }

    // ── Gesture actions in cursor mode (pointing + victory swipes still work) ──
    const activeOrigin = deadZoneAnchor || gestureOrigin;
    if (waitingForReset && activeOrigin) {
      const dx = wrist.x - activeOrigin.x;
      const dy = wrist.y - activeOrigin.y;
      if (Math.sqrt(dx * dx + dy * dy) < deadZoneRadius) {
        waitingForReset = false;
        positionBuffer.length = 0;
      } else {
        return;
      }
    }

    positionBuffer.push({ x: wrist.x, y: wrist.y });
    if (positionBuffer.length > settings.bufferSize) positionBuffer.shift();

    // Pointing and victory swipes dispatch their configured actions while in cursor mode
    if (isPointing || isVictory) {
      const gesture = detectSwipe();
      if (gesture !== GESTURES.NONE && now - lastGestureTime > settings.cooldownMs) {
        lastGestureTime = now;
        gestureOrigin   = deadZoneAnchor ?? { x: positionBuffer[0]?.x ?? wrist.x, y: positionBuffer[0]?.y ?? wrist.y };
        waitingForReset = true;
        positionBuffer.length = 0;

        const prefix    = isPointing ? 'pointing_' : 'victory_';
        const action    = gestureMap[prefix + gesture.toLowerCase()] || 'NONE';
        const poseEmoji = isPointing ? '☝' : '✌';

        if (action !== 'NONE') {
          chrome.runtime.sendMessage({ type: 'GESTURE_DETECTED', gesture, action });
          chrome.runtime.sendMessage({
            type: 'GESTURE_DISPLAY',
            label: `${poseEmoji} ${gesture.replace('_', ' ')} → ${ACTION_LABELS[action] || action}`,
          });
        }
      }
    }

    return;
  }

  // ── Swipe mode ────────────────────────────────────────────────────────────────
  const activeOrigin = deadZoneAnchor || gestureOrigin;

  if (now - lastStateTime > 66) {
    lastStateTime = now;
    chrome.runtime.sendMessage({
      type: 'OVERLAY_STATE',
      wristX: wrist.x, wristY: wrist.y,
      bufferFill: positionBuffer.length,
      bufferMax: settings.bufferSize,
      waitingForReset,
      originX: activeOrigin?.x,
      originY: activeOrigin?.y,
      deadZoneRadius,
      cursorZone,
      cursorMirrorX,
    }).catch(() => {});
  }

  if (waitingForReset && activeOrigin) {
    const dx = wrist.x - activeOrigin.x;
    const dy = wrist.y - activeOrigin.y;
    if (Math.sqrt(dx * dx + dy * dy) < deadZoneRadius) {
      waitingForReset = false;
      positionBuffer.length = 0;
    } else {
      return;
    }
  }

  positionBuffer.push({ x: wrist.x, y: wrist.y });
  if (positionBuffer.length > settings.bufferSize) positionBuffer.shift();

  if (isOpen || isClosed || isPointing || isVictory) {
    const gesture = detectSwipe();
    if (gesture !== GESTURES.NONE && now - lastGestureTime > settings.cooldownMs) {
      lastGestureTime = now;
      gestureOrigin   = deadZoneAnchor ?? { x: positionBuffer[0].x, y: positionBuffer[0].y };
      waitingForReset = true;
      positionBuffer.length = 0;

      const prefix    = isClosed ? 'closed_' : isPointing ? 'pointing_' : isVictory ? 'victory_' : 'open_';
      const mapKey    = prefix + gesture.toLowerCase();
      const action    = gestureMap[mapKey] || 'NONE';
      const poseEmoji = isClosed ? '✊' : isPointing ? '☝' : isVictory ? '✌' : '🖐';

      chrome.runtime.sendMessage({ type: 'GESTURE_DETECTED', gesture, action });
      chrome.runtime.sendMessage({
        type: 'GESTURE_DISPLAY',
        label: `${poseEmoji} ${gesture.replace('_', ' ')} → ${ACTION_LABELS[action] || action}`,
      });
      debug('gesture', gesture, '->', action);
    }
  }
}

init();
